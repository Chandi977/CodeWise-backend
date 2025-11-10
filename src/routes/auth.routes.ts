/* eslint-disable @typescript-eslint/no-misused-promises */
import { Router } from 'express';
import { AuthService } from '../services/AuthService';
import { validate, authSchemas } from '../middlewares/validation.middleware';
import { strictRateLimitMiddleware } from '../middlewares/rateLimit.middleware';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
const authService = new AuthService();

// @route   POST /api/v1/auth/register
// @desc    Register new user
// @access  Public
router.post(
  '/register',
  strictRateLimitMiddleware,
  validate(authSchemas.register),
  async (req, res, next) => {
    try {
      const { user, tokens } = await authService.register(req.body);

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user: {
            id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
          tokens,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// @route   POST /api/v1/auth/login
// @desc    Login user
// @access  Public
router.post(
  '/login',
  strictRateLimitMiddleware,
  validate(authSchemas.login),
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const { user, tokens } = await authService.login(email, password);

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user._id,
            email: user.email,
            name: user.name,
            role: user.role,
          },
          tokens,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

// @route   POST /api/v1/auth/refresh
// @desc    Refresh access token
// @access  Public
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token required',
      });
    }

    const accessToken = await authService.refreshToken(refreshToken);

    return res.json({
      success: true,
      data: { accessToken },
    });
  } catch (error) {
    return next(error);
  }
});

// @route   POST /api/v1/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', authMiddleware, async (req: any, res, next) => {
  try {
    await authService.logout(req.user.id);

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/v1/auth/change-password
// @desc    Change password
// @access  Private
router.post(
  '/change-password',
  authMiddleware,
  validate(authSchemas.changePassword),
  async (req: any, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;
      await authService.changePassword(req.user.id, currentPassword, newPassword);

      res.json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      next(error);
    }
  },
);

// @route   POST /api/v1/auth/forgot-password
// @desc    Request password reset
// @access  Public
router.post('/forgot-password', strictRateLimitMiddleware, async (req, res, next) => {
  try {
    const { email } = req.body;
    const message = await authService.requestPasswordReset(email);

    res.json({
      success: true,
      message,
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/v1/auth/reset-password
// @desc    Reset password
// @access  Public
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    await authService.resetPassword(token, newPassword);

    res.json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
