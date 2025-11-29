/**
 * Email Worker
 * 
 * BullMQ worker that processes email jobs from the queue.
 * Handles sending verification emails via Resend.
 * 
 * This worker should run in a separate process from the HTTP server.
 * Can be scaled horizontally by running multiple worker instances.
 * 
 * Usage: npm run worker
 */

import { Worker } from 'bullmq';
import Redis from 'ioredis';
import config from '../lib/config.js';
import logger from '../lib/logger.js';
import { sendVerificationEmail } from '../lib/mailer.js';
import prisma from '../lib/prisma.js';
import { flushLogs, disconnect as disconnectDb } from '../lib/prisma.js';

/**
 * Redis connection for BullMQ worker
 * Separate connection from the queue producer
 */
const redisConnection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    logger.warn({ delay, times }, 'Worker Redis connection retry');
    return delay;
  },
});

// Handle Redis connection events
redisConnection.on('connect', () => {
  logger.info('Email worker: Redis connected');
});

redisConnection.on('error', (error) => {
  logger.error({ error }, 'Email worker: Redis connection error');
});

/**
 * Email Worker
 * Processes jobs from the 'email' queue
 */
const emailWorker = new Worker(
  'email',
  async (job) => {
    const { type, userId, email, token, name } = job.data;

    logger.debug({
      jobId: job.id,
      type,
      userId,
      email,
    }, 'Processing email job');

    try {
      switch (type) {
        case 'sendVerification':
          // Send verification email
          const result = await sendVerificationEmail({
            to: email,
            token,
            name,
          });

          // Update email_sent_at timestamp in database (optional)
          // Find the token by hashing it and matching with stored hash
          // For simplicity, we'll skip this - the email was sent successfully
          
          logger.info({
            jobId: job.id,
            messageId: result.id,
            userId,
            email,
          }, 'Verification email sent successfully');

          return {
            success: true,
            messageId: result.id,
          };

        default:
          throw new Error(`Unknown email job type: ${type}`);
      }
    } catch (error) {
      logger.error({
        jobId: job.id,
        error: error.message,
        stack: error.stack,
        userId,
        email,
      }, 'Failed to process email job');

      // Re-throw to mark job as failed (BullMQ will retry if configured)
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 5, // Process up to 5 jobs concurrently
    limiter: {
      max: 100, // Max 100 jobs
      duration: 60000, // Per 60 seconds (Resend rate limits)
    },
  }
);

// Worker event handlers

emailWorker.on('completed', (job) => {
  logger.debug({ jobId: job.id }, 'Email job completed');
});

emailWorker.on('failed', (job, error) => {
  logger.error({
    jobId: job?.id,
    error: error.message,
    stack: error.stack,
    attemptsMade: job?.attemptsMade,
  }, 'Email job failed');

  // Log to dead-letter log for failed jobs after all retries
  if (job?.attemptsMade >= (job?.opts?.attempts || 3)) {
    logger.error({
      jobId: job.id,
      data: job.data,
      error: error.message,
      stack: error.stack,
    }, 'Email job permanently failed - dead letter');
  }
});

emailWorker.on('error', (error) => {
  logger.error({ error }, 'Email worker error');
});

// Graceful shutdown handler
async function shutdown() {
  logger.info('Shutting down email worker...');

  try {
    // Stop accepting new jobs
    await emailWorker.close();

    // Close Redis connection
    await redisConnection.quit();

    // Disconnect from database
    await disconnectDb();

    // Flush logs
    await flushLogs();

    logger.info('Email worker shut down successfully');
    process.exit(0);
  } catch (error) {
    logger.error({ error }, 'Error during worker shutdown');
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error({ error, stack: error.stack }, 'Uncaught exception in email worker');
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled rejection in email worker');
  shutdown();
});

logger.info('Email worker started and ready to process jobs');

// TODO: RESUME-HERE - Add support for password reset emails, welcome emails, etc.

