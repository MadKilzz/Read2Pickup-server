import { MemoryStore } from "express-rate-limit";
import config from "@/config";

/**
 * Creates a new store instance for one rate limiter.
 * Each limiter must use its own store instance (express-rate-limit does not allow sharing).
 *
 * - Default: in-memory (MemoryStore). Fine for single-instance or dev.
 * - Production with multiple instances: set REDIS_URL and use a Redis store
 *   (e.g. rate-limit-redis) so all instances share the same counters.
 */
export function createRateLimitStore(): MemoryStore {
    if (config.rateLimit.redisUrl) {
        // Optional: install rate-limit-redis and return new RedisStore({ sendCommand: ... })
        // so that multiple server instances share the same rate limit state.
        // For now we fall back to memory when Redis is not implemented.
    }
    return new MemoryStore();
}
