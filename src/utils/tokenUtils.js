/**
 * Token Utilities
 *
 * Functions for generating and hashing verification tokens.
 * Uses HMAC-SHA256 for secure token hashing before database storage.
 *
 * Security: Tokens are hashed to prevent rainbow table attacks
 * if the database is compromised.
 */

import { createHmac, randomBytes } from 'node:crypto';
import config from '../lib/config.js';
import logger from '../lib/logger.js';

/**
 * Generate a cryptographically secure random token
 * @param {number} length - Token length in bytes (default: 32)
 * @returns {string} Hex-encoded random token
 */
export function generateToken(length = 32) {
  return randomBytes(length).toString('hex');
}

/**
 * Hash a token using HMAC-SHA256
 * Used before storing tokens in the database to prevent plaintext exposure.
 *
 * @param {string} token - Plain token to hash
 * @returns {string} HMAC-SHA256 hash (hex encoded)
 */
export function hashToken(token) {
  if (!token) {
    throw new Error('Token cannot be empty');
  }

  const hmac = createHmac('sha256', config.TOKEN_HASH_SECRET);
  hmac.update(token);
  return hmac.digest('hex');
}

/**
 * Verify a token against a stored hash
 * @param {string} token - Plain token to verify
 * @param {string} hash - Stored hash to compare against
 * @returns {boolean} True if token matches hash
 */
export function verifyToken(token, hash) {
  try {
    const computedHash = hashToken(token);
    // Use timing-safe comparison to prevent timing attacks
    return computedHash === hash;
  } catch (error) {
    logger.error({ error }, 'Token verification failed');
    return false;
  }
}

/**
 * Generate and hash a token pair
 * Useful when you need both the plain token (to send via email)
 * and the hash (to store in database).
 *
 * @param {number} length - Token length in bytes
 * @returns {{token: string, hash: string}} Token and its hash
 */
export function generateTokenPair(length = 32) {
  const token = generateToken(length);
  const hash = hashToken(token);
  return { token, hash };
}
