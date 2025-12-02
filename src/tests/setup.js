/**
 * Test Setup
 *
 * Global test configuration and mocks.
 */

import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/auth_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.TOKEN_HASH_SECRET = 'test-token-hash-secret-for-testing-only';
process.env.OAUTH_ENCRYPTION_KEY = 'test-oauth-encryption-key-32-chars-long!';
process.env.RESEND_API_KEY = 'test-resend-api-key';
process.env.RESEND_FROM_EMAIL = 'test@example.com';
process.env.APP_URL = 'http://localhost:4000';
process.env.PORT = '4000';
process.env.ALLOW_UNVERIFIED_LOGIN = 'false';
process.env.EMAIL_TOKEN_EXPIRY_HOURS = '24';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '30d';
process.env.COOKIE_DOMAIN = 'localhost';
process.env.COOKIE_SECURE = 'false';

// Increase timeout for integration tests
jest.setTimeout(30000);
