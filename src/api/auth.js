/**
 * Authentication Routes
 *
 * Handles signup, login, logout, email verification, and token refresh.
 * All routes use asyncHandler to catch errors and rate limiting for protection.
 *
 * Security: Generic error messages prevent user enumeration attacks.
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createRequestLogger } from '../lib/logger.js';
import asyncHandler from '../middlewares/asyncHandler.js';
import { authRateLimiter, loginRateLimiter } from '../middlewares/rateLimiter.js';
import {
  createUser,
  verifyEmailToken,
  resendVerificationEmail,
  authenticateUser,
  storeRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
} from '../services/authService.js';
import {
  createAccessToken,
  createRefreshToken,
  verifyToken as verifyJWT,
  setAuthCookies,
  clearAuthCookies,
  getTokenFromCookie,
} from '../lib/jwt.js';
import { hashToken } from '../utils/tokenUtils.js';

const router = express.Router();

/**
 * Request ID middleware
 * Adds a unique request ID to each request for log correlation
 */
router.use((req, res, next) => {
  req.id = uuidv4();
  req.logger = createRequestLogger(req.id);
  next();
});

/**
 * POST /api/auth/signup
 *
 * Creates a new user account and sends verification email.
 * Returns 201 immediately - email is sent asynchronously via worker.
 *
 * Body: { email: string, password: string, name?: string }
 */
router.post(
  '/signup',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const { email, password, name } = req.body;

    req.logger.debug({ email }, 'Signup request received');

    // Create user (will validate input and hash password)
    const { user } = await createUser({ email, password, name });

    // Return success - email will be sent by worker
    res.status(201).json({
      message: 'Account created successfully. Please check your email to verify your account.',
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
      },
    });
  })
);

/**
 * POST /api/auth/resend-verification
 *
 * Resends verification email for a user who hasn't verified their email.
 * Returns generic success message to prevent user enumeration.
 *
 * Body: { email: string }
 */
router.post(
  '/resend-verification',
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: {
          code: 'ValidationError',
          message: 'Email is required',
        },
      });
    }

    req.logger.debug({ email }, 'Resend verification email request');

    // Resend verification email
    // Returns generic message to prevent user enumeration
    await resendVerificationEmail(email);

    res.status(200).json({
      message: 'If an account exists with this email, a verification email has been sent',
    });
  })
);

/**
 * GET /api/auth/verify
 *
 * Verifies email token and logs user in automatically.
 * Sets JWT cookies and returns success response.
 *
 * Query: { token: string }
 */
router.get(
  '/verify',
  asyncHandler(async (req, res) => {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        error: {
          code: 'ValidationError',
          message: 'Verification token is required',
        },
      });
    }

    req.logger.debug({ token: token.substring(0, 8) + '...' }, 'Email verification request');

    // Verify token and mark user as verified
    const { user } = await verifyEmailToken(token);

    // Create JWT tokens
    const accessToken = await createAccessToken(user.id, user.email);
    const refreshToken = await createRefreshToken(user.id);

    // Store refresh token hash in database for rotation/revocation
    const refreshTokenHash = hashToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days (matches JWT_REFRESH_EXPIRY)
    await storeRefreshToken(user.id, refreshTokenHash, expiresAt);

    // Set cookies
    setAuthCookies(res, accessToken, refreshToken);

    // Return success (could also redirect to frontend)
    res.status(200).json({
      message: 'Email verified successfully. You are now logged in.',
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
      },
    });
  })
);

/**
 * POST /api/auth/login
 *
 * Authenticates user with email and password.
 * Sets JWT cookies on success.
 *
 * Body: { email: string, password: string }
 */
router.post(
  '/login',
  loginRateLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    req.logger.debug({ email }, 'Login request received');

    // Authenticate user
    const user = await authenticateUser({ email, password });

    // Create JWT tokens
    const accessToken = await createAccessToken(user.id, user.email);
    const refreshToken = await createRefreshToken(user.id);

    // Store refresh token hash in database
    const refreshTokenHash = hashToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    await storeRefreshToken(user.id, refreshTokenHash, expiresAt);

    // Set cookies
    setAuthCookies(res, accessToken, refreshToken);

    req.logger.info({ userId: user.id, email: user.email }, 'User logged in successfully');

    res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
      },
    });
  })
);

/**
 * POST /api/auth/refresh
 *
 * Exchanges refresh token for new access token.
 * Implements token rotation: old refresh token is revoked, new one is issued.
 *
 * Uses refresh token from HttpOnly cookie.
 */
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const refreshToken = getTokenFromCookie(req, 'refreshToken');

    if (!refreshToken) {
      return res.status(401).json({
        error: {
          code: 'AuthenticationError',
          message: 'Refresh token not found',
        },
      });
    }

    // Verify JWT
    let payload;
    try {
      payload = await verifyJWT(refreshToken);
      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type');
      }
    } catch (error) {
      clearAuthCookies(res);
      return res.status(401).json({
        error: {
          code: 'AuthenticationError',
          message: 'Invalid or expired refresh token',
        },
      });
    }

    // Verify refresh token hash in database
    const refreshTokenHash = hashToken(refreshToken);
    let tokenData;
    try {
      tokenData = await verifyRefreshToken(refreshTokenHash);
    } catch (error) {
      clearAuthCookies(res);
      return res.status(401).json({
        error: {
          code: 'AuthenticationError',
          message: 'Invalid or expired refresh token',
        },
      });
    }

    // Revoke old refresh token (token rotation)
    await revokeRefreshToken(refreshTokenHash);

    // Create new tokens
    const newAccessToken = await createAccessToken(tokenData.user.id, tokenData.user.email);
    const newRefreshToken = await createRefreshToken(tokenData.user.id);

    // Store new refresh token hash
    const newRefreshTokenHash = hashToken(newRefreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    await storeRefreshToken(tokenData.user.id, newRefreshTokenHash, expiresAt);

    // Set new cookies
    setAuthCookies(res, newAccessToken, newRefreshToken);

    req.logger.debug({ userId: tokenData.user.id }, 'Tokens refreshed');

    res.status(200).json({
      message: 'Token refreshed successfully',
    });
  })
);

/**
 * POST /api/auth/logout
 *
 * Logs out user by clearing cookies and revoking refresh tokens.
 * Requires authentication via access token cookie.
 */
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const refreshToken = getTokenFromCookie(req, 'refreshToken');

    // If refresh token exists, revoke it
    if (refreshToken) {
      const refreshTokenHash = hashToken(refreshToken);
      await revokeRefreshToken(refreshTokenHash);
    }

    // Clear cookies
    clearAuthCookies(res);

    req.logger.debug('User logged out');

    res.status(200).json({
      message: 'Logged out successfully',
    });
  })
);

/**
 * GET /api/auth/me
 *
 * Returns current user information from JWT token.
 * Requires authentication.
 */
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const accessToken = getTokenFromCookie(req, 'accessToken');

    if (!accessToken) {
      return res.status(401).json({
        error: {
          code: 'AuthenticationError',
          message: 'Not authenticated',
        },
      });
    }

    // Verify and decode token
    let payload;
    try {
      payload = await verifyJWT(accessToken);
      if (payload.type !== 'access') {
        throw new Error('Invalid token type');
      }
    } catch (error) {
      return res.status(401).json({
        error: {
          code: 'AuthenticationError',
          message: 'Invalid or expired token',
        },
      });
    }

    // Optionally fetch fresh user data from database
    // For now, return from token payload
    res.status(200).json({
      user: {
        id: payload.userId,
        email: payload.email,
      },
    });
  })
);

export default router;
