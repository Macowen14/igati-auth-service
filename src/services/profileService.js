/**
 * Profile Service
 *
 * Business logic for user profile operations.
 * Handles getting and updating user profiles, including avatar uploads.
 */

import prisma from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { NotFoundError, ValidationError } from '../middlewares/errorHandler.js';

/**
 * Get user profile by ID
 *
 * @param {string} userId - User ID
 * @returns {Promise<object>} User profile
 */
export async function getUserProfile(userId) {
  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return user;
}

/**
 * Update user profile
 *
 * @param {string} userId - User ID
 * @param {object} updates - Profile updates
 * @param {string} updates.name - User's display name (optional)
 * @param {string} updates.avatarUrl - URL to user's avatar image (optional)
 * @returns {Promise<object>} Updated user profile
 */
export async function updateUserProfile(userId, updates) {
  if (!userId) {
    throw new ValidationError('User ID is required');
  }

  // Validate updates
  const allowedFields = ['name', 'avatarUrl'];
  const updateData = {};

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      if (field === 'name' && updates[field] !== null) {
        // Validate name length
        const name = String(updates[field]).trim();
        if (name.length === 0) {
          throw new ValidationError('Name cannot be empty');
        }
        if (name.length > 100) {
          throw new ValidationError('Name must be less than 100 characters');
        }
        updateData[field] = name;
      } else if (field === 'avatarUrl') {
        // Validate URL format if provided
        if (updates[field] !== null && updates[field] !== '') {
          try {
            new URL(updates[field]);
            updateData[field] = updates[field];
          } catch (error) {
            throw new ValidationError('Invalid avatar URL format');
          }
        } else {
          updateData[field] = null;
        }
      }
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw new ValidationError('No valid fields to update');
  }

  // Check if user exists
  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!existingUser) {
    throw new NotFoundError('User not found');
  }

  // Update user profile
  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  logger.info({ userId, updatedFields: Object.keys(updateData) }, 'User profile updated');

  return updatedUser;
}

