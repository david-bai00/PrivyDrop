import { Redis } from 'ioredis';
import { CONFIG } from '../config/env';
// Room prefix and expiration time (seconds)
export const ROOM_PREFIX = 'room:';
export const SOCKET_PREFIX = 'socket:';
export const ROOM_EXPIRY = 3600 * 24; // 24 hours
// Redis configuration options
const redisConfig = {
  host: CONFIG.REDIS.HOST,
  port: CONFIG.REDIS.PORT,
  // Redis persistence configuration needs to be set in redis.conf, not in the client
  // appendonly: 'yes',// Enable AOF persistence
  // save: '900 1 300 10',// Enable RDB snapshot
};

export const redis = new Redis(redisConfig);

// Connection event listeners can be added here
redis.on('connect', () => {
  console.log('Redis connected successfully');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});