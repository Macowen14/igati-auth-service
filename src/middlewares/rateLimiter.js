/**
 * Rate Limiter Middleware
 * 
 * Protects authentication endpoints from brute force attacks.
 * Uses express-rate-limit with IP-based limiting.
 * 
 * Security: Rate limiting prevents:
 * - Brute force password attacks
 * - Account enumeration via signup endpoints
 * - Email bombing via resend verification
 */

import rateLimit from 'express-rate-limit';
import config from '../lib/config.js';
import logger from '../lib/logger.js';

/**
 * General rate limiter for auth endpoints
 * Limits requests per IP address within a time window.
 * 
 * Default: 5 requests per 15 minutes per IP
 */
export const authRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: {
    error: {
      code: 'TooManyRequests',
      message: 'Too many requests from this IP, please try again later',
    },
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: (req, res) => {
    logger.warn({
      ip: req.ip,
      path: req.path,
    }, 'Rate limit exceeded');
    res.status(429).json({
      error: {
        code: 'TooManyRequests',
        message: 'Too many requests from this IP, please try again later',
      },
    });
  },
  // Skip rate limiting for localhost in development (optional)
  skip: (req) => {
    if (config.NODE_ENV === 'development' && req.ip === '127.0.0.1') {
      return false; // Don't skip, still apply limits
    }
    return false;
  },
});

/**
 * Stricter rate limiter for login endpoints
 * More restrictive since login attempts are more sensitive.
 */
export const loginRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: 3, // Even stricter: 3 attempts per window
  message: {
    error: {
      code: 'TooManyRequests',
      message: 'Too many login attempts, please try again later',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn({
      ip: req.ip,
      path: req.path,
      email: req.body?.email, // Log email for security monitoring (be careful with GDPR)
    }, 'Login rate limit exceeded');
    res.status(429).json({
      error: {
        code: 'TooManyRequests',
        message: 'Too many login attempts, please try again later',
      },
    });
  },
});

export default authRateLimiter;

