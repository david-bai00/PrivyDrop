export interface RoomRedisMulti {
  hset(key: string, field: string, value: number): RoomRedisMulti;
  expire(key: string, seconds: number): RoomRedisMulti;
  set(
    key: string,
    value: string,
    mode: "EX",
    seconds: number
  ): RoomRedisMulti;
  sadd(key: string, member: string): RoomRedisMulti;
  del(key: string): RoomRedisMulti;
  srem(key: string, member: string): RoomRedisMulti;
  exec(): Promise<unknown>;
}

export interface RoomRedisClient {
  hexists(key: string, field: string): Promise<number>;
  get(key: string): Promise<string | null>;
  scard(key: string): Promise<number>;
  del(key: string): Promise<unknown>;
  multi(): RoomRedisMulti;
}

export interface RoomServiceConfig {
  roomPrefix: string;
  socketPrefix: string;
  roomExpiry: number;
}

const DEFAULT_ROOM_CONFIG: RoomServiceConfig = {
  roomPrefix: "room:",
  socketPrefix: "socket:",
  roomExpiry: 3600 * 24,
};

export function createRoomService(
  redisClient: RoomRedisClient,
  config: RoomServiceConfig = DEFAULT_ROOM_CONFIG
) {
  const { roomPrefix, socketPrefix, roomExpiry } = config;

  return {
    async isRoomExist(roomId: string): Promise<boolean> {
      return (await redisClient.hexists(roomPrefix + roomId, "created_at")) === 1;
    },
    async createRoom(roomId: string): Promise<void> {
      const roomKey = roomPrefix + roomId;
      const socketsKey = `${roomKey}:sockets`;
      await redisClient
        .multi()
        .hset(roomKey, "created_at", Date.now())
        .expire(roomKey, roomExpiry)
        .expire(socketsKey, roomExpiry)
        .exec();
    },
    async deleteRoom(roomId: string): Promise<void> {
      await redisClient.del(roomPrefix + roomId);
    },
    async refreshRoom(roomId: string, expiry: number = 0): Promise<void> {
      const actualExpiry = expiry > 0 ? expiry : roomExpiry;
      const roomKey = roomPrefix + roomId;
      const socketsKey = `${roomKey}:sockets`;
      console.log(`EXPIRY of roomId:${roomId} is ${actualExpiry}`);
      await redisClient
        .multi()
        .expire(roomKey, actualExpiry)
        .expire(socketsKey, actualExpiry)
        .exec();
    },
    async bindSocketToRoom(socketId: string, roomId: string): Promise<void> {
      await redisClient
        .multi()
        .set(socketPrefix + socketId, roomId, "EX", roomExpiry + 3600)
        .sadd(roomPrefix + roomId + ":sockets", socketId)
        .exec();
    },
    async getRoomBySocketId(socketId: string): Promise<string | null> {
      return await redisClient.get(socketPrefix + socketId);
    },
    async unbindSocketFromRoom(socketId: string, roomId: string): Promise<void> {
      await redisClient
        .multi()
        .del(socketPrefix + socketId)
        .srem(roomPrefix + roomId + ":sockets", socketId)
        .exec();
    },
    async isRoomEmpty(roomId: string): Promise<boolean> {
      const count = await redisClient.scard(roomPrefix + roomId + ":sockets");
      return count === 0;
    },
    async roomNumOfConnection(roomId: string): Promise<number> {
      return await redisClient.scard(roomPrefix + roomId + ":sockets");
    },
  };
}
