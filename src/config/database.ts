/* eslint-disable @typescript-eslint/no-explicit-any */
import mongoose from 'mongoose';
import { logger } from '../utils/logger';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

export const dbConfig = {
  // Use MONGODB_URI (Atlas naming convention) or fallback to local MongoDB
  uri: (process.env.MONGODB_URI || process.env.MONGO_URI) as string,
  options: {
    dbName: process.env.DB_NAME || 'codewise', // optional explicit db name
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
    family: 4, // ✅ forces IPv4 (fixes "::1" IPv6 issues on Windows)
  },
};

/**
 * 🧩 Connect to MongoDB (Atlas or Local)
 * Includes retry + logging + graceful event handling.
 */
export async function connectDatabase(retryCount = 3): Promise<void> {
  const { uri, options } = dbConfig;

  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      await mongoose.connect(uri, options);
      logger.info(`✅ MongoDB connected successfully [Attempt ${attempt}]`);
      setupConnectionEvents();
      return; // exit once connected
    } catch (error: any) {
      logger.error(`💥 MongoDB connection attempt ${attempt} failed: ${error.message}`);
      if (attempt < retryCount) {
        const delay = attempt * 3000;
        logger.warn(`⏳ Retrying MongoDB connection in ${delay / 1000}s...`);
        await new Promise((res) => setTimeout(res, delay));
      } else {
        logger.error('❌ MongoDB connection failed after all retry attempts');
        process.exit(1);
      }
    }
  }
}

/**
 * 🧠 Sets up MongoDB connection event listeners for better observability.
 */
function setupConnectionEvents() {
  const conn = mongoose.connection;

  conn.on('connected', () => {
    logger.info('🟢 MongoDB connection established.');
  });

  conn.on('reconnected', () => {
    logger.info('🟢 MongoDB reconnected.');
  });

  conn.on('disconnected', () => {
    logger.warn('🟠 MongoDB disconnected.');
  });

  conn.on('error', (err: Error) => {
    logger.error(`🔴 MongoDB connection error: ${err.message}`);
  });
}

/**
 * 🧹 Gracefully close the database connection on process exit
 */
// eslint-disable-next-line @typescript-eslint/no-misused-promises
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  logger.info('🔒 MongoDB connection closed gracefully');
  process.exit(0);
});
