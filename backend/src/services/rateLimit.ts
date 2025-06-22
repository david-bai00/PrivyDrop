/**
 * Redis Data Structures Used for Rate Limiting:
 *
 * 1. IP Request Timestamps:
 *    - Key Pattern: `ratelimit:join:<ipAddress>` (e.g., "ratelimit:join:192.168.1.100")
 *    - Type: Sorted Set
 *    - Members: Unique identifiers for each request, typically `timestamp-randomNumber`
 *               (e.g., "1678886400000-0.12345"). Using a random suffix ensures
 *               uniqueness if multiple requests occur in the same millisecond.
 *    - Scores: Timestamp of the request (milliseconds since epoch).
 *    - TTL: Set by `RATE_WINDOW` (e.g., 5 seconds). This ensures the key auto-expires
 *           if the IP stops making requests.
 *    - Operations:
 *      - `ZADD`: Adds the current request's timestamp (and unique member) to the set.
 *      - `ZREMRANGEBYSCORE`: Removes timestamps older than the current time window.
 *      - `ZCARD`: Counts the number of requests within the current time window.
 *      - `EXPIRE`: Refreshes/sets the TTL for the key.
 *    - All operations are typically performed within a `pipeline` or `MULTI` for efficiency.
 */
import { redis } from "./redis";

const RATE_LIMIT_PREFIX = "ratelimit:join:";
const RATE_WINDOW = 5; // 5-second time window
const RATE_LIMIT = 2; // Maximum number of requests allowed

export async function checkRateLimit(ip: string): Promise<{
  allowed: boolean;
  remaining: number;
  resetAfter: number;
}> {
  const key = `${RATE_LIMIT_PREFIX}${ip}`;
  const now = Date.now();
  const windowStart = now - RATE_WINDOW * 1000;

  // Use Redis's MULTI command to start a transaction
  const pipeline = redis.pipeline();

  // 1. Add current request's timestamp
  pipeline.zadd(key, now, `${now}-${Math.random()}`); // Add a random suffix to member for uniqueness if multiple requests at same ms
  // 2. Remove timestamps older than the current window
  pipeline.zremrangebyscore(key, 0, windowStart);
  // 3. Count requests in the current window (after adding current and removing old)
  pipeline.zcard(key);
  // 4. Set/Refresh expiration for the key to clean up inactive entries
  pipeline.expire(key, RATE_WINDOW);

  const results = await pipeline.exec();

  if (!results) {
    // This case means the pipeline itself failed, not individual commands necessarily
    console.error("Redis pipeline command failed for rate limiting.");
    // Fallback: be lenient or strict? For safety, let's be strict.
    return { allowed: false, remaining: 0, resetAfter: RATE_WINDOW };
  }
  // results[0] is for zadd (number of elements added)
  // results[1] is for zremrangebyscore (number of elements removed)
  // results[2] is for zcard (the count of items in the sorted set)
  // results[3] is for expire (1 if OK, 0 if not)

  const requestCount = results[2][1] as number;
  const allowed = requestCount <= RATE_LIMIT;
  const remaining = Math.max(RATE_LIMIT - requestCount, 0);
  const resetAfter = RATE_WINDOW - Math.floor((now - windowStart) / 1000);

  return { allowed, remaining, resetAfter };
}
