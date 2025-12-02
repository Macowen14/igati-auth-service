/**
 * Admin Service
 *
 * Business logic for admin operations.
 * Handles user management and role assignments.
 */

import prisma from '../lib/prisma.js';
import logger from '../lib/logger.js';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  AuthorizationError,
} from '../middlewares/errorHandler.js';

/**
 * Get all users (excluding password hashes)
 * Only accessible by admins and superusers
 *
 * @param {object} options - Query options
 * @param {number} options.page - Page number (default: 1)
 * @param {number} options.limit - Items per page (default: 50, max: 100)
 * @returns {Promise<{users: object[], total: number, page: number, limit: number}>} Users list
 */
export async function getAllUsers({ page = 1, limit = 50 } = {}) {
  // Validate pagination
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const skip = (pageNum - 1) * limitNum;

  // Get users (excluding passwordHash)
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: limitNum,
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        emailVerified: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    }),
    prisma.user.count(),
  ]);

  return {
    users,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum),
  };
}

/**
 * Update user role
 * Only accessible by admins and superusers
 * Superusers can assign any role, admins can only assign USER, MANAGER, or ADMIN (not SUPERUSER)
 *
 * @param {string} targetUserId - User ID to update
 * @param {string} newRole - New role to assign
 * @param {string} currentUserRole - Role of the user making the request
 * @returns {Promise<object>} Updated user
 */
export async function updateUserRole(targetUserId, newRole, currentUserRole) {
  if (!targetUserId || !newRole) {
    throw new ValidationError('User ID and role are required');
  }

  // Validate role
  const validRoles = ['USER', 'MANAGER', 'ADMIN', 'SUPERUSER'];
  if (!validRoles.includes(newRole)) {
    throw new ValidationError(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
  }

  // Check permissions
  // Only SUPERUSER can assign SUPERUSER role
  if (newRole === 'SUPERUSER' && currentUserRole !== 'SUPERUSER') {
    throw new AuthorizationError('Only superusers can assign the SUPERUSER role');
  }

  // Check if target user exists
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      email: true,
      role: true,
    },
  });

  if (!targetUser) {
    throw new NotFoundError('User not found');
  }

  // Prevent changing role if user is already that role
  if (targetUser.role === newRole) {
    throw new ConflictError(`User already has the role: ${newRole}`);
  }

  // If assigning SUPERUSER, check if one already exists
  if (newRole === 'SUPERUSER') {
    const existingSuperuser = await prisma.user.findFirst({
      where: {
        role: 'SUPERUSER',
        id: { not: targetUserId }, // Exclude the target user
      },
    });

    if (existingSuperuser) {
      throw new ConflictError('A superuser already exists. Only one superuser is allowed.');
    }
  }

  // Update user role
  const updatedUser = await prisma.user.update({
    where: { id: targetUserId },
    data: { role: newRole },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      emailVerified: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  logger.info(
    {
      targetUserId,
      oldRole: targetUser.role,
      newRole,
      updatedBy: currentUserRole,
    },
    'User role updated'
  );

  return updatedUser;
}

