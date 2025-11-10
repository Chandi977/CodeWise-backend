import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { logger } from '../utils/logger';

/**
 * 🌐 Centralized error-handling middleware
 * Handles both operational and programming errors gracefully.
 */
export const errorHandler: ErrorRequestHandler = (
  error: any,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  // 🔍 Log detailed error info for developers
  logger.error(`❌ ${error.name || 'Error'}: ${error.message}`, {
    stack: error.stack,
    path: req.originalUrl,
    method: req.method,
  });

  // ✅ Handle specific known errors

  /** 1️⃣ Mongoose Validation Error */
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors || {}).map((err: any) => err.message);
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors,
    });
  }

  /** 2️⃣ Duplicate Key Error */
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || 'field';
    return res.status(400).json({
      success: false,
      message: `${field} already exists`,
    });
  }

  /** 3️⃣ JWT / Auth Errors */
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid authentication token',
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Authentication token expired',
    });
  }

  /** 4️⃣ Authorization Errors */
  if (error instanceof AuthorizationError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  /** 5️⃣ Custom API Errors (Operational) */
  if (error instanceof ApiError || error.isOperational || error.statusCode) {
    return res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    });
  }

  /** 6️⃣ MongoDB General Errors */
  if (error.name === 'MongoError') {
    return res.status(500).json({
      success: false,
      message: 'Database operation failed',
    });
  }

  /** 7️⃣ Fallback — Unhandled Errors */
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && {
      error: error.message,
      stack: error.stack,
    }),
  });
};

/**
 * 🧱 Base class for application-specific errors.
 * All operational errors should extend this.
 */
export class ApiError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(statusCode: number, message: string, isOperational = true) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * 🚫 Authorization error for permission-denied cases.
 * Example: `throw new AuthorizationError('Access denied')`
 */
export class AuthorizationError extends ApiError {
  constructor(message = 'You are not authorized to perform this action') {
    super(403, message, true);
    this.name = 'AuthorizationError';
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

/**
 * 🕵️ Not found error (404)
 * Example: `throw new NotFoundError('User')`
 */
export class NotFoundError extends ApiError {
  constructor(resource = 'Resource') {
    super(404, `${resource} not found`, true);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}
