import winston from 'winston';
import path from 'path';
import fs from 'fs';
import DailyRotateFile from 'winston-daily-rotate-file'; // ✅ Correct import!

/**
 * Ensure logs directory exists
 */
const logDir = path.resolve('logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

/**
 * File log format (JSON structured)
 */
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
);

/**
 * Developer console format (color + readable)
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const extra = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `${timestamp} [${level}]: ${message}${extra}`;
  }),
);

/**
 * Create Winston logger
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  defaultMeta: { service: process.env.SERVICE_NAME || 'codewise-backend' },
  format: fileFormat,
  transports: [
    // 🔴 Error logs (daily rotation)
    new DailyRotateFile({
      dirname: logDir,
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      level: 'error',
      maxSize: '10m',
      maxFiles: '14d',
    }),

    // 🟢 Combined logs (info + errors)
    new DailyRotateFile({
      dirname: logDir,
      filename: 'combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '10m',
      maxFiles: '14d',
    }),
  ],
});

/**
 * Console transport for dev/local environments
 */
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    }),
  );
}

/**
 * Handle fatal errors gracefully
 */
process.on('uncaughtException', (err) => {
  logger.error('💥 Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('⚠️ Unhandled Promise Rejection:', reason);
});

/**
 * Graceful shutdown for logs
 */
export const closeLogger = async (): Promise<void> =>
  new Promise((resolve) => {
    logger.on('finish', resolve);
    logger.end();
  });
