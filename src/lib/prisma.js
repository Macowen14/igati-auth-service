/**
 * Prisma Client Module
 *
 * Singleton instance of PrismaClient for database operations.
 * Handles connection pooling, reconnection, and graceful disconnection.
 *
 * Configured for Neon (serverless PostgreSQL) which closes idle connections.
 * Automatically reconnects when connections are closed due to inactivity.
 */

import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import logger from './logger.js';

/**
 * Create Prisma client instance with connection pool configuration
 *
 * Configuration for Neon/serverless PostgreSQL:
 * - Connection pool size: 10 connections
 * - Connection timeout: 10 seconds
 * - Query timeout: 20 seconds
 * - Automatic reconnection on connection errors
 */
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
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
 */
async function connectWithRetry() {
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
 * Handle connection errors and attempt reconnection
 * Called when Prisma detects a connection error
 */
prisma.$on('error' as never, (e: any) => {
  const errorMessage = e.message || String(e);
  
  // Check if connection was closed
  if (
    errorMessage.includes('Closed') ||
    errorMessage.includes("Can't reach database server") ||
    errorMessage.includes('Connection terminated')
  ) {
    logger.warn(
      {
        error: errorMessage,
      },
      'Database connection lost. Will attempt to reconnect on next query.'
    );
    isConnected = false;
  } else {
    logger.error({ error: errorMessage }, 'Database error');
  }
});

/**
 * Initialize connection on module load
 * Non-blocking - connection happens in background
 */
connectWithRetry().catch((error) => {
  logger.error(
    { error: error.message },
    'Initial database connection failed. The application will attempt to reconnect on first query.'
  );
  // Don't throw - allow app to start and reconnect on first query
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
 * Execute a query with automatic reconnection
 * Wraps Prisma queries to handle connection errors gracefully
 */
async function executeWithReconnect(queryFn) {
  try {
    return await queryFn();
  } catch (error) {
    const errorMessage = error.message || String(error);
    
    // Check if it's a connection error
    if (
      !isConnected ||
      errorMessage.includes('Closed') ||
      errorMessage.includes("Can't reach database server") ||
      errorMessage.includes('Connection terminated') ||
      errorMessage.includes('Connection refused')
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
 * All queries go through this wrapper to handle connection errors
 */
const prismaWithReconnect = new Proxy(prisma, {
  get(target, prop) {
    const value = target[prop];
    
    // Wrap query methods to handle reconnection
    if (
      typeof value === 'function' &&
      (prop.startsWith('$') || 
       prop.includes('find') || 
       prop.includes('create') || 
       prop.includes('update') || 
       prop.includes('delete') ||
       prop.includes('upsert') ||
       prop.includes('count') ||
       prop.includes('aggregate'))
    ) {
      return function (...args) {
        return executeWithReconnect(() => value.apply(target, args));
      };
    }
    
    return value;
  },
});

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
