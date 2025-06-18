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

// 定义接口提高代码可读性和类型安全性
interface CreateRoomRequest {
  roomId: string;
}

interface CheckRoomRequest {
  roomId: string;
}

// 创建房间的路由处理函数
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

// 获取房间的路由处理函数
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

// 检查房间的路由处理函数
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

// 设置跟踪的路由处理函数
const setTrackHandler: RequestHandler<{}, any, ReferrerTrack> = async (
  req,
  res
) => {
  if (req.method !== "POST") {
    res.status(405).json({ message: "Method not allowed" });
    return;
  }

  try {
    const { ref, timestamp, path } = req.body;
    // 按日期统计
    const date = new Date(timestamp).toISOString().split("T")[0];
    const dailyKey = `referrers:daily:${date}`;
    const thirtyDaysInSeconds = 30 * 24 * 60 * 60;

    // 使用MULTI确保hincrby和expire的原子性
    await redis
      .multi()
      .hincrby(dailyKey, ref, 1) // \"referrers:daily:2024-01-20\" : { \"producthunt\": \"5\", \"twitter\": \"3\" }
      .expire(dailyKey, thirtyDaysInSeconds) // 设置30天过期
      .exec();

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Track API Error:", error);
    res.status(500).json({ success: false, error: "Failed to track referrer" });
  }
};

// 日志调试的路由处理函数
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

// 注册路由
router.post("/api/create_room", createRoomHandler);
router.get("/api/get_room", getRoomHandler);
router.post("/api/check_room", checkRoomHandler);
router.post("/api/set_track", setTrackHandler);
router.post("/api/logs_debug", logsDebugHandler);

export default router;
