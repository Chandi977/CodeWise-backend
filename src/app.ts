/* eslint-disable @typescript-eslint/no-misused-promises */
import express, { Application, Request, Response } from 'express';
import dotenv from 'dotenv';
dotenv.config();

import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';

// 🧱 Config
import { appConfig } from './config/app.config';
import { connectDatabase } from './config/database';
import { closeRedisClient } from './config/redis';

// 🧰 Middlewares
import { errorHandler } from './middlewares/errorHandler.middleware';
import { rateLimitMiddleware } from './middlewares/rateLimit.middleware';
import { authMiddleware } from './middlewares/auth.middleware';

// 🚏 Routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import projectRoutes from './routes/project.routes';
import analysisRoutes from './routes/analysis.routes';
import pluginRoutes from './routes/plugin.routes';

// 🔌 WebSocket
import { setupAnalysisSocket } from './websocket/analysisSocket';

// 🧾 Utils
import { logger } from './utils/logger';

class CodeWiseServer {
  private app: Application;
  private httpServer;
  private io: SocketIOServer;
  // private redis;

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: appConfig.corsOrigin,
        credentials: true,
      },
    });

    // ✅ Use centralized Redis client
    // this.redis = createRedisClient();

    this.initializeMiddlewares();
    this.initializeRoutes();
    this.initializeWebSocket();
    this.initializeErrorHandling();
  }

  /** 🧱 Express & Security Middlewares */
  private initializeMiddlewares(): void {
    this.app.use(helmet());
    this.app.use(
      cors({
        origin: appConfig.corsOrigin,
        credentials: true,
      }),
    );

    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    this.app.use(compression());
    this.app.use(
      morgan('combined', {
        stream: { write: (message) => logger.info(message.trim()) },
      }),
    );

    this.app.use(rateLimitMiddleware);

    // Health Check Route
    this.app.get('/health', (_req: Request, res: Response) =>
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      }),
    );
  }

  /** 🚏 Route Initialization */
  private initializeRoutes(): void {
    const apiBase = '/api/v1';

    // Public
    this.app.use(`${apiBase}/auth`, authRoutes);

    // Protected (JWT)
    this.app.use(`${apiBase}/users`, authMiddleware, userRoutes);
    this.app.use(`${apiBase}/projects`, authMiddleware, projectRoutes);
    this.app.use(`${apiBase}/analysis`, authMiddleware, analysisRoutes);
    this.app.use(`${apiBase}/plugins`, authMiddleware, pluginRoutes);

    // 404 Handler
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        message: 'Route not found',
      });
    });
  }

  /** 🔌 WebSocket Initialization */
  private initializeWebSocket(): void {
    setupAnalysisSocket(this.io);
    logger.info('🔌 WebSocket initialized successfully');
  }

  /** 🧩 Global Error Handler */
  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  /** 🚀 Start HTTP + Socket Server */
  public async start(): Promise<void> {
    try {
      await connectDatabase();

      this.httpServer.listen(appConfig.port, () => {
        logger.info(`🚀 CodeWise backend running on port ${appConfig.port}`);
        logger.info(`📊 Environment: ${appConfig.nodeEnv}`);
        logger.info(`🔗 API Base: http://localhost:${appConfig.port}/api/v1`);
      });

      // Handle graceful shutdowns
      process.on('SIGTERM', () => void this.gracefulShutdown());
      process.on('SIGINT', () => void this.gracefulShutdown());
    } catch (err) {
      logger.error('❌ Failed to start server:', err);
      process.exit(1);
    }
  }

  /** 🛑 Graceful Shutdown */
  private async gracefulShutdown(): Promise<void> {
    logger.info('🛑 Initiating graceful shutdown...');

    try {
      // Close HTTP server
      this.httpServer.close(() => logger.info('HTTP server closed'));

      // Close MongoDB
      await mongoose.connection.close(false);
      logger.info('✅ MongoDB connection closed');

      // Close Redis
      await closeRedisClient();
      logger.info('✅ Redis connection closed');

      // Close Socket.IO
      this.io.close(() => logger.info('✅ Socket.IO server closed'));

      logger.info('🟢 Shutdown complete. Exiting process...');
      process.exit(0);
    } catch (err) {
      logger.error('💥 Error during shutdown:', err);
      process.exit(1);
    }
  }
}

// 🧠 Initialize & Launch
(async () => {
  const server = new CodeWiseServer();
  await server.start();
})();

export default CodeWiseServer;
