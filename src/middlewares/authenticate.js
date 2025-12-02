/**
 * Authentication Middleware
 *
 * Verifies JWT access token from cookies and attaches user info to request.
 * Protects routes that require authentication.
 */

import { verifyToken, getTokenFromCookie } from '../lib/jwt.js';
import { AuthenticationError } from './errorHandler.js';
import prisma from '../lib/prisma.js';

/**
 * Middleware to authenticate requests using JWT access token from cookies
 * Attaches userId, email, and role to req.user on success
 * Fetches fresh role from database to ensure it's up-to-date
 *
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next middleware
 */
export async function authenticate(req, res, next) {
  try {
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
      payload = await verifyToken(accessToken);
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

    // Fetch fresh user data from database to get current role
    // This ensures role changes are reflected immediately
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        role: true,
        emailVerified: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        error: {
          code: 'AuthenticationError',
          message: 'User not found',
        },
      });
    }

    // Attach user info to request
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
    };

    next();
  } catch (error) {
    next(error);
  }
}

export default authenticate;

