/**
 * Application Entry Point
 *
 * Starts the HTTP server with graceful shutdown handling.
 * Uses @godaddy/terminus for health checks and graceful shutdown.
 *
 * Graceful shutdown:
 * 1. Stop accepting new connections
 * 2. Wait for in-flight requests to finish (timeout: 10s)
 * 3. Close database connections
 * 4. Close Redis connections
 * 5. Flush logs
 * 6. Exit process
 */

import http from 'node:http';
import { createTerminus } from '@godaddy/terminus';
import config from './lib/config.js';
import logger from './lib/logger.js';
import app from './server.js';
import { disconnect as disconnectDb, healthCheck as dbHealthCheck } from './lib/prisma.js';
import {
  closeConnections as closeRedisConnections,
  healthCheck as redisHealthCheck,
} from './lib/queue.js';
import { flushLogs } from './lib/logger.js';

/**
 * Create HTTP server
 */
const server = http.createServer(app);

/**
 * Graceful shutdown function
 * Called by terminus on SIGTERM/SIGINT
 */
async function onSignal() {
  logger.info('Shutdown signal received, starting graceful shutdown...');

  try {
    // Close database connections
    await disconnectDb();

    // Close Redis connections (queue)
    await closeRedisConnections();

    // Flush all log streams
    await flushLogs();

    logger.info('Graceful shutdown completed');
  } catch (error) {
    logger.error({ error }, 'Error during graceful shutdown');
    throw error;
  }
}

/**
 * Health check function for terminus
 * Called periodically by load balancers
 */
async function onHealthCheck() {
  const checks = {
    database: await dbHealthCheck(),
    redis: await redisHealthCheck(),
  };

  const isHealthy = Object.values(checks).every((check) => check === true);

  return {
    status: isHealthy ? 'ok' : 'unhealthy',
    checks,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Configure terminus for graceful shutdown
 * - onSignal: Called on SIGTERM/SIGINT
 * - healthChecks: Health check endpoint
 * - timeout: Grace period for shutdown (10 seconds)
 * - beforeShutdown: Wait for server to stop accepting connections
 */
createTerminus(server, {
  signal: 'SIGTERM',
  healthChecks: {
    '/health': onHealthCheck,
    '/health/live': async () => ({ status: 'ok' }), // Liveness probe (always returns ok if process is running)
    '/health/ready': onHealthCheck, // Readiness probe (checks dependencies)
  },
  timeout: 10000, // 10 seconds grace period
  beforeShutdown: async () => {
    logger.info('Stopping server from accepting new connections...');
    return new Promise((resolve) => {
      server.close(() => {
        logger.info('Server stopped accepting new connections');
        resolve();
      });
    });
  },
  onSignal,
  onShutdown: async () => {
    logger.info('Shutdown complete');
  },
});

/**
 * Handle uncaught errors
 * Log and attempt graceful shutdown
 */
process.on('uncaughtException', (error) => {
  logger.error({ error, stack: error.stack }, 'Uncaught exception');
  // Attempt graceful shutdown
  onSignal()
    .then(() => process.exit(1))
    .catch(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled rejection');
  // Log but don't exit - let the process continue
  // In production, you might want to exit here too
});

/**
 * Start server
 */
const PORT = config.PORT;

server.listen(PORT, () => {
  logger.info(
    {
      port: PORT,
      env: config.NODE_ENV,
      nodeVersion: process.version,
    },
    'HTTP server started'
  );
});

// Export server for testing
export default server;
