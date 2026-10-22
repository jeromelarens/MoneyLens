import mongoose from 'mongoose';
import { logger } from '../observability/logger.js';

let isConnecting = false;

/**
 * Connects to MongoDB with connection lifecycle monitoring.
 * Logs state transitions without exposing credentials.
 */
export async function connectDatabase(uri: string): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (isConnecting) {
    logger.debug('Database connection already in progress');
    return mongoose;
  }

  isConnecting = true;

  // Register listeners if not already attached
  if (mongoose.connection.listenerCount('connected') === 0) {
    mongoose.connection.on('connected', () => {
      logger.info('MongoDB connection established');
    });

    mongoose.connection.on('error', (err) => {
      logger.error({ err }, 'MongoDB connection error');
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB connection lost');
    });
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: process.env.NODE_ENV !== 'production',
    });
    isConnecting = false;
    return conn;
  } catch (error) {
    isConnecting = false;
    logger.error('Failed to establish initial MongoDB connection');
    throw error;
  }
}

/**
 * Gracefully closes the MongoDB connection.
 */
export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.disconnect();
      logger.info('MongoDB connection closed cleanly');
    } catch (error) {
      logger.error({ error }, 'Error occurred while closing MongoDB connection');
    }
  }
}

/**
 * Returns true if MongoDB connection is ready (readyState === 1).
 */
export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
