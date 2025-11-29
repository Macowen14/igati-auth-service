/**
 * JWT Utilities
 *
 * Functions for signing and verifying JWTs using jose library.
 * Also provides cookie helper functions for setting secure HttpOnly cookies.
 *
 * Security considerations:
 * - Access tokens: short-lived (15m default) for reduced exposure
 * - Refresh tokens: long-lived (30d default) but stored in database for revocation
 * - Cookies: HttpOnly, Secure (production), SameSite=Lax to prevent XSS/CSRF
 */

import { SignJWT, jwtVerify } from 'jose';
import config from './config.js';
import logger from './logger.js';

/**
 * Convert expiry string (e.g., '15m', '30d') to seconds
 * @param {string} expiry - Expiry string like '15m', '1h', '7d'
 * @returns {number} Expiry in seconds
 */
function parseExpiry(expiry) {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid expiry format: ${expiry}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };

  return value * multipliers[unit];
}

/**
 * Create a JWT access token
 * Short-lived token for API authentication.
 *
 * @param {string} userId - User ID to encode
 * @param {string} email - User email (for logging/debugging)
 * @returns {Promise<string>} Signed JWT token
 */
export async function createAccessToken(userId, email) {
  const secret = new TextEncoder().encode(config.JWT_SECRET);
  const expiresIn = parseExpiry(config.JWT_ACCESS_EXPIRY);

  const token = await new SignJWT({
    userId,
    email,
    type: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
    .setIssuer('auth-service')
    .setAudience('auth-service-api')
    .sign(secret);

  return token;
}

/**
 * Create a JWT refresh token
 * Long-lived token for obtaining new access tokens.
 * Note: The hash of this token should be stored in the database for rotation/revocation.
 *
 * @param {string} userId - User ID to encode
 * @returns {Promise<string>} Signed JWT token
 */
export async function createRefreshToken(userId) {
  const secret = new TextEncoder().encode(config.JWT_SECRET);
  const expiresIn = parseExpiry(config.JWT_REFRESH_EXPIRY);

  const token = await new SignJWT({
    userId,
    type: 'refresh',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
    .setIssuer('auth-service')
    .setAudience('auth-service-api')
    .sign(secret);

  return token;
}

/**
 * Verify and decode a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Promise<{userId: string, email?: string, type: string}>} Decoded payload
 * @throws {Error} If token is invalid or expired
 */
export async function verifyToken(token) {
  try {
    const secret = new TextEncoder().encode(config.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'auth-service',
      audience: 'auth-service-api',
    });

    return {
      userId: payload.userId,
      email: payload.email,
      type: payload.type,
    };
  } catch (error) {
    logger.debug({ error }, 'JWT verification failed');
    throw new Error('Invalid or expired token');
  }
}

/**
 * Set access and refresh token cookies on response
 * @param {object} res - Express response object
 * @param {string} accessToken - Access token
 * @param {string} refreshToken - Refresh token
 */
export function setAuthCookies(res, accessToken, refreshToken) {
  const cookieOptions = {
    httpOnly: true,
    secure: config.COOKIE_SECURE, // true in production with HTTPS
    sameSite: 'lax',
    path: '/',
    domain: config.COOKIE_DOMAIN,
    // Note: maxAge is set per cookie below
  };

  // Access token cookie (short-lived)
  res.cookie('accessToken', accessToken, {
    ...cookieOptions,
    maxAge: parseExpiry(config.JWT_ACCESS_EXPIRY) * 1000,
  });

  // Refresh token cookie (long-lived)
  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    maxAge: parseExpiry(config.JWT_REFRESH_EXPIRY) * 1000,
  });
}

/**
 * Clear authentication cookies from response
 * @param {object} res - Express response object
 */
export function clearAuthCookies(res) {
  const cookieOptions = {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
    domain: config.COOKIE_DOMAIN,
  };

  res.clearCookie('accessToken', cookieOptions);
  res.clearCookie('refreshToken', cookieOptions);
}

/**
 * Extract token from request cookies
 * @param {object} req - Express request object
 * @param {string} cookieName - Cookie name (default: 'accessToken')
 * @returns {string|undefined} Token value or undefined
 */
export function getTokenFromCookie(req, cookieName = 'accessToken') {
  return req.cookies?.[cookieName];
}
