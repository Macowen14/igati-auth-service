/**
 * Admin Tests
 *
 * Test suite for admin endpoints.
 * Tests user listing and role management.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';

// Create mock functions before mocking modules
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
};

const mockJWT = {
  verifyToken: jest.fn(),
  getTokenFromCookie: jest.fn(),
};

// Create additional mock functions
const mockDisconnect = jest.fn().mockResolvedValue();
const mockPrismaHealthCheck = jest.fn().mockResolvedValue(true);

// Mock modules - must be before imports
jest.mock('../lib/prisma.js', () => ({
  default: mockPrisma,
  disconnect: mockDisconnect,
  healthCheck: mockPrismaHealthCheck,
}));

jest.mock('../lib/jwt.js', () => mockJWT);

// Mock authenticate middleware - simulate admin user
jest.mock('../middlewares/authenticate.js', () => {
  const mockFn = (req, res, next) => {
    req.user = {
      id: 'admin-id',
      email: 'admin@example.com',
      role: 'ADMIN',
      emailVerified: true,
    };
    next();
  };
  return {
    default: mockFn,
    authenticate: mockFn,
  };
});

// Mock authorize middleware - allow all roles for testing
jest.mock('../middlewares/authorize.js', () => {
  const mockFn = () => (req, res, next) => next();
  return {
    default: mockFn,
    authorize: mockFn,
  };
});

// Import app after mocks are set up
import app from '../server.js';

describe('GET /api/auth/admin/users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return paginated list of users', async () => {
    const mockUsers = [
      {
        id: 'user-1',
        email: 'user1@example.com',
        name: 'User One',
        avatarUrl: null,
        emailVerified: true,
        role: 'USER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user-2',
        email: 'user2@example.com',
        name: 'User Two',
        avatarUrl: null,
        emailVerified: true,
        role: 'USER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    mockPrisma.user.findMany.mockResolvedValue(mockUsers);
    mockPrisma.user.count.mockResolvedValue(2);

    const response = await request(app).get('/api/auth/admin/users');

    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(2);
    expect(response.body.total).toBe(2);
    expect(response.body.page).toBe(1);
    expect(response.body.limit).toBe(50);
    expect(response.body.users[0]).not.toHaveProperty('passwordHash');
  });

  it('should support pagination', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.user.count.mockResolvedValue(100);

    const response = await request(app)
      .get('/api/auth/admin/users')
      .query({ page: 2, limit: 10 });

    expect(response.status).toBe(200);
    expect(response.body.page).toBe(2);
    expect(response.body.limit).toBe(10);
    expect(response.body.totalPages).toBe(10);
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
      })
    );
  });

  it('should limit max page size to 100', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.user.count.mockResolvedValue(0);

    const response = await request(app)
      .get('/api/auth/admin/users')
      .query({ limit: 200 });

    expect(response.status).toBe(200);
    expect(response.body.limit).toBe(100);
  });
});

describe('PUT /api/auth/admin/users/:userId/role', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update user role', async () => {
    const targetUser = {
      id: 'target-user-id',
      email: 'target@example.com',
      role: 'USER',
    };

    const updatedUser = {
      id: 'target-user-id',
      email: 'target@example.com',
      name: null,
      avatarUrl: null,
      emailVerified: true,
      role: 'ADMIN',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrisma.user.findUnique.mockResolvedValue(targetUser);
    mockPrisma.user.findFirst.mockResolvedValue(null); // No existing superuser
    mockPrisma.user.update.mockResolvedValue(updatedUser);

    const response = await request(app)
      .put('/api/auth/admin/users/target-user-id/role')
      .send({ role: 'ADMIN' });

    expect(response.status).toBe(200);
    expect(response.body.message).toContain('User role updated successfully');
    expect(response.body.user.role).toBe('ADMIN');
  });

  it('should reject request without role', async () => {
    const response = await request(app)
      .put('/api/auth/admin/users/user-id/role')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ValidationError');
  });

  it('should reject invalid role', async () => {
    const response = await request(app)
      .put('/api/auth/admin/users/user-id/role')
      .send({ role: 'INVALID_ROLE' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ValidationError');
  });

  it('should reject if user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const response = await request(app)
      .put('/api/auth/admin/users/nonexistent-id/role')
      .send({ role: 'ADMIN' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NotFoundError');
  });

  it('should reject if user already has that role', async () => {
    const targetUser = {
      id: 'user-id',
      email: 'user@example.com',
      role: 'ADMIN',
    };

    mockPrisma.user.findUnique.mockResolvedValue(targetUser);

    const response = await request(app)
      .put('/api/auth/admin/users/user-id/role')
      .send({ role: 'ADMIN' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ConflictError');
  });

  it('should prevent creating multiple superusers', async () => {
    const targetUser = {
      id: 'user-id',
      email: 'user@example.com',
      role: 'USER',
    };

    const existingSuperuser = {
      id: 'superuser-id',
      email: 'superuser@example.com',
      role: 'SUPERUSER',
    };

    mockPrisma.user.findUnique.mockResolvedValue(targetUser);
    mockPrisma.user.findFirst.mockResolvedValue(existingSuperuser);

    const response = await request(app)
      .put('/api/auth/admin/users/user-id/role')
      .send({ role: 'SUPERUSER' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('ConflictError');
    expect(response.body.error.message).toContain('superuser already exists');
  });
});

