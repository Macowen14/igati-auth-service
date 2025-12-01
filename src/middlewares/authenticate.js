/**
 * Authentication Middleware
 *
 * Verifies JWT access token from cookies and attaches user info to request.
 * Protects routes that require authentication.
 */

import { verifyToken, getTokenFromCookie } from '../lib/jwt.js';
import { AuthenticationError } from './errorHandler.js';

/**
 * Middleware to authenticate requests using JWT access token from cookies
 * Attaches userId and email to req.user on success
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

    // Attach user info to request
    req.user = {
      id: payload.userId,
      email: payload.email,
    };

    next();
  } catch (error) {
    next(error);
  }
}

export default authenticate;

