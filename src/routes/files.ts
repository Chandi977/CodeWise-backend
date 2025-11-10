import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// @route   GET api/files/:projectId
// @desc    Get all files for a project
// @access  Private
router.get('/:projectId', authMiddleware, (req, res) => {
  res.send('Get all files for a project');
});

// @route   POST api/files/:projectId
// @desc    Create a new file
// @access  Private
router.post('/:projectId', authMiddleware, (req, res) => {
  res.send('Create a new file');
});

export default router;
