const DEFAULT_RATE_LIMIT_CONFIG = {
  prefix: "ratelimit:join:",
  windowSeconds: 5,
  limit: 2,
};

export interface RateLimitPipeline {
  zadd(key: string, score: number, member: string): RateLimitPipeline;
  zremrangebyscore(key: string, min: number, max: number): RateLimitPipeline;
  zcard(key: string): RateLimitPipeline;
  zrange(
    key: string,
    start: number,
    stop: number,
    withScores: "WITHSCORES"
  ): RateLimitPipeline;
  expire(key: string, seconds: number): RateLimitPipeline;
  exec(): Promise<Array<[unknown, unknown]> | null>;
}

export interface RateLimitRedisClient {
  pipeline(): RateLimitPipeline;
}

export interface RateLimitConfig {
  prefix: string;
  windowSeconds: number;
  limit: number;
}

export function createRateLimitService(
  redisClient: RateLimitRedisClient,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG
) {
  return {
    async checkRateLimit(ip: string): Promise<{
      allowed: boolean;
      remaining: number;
      resetAfter: number;
    }> {
      const key = `${config.prefix}${ip}`;
      const now = Date.now();
      const windowStart = now - config.windowSeconds * 1000;

      const pipeline = redisClient.pipeline();

      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      pipeline.zremrangebyscore(key, 0, windowStart);
      pipeline.zcard(key);
      pipeline.zrange(key, 0, 0, "WITHSCORES");
      pipeline.expire(key, config.windowSeconds);

      const results = await pipeline.exec();

      if (!results) {
        console.error("Redis pipeline command failed for rate limiting.");
        return {
          allowed: false,
          remaining: 0,
          resetAfter: config.windowSeconds,
        };
      }

      const requestCount = results[2][1] as number;
      const oldestEntry = results[3][1] as string[] | undefined;
      const oldestScore = oldestEntry?.[1] ? Number(oldestEntry[1]) : now;
      const allowed = requestCount <= config.limit;
      const remaining = Math.max(config.limit - requestCount, 0);
      const resetAfter = Math.max(
        0,
        Math.ceil((oldestScore + config.windowSeconds * 1000 - now) / 1000)
      );

      return { allowed, remaining, resetAfter };
    },
  };
}
