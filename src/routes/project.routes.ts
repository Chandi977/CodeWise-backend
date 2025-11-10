/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Router, Request, Response, NextFunction } from 'express';
import { ProjectService } from '../services/ProjectService';
import { uploadSingleFile } from '../middlewares/upload.middleware';
import { logger } from '../utils/logger';
// import { authMiddleware } from '../middlewares/auth.middleware'; // enable when JWT ready

const projectRouter = Router();
const projectService = new ProjectService();

/**
 * 🧩 Utility to ensure userId is available from request
 */
const requireUser = (req: Request & { user?: any }) => {
  if (!req.user?.id) {
    throw new Error('Unauthorized: Missing or invalid user ID');
  }
  return req.user.id;
};

/**
 * @route   GET /api/v1/projects
 * @desc    Get all projects for the logged-in user
 * @access  Private
 */
projectRouter.get('/', async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
  try {
    const userId = requireUser(req);
    const projects = await projectService.getUserProjects(userId);

    res.json({ success: true, data: projects });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/projects
 * @desc    Create a new project with optional ZIP upload
 * @access  Private
 */
projectRouter.post(
  '/',
  uploadSingleFile,
  async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
    try {
      const userId = requireUser(req);

      const projectData = {
        ...req.body,
        owner: userId,
        file: req.file,
      };

      const project = await projectService.createProject(projectData);

      res.status(201).json({
        success: true,
        message: '✅ Project created successfully',
        data: project,
      });
    } catch (error) {
      logger.error('❌ Error creating project:', error);
      next(error);
    }
  },
);

/**
 * @route   GET /api/v1/projects/:id
 * @desc    Retrieve a project by ID
 * @access  Private
 */
projectRouter.get(
  '/:id',
  async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
    try {
      const userId = requireUser(req);
      const projectId = req.params.id;

      const project = await projectService.getProjectById(projectId, userId);
      res.json({ success: true, data: project });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route   PUT /api/v1/projects/:id
 * @desc    Update project details
 * @access  Private
 */
projectRouter.put(
  '/:id',
  async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
    try {
      const userId = requireUser(req);
      const projectId = req.params.id;

      const updated = await projectService.updateProject(projectId, userId, req.body);
      res.json({
        success: true,
        message: '✅ Project updated successfully',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route   DELETE /api/v1/projects/:id
 * @desc    Soft delete (archive) a project
 * @access  Private
 */
projectRouter.delete(
  '/:id',
  async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
    try {
      const userId = requireUser(req);
      const projectId = req.params.id;

      await projectService.deleteProject(projectId, userId);
      res.json({ success: true, message: '🗃️ Project archived successfully' });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route   GET /api/v1/projects/:id/metrics
 * @desc    Analyze codebase and return project metrics
 * @access  Private
 */
projectRouter.get('/:id/metrics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.id;
    logger.info(`📊 Starting code analysis for project ${projectId}`);

    const metrics = await projectService.getProjectMetrics(projectId);

    res.json({
      success: true,
      message: '✅ Codebase analyzed successfully',
      data: metrics,
    });
  } catch (error) {
    logger.error('❌ Failed to analyze project metrics:', error);
    next(error);
  }
});

/**
 * @route   POST /api/v1/projects/:id/members
 * @desc    Add or update a project member
 * @access  Private
 */
projectRouter.post(
  '/:id/members',
  async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
    try {
      const userId = requireUser(req);
      const projectId = req.params.id;
      const { memberId, role } = req.body;

      const project = await projectService.addMember(projectId, userId, memberId, role);
      res.json({
        success: true,
        message: '👥 Member added successfully',
        data: project,
      });
    } catch (error) {
      next(error);
    }
  },
);

export default projectRouter;
