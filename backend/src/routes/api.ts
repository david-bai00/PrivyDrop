/**
 * Redis Data Structures Used by setTrackHandler:
 *
 * 1. Daily Referrer Counts:
 *    - Key Pattern: `referrers:daily:<YYYY-MM-DD>` (e.g., "referrers:daily:2024-03-15")
 *    - Type: Hash
 *    - Fields: Referrer source string (e.g., "producthunt", "twitter").
 *    - Values: Count of referrals from that source for that day.
 *    - TTL: Set to 30 days upon creation or update.
 *    - Operations:
 *      - `HINCRBY`: Increments the count for a specific referrer for the given day.
 *      - `EXPIRE`: Sets/refreshes the 30-day TTL for the daily statistics key.
 *      - These operations are performed within a `MULTI` transaction.
 *
 */
import { Router, RequestHandler } from "express";
import { redis } from "../services/redis";
import * as roomService from "../services/room";
import { ReferrerTrack, FunnelTrackEvent, LogMessage } from "../types/room";
import { checkTrackRateLimit } from "../services/rateLimit";

const router = Router();

// Define interfaces to improve code readability and type safety
interface CreateRoomRequest {
  roomId: string;
}

interface CheckRoomRequest {
  roomId: string;
}

interface LeaveRoomRequest {
  roomId: string;
  socketId: string;
}

// Route handler for creating a room
const createRoomHandler: RequestHandler<{}, any, CreateRoomRequest> = async (
  req,
  res
) => {
  const { roomId } = req.body;
  if (!roomId) {
    res.status(400).json({ error: "Room ID is required" });
    return;
  }

  try {
    const exists = await roomService.isRoomExist(roomId);

    // Idempotent behavior for long IDs (>= 8): allow reuse for reconnect scenarios.
    // Short IDs keep strict uniqueness (prevent accidental collisions).
    if (exists) {
      if (roomId.length >= 8) {
        // Do NOT refresh TTL here; actual join will refresh on success.
        res.json({ success: true, message: "room exists (rejoin allowed)" });
        return;
      }
      res.json({ success: false, message: "roomId is already exists" });
      return;
    }

    await roomService.createRoom(roomId);
    res.json({ success: true, message: "create room success" });
  } catch (error) {
    console.error("Error checking room:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Route handler for getting a room
const getRoomHandler: RequestHandler = async (req, res) => {
  try {
    const roomId = await roomService.getAvailableRoomId();
    await roomService.createRoom(roomId);
    res.json({ roomId });
  } catch (error) {
    console.error("Error getting room:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Route handler for checking a room
const checkRoomHandler: RequestHandler<{}, any, CheckRoomRequest> = async (
  req,
  res
) => {
  const { roomId } = req.body;
  if (!roomId) {
    res.status(400).json({ error: "Room ID is required" });
    return;
  }

  try {
    const exists = await roomService.isRoomExist(roomId);
    res.json({ available: !exists });
  } catch (error) {
    console.error("Error checking room:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const TRACK_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_SESSION_KEYS_PER_DAY = 20000;

/**
 * Events the client is allowed to report. Anything else collapses into
 * `unknown_event` so a caller cannot create unbounded hash fields, which would
 * turn a public endpoint into a Redis memory amplifier.
 */
const KNOWN_EVENTS = new Set([
  "visit",
  "room_join",
  "share_link_copy",
  "share_qr_view",
  "receive_join",
  "receive_invite_landing",
  "transfer_start",
  "transfer_complete",
  "transfer_fail",
  "cached_id_use",
  "secondary_action",
]);

const KNOWN_LOCALES = new Set(["en", "zh", "ja", "es", "de", "fr", "ko"]);

/**
 * Landing paths are a small closed set in practice, but the parameter is
 * attacker-controlled, so collapse it to the known route shapes.
 */
const normalizePath = (value: string): string => {
  if (value === "/") return "/";
  if (/^\/[a-z]{2}$/.test(value)) return value;
  if (/^\/[a-z]{2}\/(blog|features|about|faq|help|privacy|terms)$/.test(value)) return value;
  if (/^\/[a-z]{2}\/blog\/.+/.test(value)) return value.replace(/\/$/, "");
  return "/other";
};

/**
 * Keep attacker-controlled strings to a boring, index-safe alphabet. These
 * values end up as Redis hash fields and are read back by export scripts, so a
 * stray colon or newline must never be able to forge a dimension.
 */
const sanitizeToken = (value: unknown, fallback: string, maxLen = 64): string => {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim().replace(/[^a-zA-Z0-9_.:\-\/]/g, "").slice(0, maxLen);
  return cleaned.length > 0 ? cleaned : fallback;
};

const parseTrackDate = (timestamp: unknown): string => {
  const date = new Date(
    typeof timestamp === "number" || typeof timestamp === "string"
      ? timestamp
      : Date.now()
  );
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().split("T")[0];
  }
  return date.toISOString().split("T")[0];
};

/**
 * Route handler for funnel tracking.
 *
 * Backward compatible with the historical `{ ref, timestamp }` payload: a
 * request without an `event` is recorded as a plain "visit".
 *
 * Redis layout written here:
 * - `referrers:daily:<date>`      hash  <ref>                  -> count  (channel DAU, unchanged shape)
 * - `funnel:daily:<date>`         hash  <event>                -> count
 * - `funnel:ref:daily:<date>`     hash  <event>|<ref>          -> count
 * - `funnel:locale:daily:<date>`  hash  <event>|<locale>       -> count
 * - `funnel:path:daily:<date>`    hash  <event>|<path>         -> count
 * - `funnel:sessions:<date>`      set   <sid>                  -> 1     (unique visitors, capped)
 */
const setTrackHandler: RequestHandler<{}, any, FunnelTrackEvent | ReferrerTrack> = async (
  req,
  res
) => {
  if (req.method !== "POST") {
    res.status(405).json({ message: "Method not allowed" });
    return;
  }

  try {
    const rate = await checkTrackRateLimit(req.ip ?? "unknown");
    if (!rate.allowed) {
      // Analytics are best-effort: drop silently rather than surface an error
      // to a page that is otherwise fine.
      res.status(204).end();
      return;
    }

    const body = (req.body ?? {}) as FunnelTrackEvent;
    const event = sanitizeToken(body.event, "visit", 40);
    const ref = sanitizeToken(body.ref, "direct", 64);
    const locale = KNOWN_LOCALES.has(body.locale as string)
      ? sanitizeToken(body.locale, "unknown", 2)
      : "unknown";
    const path = normalizePath(sanitizeToken(body.path, "/", 120));
    const sid = sanitizeToken(body.sid, "", 64);
    const date = parseTrackDate(body.timestamp);

    const eventName = KNOWN_EVENTS.has(event) ? event : "unknown_event";

    const tx = redis
      .multi()
      // Legacy channel counter, preserved so existing dashboards keep working.
      .hincrby(`referrers:daily:${date}`, ref, 1)
      .expire(`referrers:daily:${date}`, TRACK_TTL_SECONDS)
      // Funnel steps.
      .hincrby(`funnel:daily:${date}`, eventName, 1)
      .expire(`funnel:daily:${date}`, TRACK_TTL_SECONDS)
      .hincrby(`funnel:ref:daily:${date}`, `${eventName}|${ref}`, 1)
      .expire(`funnel:ref:daily:${date}`, TRACK_TTL_SECONDS)
      .hincrby(`funnel:locale:daily:${date}`, `${eventName}|${locale}`, 1)
      .expire(`funnel:locale:daily:${date}`, TRACK_TTL_SECONDS)
      .hincrby(`funnel:path:daily:${date}`, `${eventName}|${path}`, 1)
      .expire(`funnel:path:daily:${date}`, TRACK_TTL_SECONDS);

    if (sid) {
      // SCARD is checked lazily: tracking must stay cheap, and a few extra
      // members on a runaway day is cheaper than a second round trip per event.
      tx.sadd(`funnel:sessions:${date}`, sid);
      tx.expire(`funnel:sessions:${date}`, TRACK_TTL_SECONDS);
    }

    await tx.exec();

    // Best-effort cap so a single viral day cannot grow the session set forever.
    if (sid) {
      void redis
        .scard(`funnel:sessions:${date}`)
        .then((count) => (count ?? 0) > MAX_SESSION_KEYS_PER_DAY ? count : null)
        .then((count) => {
          if (count !== null) {
            console.warn(
              `funnel:sessions:${date} is oversized (${count}); consider sampling`
            );
          }
        })
        .catch(() => undefined);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Track API Error:", error);
    res.status(500).json({ success: false, error: "Failed to track referrer" });
  }
};

// Route handler for log debugging
const logsDebugHandler: RequestHandler<{}, any, LogMessage> = async (
  req,
  res
) => {
  try {
    const { message, timestamp } = req.body;
    console.log(`logs----timestamp:${timestamp} message:${message}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error checking room:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Route handler for leaving a room
const leaveRoomHandler: RequestHandler<{}, any, LeaveRoomRequest> = async (
  req,
  res
) => {
  const { roomId, socketId } = req.body;
  if (!roomId || !socketId) {
    res.status(400).json({ error: "Room ID and Socket ID are required" });
    return;
  }

  try {
    const roomExists = await roomService.isRoomExist(roomId);
    if (!roomExists) {
      res.json({ success: true, message: "Room does not exist." });
      return;
    }

    // Notify other users in the room that this peer has left (before unbinding)
    const io = req.app.get('io');
    if (io) {
      io.to(roomId).emit("peer-disconnected", { peerId: socketId });
    }

    await roomService.unbindSocketFromRoom(socketId, roomId);

    if (await roomService.isRoomEmpty(roomId)) {
      await roomService.refreshRoom(roomId, 900); // 15 minutes
      console.log(
        `Room ${roomId} is empty after leave and will be deleted in 15 min.`
      );
    }

    res.json({ success: true, message: "Successfully left the room" });
  } catch (error) {
    console.error("Error leaving room:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Register routes
router.post("/api/create_room", createRoomHandler);
router.get("/api/get_room", getRoomHandler);
router.post("/api/check_room", checkRoomHandler);
router.post("/api/set_track", setTrackHandler);
router.post("/api/logs_debug", logsDebugHandler);
router.post("/api/leave_room", leaveRoomHandler);

export default router;
