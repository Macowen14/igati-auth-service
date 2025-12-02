/**
 * Prisma Client Module
 *
 * Singleton instance of PrismaClient for database operations.
 * Handles connection pooling, reconnection, and graceful disconnection.
 *
 * Configured for Neon (serverless PostgreSQL) which closes idle connections.
 * Automatically reconnects when connections are closed due to inactivity.
 *
 * IMPORTANT for Neon:
 * - Use the connection pooler URL (ends with -pooler) for better connection management
 * - Add connection pool parameters to DATABASE_URL:
 *   ?sslmode=require&connection_limit=10&pool_timeout=20
 * - Example: postgresql://user:pass@ep-xxx-pooler.us-east-1.aws.neon.tech/db?sslmode=require&connection_limit=10&pool_timeout=20
 * - The pooler handles connection lifecycle automatically
 */

import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import logger from './logger.js';

/**
 * Enhance DATABASE_URL with connection pool parameters if not already present
 * This ensures proper connection pool configuration for Neon
 */
function enhanceDatabaseUrl(url) {
  if (!url) return url;

  try {
    const urlObj = new URL(url);

    // Add connection pool parameters if not present
    const params = urlObj.searchParams;

    // Set connection_limit (default: 10 for Neon pooler)
    if (!params.has('connection_limit')) {
      params.set('connection_limit', '10');
    }

    // Set pool_timeout in seconds (default: 20 seconds)
    if (!params.has('pool_timeout')) {
      params.set('pool_timeout', '20');
    }

    // Ensure sslmode is set for Neon
    if (!params.has('sslmode') && url.includes('neon.tech')) {
      params.set('sslmode', 'require');
    }

    return urlObj.toString();
  } catch (error) {
    // If URL parsing fails, return original URL
    logger.warn({ error: error.message }, 'Failed to parse DATABASE_URL, using as-is');
    return url;
  }
}

/**
 * Create Prisma client instance with connection pool configuration
 *
 * Configuration for Neon/serverless PostgreSQL:
 * - Connection pool size: 10 connections (via connection_limit parameter)
 * - Connection timeout: 20 seconds (via pool_timeout parameter)
 * - Automatic reconnection on connection errors
 */
const enhancedDatabaseUrl = enhanceDatabaseUrl(process.env.DATABASE_URL);

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: enhancedDatabaseUrl,
    },
  },
});

// Track connection state
let isConnected = false;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 5;

/**
 * Connect to database with retry logic
 * Handles connection errors and reconnection attempts
 * Note: Prisma manages connections automatically, we only need to ensure it's initialized
 */
async function connectWithRetry() {
  // Prisma connects lazily, so we don't need to call $connect() unless disconnected
  // Only reconnect if we know we're disconnected
  if (isConnected) {
    return;
  }

  connectionAttempts = 0;

  while (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
    try {
      await prisma.$connect();
      isConnected = true;
      connectionAttempts = 0;
      logger.info('Database connected successfully');
      return;
    } catch (error) {
      connectionAttempts++;
      const errorMessage = error.message || String(error);

      // Check if DATABASE_URL is missing or invalid
      if (!process.env.DATABASE_URL) {
        logger.error(
          {
            error: errorMessage,
            attempt: connectionAttempts,
            maxAttempts: MAX_CONNECTION_ATTEMPTS,
          },
          'DATABASE_URL environment variable is not set. Please check your .env file.'
        );
        throw new Error(
          'DATABASE_URL is not set. Please configure your database connection string in the .env file.'
        );
      }

      // Check if it's a connection error (database unreachable)
      if (
        errorMessage.includes("Can't reach database server") ||
        errorMessage.includes('Connection refused') ||
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('ETIMEDOUT')
      ) {
        logger.error(
          {
            error: errorMessage,
            attempt: connectionAttempts,
            maxAttempts: MAX_CONNECTION_ATTEMPTS,
            databaseUrl: process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@'), // Mask password
          },
          `Database connection failed (attempt ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS}). Possible causes: database server is down, wrong DATABASE_URL, or network issue.`
        );

        if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
          throw new Error(
            `Failed to connect to database after ${MAX_CONNECTION_ATTEMPTS} attempts. ` +
              `Please verify: 1) DATABASE_URL is correct, 2) Database server is running, 3) Network connectivity. ` +
              `Error: ${errorMessage}`
          );
        }

        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, connectionAttempts - 1), 10000);
        logger.warn({ delay }, `Retrying database connection in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // For other errors, throw immediately
      logger.error({ error: errorMessage }, 'Database connection error');
      throw error;
    }
  }
}

/**
 * Handle Prisma query engine errors
 * Note: Prisma doesn't have a direct $on('error') event, so we handle errors in queries
 */

/**
 * Initialize connection on module load
 * Prisma connects lazily, so we don't need to connect immediately
 * Connection will happen on first query
 */
// Don't connect immediately - let Prisma connect lazily on first query
// This prevents connection pool exhaustion on startup
logger.info('Prisma client initialized. Connections will be established on first query.');

/**
 * Gracefully disconnect from database
 * Call this during shutdown to close connections cleanly
 */
export async function disconnect() {
  try {
    isConnected = false;
    await prisma.$disconnect();
    logger.info('Database disconnected');
  } catch (error) {
    logger.error({ error }, 'Error disconnecting from database');
    isConnected = false;
    throw error;
  }
}

/**
 * Execute a query with automatic reconnection
 * Only reconnects on actual connection errors, not pool exhaustion
 */
async function executeWithReconnect(queryFn) {
  try {
    return await queryFn();
  } catch (error) {
    const errorMessage = error.message || String(error);

    // Check if it's a connection pool timeout (all connections in use)
    if (errorMessage.includes('Timed out fetching a new connection from the connection pool')) {
      logger.error(
        {
          error: errorMessage,
        },
        'Connection pool exhausted. This usually means too many concurrent queries or connections not being released. ' +
          'Check for connection leaks or increase connection_limit in DATABASE_URL.'
      );
      // Don't retry pool exhaustion - throw immediately
      throw new Error(
        'Database connection pool exhausted. Please try again in a moment. ' +
          'If this persists, check for connection leaks or increase connection_limit in DATABASE_URL.'
      );
    }

    // Check if it's a connection error (not pool-related)
    if (
      errorMessage.includes('Closed') ||
      errorMessage.includes("Can't reach database server") ||
      errorMessage.includes('Connection terminated') ||
      errorMessage.includes('Connection refused') ||
      errorMessage.includes('ENOTFOUND') ||
      errorMessage.includes('ETIMEDOUT')
    ) {
      logger.warn(
        {
          error: errorMessage,
        },
        'Database connection lost. Attempting to reconnect...'
      );

      isConnected = false;

      // Attempt to reconnect
      try {
        await connectWithRetry();

        // Retry the query once after reconnection
        logger.info('Database reconnected. Retrying query...');
        return await queryFn();
      } catch (reconnectError) {
        const reconnectErrorMessage = reconnectError.message || String(reconnectError);
        logger.error(
          {
            originalError: errorMessage,
            reconnectError: reconnectErrorMessage,
          },
          'Failed to reconnect to database. Please check your database connection.'
        );
        throw reconnectError;
      }
    }

    // For other errors, throw as-is
    throw error;
  }
}

/**
 * Wrapped Prisma client with automatic reconnection
 * Recursively proxies model objects to intercept all queries
 */
const prismaWithReconnect = new Proxy(prisma, {
  get(target, prop) {
    const value = target[prop];

    // Handle connection management methods - don't wrap these
    if (prop === '$connect' || prop === '$disconnect' || prop === '$on' || prop === '$use') {
      return value;
    }

    // Wrap $ methods (like $queryRaw, $transaction, etc.)
    if (typeof value === 'function' && typeof prop === 'string' && prop.startsWith('$')) {
      return function (...args) {
        // For transaction methods, handle differently
        if (prop === '$transaction') {
          return value.apply(target, args).catch((error) => {
            return handleConnectionError(error, () => value.apply(target, args));
          });
        }

        // For all other $ methods, use executeWithReconnect
        return executeWithReconnect(() => value.apply(target, args));
      };
    }

    // Wrap model delegates (like prisma.user, prisma.post, etc.)
    // These are objects that contain query methods like findMany, create, etc.
    if (value && typeof value === 'object' && !Array.isArray(value) && value !== null) {
      // Check if it's a model delegate by checking for common Prisma model methods
      const isModelDelegate =
        typeof value.findMany === 'function' ||
        typeof value.findUnique === 'function' ||
        typeof value.create === 'function' ||
        typeof value.update === 'function' ||
        typeof value.delete === 'function' ||
        typeof value.upsert === 'function' ||
        typeof value.count === 'function' ||
        typeof value.aggregate === 'function';

      if (isModelDelegate) {
        return new Proxy(value, {
          get(modelTarget, modelProp) {
            const modelValue = modelTarget[modelProp];

            // Wrap all model query methods
            if (typeof modelValue === 'function') {
              return function (...args) {
                return executeWithReconnect(() => modelValue.apply(modelTarget, args));
              };
            }

            return modelValue;
          },
        });
      }
    }

    return value;
  },
});

/**
 * Handle connection errors with better error messages
 */
async function handleConnectionError(error, retryFn) {
  const errorMessage = error.message || String(error);

  // Don't retry on pool exhaustion
  if (errorMessage.includes('Timed out fetching a new connection from the connection pool')) {
    throw error;
  }

  if (
    errorMessage.includes('Closed') ||
    errorMessage.includes("Can't reach database server") ||
    errorMessage.includes('Connection terminated') ||
    errorMessage.includes('Connection refused')
  ) {
    isConnected = false;

    try {
      await connectWithRetry();
      return await retryFn();
    } catch (reconnectError) {
      const reconnectErrorMessage = reconnectError.message || String(reconnectError);
      throw new Error(
        `Database connection failed: ${reconnectErrorMessage}. ` +
          `Please verify: 1) DATABASE_URL is correct, 2) Database server is running, 3) Network connectivity.`
      );
    }
  }

  throw error;
}

/**
 * Health check: verify database connection
 * Attempts to reconnect if connection is lost
 * @returns {Promise<boolean>} True if connected
 */
export async function healthCheck() {
  try {
    await executeWithReconnect(() => prisma.$queryRaw`SELECT 1`);
    return true;
  } catch (error) {
    const errorMessage = error.message || String(error);

    // Provide helpful error message
    if (errorMessage.includes("Can't reach database server")) {
      logger.error(
        {
          error: errorMessage,
          databaseUrl: process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@'),
        },
        'Database health check failed: Cannot reach database server. Please verify DATABASE_URL and ensure the database is running.'
      );
    } else {
      logger.error({ error: errorMessage }, 'Database health check failed');
    }

    return false;
  }
}

export default prismaWithReconnect;
