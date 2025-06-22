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
// Check if a room exists
export async function isRoomExist(roomId: string): Promise<boolean> {
  return (await redis.hexists(ROOM_PREFIX + roomId, "created_at")) === 1; // hset and hexists operate on hashes, 'created_at' is the field name
}
// Create a new room
// (Hash)
// "room:1234" : {
//   "created_at": "1705123456789"
// }
export async function createRoom(roomId: string): Promise<void> {
  const roomKey = ROOM_PREFIX + roomId;
  const socketsKey = `${roomKey}:sockets`;
  await redis
    .multi()
    .hset(roomKey, "created_at", Date.now()) // Set hash to store the room's creation time
    .expire(roomKey, ROOM_EXPIRY) // Set expiration time
    .expire(socketsKey, ROOM_EXPIRY)
    .exec();
}
// Delete a room
export async function deleteRoom(roomId: string): Promise<void> {
  await redis.del(ROOM_PREFIX + roomId);
}
// Refresh a room's expiration time
export async function refreshRoom(
  roomId: string,
  expiry: number = 0
): Promise<void> {
  const actualExpiry = expiry > 0 ? expiry : ROOM_EXPIRY;
  const roomKey = ROOM_PREFIX + roomId;
  const socketsKey = `${roomKey}:sockets`;
  console.log(`EXPIRY of roomId:${roomId} is ${actualExpiry}`);
  await redis
    .multi()
    .expire(roomKey, actualExpiry)
    .expire(socketsKey, actualExpiry)
    .exec();
}
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
// Bind a socket.id to a room ID
export async function bindSocketToRoom(
  socketId: string,
  roomId: string
): Promise<void> {
  await redis
    .multi()
    // String, stores the room ID associated with this socket ID, e.g., "socket:abcd1234" : "1234"
    .set(SOCKET_PREFIX + socketId, roomId, "EX", ROOM_EXPIRY + 3600) // Set with expiry
    // Set, list of sockets in the room, e.g., "room:1234:sockets" : ["socket1", "socket2", ...]
    .sadd(ROOM_PREFIX + roomId + ":sockets", socketId)
    .exec();
}
// Get the room ID for a given socket.id
export async function getRoomBySocketId(
  socketId: string
): Promise<string | null> {
  return await redis.get(SOCKET_PREFIX + socketId);
}
// Unbind a socket.id from a room ID
export async function unbindSocketFromRoom(
  socketId: string,
  roomId: string
): Promise<void> {
  await redis
    .multi()
    .del(SOCKET_PREFIX + socketId) // Unbind socket ID from room ID
    .srem(ROOM_PREFIX + roomId + ":sockets", socketId) // Remove socket ID from the room's set
    .exec();
}
// Check if a room is empty
export async function isRoomEmpty(roomId: string): Promise<boolean> {
  const count = await redis.scard(ROOM_PREFIX + roomId + ":sockets"); // Returns the number of elements in the set
  return count === 0;
}
// Get the number of connections in a room
export async function roomNumOfConnection(roomId: string): Promise<number> {
  return await redis.scard(ROOM_PREFIX + roomId + ":sockets");
}
