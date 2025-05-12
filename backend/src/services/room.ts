import { redis, ROOM_PREFIX, SOCKET_PREFIX, ROOM_EXPIRY } from './redis';
// 生成随机房间号--4位数字
export async function generateRoomId(): Promise<string> {
  return Math.floor(1000 + Math.random() * 9000).toString();
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
  await redis.multi()
    .hset(ROOM_PREFIX + roomId, 'created_at', Date.now())//设置hash，存储房间的创建时间；
    .expire(ROOM_PREFIX + roomId, ROOM_EXPIRY)//设置过期时间
    .exec();
}
// 删除房间
export async function deleteRoom(roomId: string): Promise<void> {
  await redis.del(ROOM_PREFIX + roomId);
}
// 刷新房间过期时间
export async function refreshRoom(roomId: string, expiry: number = 0): Promise<void> {
  const actualExpiry = expiry > 0 ? expiry : ROOM_EXPIRY;
  console.log(`EXPIRY of roomId:${roomId} is ${actualExpiry}`);
  await redis.expire(ROOM_PREFIX + roomId, actualExpiry);
}
// 获取可用房间号
export async function getAvailableRoomId(): Promise<string> {
  let roomId: string;
  do {
    roomId = await generateRoomId();
  } while (await isRoomExist(roomId));
  return roomId;
}
// 将socket.id与房间号绑定
export async function bindSocketToRoom(socketId: string, roomId: string): Promise<void> {
  await redis.multi()
    //字符串，存储与该socket ID相关联的房间号,"socket:abcd1234" : "1234"
    .set(SOCKET_PREFIX + socketId, roomId)
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