/**
 * Encryption Utility
 *
 * Provides secure encryption/decryption for sensitive data like OAuth tokens.
 * Uses AES-256-GCM (Galois/Counter Mode) for authenticated encryption.
 *
 * Features:
 * - AES-256-GCM encryption (confidentiality + authenticity)
 * - Automatic IV (Initialization Vector) generation
 * - Authentication tag for tamper detection
 * - Secure key derivation
 *
 * Security Notes:
 * - Never log encrypted tokens
 * - Store encryption key securely (environment variable)
 * - Rotate encryption key periodically in production
 * - Use different keys for different environments
 */

import crypto from 'crypto';
import config from './config.js';
import logger from './logger.js';

// Encryption algorithm: AES-256-GCM
// GCM provides authenticated encryption (confidentiality + integrity)
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits - standard for AES-GCM
const SALT_LENGTH = 64; // 64 bytes for key derivation salt
const TAG_LENGTH = 16; // 128 bits - authentication tag length
const KEY_LENGTH = 32; // 256 bits for AES-256

// Cache the derived key to avoid recalculating on every encrypt/decrypt
let derivedKey = null;

/**
 * Derive encryption key from OAUTH_ENCRYPTION_KEY using PBKDF2
 * Uses a fixed salt combined with environment-specific salt for key derivation
 *
 * @returns {Buffer} 32-byte encryption key
 */
function getEncryptionKey() {
  if (derivedKey) {
    return derivedKey;
  }

  const masterKey = config.OAUTH_ENCRYPTION_KEY;

  if (!masterKey || masterKey.length < 32) {
    throw new Error(
      'OAUTH_ENCRYPTION_KEY must be at least 32 characters long. Generate one using: openssl rand -base64 32'
    );
  }

  // Use a fixed salt derived from the master key for consistency
  // In production, you might want to store this separately
  const salt = crypto
    .createHash('sha256')
    .update(masterKey + config.NODE_ENV)
    .digest();

  // Derive a 32-byte key using PBKDF2 (Password-Based Key Derivation Function 2)
  // PBKDF2 is secure for key derivation
  derivedKey = crypto.pbkdf2Sync(masterKey, salt, 100000, KEY_LENGTH, 'sha256');

  return derivedKey;
}

/**
 * Encrypt sensitive data (e.g., OAuth tokens)
 *
 * @param {string} plaintext - Data to encrypt
 * @returns {string} Encrypted data in format: base64(iv + salt + tag + ciphertext)
 * @throws {Error} If encryption fails
 */
export function encrypt(plaintext) {
  if (!plaintext) {
    return null;
  }

  try {
    const key = getEncryptionKey();

    // Generate random IV for each encryption (required for GCM)
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher with GCM mode
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt the plaintext
    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

    // Get authentication tag (prevents tampering)
    const tag = cipher.getAuthTag();

    // Combine: IV (16 bytes) + Tag (16 bytes) + Ciphertext
    // Format: base64(iv|tag|ciphertext)
    const encrypted = Buffer.concat([iv, tag, Buffer.from(ciphertext, 'base64')]).toString(
      'base64'
    );

    return encrypted;
  } catch (error) {
    logger.error({ error }, 'Failed to encrypt data');
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt sensitive data (e.g., OAuth tokens)
 *
 * @param {string} encryptedData - Encrypted data from encrypt()
 * @returns {string|null} Decrypted plaintext, or null if input was null/empty
 * @throws {Error} If decryption fails (invalid data, tampering detected, etc.)
 */
export function decrypt(encryptedData) {
  if (!encryptedData) {
    return null;
  }

  try {
    const key = getEncryptionKey();

    // Decode base64
    const buffer = Buffer.from(encryptedData, 'base64');

    // Extract components
    // Format: IV (16 bytes) + Tag (16 bytes) + Ciphertext
    const iv = buffer.subarray(0, IV_LENGTH);
    const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertextBuffer = buffer.subarray(IV_LENGTH + TAG_LENGTH);

    // Create decipher with GCM mode
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    // Set authentication tag (required for GCM)
    decipher.setAuthTag(tag);

    // Decrypt
    const ciphertext = ciphertextBuffer.toString('base64');
    let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  } catch (error) {
    // GCM will throw if authentication tag verification fails (tampering detected)
    logger.error({ error }, 'Failed to decrypt data - possible tampering or invalid data');
    throw new Error('Decryption failed - data may be corrupted or tampered with');
  }
}

/**
 * Encrypt an OAuth access token
 * Wrapper function for consistency
 *
 * @param {string} token - OAuth access token
 * @returns {string|null} Encrypted token
 */
export function encryptOAuthToken(token) {
  return encrypt(token);
}

/**
 * Decrypt an OAuth access token
 * Wrapper function for consistency
 *
 * @param {string} encryptedToken - Encrypted token
 * @returns {string|null} Decrypted token
 */
export function decryptOAuthToken(encryptedToken) {
  return decrypt(encryptedToken);
}

/**
 * Clear the cached encryption key
 * Useful for testing or key rotation
 */
export function clearKeyCache() {
  derivedKey = null;
}
