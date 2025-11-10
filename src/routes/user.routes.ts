import { UserService } from '../services/UserService';
import { authorize } from '../middlewares/auth.middleware';
import { Router } from 'express';
const userRouter = Router();
const userService = new UserService();

// @route   GET /api/v1/users/me
// @desc    Get current user profile
// @access  Private
userRouter.get('/me', async (req: any, res, next) => {
  try {
    const user = await userService.getUserById(req.user.id);

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/v1/users/me
// @desc    Update user profile
// @access  Private
userRouter.put('/me', async (req: any, res, next) => {
  try {
    const user = await userService.updateUser(req.user.id, req.body);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/v1/users/me/stats
// @desc    Get user statistics
// @access  Private
userRouter.get('/me/stats', async (req: any, res, next) => {
  try {
    const stats = await userService.getUserStats(req.user.id);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/v1/users
// @desc    Get all users (Admin only)
// @access  Private/Admin
userRouter.get('/', authorize('admin'), async (_req: any, res, next) => {
  try {
    const users = await userService.getAllUsers();

    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    next(error);
  }
});

export default userRouter;
