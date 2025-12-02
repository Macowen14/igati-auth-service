/**
 * Profile Tests
 *
 * Test suite for user profile endpoints.
 * Tests profile retrieval and updates including image uploads.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';

// Create mock functions before mocking modules
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
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

// Mock authenticate middleware - simulate authenticated user
// The real authenticate middleware is async and uses prisma, so we need to mock it completely
// Define the mock function directly in the factory to avoid scope issues in ES modules
jest.mock('../middlewares/authenticate.js', () => {
  const mockFn = (req, res, next) => {
    req.user = {
      id: 'user-id',
      email: 'test@example.com',
      role: 'USER',
      emailVerified: true,
    };
    next();
  };
  return {
    default: mockFn,
    authenticate: mockFn,
  };
});

// Import app after mocks are set up
import app from '../server.js';

describe('GET /api/auth/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return user profile', async () => {
    const mockProfile = {
      id: 'user-id',
      email: 'test@example.com',
      name: 'Test User',
      avatarUrl: 'http://localhost:4000/uploads/avatar.jpg',
      emailVerified: true,
      role: 'USER',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrisma.user.findUnique.mockResolvedValue(mockProfile);

    const response = await request(app).get('/api/auth/profile');

    expect(response.status).toBe(200);
    expect(response.body.profile).toEqual(mockProfile);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      select: expect.objectContaining({
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
      }),
    });
  });

  it('should return 404 if user not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const response = await request(app).get('/api/auth/profile');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NotFoundError');
  });
});

describe('PUT /api/auth/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update user name', async () => {
    const updatedProfile = {
      id: 'user-id',
      email: 'test@example.com',
      name: 'Updated Name',
      avatarUrl: null,
      emailVerified: true,
      role: 'USER',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-id' });
    mockPrisma.user.update.mockResolvedValue(updatedProfile);

    const response = await request(app).put('/api/auth/profile').send({ name: 'Updated Name' });

    expect(response.status).toBe(200);
    expect(response.body.profile.name).toBe('Updated Name');
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { name: 'Updated Name' },
      select: expect.any(Object),
    });
  });

  it('should update avatarUrl', async () => {
    const updatedProfile = {
      id: 'user-id',
      email: 'test@example.com',
      name: null,
      avatarUrl: 'http://example.com/avatar.jpg',
      emailVerified: true,
      role: 'USER',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-id' });
    mockPrisma.user.update.mockResolvedValue(updatedProfile);

    const response = await request(app)
      .put('/api/auth/profile')
      .send({ avatarUrl: 'http://example.com/avatar.jpg' });

    expect(response.status).toBe(200);
    expect(response.body.profile.avatarUrl).toBe('http://example.com/avatar.jpg');
  });

  it('should reject empty name', async () => {
    const response = await request(app).put('/api/auth/profile').send({ name: '' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ValidationError');
  });

  it('should reject name longer than 100 characters', async () => {
    const longName = 'a'.repeat(101);
    const response = await request(app).put('/api/auth/profile').send({ name: longName });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ValidationError');
  });

  it('should reject invalid avatarUrl format', async () => {
    const response = await request(app)
      .put('/api/auth/profile')
      .send({ avatarUrl: 'not-a-valid-url' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ValidationError');
  });

  it('should reject update with no valid fields', async () => {
    const response = await request(app).put('/api/auth/profile').send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('ValidationError');
  });
});
