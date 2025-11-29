/**
 * Test Setup
 *
 * Global test configuration and mocks.
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/auth_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.TOKEN_HASH_SECRET = 'test-token-hash-secret';

// Increase timeout for integration tests
jest.setTimeout(30000);
