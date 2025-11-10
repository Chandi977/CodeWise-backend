import { RedisOptions } from 'ioredis';
import { redisConfig } from './redis';

export const queueConnection: RedisOptions = {
  ...redisConfig,
  maxRetriesPerRequest: null,
};

export const queueConfig = {
  prefix: 'bull',
};
