import { Redis } from 'ioredis';
import { CONFIG } from '../config/env';
// 房间前缀和过期时间（秒）
export const ROOM_PREFIX = 'room:';
export const SOCKET_PREFIX = 'socket:';
export const ROOM_EXPIRY = 3600 * 24; // 24 hours
// Redis 配置选项
const redisConfig = {
  host: CONFIG.REDIS.HOST,
  port: CONFIG.REDIS.PORT,
  // Redis 持久化配置需要在 redis.conf 中设置，而不是在客户端
  // appendonly: 'yes',// 启用 AOF 持久化
  // save: '900 1 300 10',// 启用 RDB 快照
};

export const redis = new Redis(redisConfig);

// 可以在这里添加连接事件监听
redis.on('connect', () => {
  console.log('Redis connected successfully');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});