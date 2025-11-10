/* eslint-disable @typescript-eslint/no-explicit-any */
// jobs/JobManager.ts
import { Queue, QueueOptions } from 'bullmq';
import { queueConfig, queueConnection } from '../config/queue';
import { logger } from '../utils/logger';

/**
 * 🧠 JobManager
 * Manages creation, access, and monitoring of BullMQ queues.
 * Ensures all queues share the same Redis connection and consistent config.
 */
export interface JobCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused?: number;
}
export class JobManager {
  private static instance: JobManager;
  private queues: Map<string, Queue>;

  private constructor() {
    this.queues = new Map();
  }

  /**
   * 🧩 Singleton instance (ensures a single manager across app lifecycle)
   */
  public static getInstance(): JobManager {
    if (!JobManager.instance) {
      JobManager.instance = new JobManager();
    }
    return JobManager.instance;
  }

  /**
   * 🏗️ Create or retrieve a queue by name.
   * Reuses existing instance if already created.
   */
  public createQueue(name: string, config: Partial<QueueOptions> = {}): Queue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    const queue = new Queue(name, {
      ...queueConfig, // ✅ uses shared connection & defaultJobOptions
      ...config,
      connection: queueConnection,
    });

    this.queues.set(name, queue);
    logger.info(`✅ Queue "${name}" initialized.`);
    return queue;
  }

  /**
   * 🔍 Get an existing queue by name.
   */
  public getQueue(name: string): Queue | undefined {
    return this.queues.get(name);
  }

  /**
   * 📊 Get basic stats (counts) for a queue.
   */
  public async getQueueStats(name: string): Promise<JobCounts | null> {
    const queue = this.queues.get(name);
    if (!queue) {
      logger.warn(`⚠️ Queue "${name}" not found.`);
      return null;
    }

    try {
      const counts = await queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      );
      return counts as unknown as JobCounts;
    } catch (err: any) {
      logger.error(`💥 Failed to get stats for queue "${name}": ${err.message}`);
      return null;
    }
  }

  /**
   * 🧹 Gracefully close all queues and Redis connections.
   */
  public async closeAll(): Promise<void> {
    logger.info('🧹 Closing all BullMQ queues...');
    for (const [name, queue] of this.queues.entries()) {
      try {
        await queue.close();
        logger.info(`✅ Queue "${name}" closed.`);
      } catch (err: any) {
        logger.error(`💥 Failed to close queue "${name}": ${err.message}`);
      }
    }

    if (queueConnection.status !== 'end') {
      await queueConnection.quit();
      logger.info('🔒 Shared BullMQ Redis connection closed.');
    }
  }
}
