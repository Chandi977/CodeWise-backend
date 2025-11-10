// config/redis.ts
import Redis, { RedisOptions } from 'ioredis';
import { logger } from '../utils/logger';

/**
 * 🧩 Centralized Redis configuration.
 * Used across the app for caching, sessions, and BullMQ queues.
 */
export const redisConfig: RedisOptions = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  connectTimeout: 10_000, // 10 seconds
  keepAlive: 30_000, // keep TCP socket alive
  enableReadyCheck: true,
  lazyConnect: false,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 200, 3000); // exponential backoff
    logger.warn(`Redis reconnect attempt #${times}, retrying in ${delay}ms`);
    return delay;
  },
};

/**
 * 🔄 Singleton Redis client for generic app use (not BullMQ).
 * BullMQ will use its own connection from config/queue.ts.
 */
let redisClient: Redis | null = null;

export const createRedisClient = (): Redis => {
  if (redisClient) {
    return redisClient;
  }

  const client = new Redis(redisConfig);

  // ---- Event listeners for better observability ---- //
  client.on('connect', () => logger.info('✅ Redis connected successfully'));
  client.on('ready', () => logger.info('🔁 Redis connection is ready for use'));
  client.on('reconnecting', (time: number) => logger.warn(`⚠️ Redis reconnecting in ${time}ms`));
  client.on('error', (err: Error) => logger.error(`💥 Redis connection error: ${err.message}`));
  client.on('end', () => logger.warn('🛑 Redis connection closed'));

  redisClient = client;
  return redisClient;
};

/**
 * 🧹 Gracefully close Redis client during shutdown.
 */
export const closeRedisClient = async (): Promise<void> => {
  if (redisClient && redisClient.status !== 'end') {
    await redisClient.quit();
    logger.info('🔒 Redis client closed gracefully');
    redisClient = null;
  }
};
