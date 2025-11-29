/**
 * BullMQ Queue Setup
 *
 * Configures BullMQ for background job processing.
 * Jobs are queued here and processed by the email worker.
 *
 * This module exports:
 * - emailQueue: Queue instance for email jobs
 * - closeConnections: Function to gracefully close Redis connections
 */

import { Queue } from 'bullmq';
import Redis from 'ioredis';
import config from './config.js';
import logger from './logger.js';

/**
 * Redis connection for BullMQ
 * Configured with connection pooling and error handling.
 */
const redisConnection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    logger.warn({ delay, times }, 'Redis connection retry');
    return delay;
  },
});

// Handle Redis connection events
redisConnection.on('connect', () => {
  logger.info('Redis connected');
});

redisConnection.on('error', (error) => {
  logger.error({ error }, 'Redis connection error');
});

redisConnection.on('close', () => {
  logger.info('Redis connection closed');
});

/**
 * Email queue for background email processing
 * Jobs are enqueued with retry logic and exponential backoff.
 *
 * Job data structure:
 * - type: 'sendVerification'
 * - userId: User ID
 * - email: User email
 * - token: Plain verification token (not hashed)
 * - name?: User name (optional)
 */
export const emailQueue = new Queue('email', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3, // Retry 3 times before failing
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2s delay, exponential backoff
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000, // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days for debugging
    },
  },
});

/**
 * Gracefully close Redis connections
 * Call this during shutdown to ensure all connections are closed cleanly.
 */
export async function closeConnections() {
  try {
    await emailQueue.close();
    await redisConnection.quit();
    logger.info('Redis connections closed');
  } catch (error) {
    logger.error({ error }, 'Error closing Redis connections');
    throw error;
  }
}

/**
 * Health check: verify Redis connection
 * @returns {Promise<boolean>} True if connected
 */
export async function healthCheck() {
  try {
    await redisConnection.ping();
    return true;
  } catch (error) {
    logger.error({ error }, 'Redis health check failed');
    return false;
  }
}

export default emailQueue;
