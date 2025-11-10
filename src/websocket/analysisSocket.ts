/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable prettier/prettier */
import { Worker, Job } from 'bullmq';
import { createRedisClient } from '../config/redis';
import { queueConfig, queueConnection } from '../config/queue';
import { Analysis } from '../models/Analysis.model';
import { Issue } from '../models/Issue.model';
import { Suggestion } from '../models/Suggestion.model';
import { Project } from '../models/Project.model';
import { AnalysisEngine } from '../analysis/AnalysisEngine';
import { SuggestionEngine } from '../adapters/ai/SuggestionEngine';
import path from 'path';
import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';

/**
 * 🔌 Setup socket.io connection for real-time analysis updates.
 */
export function setupAnalysisSocket(io: Server): void {
  io.on('connection', (socket: Socket) => {
    logger.info(`🔌 Client connected: ${socket.id}`);

    socket.on('join-analysis', (analysisId: string) => {
      socket.join(`analysis:${analysisId}`);
      logger.info(`📡 Client joined analysis room: ${analysisId}`);
    });

    socket.on('disconnect', () => logger.info(`❎ Client disconnected: ${socket.id}`));
  });
}

/**
 * ⚙️ Create BullMQ worker for processing code analysis jobs.
 * Sends progress and completion events via WebSocket.
 */
export function createAnalysisWorker(io: Server) {
  // Create a dedicated Redis client for worker-level operations (not used by BullMQ)
  const redis = createRedisClient();

  const worker = new Worker(
    'analysis',
    async (job: Job) => {
      const { analysisId, projectId } = job.data;
      logger.info(`🧩 Starting analysis job: ${analysisId}`);

      if (!analysisId || !projectId) {
        throw new Error('Missing analysisId or projectId in job data');
      }

      try {
        const project = await Project.findById(projectId);
        if (!project) throw new Error(`Project not found: ${projectId}`);

        const analysisEngine = new AnalysisEngine();
        const suggestionEngine = new SuggestionEngine('openai');

        // ✅ progressCallback ensures progress updates are awaited and consistent
        const progressCallback = async (progress: number): Promise<void> => {
          try {
            await job.updateProgress(progress);
            await Analysis.findByIdAndUpdate(analysisId, { $set: { progress } });

            io.to(`analysis:${analysisId}`).emit('analysis:progress', {
              analysisId,
              progress,
            });
          } catch (progressErr) {
            logger.warn(
              `⚠️ Failed to update progress for analysis ${analysisId}:`,
              progressErr
            );
          }
        };

        // 🔍 Run static and AI-based analysis
        const { issues } = await analysisEngine.analyzeCodebase(
          path.resolve('uploads', 'projects', projectId),
          progressCallback
        );

        // 💡 Generate AI-powered suggestions
        const suggestions = await suggestionEngine.generateSuggestions(issues);

        // 🧾 Persist analysis results
        await Issue.insertMany(issues.map(i => ({ ...i, analysis: analysisId })));
        await Suggestion.insertMany(
          suggestions.map(s => ({ ...s, analysis: analysisId }))
        );

        // ✅ Mark analysis as completed
        await Analysis.findByIdAndUpdate(analysisId, {
          $set: {
            status: 'completed',
            progress: 100,
            completedAt: new Date(),
          },
        });

        io.to(`analysis:${analysisId}`).emit('analysis:complete', { analysisId });
        logger.info(`✅ Analysis job ${analysisId} completed successfully`);
      } catch (err: any) {
        logger.error(`💥 Analysis job ${analysisId} failed:`, err);

        // Update DB with failure status
        await Analysis.findByIdAndUpdate(analysisId, {
          $set: {
            status: 'failed',
            error: err.message || 'Unknown error',
            progress: 100,
          },
        });

        // Notify clients
        io.to(`analysis:${analysisId}`).emit('analysis:error', {
          analysisId,
          message: err.message || 'Analysis failed',
        });

        throw err; // Let BullMQ mark job as failed
      }
    },
    {
      // ✅ Consistent BullMQ configuration
      connection: queueConnection,
      prefix: queueConfig.prefix,
      concurrency: parseInt(process.env.ANALYSIS_SOCKET_WORKER_CONCURRENCY || '1', 10),
      lockDuration: parseInt(
        process.env.ANALYSIS_LOCK_DURATION_MS || String(20 * 60 * 1000),
        10
      ),
    }
  );

  /** 🔁 Worker event listeners */
  worker.on('completed', job => logger.info(`🎉 Worker completed job ${job.id}`));

  worker.on('failed', (job, err) =>
    logger.error(`💥 Worker job ${job?.id} failed:`, err)
  );

  worker.on('progress', (job, progress) =>
    logger.debug(`📈 Job ${job.id} progress: ${progress}%`)
  );

  worker.on('stalled', jobId =>
    logger.warn(`⚠️ Job ${jobId} stalled and is being retried`)
  );

  /** 🧹 Graceful shutdown handler for the worker */
  process.on('SIGTERM', async () => {
    logger.info('🛑 Closing analysis worker...');
    await worker.close();
    await redis.quit();
    logger.info('✅ Analysis worker closed gracefully.');
  });

  process.on('SIGINT', async () => {
    logger.info('🛑 Closing analysis worker (Ctrl+C)...');
    await worker.close();
    await redis.quit();
    logger.info('✅ Worker shutdown complete.');
  });
}
