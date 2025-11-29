/**
 * Error Handler Middleware
 *
 * Centralized error handling for Express routes.
 * Maps internal errors to consistent JSON responses with appropriate
 * HTTP status codes. Logs full error details but doesn't leak stack
 * traces to clients in production.
 */

import logger from '../lib/logger.js';
import config from '../lib/config.js';
import { Prisma } from '@prisma/client';

/**
 * Custom error classes for better error handling
 */
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

export class AuthenticationError extends Error {
  constructor(message = 'Authentication failed') {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = 401;
  }
}

export class AuthorizationError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = 403;
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

export class ConflictError extends Error {
  constructor(message = 'Resource already exists') {
    super(message);
    this.name = 'ConflictError';
    this.statusCode = 409;
  }
}

/**
 * Map Prisma errors to appropriate HTTP errors
 * @param {Error} error - Prisma error
 * @returns {Error} Mapped error
 */
function mapPrismaError(error) {
  // Unique constraint violation
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return new ConflictError('A user with this email already exists');
    }
    if (error.code === 'P2025') {
      return new NotFoundError('Resource not found');
    }
  }

  // Foreign key constraint violation
  if (error instanceof Prisma.PrismaClientValidationError) {
    return new ValidationError('Invalid input data');
  }

  return error;
}

/**
 * Central error handler middleware
 * Should be used as the last middleware in the Express app.
 *
 * @param {Error} error - Error object
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {Function} next - Express next function
 */
export function errorHandler(error, req, res, next) {
  // Get request ID from logger if available
  const reqId = req.logger?.bindings()?.reqId || req.id || 'unknown';

  // Map known errors
  const mappedError = mapPrismaError(error);

  // Determine status code
  const statusCode = mappedError.statusCode || mappedError.status || 500;

  // Log error details (full stack trace in development, summary in production)
  const logContext = {
    reqId,
    method: req.method,
    path: req.path,
    statusCode,
    error: {
      name: mappedError.name,
      message: mappedError.message,
    },
  };

  if (config.NODE_ENV === 'development') {
    logContext.stack = mappedError.stack;
  }

  if (statusCode >= 500) {
    logger.error(logContext, 'Server error');
  } else {
    logger.warn(logContext, 'Client error');
  }

  // Prepare response
  const response = {
    error: {
      code: mappedError.name || 'InternalServerError',
      message: mappedError.message || 'An unexpected error occurred',
    },
  };

  // Include request ID in response for debugging
  if (config.NODE_ENV === 'development') {
    response.error.requestId = reqId;
  }

  // Send response
  res.status(statusCode).json(response);
}

export default errorHandler;
