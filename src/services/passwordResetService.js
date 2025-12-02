/**
 * Password Reset Service
 *
 * Business logic for password reset operations.
 * Handles password reset token generation, verification, and password updates.
 */

import prisma from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { generateTokenPair, hashToken } from '../utils/tokenUtils.js';
import { emailQueue } from '../lib/queue.js';
import config from '../lib/config.js';
import argon2 from 'argon2';
import {
  ValidationError,
  NotFoundError,
  AuthenticationError,
} from '../middlewares/errorHandler.js';

/**
 * Validate password strength
 * Requirements: at least 8 characters, 1 uppercase, 1 lowercase, 1 number
 * @param {string} password - Password to validate
 * @returns {{valid: boolean, message?: string}} Validation result
 */
function validatePassword(password) {
  if (!password || password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  return { valid: true };
}

/**
 * Request password reset - generates token and sends email
 *
 * @param {string} email - User email address
 * @returns {Promise<{message: string}>} Success message
 */
export async function requestPasswordReset(email) {
  if (!email) {
    throw new ValidationError('Email is required');
  }

  // Normalize email
  const normalizedEmail = email.toLowerCase().trim();

  // Find user
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  // Return generic message to prevent user enumeration
  // Even if user doesn't exist, return success message
  if (!user) {
    logger.debug({ email: normalizedEmail }, 'Password reset requested for non-existent user');
    return {
      message: 'If an account exists with this email, a password reset link has been sent',
    };
  }

  // Check if user has a password (not OAuth-only user)
  if (!user.passwordHash) {
    logger.debug(
      { userId: user.id, email: user.email },
      'Password reset requested for OAuth-only user'
    );
    return {
      message: 'If an account exists with this email, a password reset link has been sent',
    };
  }

  // Generate password reset token
  const { token, hash: tokenHash } = generateTokenPair(32);

  // Calculate expiry (default: 1 hour from now)
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry for password reset

  // Create password reset token
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  // Enqueue email job
  try {
    await emailQueue.add(
      'sendPasswordReset',
      {
        type: 'sendPasswordReset',
        userId: user.id,
        email: user.email,
        token, // Plain token (not hashed) - worker needs this to build the URL
        name: user.name || null,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      }
    );

    logger.info(
      {
        userId: user.id,
        email: user.email,
        jobType: 'sendPasswordReset',
      },
      'Password reset email job enqueued. NOTE: Make sure the email worker is running (npm run worker:dev)'
    );
  } catch (error) {
    logger.error({ error, userId: user.id }, 'Failed to enqueue password reset email job');
    // Don't throw - return generic message anyway
  }

  return {
    message: 'If an account exists with this email, a password reset link has been sent',
  };
}

/**
 * Verify password reset token
 *
 * @param {string} token - Plain reset token from email link
 * @returns {Promise<{user: object, token: object}>} User and token record
 */
export async function verifyPasswordResetToken(token) {
  if (!token) {
    throw new ValidationError('Reset token is required');
  }

  // Hash the incoming token to compare with stored hash
  const tokenHash = hashToken(token);

  // Find token in database (not used, not expired)
  const resetToken = await prisma.passwordResetToken.findFirst({
    where: {
      tokenHash,
      used: false,
      expiresAt: {
        gt: new Date(), // Token hasn't expired
      },
    },
    include: {
      user: true,
    },
  });

  if (!resetToken) {
    throw new NotFoundError('Invalid or expired reset token');
  }

  return {
    user: {
      id: resetToken.user.id,
      email: resetToken.user.email,
    },
    token: resetToken,
  };
}

/**
 * Reset password using token
 *
 * @param {string} token - Plain reset token from email link
 * @param {string} newPassword - New password (plain, will be hashed)
 * @returns {Promise<{message: string}>} Success message
 */
export async function resetPassword(token, newPassword) {
  if (!token || !newPassword) {
    throw new ValidationError('Token and new password are required');
  }

  // Validate password strength
  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.valid) {
    throw new ValidationError(passwordValidation.message);
  }

  // Verify token
  const { user, token: resetToken } = await verifyPasswordResetToken(token);

  // Hash new password
  const passwordHash = await argon2.hash(newPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  // Update password and mark token as used in a transaction
  await prisma.$transaction(async (tx) => {
    // Mark token as used
    await tx.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true },
    });

    // Update user password
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
  });

  // Revoke all refresh tokens for security (force re-login)
  await prisma.refreshToken.updateMany({
    where: {
      userId: user.id,
      revoked: false,
    },
    data: {
      revoked: true,
      revokedAt: new Date(),
    },
  });

  logger.info(
    {
      userId: user.id,
      email: user.email,
    },
    'Password reset successfully'
  );

  return {
    message: 'Password has been reset successfully. Please log in with your new password.',
  };
}
