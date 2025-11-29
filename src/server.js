/**
 * Express Server Application
 * 
 * Configures Express app with middleware, routes, and error handling.
 * Separated from index.js for easier testing.
 */

import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import config from './lib/config.js';
import logger from './lib/logger.js';
import { createRequestLogger } from './lib/logger.js';
import errorHandler from './middlewares/errorHandler.js';
import authRoutes from './api/auth.js';
import oauthRoutes from './api/oauth.js';

/**
 * Create Express application
 */
const app = express();

/**
 * Security middleware
 * Helmet sets various HTTP headers for security
 */
app.use(helmet({
  contentSecurityPolicy: false, // Adjust based on your needs
  crossOriginEmbedderPolicy: false,
}));

/**
 * CORS configuration
 * Allow requests from frontend origin
 */
app.use(cors({
  origin: process.env.FRONTEND_URL || config.APP_URL,
  credentials: true, // Allow cookies to be sent
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

/**
 * Body parsing middleware
 */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/**
 * Cookie parser middleware
 * Required for reading HttpOnly cookies
 */
app.use(cookieParser());

/**
 * Request ID middleware
 * Adds unique request ID to each request for log correlation
 */
app.use((req, res, next) => {
  req.id = uuidv4();
  req.logger = createRequestLogger(req.id);
  
  // Log request
  req.logger.info({
    method: req.method,
    path: req.path,
    ip: req.ip,
  }, 'Incoming request');

  next();
});

/**
 * Health check endpoint
 * Used by load balancers and monitoring tools
 */
app.get('/health', async (req, res) => {
  // TODO: Add actual health checks (database, Redis, etc.)
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * API routes
 */
app.use('/api/auth', authRoutes);
app.use('/api/auth/oauth', oauthRoutes);

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NotFound',
      message: 'Endpoint not found',
    },
  });
});

/**
 * Global error handler
 * Must be last middleware
 */
app.use(errorHandler);

export default app;

