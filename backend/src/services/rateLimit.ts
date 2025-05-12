import { redis } from './redis';

const RATE_LIMIT_PREFIX = 'ratelimit:join:';
const RATE_WINDOW = 5; // 5秒时间窗口
const RATE_LIMIT = 2;  // 允许的最大请求次数

export async function checkRateLimit(ip: string): Promise<{
  allowed: boolean;
  remaining: number;
  resetAfter: number;
}> {
  const key = `${RATE_LIMIT_PREFIX}${ip}`;
  const now = Date.now();
  const windowStart = now - (RATE_WINDOW * 1000);

  // 使用 Redis 的 MULTI 命令开启事务
  const pipeline = redis.pipeline();
  
  // 移除时间窗口之前的数据
  pipeline.zremrangebyscore(key, 0, windowStart);
  // 获取当前时间窗口内的请求次数
  pipeline.zcard(key);
  // 添加新的请求记录
  pipeline.zadd(key, now, `${now}`);
  // 设置过期时间
  pipeline.expire(key, RATE_WINDOW);

  const results = await pipeline.exec();
  
  if (!results) {
    throw new Error('Redis pipeline failed');
  }

  const requestCount = results[1][1] as number;
  const allowed = requestCount <= RATE_LIMIT;
  const remaining = Math.max(RATE_LIMIT - requestCount, 0);
  const resetAfter = RATE_WINDOW - Math.floor((now - windowStart) / 1000);

  return { allowed, remaining, resetAfter };
}