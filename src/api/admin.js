/**
 * Admin Routes
 *
 * Administrative endpoints for user management.
 * All routes require authentication and admin/superuser authorization.
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createRequestLogger } from '../lib/logger.js';
import asyncHandler from '../middlewares/asyncHandler.js';
import authenticate from '../middlewares/authenticate.js';
import authorize from '../middlewares/authorize.js';
import { getAllUsers, updateUserRole } from '../services/adminService.js';

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
 * All admin routes require authentication
 */
router.use(authenticate);

/**
 * GET /api/auth/admin/users
 *
 * Get all users (excluding password hashes).
 * Requires ADMIN or SUPERUSER role.
 *
 * Query Parameters:
 * - page (optional, default: 1) - Page number
 * - limit (optional, default: 50, max: 100) - Items per page
 */
router.get(
  '/users',
  authorize(['ADMIN', 'SUPERUSER']),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query;

    req.logger.debug({ page, limit, userId: req.user.id }, 'Admin: Get all users');

    const result = await getAllUsers({ page, limit });

    res.status(200).json(result);
  })
);

/**
 * PUT /api/auth/admin/users/:userId/role
 *
 * Update user role.
 * Requires ADMIN or SUPERUSER role.
 * Only SUPERUSER can assign SUPERUSER role.
 *
 * Body: { role: string }
 * - role: 'USER' | 'MANAGER' | 'ADMIN' | 'SUPERUSER'
 */
router.put(
  '/users/:userId/role',
  authorize(['ADMIN', 'SUPERUSER']),
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({
        error: {
          code: 'ValidationError',
          message: 'Role is required',
        },
      });
    }

    req.logger.info(
      { targetUserId: userId, newRole: role, updatedBy: req.user.id },
      'Admin: Update user role'
    );

    const updatedUser = await updateUserRole(userId, role, req.user.role);

    res.status(200).json({
      message: 'User role updated successfully',
      user: updatedUser,
    });
  })
);

export default router;
