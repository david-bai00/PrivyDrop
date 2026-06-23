/**
 * Redis Data Structures Used:
 *
 * 1. Room Information:
 *    - Key Pattern: `room:<roomId>` (e.g., "room:ABCD12")
 *    - Type: Hash
 *    - Fields:
 *      - `created_at`: Timestamp of room creation.
 *    - TTL: Set by `ROOM_EXPIRY` (e.g., 24 hours), refreshed on activity.
 *    - Operations: HSET (createRoom), HEXISTS (isRoomExist), EXPIRE (createRoom, refreshRoom), DEL (deleteRoom).
 *
 * 2. Sockets in Room:
 *    - Key Pattern: `room:<roomId>:sockets` (e.g., "room:ABCD12:sockets")
 *    - Type: Set
 *    - Members: `socketId`s of clients currently in the room.
 *    - TTL: Matches the corresponding `room:<roomId>` key.
 *    - Operations: SADD (bindSocketToRoom), SREM (unbindSocketFromRoom), SCARD (isRoomEmpty, roomNumOfConnection),
 *                  EXPIRE (createRoom, refreshRoom), DEL (as part of deleteRoom).
 *
 * 3. Socket to Room Mapping:
 *    - Key Pattern: `socket:<socketId>` (e.g., "socket:xgACY6QcQCojsOQaAAAB")
 *    - Type: String
 *    - Value: `roomId` the socket is currently associated with.
 *    - TTL: Set individually upon binding (e.g., `ROOM_EXPIRY` + buffer).
 *    - Operations: SET (with EX option in bindSocketToRoom), GET (getRoomBySocketId), DEL (unbindSocketFromRoom, and as part of deleteRoom).
 */
import { redis, ROOM_PREFIX, SOCKET_PREFIX, ROOM_EXPIRY } from "./redis";
import { createRoomService } from "./roomCore";
export type {
  RoomRedisClient,
  RoomRedisMulti,
  RoomServiceConfig,
} from "./roomCore";

const MAX_NUMERIC_ID_ATTEMPTS = 10;
const MAX_ALPHANUMERIC_ID_ATTEMPTS = 50;

// Generate a random 4-digit numeric room ID
function generateNumericRoomId(length: number = 4): string {
  let id = "";
  for (let i = 0; i < length; i++) {
    id += Math.floor(Math.random() * 10).toString();
  }
  return id;
}
// Generate a random 4-character alphanumeric room ID
function generateAlphanumericRoomId(length: number = 4): string {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}
const roomService = createRoomService(redis, {
  roomPrefix: ROOM_PREFIX,
  socketPrefix: SOCKET_PREFIX,
  roomExpiry: ROOM_EXPIRY,
});
// Get an available room ID
export async function getAvailableRoomId(): Promise<string> {
  let roomId: string;
  let attempts = 0;
  do {
    roomId = generateNumericRoomId(4);
    attempts++;
    if (attempts > MAX_NUMERIC_ID_ATTEMPTS) {
      break; // Exhausted numeric attempts
    }
  } while (await isRoomExist(roomId));

  if (attempts > MAX_NUMERIC_ID_ATTEMPTS && (await isRoomExist(roomId))) {
    // Numeric attempts exhausted and last one was not unique
    console.warn(
      "Numeric room ID attempts exhausted, switching to alphanumeric."
    );
    attempts = 0; // Reset attempts for alphanumeric
    do {
      roomId = generateAlphanumericRoomId(4); // Generate 4-char alphanumeric as requested
      attempts++;
      if (attempts > MAX_ALPHANUMERIC_ID_ATTEMPTS) {
        // This is highly unlikely for 4-char alphanumeric, but as a safeguard:
        console.error(
          "FATAL: Could not find an available alphanumeric room ID after many attempts."
        );
        throw new Error("Failed to generate a unique room ID.");
      }
    } while (await isRoomExist(roomId));
  }
  return roomId;
}

export const isRoomExist = roomService.isRoomExist;
export const createRoom = roomService.createRoom;
export const deleteRoom = roomService.deleteRoom;
export const refreshRoom = roomService.refreshRoom;
export const bindSocketToRoom = roomService.bindSocketToRoom;
export const getRoomBySocketId = roomService.getRoomBySocketId;
export const unbindSocketFromRoom = roomService.unbindSocketFromRoom;
export const isRoomEmpty = roomService.isRoomEmpty;
export const roomNumOfConnection = roomService.roomNumOfConnection;
