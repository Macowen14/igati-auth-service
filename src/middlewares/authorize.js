/**
 * Authorization Middleware
 *
 * Role-based access control middleware.
 * Must be used after authenticate middleware.
 *
 * Usage:
 * - authorize(['ADMIN', 'SUPERUSER']) - Allow ADMIN or SUPERUSER
 * - authorize(['SUPERUSER']) - Only SUPERUSER
 * - authorize(['ADMIN', 'MANAGER']) - Allow ADMIN or MANAGER
 */

import { AuthorizationError } from './errorHandler.js';

/**
 * Middleware to authorize requests based on user roles
 * Requires authenticate middleware to be called first
 *
 * @param {string[]} allowedRoles - Array of allowed roles
 * @returns {function} Express middleware function
 */
export function authorize(allowedRoles) {
  return (req, res, next) => {
    // Ensure user is authenticated (should be set by authenticate middleware)
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'AuthenticationError',
          message: 'Not authenticated',
        },
      });
    }

    // Check if user's role is in allowed roles
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: {
          code: 'AuthorizationError',
          message: 'Insufficient permissions',
        },
      });
    }

    next();
  };
}

export default authorize;
