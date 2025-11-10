/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose from 'mongoose';
import { Queue, JobsOptions } from 'bullmq';
import { createRedisClient } from '../config/redis';
import { Analysis, IAnalysis } from '../models/Analysis.model';
import { Issue, IIssue } from '../models/Issue.model';
import { Suggestion, ISuggestion } from '../models/Suggestion.model';
import {
  NotFoundError,
  AuthorizationError,
  ApiError,
} from '../middlewares/errorHandler.middleware';
import { logger } from '../utils/logger';
import { BULLMQ_CONSTANTS } from '../utils/constants';

/**
 * Service responsible for managing code analyses, AI suggestions,
 * and issue tracking with BullMQ + MongoDB transactions.
 */
export class AnalysisService {
  private analysisQueue: Queue;

  constructor() {
    // ✅ Shared Redis connection for all queues
    const redis = createRedisClient();
    this.analysisQueue = new Queue(BULLMQ_CONSTANTS.QUEUES.ANALYSIS, {
      connection: redis,
    });
    logger.info('📦 AnalysisService initialized with BullMQ queue.');
  }

  /**
   * Start a new analysis job for a project.
   * Prevents duplicates, creates DB record, and queues BullMQ job.
   */
  async startAnalysis(
    projectId: string,
    userId: string,
    options: Record<string, any> = {},
  ): Promise<IAnalysis> {
    // 🚫 Prevent duplicate running analyses
    const existingAnalysis = await Analysis.findOne({
      project: projectId,
      status: { $in: ['pending', 'in-progress'] },
    });

    if (existingAnalysis) {
      throw new ApiError(409, 'An analysis for this project is already in progress.');
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // ✅ Option 1 (simplest, fully typed) — Use .save() instead of create()
      const created = await new Analysis({
        project: projectId,
        triggeredBy: userId,
        status: 'pending',
        progress: 0,
        options,
      }).save({ session });

      // 2️⃣ Queue the analysis job in BullMQ
      const jobOptions: JobsOptions = {
        priority: options.priority || 5,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 20 },
      };

      const job = await this.analysisQueue.add(
        BULLMQ_CONSTANTS.JOBS.ANALYZE_PROJECT,
        {
          analysisId: (created._id as mongoose.Types.ObjectId).toString(),
          projectId,
          userId,
          options,
        },
        jobOptions,
      );

      created.jobId = job.id;
      await created.save({ session });

      await session.commitTransaction();
      logger.info(`🧩 Analysis job queued successfully: ${created._id} (jobId: ${job.id})`);
      return created as IAnalysis;
    } catch (error: any) {
      await session.abortTransaction();
      logger.error(`❌ Failed to start analysis: ${error.message}`);
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to queue analysis job');
    } finally {
      session.endSession();
    }
  }

  /**
   * Retrieve analysis by ID.
   */
  async getAnalysisById(analysisId: string): Promise<IAnalysis> {
    const analysis = await Analysis.findById(analysisId)
      .populate('project', 'name')
      .populate('triggeredBy', 'name email');

    if (!analysis) throw new NotFoundError('Analysis not found');
    return analysis;
  }

  /**
   * Retrieve analysis by BullMQ job ID.
   */
  async getAnalysisByJobId(jobId: string): Promise<IAnalysis> {
    const analysis = await Analysis.findOne({ jobId });
    if (!analysis) throw new NotFoundError('Analysis not found for the given job ID');
    return analysis;
  }

  /**
   * Retrieve all analyses for a specific project.
   */
  async getProjectAnalyses(projectId: string): Promise<IAnalysis[]> {
    return Analysis.find({ project: projectId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('triggeredBy', 'name email');
  }

  /**
   * Retrieve all issues from a given analysis.
   */
  async getAnalysisIssues(analysisId: string, severity?: string, type?: string): Promise<IIssue[]> {
    const query: Record<string, any> = { analysis: analysisId };
    if (severity) query.severity = severity;
    if (type) query.type = type;

    const issues = await Issue.find(query).sort({ severity: 1, line: 1 });
    if (!issues.length) logger.warn(`⚠️ No issues found for analysis ${analysisId}`);
    return issues;
  }

  /**
   * Retrieve AI-generated suggestions for an analysis.
   */
  async getAnalysisSuggestions(analysisId: string): Promise<ISuggestion[]> {
    const suggestions = await Suggestion.find({ analysis: analysisId }).sort({
      priority: 1,
      confidence: -1,
    });

    if (!suggestions.length) logger.info(`No AI suggestions for analysis ${analysisId}`);
    return suggestions;
  }

  /**
   * Cancel a running or queued analysis job.
   */
  async cancelAnalysis(analysisId: string, userId: string): Promise<void> {
    const analysis = await Analysis.findById(analysisId);
    if (!analysis) throw new NotFoundError('Analysis not found');

    if (analysis.triggeredBy.toString() !== userId) {
      throw new AuthorizationError('You can only cancel your own analyses');
    }

    if (['completed', 'failed'].includes(analysis.status)) {
      throw new ApiError(400, 'Cannot cancel completed or failed analysis');
    }

    const jobs = await this.analysisQueue.getJobs(['waiting', 'active', 'delayed', 'paused']);

    const job = jobs.find((j) => j.data.analysisId === analysisId);
    if (job) {
      await job.remove();
      logger.info(`🗑️ BullMQ job removed for analysis ${analysisId}`);
    }

    analysis.status = 'failed';
    analysis.error = 'Cancelled by user';
    await analysis.save();

    logger.info(`🛑 Analysis cancelled by user ${userId}: ${analysisId}`);
  }

  /**
   * Mark an AI suggestion as applied.
   */
  async applySuggestion(suggestionId: string, userId: mongoose.Types.ObjectId): Promise<void> {
    const suggestion = await Suggestion.findById(suggestionId).populate('createdBy');
    if (!suggestion) throw new NotFoundError('Suggestion not found');

    if (suggestion.createdBy && suggestion.createdBy._id.toString() !== userId.toString()) {
      throw new AuthorizationError('You are not allowed to apply this suggestion');
    }

    suggestion.status = 'applied';
    suggestion.appliedBy = userId;
    suggestion.appliedAt = new Date();
    await suggestion.save();

    logger.info(`✨ Suggestion applied successfully: ${suggestionId}`);
  }

  /**
   * Record user feedback on an AI suggestion.
   */
  async provideSuggestionFeedback(
    suggestionId: string,
    userId: mongoose.Types.ObjectId,
    rating: number,
    comment: string,
  ): Promise<void> {
    const suggestion = await Suggestion.findById(suggestionId);
    if (!suggestion) throw new NotFoundError('Suggestion not found');

    suggestion.feedback = {
      rating,
      comment,
      user: userId,
      createdAt: new Date(), // ✅ works with Suggestion.model.ts
    };

    await suggestion.save();
    logger.info(`🗒️ Feedback recorded for suggestion ${suggestionId} by ${userId}`);
  }
}

export const analysisService = new AnalysisService();
