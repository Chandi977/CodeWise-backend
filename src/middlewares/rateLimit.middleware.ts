import rateLimit from 'express-rate-limit';
import RedisStore, { RedisReply } from 'rate-limit-redis';
import { createRedisClient } from '../config/redis';
import { logger } from '../utils/logger';

// Create ioredis client
const redis = createRedisClient();

/**
 * 🧩 Custom sendCommand bridge to make ioredis work with rate-limit-redis
 */
async function sendRedisCommand(...args: string[]): Promise<RedisReply> {
  try {
    // ✅ Type-safe call using apply()
    const result = await (redis as any).call.apply(redis, args);
    return result as unknown as RedisReply;
  } catch (err: any) {
    logger.error(`Redis sendCommand error: ${err.message}`);
    throw err;
  }
}

/**
 * 🏗 Create Redis store for rate limiting
 */
function createRateLimitStore(prefix: string) {
  try {
    return new RedisStore({
      prefix,
      sendCommand: (...args: string[]): Promise<RedisReply> => sendRedisCommand(...args),
    });
  } catch (err: any) {
    logger.error(`⚠️ Failed to connect Redis for rate limiter: ${err.message}`);
    logger.warn('⚠️ Falling back to in-memory rate limiter');
    return undefined;
  }
}

/**
 * 🚀 Normal rate limiter (100 req/15min)
 */
export const rateLimitMiddleware = rateLimit({
  store: createRateLimitStore('rl:'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.',
  handler: (req, res) => {
    logger.warn(`🚫 Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Too many requests. Please wait before retrying.',
    });
  },
});

/**
 * 🔒 Strict rate limiter (10 req/15min)
 */
export const strictRateLimitMiddleware = rateLimit({
  store: createRateLimitStore('rl:strict:'),
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.STRICT_RATE_LIMIT_MAX || '10', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later.',
  handler: (req, res) => {
    logger.warn(`🚫 Strict rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later.',
    });
  },
});
