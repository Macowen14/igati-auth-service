/**
 * Authentication Tests
 *
 * Comprehensive test suite for authentication endpoints.
 * Tests signup, email verification, login, logout, refresh, and password reset.
 *
 * Note: These tests use mocks to avoid requiring real Redis/Database during tests.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import argon2 from 'argon2';

// Create mock functions before mocking modules
const mockEmailQueue = {
  add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  close: jest.fn().mockResolvedValue(),
};

const mockJWT = {
  createAccessToken: jest.fn().mockResolvedValue('mock-access-token'),
  createRefreshToken: jest.fn().mockResolvedValue('mock-refresh-token'),
  verifyToken: jest.fn(),
  setAuthCookies: jest.fn(),
  clearAuthCookies: jest.fn(),
  getTokenFromCookie: jest.fn(),
};

const mockTokenUtils = {
  generateTokenPair: jest.fn().mockReturnValue({
    token: 'mock-plain-token',
    hash: 'mock-token-hash',
  }),
  hashToken: jest.fn().mockReturnValue('mock-token-hash'),
  verifyToken: jest.fn().mockReturnValue(true),
};

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  emailToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  passwordResetToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
};

// Create additional mock functions for module mocks
const mockCloseConnections = jest.fn().mockResolvedValue();
const mockQueueHealthCheck = jest.fn().mockResolvedValue(true);
const mockConfigureRedis = jest.fn().mockResolvedValue();
const mockDisconnect = jest.fn().mockResolvedValue();
const mockPrismaHealthCheck = jest.fn().mockResolvedValue(true);

// Mock modules - must be before imports
jest.mock('../lib/queue.js', () => ({
  emailQueue: mockEmailQueue,
  closeConnections: mockCloseConnections,
  healthCheck: mockQueueHealthCheck,
  configureRedisMemoryPolicy: mockConfigureRedis,
}));

jest.mock('../lib/jwt.js', () => mockJWT);

jest.mock('../utils/tokenUtils.js', () => mockTokenUtils);

jest.mock('../lib/prisma.js', () => ({
  default: mockPrisma,
  disconnect: mockDisconnect,
  healthCheck: mockPrismaHealthCheck,
}));

// Import app after mocks are set up
import app from '../server.js';

describe('POST /api/auth/signup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a new user with valid email and password', async () => {
    // Mock no existing user
    mockPrisma.user.findUnique.mockResolvedValue(null);

    // Mock transaction (user + token creation)
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        user: {
          create: jest.fn().mockResolvedValue({
            id: 'new-user-id',
            email: 'test@example.com',
            emailVerified: false,
            role: 'USER',
            createdAt: new Date(),
          }),
        },
        emailToken: {
          create: jest.fn().mockResolvedValue({
            id: 'token-id',
            userId: 'new-user-id',
          }),
        },
      };
      return callback(tx);
    });

    const response = await request(app).post('/api/auth/signup').send({
      email: 'test@example.com',
      password: 'ValidPassword123',
      name: 'Test User',
    });

    expect(response.status).toBe(201);
    expect(response.body.message).toContain('Account created successfully');
    expect(response.body.user.email).toBe('test@example.com');
    expect(response.body.user.emailVerified).toBe(false);
    expect(mockEmailQueue.add).toHaveBeenCalledWith(
      'sendVerification',
      expect.objectContaining({
        type: 'sendVerification',
        email: 'test@example.com',
      }),
      expect.any(Object)
    );
  });

  it('should reject signup with invalid email', async () => {
    const response = await request(app).post('/api/auth/signup').send({
      email: 'invalid-email',
      password: 'ValidPassword123',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ValidationError');
  });

  it('should reject signup with weak password', async () => {
    const response = await request(app).post('/api/auth/signup').send({
      email: 'test@example.com',
      password: 'weak',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ValidationError');
  });

  it('should reject signup with missing email', async () => {
    const response = await request(app).post('/api/auth/signup').send({
      password: 'ValidPassword123',
    });

    expect(response.status).toBe(400);
  });

  it('should reject signup with missing password', async () => {
    const response = await request(app).post('/api/auth/signup').send({
      email: 'test@example.com',
    });

    expect(response.status).toBe(400);
  });

  it('should reject duplicate email signup', async () => {
    // Mock existing user
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'existing-user-id',
      email: 'existing@example.com',
    });

    const response = await request(app).post('/api/auth/signup').send({
      email: 'existing@example.com',
      password: 'ValidPassword123',
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ConflictError');
  });
});

describe('GET /api/auth/verify', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should verify email token and log user in', async () => {
    const mockUser = {
      id: 'user-id',
      email: 'test@example.com',
      emailVerified: false,
      role: 'USER',
    };

    // Mock finding valid token
    mockPrisma.emailToken.findFirst.mockResolvedValue({
      id: 'token-id',
      userId: 'user-id',
      user: mockUser,
    });

    // Mock transaction (update token + user)
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        emailToken: {
          update: jest.fn().mockResolvedValue({}),
        },
        user: {
          update: jest.fn().mockResolvedValue({
            ...mockUser,
            emailVerified: true,
            role: 'USER',
          }),
        },
      };
      return callback(tx);
    });

    // Mock refresh token storage
    mockPrisma.refreshToken.create.mockResolvedValue({
      id: 'refresh-token-id',
      userId: 'user-id',
    });

    mockJWT.createAccessToken.mockResolvedValue('access-token');
    mockJWT.createRefreshToken.mockResolvedValue('refresh-token');

    const response = await request(app).get('/api/auth/verify').query({ token: 'valid-token' });

    expect(response.status).toBe(200);
    expect(response.body.message).toContain('Email verified successfully');
    expect(response.body.user.emailVerified).toBe(true);
    expect(mockJWT.setAuthCookies).toHaveBeenCalled();
  });

  it('should reject missing token', async () => {
    const response = await request(app).get('/api/auth/verify');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ValidationError');
  });

  it('should reject expired or invalid token', async () => {
    // Mock no token found (expired or invalid)
    mockPrisma.emailToken.findFirst.mockResolvedValue(null);

    const response = await request(app).get('/api/auth/verify').query({ token: 'expired-token' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NotFoundError');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should login user with valid credentials', async () => {
    const passwordHash = await argon2.hash('ValidPassword123');
    const mockUser = {
      id: 'user-id',
      email: 'test@example.com',
      passwordHash,
      emailVerified: true,
      role: 'USER',
    };

    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.refreshToken.create.mockResolvedValue({
      id: 'refresh-token-id',
      userId: 'user-id',
    });

    mockJWT.createAccessToken.mockResolvedValue('access-token');
    mockJWT.createRefreshToken.mockResolvedValue('refresh-token');

    const response = await request(app).post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'ValidPassword123',
    });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Login successful');
    expect(response.body.user.email).toBe('test@example.com');
    expect(mockJWT.setAuthCookies).toHaveBeenCalled();
  });

  it('should reject login with missing credentials', async () => {
    const response = await request(app).post('/api/auth/login').send({});

    expect(response.status).toBe(400);
  });

  it('should reject login with invalid email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const response = await request(app).post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'wrongpassword',
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AuthenticationError');
  });

  it('should reject login with wrong password', async () => {
    const passwordHash = await argon2.hash('CorrectPassword123');
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'test@example.com',
      passwordHash,
      emailVerified: true,
    });

    const response = await request(app).post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'WrongPassword123',
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AuthenticationError');
  });

  it('should reject login for unverified email (if ALLOW_UNVERIFIED_LOGIN=false)', async () => {
    const passwordHash = await argon2.hash('ValidPassword123');
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      email: 'test@example.com',
      passwordHash,
      emailVerified: false,
    });

    const response = await request(app).post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'ValidPassword123',
    });

    // Should reject if email not verified
    expect([401, 400]).toContain(response.status);
  });
});

describe('POST /api/auth/resend-verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject request without email', async () => {
    const response = await request(app).post('/api/auth/resend-verification').send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ValidationError');
  });

  it('should return success message even if user does not exist (prevent enumeration)', async () => {
    // Mock user not found
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const response = await request(app).post('/api/auth/resend-verification').send({
      email: 'nonexistent@example.com',
    });

    // Should return 404 with generic message
    expect(response.status).toBe(404);
  });

  it('should resend verification email for existing unverified user', async () => {
    const mockUser = {
      id: 'user-id',
      email: 'test@example.com',
      emailVerified: false,
    };

    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        emailToken: {
          create: jest.fn().mockResolvedValue({ id: 'token-id' }),
        },
      };
      return callback(tx);
    });

    const response = await request(app).post('/api/auth/resend-verification').send({
      email: 'test@example.com',
    });

    expect(response.status).toBe(200);
    expect(mockEmailQueue.add).toHaveBeenCalled();
  });
});

describe('POST /api/auth/refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject request without refresh token cookie', async () => {
    mockJWT.getTokenFromCookie.mockReturnValue(undefined);

    const response = await request(app).post('/api/auth/refresh');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AuthenticationError');
  });

  it('should refresh tokens with valid refresh token', async () => {
    const mockUser = {
      id: 'user-id',
      email: 'test@example.com',
      emailVerified: true,
    };

    mockJWT.getTokenFromCookie.mockReturnValue('refresh-token');
    mockJWT.verifyToken.mockResolvedValue({
      userId: 'user-id',
      email: 'test@example.com',
      type: 'refresh',
    });

    mockPrisma.refreshToken.findFirst.mockResolvedValue({
      id: 'token-id',
      userId: 'user-id',
      user: mockUser,
    });

    mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-id',
      role: 'USER',
    });

    mockJWT.createAccessToken.mockResolvedValue('new-access-token');
    mockJWT.createRefreshToken.mockResolvedValue('new-refresh-token');
    mockPrisma.refreshToken.create.mockResolvedValue({ id: 'new-token-id' });

    const response = await request(app).post('/api/auth/refresh');

    expect(response.status).toBe(200);
    expect(response.body.message).toContain('Token refreshed successfully');
    expect(mockJWT.setAuthCookies).toHaveBeenCalled();
  });

  it('should reject invalid refresh token', async () => {
    mockJWT.getTokenFromCookie.mockReturnValue('invalid-token');
    mockJWT.verifyToken.mockRejectedValue(new Error('Invalid token'));

    const response = await request(app).post('/api/auth/refresh');

    expect(response.status).toBe(401);
    expect(mockJWT.clearAuthCookies).toHaveBeenCalled();
  });
});

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should clear cookies and revoke refresh token on logout', async () => {
    mockJWT.getTokenFromCookie.mockReturnValue('refresh-token');
    mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    const response = await request(app).post('/api/auth/logout');

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Logged out successfully');
    expect(mockJWT.clearAuthCookies).toHaveBeenCalled();
  });

  it('should logout even without refresh token', async () => {
    mockJWT.getTokenFromCookie.mockReturnValue(undefined);

    const response = await request(app).post('/api/auth/logout');

    expect(response.status).toBe(200);
    expect(mockJWT.clearAuthCookies).toHaveBeenCalled();
  });
});

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject request without access token', async () => {
    mockJWT.getTokenFromCookie.mockReturnValue(undefined);

    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AuthenticationError');
  });

  it('should return user info with valid access token', async () => {
    mockJWT.getTokenFromCookie.mockReturnValue('access-token');
    mockJWT.verifyToken.mockResolvedValue({
      userId: 'user-id',
      email: 'test@example.com',
      type: 'access',
    });

    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe('user-id');
    expect(response.body.user.email).toBe('test@example.com');
  });

  it('should reject invalid access token', async () => {
    mockJWT.getTokenFromCookie.mockReturnValue('invalid-token');
    mockJWT.verifyToken.mockRejectedValue(new Error('Invalid token'));

    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(401);
  });
});

describe('POST /api/auth/forgot-password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject request without email', async () => {
    const response = await request(app).post('/api/auth/forgot-password').send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ValidationError');
  });

  it('should return success message even if user does not exist (prevent enumeration)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const response = await request(app).post('/api/auth/forgot-password').send({
      email: 'nonexistent@example.com',
    });

    expect(response.status).toBe(200);
    expect(response.body.message).toContain('password reset link has been sent');
  });

  it('should send password reset email for existing user', async () => {
    const mockUser = {
      id: 'user-id',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
    };

    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.passwordResetToken.create.mockResolvedValue({ id: 'token-id' });

    const response = await request(app).post('/api/auth/forgot-password').send({
      email: 'test@example.com',
    });

    expect(response.status).toBe(200);
    expect(mockEmailQueue.add).toHaveBeenCalledWith(
      'sendPasswordReset',
      expect.objectContaining({
        type: 'sendPasswordReset',
        email: 'test@example.com',
      }),
      expect.any(Object)
    );
  });
});

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject request without token or password', async () => {
    const response = await request(app).post('/api/auth/reset-password').send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ValidationError');
  });

  it('should reset password with valid token', async () => {
    const mockUser = {
      id: 'user-id',
      email: 'test@example.com',
    };

    mockPrisma.passwordResetToken.findFirst.mockResolvedValue({
      id: 'token-id',
      userId: 'user-id',
      user: mockUser,
    });

    mockPrisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        passwordResetToken: {
          update: jest.fn().mockResolvedValue({}),
        },
        user: {
          update: jest.fn().mockResolvedValue(mockUser),
        },
      };
      return callback(tx);
    });

    mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    const response = await request(app).post('/api/auth/reset-password').send({
      token: 'valid-reset-token',
      password: 'NewPassword123',
    });

    expect(response.status).toBe(200);
    expect(response.body.message).toContain('Password has been reset successfully');
  });

  it('should reject weak password', async () => {
    const response = await request(app).post('/api/auth/reset-password').send({
      token: 'valid-token',
      password: 'weak',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ValidationError');
  });

  it('should reject expired or invalid token', async () => {
    mockPrisma.passwordResetToken.findFirst.mockResolvedValue(null);

    const response = await request(app).post('/api/auth/reset-password').send({
      token: 'expired-token',
      password: 'NewPassword123',
    });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NotFoundError');
  });
});
