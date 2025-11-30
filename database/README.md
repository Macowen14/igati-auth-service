# Database Schema Setup

This directory contains SQL scripts to manually create the database schema.

## Quick Start

### Option 1: Using Prisma (Recommended)

Prisma migrations handle schema creation automatically:

```bash
# Apply migrations
npm run migrate

# Generate Prisma Client
npx prisma generate

# Seed the database
npm run seed
```

### Option 2: Manual SQL Setup

If you prefer to run SQL directly:

```bash
# Using psql with DATABASE_URL from .env
psql $DATABASE_URL -f database/schema.sql

# Or using psql connection string
psql "postgresql://user:password@host:port/database" -f database/schema.sql

# Or pipe the SQL file
cat database/schema.sql | psql $DATABASE_URL
```

## Schema Overview

The database consists of 4 main tables:

### 1. `users`

Core user accounts storing:

- `id` (UUID) - Primary key
- `email` (unique) - User email address
- `passwordHash` - Hashed password (NULL for social-only users)
- `emailVerified` - Email verification status
- `createdAt`, `updatedAt` - Timestamps

**Use cases:**

- User authentication (email/password)
- User profile storage
- Email verification tracking

### 2. `email_tokens`

Email verification tokens for signup:

- `id` (UUID) - Primary key
- `userId` - Foreign key to `users`
- `tokenHash` - HMAC-SHA256 hash of verification token
- `used` - Whether token has been used
- `expiresAt` - Token expiration time
- `emailSentAt` - When email was sent

**Use cases:**

- Email verification during signup
- Resending verification emails

### 3. `identities`

OAuth provider identities (social logins):

- `id` (UUID) - Primary key
- `userId` - Foreign key to `users`
- `provider` - OAuth provider ('google', 'github', etc.)
- `providerUserId` - Unique ID from provider
- `accessToken`, `refreshToken` - OAuth tokens
- `providerMeta` - Additional provider data (JSONB)

**Use cases:**

- Google OAuth login
- GitHub OAuth login
- Linking multiple social accounts to one user

### 4. `refresh_tokens`

Refresh token storage for JWT rotation:

- `id` (UUID) - Primary key
- `userId` - Foreign key to `users`
- `tokenHash` - Hash of refresh token
- `expiresAt` - Token expiration
- `revoked` - Whether token was revoked
- `revokedAt` - Revocation timestamp

**Use cases:**

- JWT refresh token rotation
- Token revocation (logout)
- Session management

## Indexes

The schema includes optimized indexes for:

1. **Email lookups** - Fast user login/authentication
2. **Token validation** - Efficient email/refresh token verification
3. **OAuth lookups** - Quick social login provider matching
4. **User relations** - Fast queries for user-related data

## Foreign Keys

All foreign keys use `CASCADE` deletion:

- Deleting a user automatically deletes all related tokens and identities
- Ensures data consistency and prevents orphaned records

## Verification

After running the schema, verify tables were created:

```sql
-- List all tables
\dt

-- Check table structure
\d users
\d email_tokens
\d identities
\d refresh_tokens

-- Count records (should be 0 initially)
SELECT
    (SELECT COUNT(*) FROM users) as users,
    (SELECT COUNT(*) FROM email_tokens) as email_tokens,
    (SELECT COUNT(*) FROM identities) as identities,
    (SELECT COUNT(*) FROM refresh_tokens) as refresh_tokens;
```

## Seeding Data

After schema creation, seed an admin user:

```bash
npm run seed
```

This creates a default admin user (check `prisma/seed.js` for details).

## Testing

### Test Normal Auth Flow

```bash
# 1. Signup
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"SecurePass123!"}'

# 2. Verify email (use token from email)
curl "http://localhost:3000/api/auth/verify?token=TOKEN_FROM_EMAIL"

# 3. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"SecurePass123!"}'
```

### Test Social Auth Flow

```bash
# 1. Initiate Google OAuth
curl "http://localhost:3000/api/auth/google"

# 2. After OAuth callback, you'll be redirected with cookies set
# 3. Check current user
curl "http://localhost:3000/api/auth/me" --cookie-jar cookies.txt --cookie cookies.txt
```

## Troubleshooting

### Tables already exist

If you get "relation already exists" errors:

- The SQL script includes `DROP TABLE IF EXISTS` statements
- Or use Prisma: `npm run migrate:reset` (⚠️ deletes all data)

### Foreign key constraint errors

Ensure tables are created in the correct order:

1. `users` (no dependencies)
2. `email_tokens`, `identities`, `refresh_tokens` (depend on `users`)

The SQL script handles this automatically.

### UUID generation

PostgreSQL needs the UUID extension:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

The schema script includes this automatically.

## Maintenance

### Reset Database (Development Only)

```bash
# Using Prisma (recommended)
npm run migrate:reset

# Using SQL (manual)
psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
psql $DATABASE_URL -f database/schema.sql
npm run seed
```

### Backup Database

```bash
pg_dump $DATABASE_URL > backup.sql
```

### Restore Database

```bash
psql $DATABASE_URL < backup.sql
```
