/**
 * Prisma Client Module
 *
 * Singleton instance of PrismaClient for database operations.
 * Handles connection pooling and graceful disconnection.
 *
 * In production, use connection pooling via pgbouncer or similar.
 */

import { PrismaClient } from '@prisma/client';
import logger from './logger.js';

/**
 * Create Prisma client instance
 *
 * Logging is enabled in development for query debugging.
 * Connection pooling is handled by Prisma automatically.
 */
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

/**
 * Connect to database and log success
 * Called on module load to verify connection
 */
prisma
  .$connect()
  .then(() => {
    logger.info('Database connected successfully');
  })
  .catch((error) => {
    logger.error({ error }, 'Failed to connect to database');
    throw error;
  });

/**
 * Gracefully disconnect from database
 * Call this during shutdown to close connections cleanly
 */
export async function disconnect() {
  try {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  } catch (error) {
    logger.error({ error }, 'Error disconnecting from database');
    throw error;
  }
}

/**
 * Health check: verify database connection
 * @returns {Promise<boolean>} True if connected
 */
export async function healthCheck() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error({ error }, 'Database health check failed');
    return false;
  }
}

export default prisma;
