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
import { createRateLimitService } from "./rateLimitCore";
export type {
  RateLimitConfig,
  RateLimitPipeline,
  RateLimitRedisClient,
} from "./rateLimitCore";

const rateLimitService = createRateLimitService(redis);

export const checkRateLimit = rateLimitService.checkRateLimit;
