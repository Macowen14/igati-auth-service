# Quick Database Setup Guide

## 🚀 Quick Start

### Option 1: Using Prisma (Recommended)

```bash
# 1. Create all tables automatically
npm run migrate

# 2. Seed admin user
npm run seed

# 3. Verify tables
psql $DATABASE_URL -c "\dt"
```

### Option 2: Using SQL Directly

```bash
# 1. Run the SQL schema
psql $DATABASE_URL -f database/schema.sql

# 2. Seed admin user
npm run seed

# 3. Verify tables
psql $DATABASE_URL -c "\dt"
```

## 📋 What Gets Created

### 4 Main Tables:

1. **`users`** - User accounts
   - `id`, `email`, `passwordHash`, `emailVerified`

2. **`email_tokens`** - Email verification
   - Used for signup email verification

3. **`identities`** - OAuth/social logins
   - Supports Google, GitHub, etc.

4. **`refresh_tokens`** - JWT refresh tokens
   - Secure token management

## ✅ After Setup

### Test Normal Auth (Email/Password)

```bash
# 1. Signup
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!"
  }'

# 2. Check email for verification token, then verify:
curl "http://localhost:3000/api/auth/verify?token=TOKEN_FROM_EMAIL"

# 3. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!"
  }'

# 4. Get current user (use cookies from login)
curl "http://localhost:3000/api/auth/me" \
  --cookie-jar cookies.txt \
  --cookie cookies.txt
```

### Test Social Auth (Google/GitHub)

```bash
# 1. Initiate Google OAuth
curl -v "http://localhost:3000/api/auth/google"

# Browser will redirect to Google, then back with auth cookies

# 2. Get current user (cookies set automatically)
curl "http://localhost:3000/api/auth/me" \
  --cookie-jar cookies.txt \
  --cookie cookies.txt
```

## 🧪 Seed Admin User

The seed script creates an admin user:

- **Email**: `mwingamac@gmail.com` (or `ADMIN_EMAIL` from .env)
- **Password**: `Admin123!` (or `ADMIN_PASSWORD` from .env)
- **Email Verified**: `true` (can login immediately)

## 🔍 Verify Database

```sql
-- List all tables
\dt

-- Check users table
SELECT id, email, "emailVerified", "createdAt" FROM users;

-- Check all tables have records
SELECT 
    (SELECT COUNT(*) FROM users) as users,
    (SELECT COUNT(*) FROM email_tokens) as email_tokens,
    (SELECT COUNT(*) FROM identities) as identities,
    (SELECT COUNT(*) FROM refresh_tokens) as refresh_tokens;
```

## 📁 Files

- `database/schema.sql` - Complete SQL schema with comprehensive documentation
- `database/README.md` - Complete documentation

## ⚠️ Troubleshooting

### "relation already exists"
```bash
# Reset and recreate (⚠️ deletes all data)
npm run migrate:reset
npm run seed
```

### "permission denied"
```bash
# Make sure DATABASE_URL has correct permissions
psql $DATABASE_URL -c "SELECT version();"
```

### "extension uuid-ossp does not exist"
The SQL script handles this automatically with:
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

## ✅ Done!

After running the setup, you should have:
- ✅ All 4 tables created
- ✅ All indexes and foreign keys set up
- ✅ Admin user seeded (ready to login)
- ✅ Ready to test normal and social auth

