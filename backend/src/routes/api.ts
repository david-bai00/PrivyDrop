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
import { ReferrerTrack, LogMessage } from "../types/room";

const router = Router();

// Define interfaces to improve code readability and type safety
interface CreateRoomRequest {
  roomId: string;
}

interface CheckRoomRequest {
  roomId: string;
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
    const response = {
      success: !exists,
      message: exists ? "roomId is already exists" : "create room success",
    };

    if (!exists) {
      await roomService.createRoom(roomId);
    }

    res.json(response);
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

// Route handler for setting tracking
const setTrackHandler: RequestHandler<{}, any, ReferrerTrack> = async (
  req,
  res
) => {
  if (req.method !== "POST") {
    res.status(405).json({ message: "Method not allowed" });
    return;
  }

  try {
    const { ref, timestamp } = req.body;
    // Statistics by date
    const date = new Date(timestamp).toISOString().split("T")[0];
    const dailyKey = `referrers:daily:${date}`;
    const thirtyDaysInSeconds = 30 * 24 * 60 * 60;

    // Use MULTI to ensure atomicity of hincrby and expire
    await redis
      .multi()
      .hincrby(dailyKey, ref, 1) // \"referrers:daily:2024-01-20\" : { \"producthunt\": \"5\", \"twitter\": \"3\" }
      .expire(dailyKey, thirtyDaysInSeconds) // Set a 30-day expiration
      .exec();

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

// Register routes
router.post("/api/create_room", createRoomHandler);
router.get("/api/get_room", getRoomHandler);
router.post("/api/check_room", checkRoomHandler);
router.post("/api/set_track", setTrackHandler);
router.post("/api/logs_debug", logsDebugHandler);

export default router;
