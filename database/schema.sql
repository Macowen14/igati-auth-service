-- =====================================================
-- Auth Service Database Schema
-- =====================================================
-- This SQL script creates all necessary tables, indexes,
-- and foreign keys for the authentication service.
-- 
-- Run this script to set up the database schema manually:
--   psql $DATABASE_URL -f database/schema.sql
--   OR
--   cat database/schema.sql | psql $DATABASE_URL
-- =====================================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- Drop existing tables (if any) in reverse dependency order
-- =====================================================
-- This ensures a clean setup. Remove these DROP statements
-- if you want to preserve existing data.

DROP TABLE IF EXISTS "refresh_tokens" CASCADE;
DROP TABLE IF EXISTS "email_tokens" CASCADE;
DROP TABLE IF EXISTS "identities" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;

-- =====================================================
-- Table: users
-- Description: Core user table storing user accounts
-- =====================================================
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT, -- NULL for social-only users (OAuth)
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- =====================================================
-- Table: email_tokens
-- Description: Stores email verification tokens (hashed)
-- Used for email verification during signup
-- =====================================================
CREATE TABLE "email_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL, -- HMAC-SHA256 hash of the plain token
    "used" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "emailSentAt" TIMESTAMP(3), -- When the verification email was sent
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_tokens_pkey" PRIMARY KEY ("id")
);

-- =====================================================
-- Table: identities
-- Description: Stores OAuth provider identities
-- Links social accounts (Google, GitHub, etc.) to users
-- =====================================================
CREATE TABLE "identities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL, -- 'google', 'github', etc.
    "providerUserId" TEXT NOT NULL, -- Unique ID from OAuth provider
    "accessToken" TEXT, -- Encrypted in production
    "refreshToken" TEXT, -- Encrypted in production
    "expiresAt" TIMESTAMP(3), -- Token expiration
    "providerMeta" JSONB, -- Additional provider-specific data
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

-- =====================================================
-- Table: refresh_tokens
-- Description: Stores refresh token hashes for JWT rotation
-- Allows token revocation and secure token management
-- =====================================================
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL, -- Hash of the refresh token
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3), -- When the token was revoked
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- =====================================================
-- Indexes: users
-- =====================================================

-- Unique constraint on email (enforced via index)
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- Index for email lookups (login, signup)
CREATE INDEX "users_email_idx" ON "users"("email");

-- =====================================================
-- Indexes: email_tokens
-- =====================================================

-- Composite index for efficient token lookup and validation
-- Used when verifying email tokens (finds unused, non-expired tokens)
CREATE INDEX "email_tokens_tokenHash_used_expiresAt_idx" 
    ON "email_tokens"("tokenHash", "used", "expiresAt");

-- Index for finding all tokens for a user
CREATE INDEX "email_tokens_userId_idx" ON "email_tokens"("userId");

-- =====================================================
-- Indexes: identities
-- =====================================================

-- Index for finding all identities for a user
CREATE INDEX "identities_userId_idx" ON "identities"("userId");

-- Index for OAuth provider lookups (finding user by provider + providerUserId)
CREATE INDEX "identities_provider_providerUserId_idx" 
    ON "identities"("provider", "providerUserId");

-- Unique constraint: one provider account per user
-- Prevents duplicate OAuth account linking
CREATE UNIQUE INDEX "identities_provider_providerUserId_key" 
    ON "identities"("provider", "providerUserId");

-- =====================================================
-- Indexes: refresh_tokens
-- =====================================================

-- Index for token lookup (validating refresh tokens)
CREATE INDEX "refresh_tokens_tokenHash_idx" ON "refresh_tokens"("tokenHash");

-- Composite index for finding active tokens for a user
-- Used when revoking all user tokens or checking active sessions
CREATE INDEX "refresh_tokens_userId_revoked_idx" 
    ON "refresh_tokens"("userId", "revoked");

-- =====================================================
-- Foreign Key Constraints
-- =====================================================

-- email_tokens.userId -> users.id
ALTER TABLE "email_tokens" 
    ADD CONSTRAINT "email_tokens_userId_fkey" 
    FOREIGN KEY ("userId") 
    REFERENCES "users"("id") 
    ON DELETE CASCADE 
    ON UPDATE CASCADE;

-- identities.userId -> users.id
ALTER TABLE "identities" 
    ADD CONSTRAINT "identities_userId_fkey" 
    FOREIGN KEY ("userId") 
    REFERENCES "users"("id") 
    ON DELETE CASCADE 
    ON UPDATE CASCADE;

-- refresh_tokens.userId -> users.id
ALTER TABLE "refresh_tokens" 
    ADD CONSTRAINT "refresh_tokens_userId_fkey" 
    FOREIGN KEY ("userId") 
    REFERENCES "users"("id") 
    ON DELETE CASCADE 
    ON UPDATE CASCADE;

-- =====================================================
-- Schema Setup Complete!
-- =====================================================
-- Tables created:
--   ✅ users (core user accounts)
--   ✅ email_tokens (email verification)
--   ✅ identities (OAuth social logins)
--   ✅ refresh_tokens (JWT refresh token management)
--
-- Next steps:
--   1. Run the seed script: npm run seed
--   2. Test normal auth: POST /api/auth/signup
--   3. Test social auth: GET /api/auth/google
-- =====================================================

