/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, Request, Response, NextFunction } from 'express';
import { AnalysisService } from '../services/AnalysisService';
import { logger } from '../utils/logger';
// import { authMiddleware } from '../middlewares/auth.middleware'; // Uncomment when JWT ready

const analysisRouter = Router();
const analysisService = new AnalysisService();

/**
 * @route   POST /api/v1/analysis/start
 * @desc    Start a new code analysis job
 * @access  Private
 */
analysisRouter.post(
  '/start',
  async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
    try {
      const { projectId, options } = req.body;
      const userId = req.user?.id;

      if (!userId) throw new Error('Unauthorized: Missing user ID');

      logger.info(`🚀 Starting analysis for project ${projectId} by user ${userId}`);

      const analysis = await analysisService.startAnalysis(projectId, userId, options);

      res.status(202).json({
        success: true,
        message: '✅ Analysis started successfully',
        data: {
          analysisId: analysis._id,
          status: analysis.status,
        },
      });
    } catch (error) {
      logger.error('❌ Error starting analysis:', error);
      next(error);
    }
  },
);

/**
 * @route   GET /api/v1/analysis/project/:projectId
 * @desc    Get all analyses for a specific project
 * @access  Private
 */
analysisRouter.get(
  '/project/:projectId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId } = req.params;

      const analyses = await analysisService.getProjectAnalyses(projectId);

      res.json({
        success: true,
        data: analyses,
      });
    } catch (error) {
      logger.error('❌ Error fetching project analyses:', error);
      next(error);
    }
  },
);

/**
 * @route   GET /api/v1/analysis/:id
 * @desc    Get analysis details by ID
 * @access  Private
 */
analysisRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const analysis = await analysisService.getAnalysisById(id);

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    logger.error('❌ Error fetching analysis by ID:', error);
    next(error);
  }
});

/**
 * @route   GET /api/v1/analysis/:id/issues
 * @desc    Get all issues detected in an analysis
 * @access  Private
 */
analysisRouter.get('/:id/issues', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { severity, type } = req.query;

    const issues = await analysisService.getAnalysisIssues(id, severity as string, type as string);

    res.json({
      success: true,
      data: issues,
    });
  } catch (error) {
    logger.error('❌ Error fetching analysis issues:', error);
    next(error);
  }
});

/**
 * @route   GET /api/v1/analysis/:id/suggestions
 * @desc    Get AI code suggestions for an analysis
 * @access  Private
 */
analysisRouter.get('/:id/suggestions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const suggestions = await analysisService.getAnalysisSuggestions(id);

    res.json({
      success: true,
      data: suggestions,
    });
  } catch (error) {
    logger.error('❌ Error fetching AI suggestions:', error);
    next(error);
  }
});

/**
 * @route   POST /api/v1/analysis/:id/cancel
 * @desc    Cancel an ongoing analysis
 * @access  Private
 */
analysisRouter.post(
  '/:id/cancel',
  async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      await analysisService.cancelAnalysis(id, userId);

      res.json({
        success: true,
        message: '🛑 Analysis cancelled successfully',
      });
    } catch (error) {
      logger.error('❌ Error cancelling analysis:', error);
      next(error);
    }
  },
);

/**
 * @route   POST /api/v1/analysis/suggestions/:id/apply
 * @desc    Apply an AI suggestion to the codebase
 * @access  Private
 */
analysisRouter.post(
  '/suggestions/:id/apply',
  async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      await analysisService.applySuggestion(id, userId);

      res.json({
        success: true,
        message: '✅ Suggestion applied successfully',
      });
    } catch (error) {
      logger.error('❌ Error applying suggestion:', error);
      next(error);
    }
  },
);

/**
 * @route   POST /api/v1/analysis/suggestions/:id/feedback
 * @desc    Provide feedback on a suggestion
 * @access  Private
 */
analysisRouter.post(
  '/suggestions/:id/feedback',
  async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { rating, comment } = req.body;
      const userId = req.user?.id;

      await analysisService.provideSuggestionFeedback(id, userId, rating, comment);

      res.json({
        success: true,
        message: '💬 Feedback submitted successfully',
      });
    } catch (error) {
      logger.error('❌ Error submitting feedback:', error);
      next(error);
    }
  },
);

export default analysisRouter;
