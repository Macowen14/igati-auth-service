/**
 * Authentication Service
 *
 * Business logic layer for authentication operations.
 * Handles user creation, password verification, token management,
 * and email verification flows.
 *
 * All database operations and business rules are encapsulated here.
 */

import argon2 from 'argon2';
import prisma from '../lib/prisma.js';
import logger from '../lib/logger.js';
import { generateTokenPair, hashToken } from '../utils/tokenUtils.js';
import { emailQueue } from '../lib/queue.js';
import config from '../lib/config.js';
import { encryptOAuthToken, decryptOAuthToken } from '../lib/encryption.js';
import {
  ValidationError,
  NotFoundError,
  AuthenticationError,
  ConflictError,
} from '../middlewares/errorHandler.js';

/**
 * Validate email format
 * Simple validation - in production, consider using a library like validator.js
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

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
 * Create a new user account
 *
 * @param {object} params - User creation parameters
 * @param {string} params.email - User email
 * @param {string} params.password - Plain password (will be hashed)
 * @param {string} params.name - User name (optional)
 * @returns {Promise<{user: object, emailToken: object}>} Created user and email token
 */
export async function createUser({ email, password, name }) {
  // Validate input
  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  if (!isValidEmail(email)) {
    throw new ValidationError('Invalid email format');
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    throw new ValidationError(passwordValidation.message);
  }

  // Normalize email (lowercase)
  const normalizedEmail = email.toLowerCase().trim();

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingUser) {
    // Return generic error to prevent user enumeration
    throw new ConflictError('A user with this email already exists');
  }

  // Hash password using argon2 (secure, memory-hard hashing)
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id, // Hybrid approach (resistant to GPU and side-channel attacks)
    memoryCost: 65536, // 64 MB
    timeCost: 3, // 3 iterations
    parallelism: 4, // 4 threads
  });

  // Generate email verification token
  const { token, hash: tokenHash } = generateTokenPair(32);

  // Calculate expiry (default: 24 hours from now)
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + config.EMAIL_TOKEN_EXPIRY_HOURS);

  // Create user and email token in a transaction
  // This ensures atomicity: either both succeed or both fail
  const result = await prisma.$transaction(async (tx) => {
    // Create user
    const user = await tx.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        emailVerified: false,
      },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    // Create email token
    const emailToken = await tx.emailToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return { user, emailToken };
  });

  // Enqueue email job (fire and forget - don't wait for worker)
  try {
    await emailQueue.add(
      'sendVerification',
      {
        type: 'sendVerification',
        userId: result.user.id,
        email: result.user.email,
        token, // Plain token (not hashed) - worker needs this to build the URL
        name: name || null,
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
        userId: result.user.id,
        email: result.user.email,
        jobType: 'sendVerification',
      },
      'Email verification job enqueued. NOTE: Make sure the email worker is running (npm run worker:dev)'
    );
  } catch (error) {
    // Log error but don't fail the signup - email can be resent later
    logger.error({ error, userId: result.user.id }, 'Failed to enqueue email verification job');
  }

  logger.info(
    {
      userId: result.user.id,
      email: result.user.email,
    },
    'User created successfully'
  );

  return result;
}

/**
 * Verify email token and mark user as verified
 *
 * @param {string} token - Plain verification token from email link
 * @returns {Promise<{user: object}>} Updated user object
 */
export async function verifyEmailToken(token) {
  if (!token) {
    throw new ValidationError('Verification token is required');
  }

  // Hash the incoming token to compare with stored hash
  const tokenHash = hashToken(token);

  // Find token in database (not used, not expired)
  const emailToken = await prisma.emailToken.findFirst({
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

  if (!emailToken) {
    throw new NotFoundError('Invalid or expired verification token');
  }

  // Mark token as used and user as verified in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Update token
    await tx.emailToken.update({
      where: { id: emailToken.id },
      data: { used: true },
    });

    // Update user
    const user = await tx.user.update({
      where: { id: emailToken.userId },
      data: { emailVerified: true },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        role: true,
        createdAt: true,
      },
    });

    return { user };
  });

  logger.info(
    {
      userId: result.user.id,
      email: result.user.email,
    },
    'Email verified successfully'
  );

  return result;
}

/**
 * Resend verification email for an existing user
 * Creates a new verification token and enqueues email job.
 *
 * @param {string} email - User email address
 * @returns {Promise<{message: string}>} Success message
 */
export async function resendVerificationEmail(email) {
  if (!email) {
    throw new ValidationError('Email is required');
  }

  // Normalize email
  const normalizedEmail = email.toLowerCase().trim();

  // Find user
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    // Return generic message to prevent user enumeration
    // In production, you might want to return success even if user doesn't exist
    throw new NotFoundError(
      'If an account exists with this email, a verification email has been sent'
    );
  }

  // Check if email is already verified
  if (user.emailVerified) {
    throw new ConflictError('Email address is already verified');
  }

  // Generate new email verification token
  const { token, hash: tokenHash } = generateTokenPair(32);

  // Calculate expiry
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + config.EMAIL_TOKEN_EXPIRY_HOURS);

  // Create new email token (invalidate old unused tokens)
  await prisma.$transaction(async (tx) => {
    // Optionally: Mark old unused tokens as used (optional - allows multiple pending tokens)
    // await tx.emailToken.updateMany({
    //   where: {
    //     userId: user.id,
    //     used: false,
    //   },
    //   data: {
    //     used: true,
    //   },
    // });

    // Create new token
    await tx.emailToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });
  });

  // Enqueue email job
  try {
    await emailQueue.add(
      'sendVerification',
      {
        type: 'sendVerification',
        userId: user.id,
        email: user.email,
        token,
        name: null, // We don't store names separately, could be added to User model
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
        jobType: 'sendVerification',
      },
      'Verification email resend job enqueued. NOTE: Make sure the email worker is running (npm run worker:dev)'
    );
  } catch (error) {
    logger.error({ error, userId: user.id }, 'Failed to enqueue resend verification email job');
    throw new Error('Failed to queue verification email. Please try again later.');
  }

  return {
    message: 'If an account exists with this email, a verification email has been sent',
  };
}

/**
 * Authenticate user with email and password
 *
 * @param {object} params - Login parameters
 * @param {string} params.email - User email
 * @param {string} params.password - Plain password
 * @returns {Promise<{user: object}>} Authenticated user
 */
export async function authenticateUser({ email, password }) {
  if (!email || !password) {
    throw new ValidationError('Email and password are required');
  }

  // Normalize email
  const normalizedEmail = email.toLowerCase().trim();

  // Find user
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user || !user.passwordHash) {
    // Return generic error to prevent user enumeration
    throw new AuthenticationError('Invalid email or password');
  }

  // Verify password
  const isValid = await argon2.verify(user.passwordHash, password);

  if (!isValid) {
    throw new AuthenticationError('Invalid email or password');
  }

  // Check email verification (if required by config)
  if (!config.ALLOW_UNVERIFIED_LOGIN && !user.emailVerified) {
    throw new AuthenticationError('Please verify your email address before logging in');
  }

  logger.info(
    {
      userId: user.id,
      email: user.email,
    },
    'User authenticated successfully'
  );

  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    role: user.role || 'USER', // Include role, default to USER for backward compatibility
    createdAt: user.createdAt,
  };
}

/**
 * Create or update refresh token hash in database
 * Used for token rotation and revocation.
 *
 * @param {string} userId - User ID
 * @param {string} refreshTokenHash - Hashed refresh token
 * @param {Date} expiresAt - Token expiration date
 * @returns {Promise<object>} Created refresh token record
 */
export async function storeRefreshToken(userId, refreshTokenHash, expiresAt) {
  return await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: refreshTokenHash,
      expiresAt,
    },
  });
}

/**
 * Verify refresh token hash exists and is not revoked
 *
 * @param {string} refreshTokenHash - Hashed refresh token
 * @returns {Promise<{user: object, token: object}>} User and token record
 */
export async function verifyRefreshToken(refreshTokenHash) {
  const token = await prisma.refreshToken.findFirst({
    where: {
      tokenHash: refreshTokenHash,
      revoked: false,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      user: true,
    },
  });

  if (!token) {
    throw new AuthenticationError('Invalid or expired refresh token');
  }

  return {
    user: {
      id: token.user.id,
      email: token.user.email,
      emailVerified: token.user.emailVerified,
    },
    token,
  };
}

/**
 * Revoke a refresh token
 *
 * @param {string} refreshTokenHash - Hashed refresh token to revoke
 * @returns {Promise<void>}
 */
export async function revokeRefreshToken(refreshTokenHash) {
  await prisma.refreshToken.updateMany({
    where: {
      tokenHash: refreshTokenHash,
      revoked: false,
    },
    data: {
      revoked: true,
      revokedAt: new Date(),
    },
  });
}

/**
 * Revoke all refresh tokens for a user
 * Used during logout or password reset.
 *
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
export async function revokeAllUserRefreshTokens(userId) {
  await prisma.refreshToken.updateMany({
    where: {
      userId,
      revoked: false,
    },
    data: {
      revoked: true,
      revokedAt: new Date(),
    },
  });

  logger.info({ userId }, 'All refresh tokens revoked');
}

/**
 * Find or create user by OAuth provider identity
 * Used for social login flows.
 *
 * @param {object} params - OAuth parameters
 * @param {string} params.provider - Provider name ('google', 'github', etc.)
 * @param {string} params.providerUserId - Unique user ID from provider
 * @param {string} params.email - User email from provider
 * @param {string} params.name - User name from provider (optional)
 * @param {string} params.accessToken - OAuth access token (optional)
 * @param {string} params.refreshToken - OAuth refresh token (optional)
 * @param {object} params.meta - Additional provider metadata (optional)
 * @returns {Promise<{user: object, identity: object, isNewUser: boolean}>} User and identity
 */
export async function findOrCreateOAuthUser({
  provider,
  providerUserId,
  email,
  accessToken,
  refreshToken,
  meta,
}) {
  // Normalize email
  const normalizedEmail = email?.toLowerCase().trim();

  if (!normalizedEmail) {
    throw new ValidationError('Email is required from OAuth provider');
  }

  // Find existing identity
  let identity = await prisma.identity.findUnique({
    where: {
      provider_providerUserId: {
        provider,
        providerUserId,
      },
    },
    include: {
      user: true,
    },
  });

  if (identity) {
    // Update access token if provided
    if (accessToken || refreshToken || meta) {
      // Encrypt new tokens before storing (keep existing encrypted tokens if not updating)
      const updateData = {
        providerMeta: meta || identity.providerMeta,
        updatedAt: new Date(),
      };

      // Encrypt tokens if provided
      if (accessToken) {
        updateData.accessToken = encryptOAuthToken(accessToken);
      }
      if (refreshToken) {
        updateData.refreshToken = encryptOAuthToken(refreshToken);
      }

      identity = await prisma.identity.update({
        where: { id: identity.id },
        data: updateData,
        include: {
          user: true,
        },
      });
    }

    // Decrypt tokens before returning (for any potential use)
    const decryptedIdentity = {
      ...identity,
      accessToken: identity.accessToken ? decryptOAuthToken(identity.accessToken) : null,
      refreshToken: identity.refreshToken ? decryptOAuthToken(identity.refreshToken) : null,
    };

    return {
      user: {
        id: identity.user.id,
        email: identity.user.email,
        emailVerified: identity.user.emailVerified,
        role: identity.user.role || 'USER',
      },
      identity: decryptedIdentity,
      isNewUser: false,
    };
  }

  // Create new user and identity
  // Note: OAuth users have their emails verified by the provider
  let isNewUser = false;
  const result = await prisma.$transaction(async (tx) => {
    // Check if user exists with this email
    let user = await tx.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      isNewUser = true;
      // Create new user (email verified = true for OAuth)
      user = await tx.user.create({
        data: {
          email: normalizedEmail,
          emailVerified: true, // OAuth providers verify emails
          passwordHash: null, // No password for OAuth-only users
        },
      });
    } else {
      // Link existing user - mark email as verified if not already
      if (!user.emailVerified) {
        user = await tx.user.update({
          where: { id: user.id },
          data: { emailVerified: true },
        });
      }
    }

    // Encrypt OAuth tokens before storing
    const encryptedAccessToken = accessToken ? encryptOAuthToken(accessToken) : null;
    const encryptedRefreshToken = refreshToken ? encryptOAuthToken(refreshToken) : null;

    // Create identity with encrypted tokens
    const newIdentity = await tx.identity.create({
      data: {
        userId: user.id,
        provider,
        providerUserId,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        providerMeta: meta || {},
      },
    });

    return { user, identity: newIdentity };
  });

  logger.info(
    {
      userId: result.user.id,
      provider,
      providerUserId,
      isNewUser,
    },
    'OAuth user created or linked'
  );

  // Decrypt tokens before returning (for any potential use)
  const decryptedIdentity = {
    ...result.identity,
    accessToken: result.identity.accessToken
      ? decryptOAuthToken(result.identity.accessToken)
      : null,
    refreshToken: result.identity.refreshToken
      ? decryptOAuthToken(result.identity.refreshToken)
      : null,
  };

  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      emailVerified: result.user.emailVerified,
      role: result.user.role || 'USER',
    },
    identity: decryptedIdentity,
    isNewUser,
  };
}
