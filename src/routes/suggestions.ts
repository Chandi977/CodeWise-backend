import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();

// @route   GET api/suggestions/:fileId
// @desc    Get suggestions for a file
// @access  Private
router.get('/:fileId', authMiddleware, (req, res) => {
  res.send('Get suggestions for a file');
});

export default router;
