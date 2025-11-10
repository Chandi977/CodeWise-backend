import { Request, Response, NextFunction } from 'express';
import { JWTService } from '../services/JWTService';
import { logger } from '../utils/logger';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * 🔐 Authentication Middleware
 * Verifies the JWT token and attaches the decoded user payload to `req.user`.
 */
export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Authorization header missing or malformed',
      });
      return;
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Access token missing',
      });
      return;
    }

    const jwtService = new JWTService();
    let payload;

    try {
      // ✅ Support both sync and async verify methods
      const result = jwtService.verifyAccessToken(token);
      payload = result instanceof Promise ? await result : result;
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        res.status(401).json({
          success: false,
          message: 'Token expired. Please refresh your session.',
        });
        return;
      }
      logger.error(`JWT verification failed: ${err.message}`);
      res.status(401).json({
        success: false,
        message: 'Invalid or malformed token',
      });
      return;
    }

    // ✅ Attach user payload to request
    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
    };

    next();
  } catch (error: any) {
    logger.error(`Auth middleware error: ${error.message}`);
    res.status(401).json({
      success: false,
      message: error.message || 'Unauthorized',
    });
  }
};

/**
 * 🛡️ Role-Based Authorization Middleware
 * Restricts route access to users with allowed roles.
 */
export const authorize =
  (...roles: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized: No user context',
      });
      return;
    }

    const userRole = req.user.role.toLowerCase();
    const allowedRoles = roles.map((r) => r.toLowerCase());

    if (!allowedRoles.includes(userRole)) {
      logger.warn(`Access denied for user role: ${userRole}`);
      res.status(403).json({
        success: false,
        message: 'Forbidden: Insufficient permissions',
      });
      return;
    }

    next();
  };
