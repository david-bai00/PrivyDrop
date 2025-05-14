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
import { redis, ROOM_PREFIX, SOCKET_PREFIX, ROOM_EXPIRY } from './redis';

const MAX_NUMERIC_ID_ATTEMPTS = 10;
const MAX_ALPHANUMERIC_ID_ATTEMPTS = 50;

// 生成随机房间号--4位数字
function generateNumericRoomId(length: number = 4): string {
  let id = '';
  for (let i = 0; i < length; i++) {
    id += Math.floor(Math.random() * 10).toString();
  }
  return id;
}
function generateAlphanumericRoomId(length: number = 4): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}
// 检查房间是否存在
export async function isRoomExist(roomId: string): Promise<boolean> {
  return await redis.hexists(ROOM_PREFIX + roomId, 'created_at') === 1;//hset和hexists方法操作哈希,created_at是字段名
}
// 创建新房间
// (Hash)
// "room:1234" : {
//   "created_at": "1705123456789"
// }
export async function createRoom(roomId: string): Promise<void> {
  const roomKey = ROOM_PREFIX + roomId;
  const socketsKey = `${roomKey}:sockets`;
  await redis.multi()
    .hset(roomKey, 'created_at', Date.now())//设置hash，存储房间的创建时间；
    .expire(roomKey, ROOM_EXPIRY)//设置过期时间
    .expire(socketsKey, ROOM_EXPIRY)
    .exec();
}
// 删除房间
export async function deleteRoom(roomId: string): Promise<void> {
  await redis.del(ROOM_PREFIX + roomId);
}
// 刷新房间过期时间
export async function refreshRoom(roomId: string, expiry: number = 0): Promise<void> {
  const actualExpiry = expiry > 0 ? expiry : ROOM_EXPIRY;
  const roomKey = ROOM_PREFIX + roomId;
  const socketsKey = `${roomKey}:sockets`;
  console.log(`EXPIRY of roomId:${roomId} is ${actualExpiry}`);
  await redis.multi()
    .expire(roomKey, actualExpiry)
    .expire(socketsKey, actualExpiry)
    .exec();
}
// 获取可用房间号
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

  if (attempts > MAX_NUMERIC_ID_ATTEMPTS && await isRoomExist(roomId)) { // Numeric attempts exhausted and last one was not unique
    console.warn('Numeric room ID attempts exhausted, switching to alphanumeric.');
    attempts = 0; // Reset attempts for alphanumeric
    do {
      roomId = generateAlphanumericRoomId(4); // Generate 4-char alphanumeric as requested
      attempts++;
      if (attempts > MAX_ALPHANUMERIC_ID_ATTEMPTS) {
        // This is highly unlikely for 4-char alphanumeric, but as a safeguard:
        console.error('FATAL: Could not find an available alphanumeric room ID after many attempts.');
        throw new Error('Failed to generate a unique room ID.'); 
      }
    } while (await isRoomExist(roomId));
  }
  return roomId;
}
// 将socket.id与房间号绑定
export async function bindSocketToRoom(socketId: string, roomId: string): Promise<void> {
  await redis.multi()
    //字符串，存储与该socket ID相关联的房间号,"socket:abcd1234" : "1234"
    .set(SOCKET_PREFIX + socketId, roomId, 'EX', ROOM_EXPIRY+3600) // Set with expiry
    //添加集合，房间内的 Socket 列表 (Set),"room:1234:sockets" : ["socket1", "socket2", ...]
    .sadd(ROOM_PREFIX + roomId + ':sockets', socketId)
    .exec();
}
// 获取socket.id对应的房间号
export async function getRoomBySocketId(socketId: string): Promise<string | null> {
  return await redis.get(SOCKET_PREFIX + socketId);
}
// 解绑socket.id与房间号
export async function unbindSocketFromRoom(socketId: string, roomId: string): Promise<void> {
  await redis.multi()
    .del(SOCKET_PREFIX + socketId)//解绑socket ID与房间号
    .srem(ROOM_PREFIX + roomId + ':sockets', socketId)//从房间的集合中移除socket ID
    .exec();
}
// 检查房间是否为空
export async function isRoomEmpty(roomId: string): Promise<boolean> {
  const count = await redis.scard(ROOM_PREFIX + roomId + ':sockets');//返回集合中元素的数量
  return count === 0;
}
// 检查房间连接数
export async function roomNumOfConnection(roomId: string): Promise<number> {
  return await redis.scard(ROOM_PREFIX + roomId + ':sockets');
}