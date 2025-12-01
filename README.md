# Auth Service

Production-ready Express.js authentication microservice with email verification, social logins (Google, GitHub), and JWT-based authentication.

## Features

- ✅ **Email + Password Authentication** - Secure password hashing with argon2id
- ✅ **Email Verification** - Asynchronous email verification via Resend
- ✅ **Social Logins** - OAuth integration with Google and GitHub
- ✅ **JWT Tokens** - HttpOnly Secure cookies with token rotation
- ✅ **Background Jobs** - BullMQ + Redis for email processing
- ✅ **Structured Logging** - Pino logger with file and console output
- ✅ **Graceful Shutdown** - Health checks and proper resource cleanup
- ✅ **Rate Limiting** - IP-based protection on auth endpoints
- ✅ **Error Handling** - Centralized error handling with security best practices
- ✅ **Docker Support** - Complete Docker setup for development and production

## Tech Stack

- **Runtime**: Node.js 18+ (ES Modules)
- **Framework**: Express.js 5.x
- **Database**: PostgreSQL with Prisma ORM 6.x
- **Queue**: BullMQ with Redis
- **Email**: Resend SDK
- **Authentication**: JWT (jose), Passport.js
- **Logging**: Pino with file streams
- **Testing**: Jest + Supertest
- **Environment**: dotenv for configuration

---

## Quick Start

### Prerequisites

- **Node.js** 18.0.0 or higher
- **PostgreSQL** 15+ (or use Docker/Neon)
- **Redis** 7+ (or use Docker/Cloud Redis)
- **Resend API Key** ([Get one here](https://resend.com/api-keys))

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd auth_service
   ```

2. **Install dependencies**

   ```bash
   npm ci
   ```

3. **Set up environment variables**

   **IMPORTANT**: Copy the provided `.env.example` file to `.env` and update all values:

   ```bash
   cp .env.example .env
   ```

   Then edit `.env` and replace the placeholder values with your actual credentials:

   ```bash
   # Edit .env with your actual values
   nano .env
   # or
   code .env
   ```

   **Required values to update:**
   - `DATABASE_URL` - Your PostgreSQL connection string
   - `REDIS_URL` - Your Redis connection URL
   - `RESEND_API_KEY` - Your Resend API key from [resend.com](https://resend.com/api-keys)
   - `JWT_SECRET` - Generate a secure random string:
     ```bash
     node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
     ```
   - `TOKEN_HASH_SECRET` - Generate another secure random string:
     ```bash
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
   - `OAUTH_ENCRYPTION_KEY` - Generate a secure encryption key for OAuth tokens (min 32 characters):
     ```bash
     openssl rand -base64 32
     # or
     node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
     ```
   - `APP_URL` - Your application URL (e.g., `http://localhost:4000` for dev)
   - OAuth credentials (if using social login):
     - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
     - `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`

4. **Run database migrations**

   ```bash
   npm run migrate
   ```

   This will:
   - Create the database schema
   - Generate Prisma client

5. **Generate Prisma Client** (if not done automatically)

   ```bash
   npx prisma generate
   ```

6. **Start the API server**

   ```bash
   npm run dev
   ```

   Server will start on `http://localhost:4000` (or the port specified in `.env`)

7. **Start the email worker** (in a separate terminal)

   ```bash
   npm run worker:dev
   ```

   This worker processes email jobs from the queue (verification emails, etc.)

---

## API Documentation

### Base URL

All API endpoints are prefixed with `/api/auth`

### Authentication Endpoints

#### POST `/api/auth/signup`

Create a new user account. An email verification link will be sent asynchronously.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "name": "John Doe"
}
```

**Fields:**

- `email` (required, string) - Valid email address
- `password` (required, string) - Minimum 8 characters, must include uppercase, lowercase, and number
- `name` (optional, string) - User's display name

**Success Response (201):**

```json
{
  "message": "Account created successfully. Please check your email to verify your account.",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "emailVerified": false
  }
}
```

**Error Responses:**

- `400 Bad Request` - Invalid email format or weak password
- `409 Conflict` - Email already exists
- `429 Too Many Requests` - Rate limit exceeded

**Rate Limit:** 5 requests per 15 minutes per IP

---

#### POST `/api/auth/resend-verification`

Resend verification email to a user. Returns generic message to prevent user enumeration.

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

**Success Response (200):**

```json
{
  "message": "If an account exists with this email, a verification email has been sent"
}
```

**Error Responses:**

- `400 Bad Request` - Email is required
- `409 Conflict` - Email already verified
- `429 Too Many Requests` - Rate limit exceeded

**Rate Limit:** 5 requests per 15 minutes per IP

---

#### GET `/api/auth/verify?token=<verification_token>`

Verify email address using the token sent via email. Automatically logs the user in and sets JWT cookies.

**Query Parameters:**

- `token` (required, string) - Verification token from email

**Success Response (200):**

```json
{
  "message": "Email verified successfully. You are now logged in.",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "emailVerified": true
  }
}
```

**Error Responses:**

- `400 Bad Request` - Token is required
- `404 Not Found` - Invalid or expired token

**Note:** JWT access and refresh tokens are automatically set as HttpOnly cookies.

---

#### POST `/api/auth/login`

Authenticate user with email and password. Sets JWT cookies on success.

**Request Body:**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Success Response (200):**

```json
{
  "message": "Login successful",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "emailVerified": true
  }
}
```

**Error Responses:**

- `400 Bad Request` - Email or password missing
- `401 Unauthorized` - Invalid credentials or unverified email (if `ALLOW_UNVERIFIED_LOGIN=false`)
- `429 Too Many Requests` - Rate limit exceeded (3 attempts per 15 minutes)

**Rate Limit:** 3 login attempts per 15 minutes per IP

**Note:**

- Access and refresh tokens are set as HttpOnly cookies
- By default, unverified users cannot login (configurable via `ALLOW_UNVERIFIED_LOGIN`)

---

#### POST `/api/auth/refresh`

Refresh access token using the refresh token cookie. Implements token rotation (old refresh token is revoked).

**Request:** No body required (uses refresh token from cookie)

**Success Response (200):**

```json
{
  "message": "Token refreshed successfully"
}
```

**Error Responses:**

- `401 Unauthorized` - Invalid, expired, or missing refresh token

**Note:** New access and refresh tokens are set as HttpOnly cookies.

---

#### POST `/api/auth/logout`

Logout user by revoking refresh token and clearing cookies.

**Request:** No body required

**Success Response (200):**

```json
{
  "message": "Logged out successfully"
}
```

**Note:** Clears all authentication cookies.

---

#### GET `/api/auth/me`

Get current authenticated user information.

**Request:** Requires access token cookie

**Success Response (200):**

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

**Error Responses:**

- `401 Unauthorized` - Missing or invalid access token

---

#### GET `/api/auth/profile`

Get current user's complete profile information including name and avatar.

**Request:** Requires access token cookie

**Success Response (200):**

```json
{
  "profile": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "avatarUrl": "http://localhost:4000/uploads/image-1234567890-123456789.jpg",
    "emailVerified": true,
    "createdAt": "2025-11-29T19:00:00.000Z",
    "updatedAt": "2025-11-29T19:00:00.000Z"
  }
}
```

**Error Responses:**

- `401 Unauthorized` - Missing or invalid access token
- `404 Not Found` - User not found

---

#### PUT `/api/auth/profile`

Update current user's profile. Supports updating name and uploading avatar image.

**Request:** Requires access token cookie

**Content-Type:** `multipart/form-data` (for file upload) or `application/json`

**Form Data:**

- `name` (optional, string) - User's display name (max 100 characters)
- `avatar` (optional, file) - Image file (JPEG, PNG, GIF, WebP, max 5MB)

**OR JSON Body:**

```json
{
  "name": "John Doe",
  "avatarUrl": "http://example.com/avatar.jpg"
}
```

**Success Response (200):**

```json
{
  "message": "Profile updated successfully",
  "profile": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "avatarUrl": "http://localhost:4000/uploads/image-1234567890-123456789.jpg",
    "emailVerified": true,
    "createdAt": "2025-11-29T19:00:00.000Z",
    "updatedAt": "2025-11-29T20:00:00.000Z"
  }
}
```

**Error Responses:**

- `400 Bad Request` - Invalid file type, file too large (>5MB), or validation error
- `401 Unauthorized` - Missing or invalid access token
- `404 Not Found` - User not found

**Notes:**

- Image files are stored in the `uploads/` directory
- Uploaded images are accessible via `/uploads/{filename}` URL
- Maximum file size: 5MB
- Allowed formats: JPEG, PNG, GIF, WebP
- If uploading a file, the `avatarUrl` will be automatically generated

---

### OAuth Endpoints

#### GET `/api/auth/oauth/google`

Initiate Google OAuth flow. Redirects user to Google authorization page.

**Query Parameters:** None

**Response:** Redirects to Google OAuth consent screen

**Callback URL:** `/api/auth/oauth/google/callback`

---

#### GET `/api/auth/oauth/google/callback`

Google OAuth callback handler. Called by Google after authorization.

**Query Parameters:**

- `code` (provided by Google)
- `error` (if authorization failed)

**Response:**

- On success: Redirects to frontend with `?success=true` and sets JWT cookies
- On failure: Redirects with `?error=google_failed`

---

#### GET `/api/auth/oauth/github`

Initiate GitHub OAuth flow. Redirects user to GitHub authorization page.

**Query Parameters:** None

**Response:** Redirects to GitHub OAuth consent screen

**Callback URL:** `/api/auth/oauth/github/callback`

---

#### GET `/api/auth/oauth/github/callback`

GitHub OAuth callback handler. Called by GitHub after authorization.

**Query Parameters:**

- `code` (provided by GitHub)
- `error` (if authorization failed)

**Response:**

- On success: Redirects to frontend with `?success=true` and sets JWT cookies
- On failure: Redirects with `?error=github_failed`

**Note:** OAuth users automatically have `emailVerified: true` since providers verify emails.

---

### Health Check Endpoints

#### GET `/health`

Basic health check endpoint.

**Response (200):**

```json
{
  "status": "ok",
  "timestamp": "2025-11-29T19:00:00.000Z",
  "uptime": 3600.5
}
```

---

#### GET `/health/live`

Liveness probe for Kubernetes/container orchestration.

**Response (200):**

```json
{
  "status": "ok"
}
```

---

#### GET `/health/ready`

Readiness probe that checks database and Redis connectivity.

**Response (200) - All healthy:**

```json
{
  "status": "ok",
  "checks": {
    "database": "healthy",
    "redis": "healthy"
  },
  "timestamp": "2025-11-29T19:00:00.000Z"
}
```

**Response (503) - Degraded:**

```json
{
  "status": "degraded",
  "checks": {
    "database": "unhealthy",
    "redis": "healthy"
  },
  "timestamp": "2025-11-29T19:00:00.000Z"
}
```

---

## Error Responses

All error responses follow this structure:

```json
{
  "error": {
    "code": "ErrorCode",
    "message": "Human-readable error message"
  }
}
```

### Error Codes

| Code                  | HTTP Status | Description                                                |
| --------------------- | ----------- | ---------------------------------------------------------- |
| `ValidationError`     | 400         | Invalid input data (email format, password strength, etc.) |
| `AuthenticationError` | 401         | Authentication failed (invalid credentials, missing token) |
| `AuthorizationError`  | 403         | Insufficient permissions                                   |
| `NotFoundError`       | 404         | Resource not found                                         |
| `ConflictError`       | 409         | Resource already exists (e.g., duplicate email)            |
| `TooManyRequests`     | 429         | Rate limit exceeded                                        |
| `InternalServerError` | 500         | Unexpected server error                                    |

### Example Error Responses

**Validation Error (400):**

```json
{
  "error": {
    "code": "ValidationError",
    "message": "Password must be at least 8 characters long"
  }
}
```

**Authentication Error (401):**

```json
{
  "error": {
    "code": "AuthenticationError",
    "message": "Invalid email or password"
  }
}
```

**Rate Limit Error (429):**

```json
{
  "error": {
    "code": "TooManyRequests",
    "message": "Too many requests from this IP, please try again later"
  }
}
```

**Note:** Error messages are generic to prevent user enumeration attacks. Detailed errors are logged server-side only.

---

## Project Structure

```
auth_service/
├── src/
│   ├── api/                  # API route handlers
│   │   ├── auth.js          # Authentication routes
│   │   └── oauth.js         # OAuth routes
│   ├── lib/                  # Core libraries
│   │   ├── config.js        # Environment validation
│   │   ├── logger.js        # Pino logger setup
│   │   ├── prisma.js        # Prisma client singleton
│   │   ├── jwt.js           # JWT signing/verification
│   │   ├── queue.js         # BullMQ queue setup
│   │   └── mailer.js        # Resend email wrapper
│   ├── middlewares/          # Express middlewares
│   │   ├── errorHandler.js  # Centralized error handling
│   │   ├── asyncHandler.js  # Async route wrapper
│   │   ├── rateLimiter.js   # Rate limiting
│   │   ├── authenticate.js  # JWT authentication middleware
│   │   └── upload.js        # File upload middleware (multer)
│   ├── services/             # Business logic
│   │   ├── authService.js   # Auth operations
│   │   └── profileService.js # Profile operations
│   ├── workers/              # Background workers
│   │   └── emailWorker.js   # Email job processor
│   ├── utils/                # Utilities
│   │   └── tokenUtils.js    # Token generation/hashing
│   ├── tests/                # Test files
│   │   ├── setup.js
│   │   └── auth.test.js
│   ├── server.js            # Express app setup
│   └── index.js             # Application entry point
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── seed.js              # Database seeding
├── logs/                    # Log files (auto-created)
│   ├── app.log              # Info+ logs (JSON)
│   └── debug.log            # Debug logs (JSON)
├── uploads/                 # Uploaded user images (auto-created)
├── docker-compose.yml       # Docker Compose config
├── Dockerfile               # Docker image definition
├── .env.example             # Environment template
├── package.json
└── README.md
```

---

## Development

### Available Scripts

```bash
# Development
npm run dev              # Start API server with watch mode
npm run worker           # Start email worker
npm run worker:dev       # Start email worker with watch mode

# Database
npm run migrate          # Run Prisma migrations (dev)
npm run migrate:deploy   # Deploy migrations (production)
npm run migrate:reset    # Reset database (dev only)
npm run db:studio        # Open Prisma Studio (DB GUI)
npm run db:seed          # Run seed script (create admin user)

# Testing & Quality
npm test                 # Run tests
npm run test:watch       # Run tests in watch mode
npm run lint             # Lint code
npm run format           # Format code with Prettier
```

### Database Migrations

```bash
# Create a new migration
npm run migrate

# Reset database (WARNING: Deletes all data)
npm run migrate:reset

# Deploy migrations to production
npm run migrate:deploy
```

### Database Seeding

Create an admin user for testing:

```bash
# Set admin credentials in .env (optional)
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Admin123!

# Run seed
npm run db:seed
```

### Logging

Logs are automatically written to:

- **`logs/app.log`** - Info level and above (JSON format)
- **`logs/debug.log`** - Debug logs (JSON format)
- **Console** - Pretty formatted logs in development

**Log Levels:** `fatal`, `error`, `warn`, `info`, `debug`, `trace`

Set log level via `LOG_LEVEL` environment variable.

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage report
npm test -- --coverage
```

Tests use Jest with Supertest. BullMQ and database are mocked in unit tests.

---

## Environment Variables

**IMPORTANT:** Always copy `.env.example` to `.env` and update all values before running the application.

### Required Variables

| Variable               | Description                                    | Example                                                                                   |
| ---------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `DATABASE_URL`         | PostgreSQL connection string                   | `postgresql://user:pass@host:5432/dbname`                                                 |
| `REDIS_URL`            | Redis connection URL                           | `redis://localhost:6379`                                                                  |
| `RESEND_API_KEY`       | Resend API key for emails                      | `re_xxxxxxxxxxxx`                                                                         |
| `JWT_SECRET`           | Secret for signing JWTs                        | Generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `TOKEN_HASH_SECRET`    | Secret for hashing email tokens                | Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `OAUTH_ENCRYPTION_KEY` | Encryption key for OAuth tokens (min 32 chars) | Generate with: `openssl rand -base64 32`                                                  |

### Optional Variables

| Variable                   | Default                 | Description                                                      |
| -------------------------- | ----------------------- | ---------------------------------------------------------------- |
| `PORT`                     | `4000`                  | HTTP server port                                                 |
| `APP_URL`                  | `http://localhost:4000` | Base URL for email links                                         |
| `NODE_ENV`                 | `development`           | Environment mode (`development`, `test`, `production`)           |
| `LOG_LEVEL`                | `info`                  | Logging level                                                    |
| `JWT_ACCESS_EXPIRY`        | `15m`                   | Access token expiry                                              |
| `JWT_REFRESH_EXPIRY`       | `30d`                   | Refresh token expiry                                             |
| `EMAIL_TOKEN_EXPIRY_HOURS` | `24`                    | Email verification token expiry                                  |
| `ALLOW_UNVERIFIED_LOGIN`   | `false`                 | Allow login without email verification                           |
| `COOKIE_DOMAIN`            | `localhost`             | Cookie domain                                                    |
| `COOKIE_SECURE`            | `false`                 | Use Secure flag on cookies (set `true` in production with HTTPS) |
| `RESEND_FROM_EMAIL`        | `noreply@example.com`   | Default from email address                                       |
| `GOOGLE_CLIENT_ID`         | -                       | Google OAuth client ID                                           |
| `GOOGLE_CLIENT_SECRET`     | -                       | Google OAuth client secret                                       |
| `GITHUB_CLIENT_ID`         | -                       | GitHub OAuth client ID                                           |
| `GITHUB_CLIENT_SECRET`     | -                       | GitHub OAuth client secret                                       |
| `RATE_LIMIT_MAX_REQUESTS`  | `5`                     | Max requests per window                                          |
| `RATE_LIMIT_WINDOW_MS`     | `900000`                | Rate limit window (15 minutes)                                   |

See `.env.example` for all available variables with descriptions.

---

## Docker Setup

### Quick Start with Docker Compose

```bash
# Start all services (PostgreSQL, Redis, API, Worker)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Development Setup

Run only database services in Docker, API locally:

```bash
# Start only PostgreSQL and Redis
docker-compose up -d postgres redis

# Run API locally
npm run dev

# Run worker locally (separate terminal)
npm run worker:dev
```

### Production Build

```bash
# Build Docker image
docker build -t auth-service:latest .

# Run container
docker run -d \
  --name auth-api \
  -p 4000:4000 \
  --env-file .env \
  auth-service:latest
```

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] All environment variables set in production secrets manager
- [ ] Database migrations run: `npm run migrate:deploy`
- [ ] Prisma client generated: `npx prisma generate`
- [ ] HTTPS enabled (required for Secure cookies)
- [ ] `COOKIE_SECURE=true` set in production
- [ ] `NODE_ENV=production` set
- [ ] Strong `JWT_SECRET` and `TOKEN_HASH_SECRET` generated
- [ ] Redis `maxmemory-policy` set to `noeviction` (see Redis Configuration below)
- [ ] Rate limiting configured appropriately
- [ ] Log aggregation set up
- [ ] Health checks configured for load balancer
- [ ] Worker process running separately
- [ ] Uploads directory created and writable

### Redis Configuration

For production, Redis should be configured with `maxmemory-policy noeviction` to prevent BullMQ jobs from being evicted when Redis runs out of memory. This can be done in several ways:

**Option 1: Configure via Redis CLI (recommended for managed Redis)**

```bash
redis-cli CONFIG SET maxmemory-policy noeviction
```

**Option 2: Configure in redis.conf**

```
maxmemory-policy noeviction
```

**Option 3: Call the configuration function at startup**
The application includes a `configureRedisMemoryPolicy()` function in `src/lib/queue.js` that can be called during startup. However, this may not work if Redis is managed externally or doesn't allow runtime configuration changes.

**Note:** For managed Redis services (AWS ElastiCache, Redis Cloud, etc.), configure this through the service's management console or configuration interface.

### Process Manager (PM2)

Use the provided `ecosystem.config.example.js` as a template:

```bash
# Copy example config
cp ecosystem.config.example.js ecosystem.config.js

# Edit with your settings
nano ecosystem.config.js

# Start with PM2
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# View logs
pm2 logs
```

### Reverse Proxy (Nginx Example)

```nginx
server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:4000/health;
        access_log off;
    }
}
```

### Kubernetes Deployment

Example deployment and service:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: auth-service
  template:
    metadata:
      labels:
        app: auth-service
    spec:
      containers:
        - name: api
          image: auth-service:latest
          ports:
            - containerPort: 4000
          envFrom:
            - secretRef:
                name: auth-secrets
          livenessProbe:
            httpGet:
              path: /health/live
              port: 4000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 4000
            initialDelaySeconds: 5
            periodSeconds: 5
```

### Monitoring

Monitor these metrics:

- **Health Checks**: `/health/ready` endpoint
- **Queue Depth**: BullMQ queue length
- **Worker Status**: Email worker health
- **Database Connections**: Prisma connection pool
- **Error Rates**: 5xx error counts
- **Response Times**: API latency

---

## Security Considerations

### Implemented Security Features

1. **Password Hashing**: argon2id (memory-hard, resistant to GPU attacks)
2. **Token Security**:
   - Email verification tokens are hashed before storage
   - Refresh tokens stored as hashes in database
   - Token rotation on refresh
3. **Cookie Security**:
   - HttpOnly (prevents XSS)
   - Secure flag in production (HTTPS only)
   - SameSite=Lax (CSRF protection)
4. **Rate Limiting**: IP-based protection on auth endpoints
5. **Error Messages**: Generic responses prevent user enumeration
6. **JWT Tokens**:
   - Short-lived access tokens (15 minutes)
   - Long-lived refresh tokens (30 days) with rotation
   - Stored in HttpOnly cookies (not localStorage)
7. **Input Validation**: Email format, password strength enforced
8. **SQL Injection Protection**: Prisma ORM with parameterized queries

### Security Best Practices

- ✅ Never commit `.env` file to version control
- ✅ Use strong, randomly generated secrets
- ✅ Enable HTTPS in production
- ✅ Set `COOKIE_SECURE=true` in production
- ✅ Regularly rotate JWT secrets
- ✅ Monitor for suspicious activity
- ✅ Keep dependencies updated
- ✅ Use environment-specific configurations

---

## Troubleshooting

### Database Connection Issues

**Problem:** Cannot connect to database

**Solutions:**

- Verify `DATABASE_URL` format: `postgresql://user:password@host:port/database`
- For Neon/cloud databases, ensure `?sslmode=require` is included
- Check database is running: `pg_isready -h localhost`
- Verify network/firewall allows connections
- Check credentials are correct

### Redis Connection Issues

**Problem:** Cannot connect to Redis

**Solutions:**

- Verify `REDIS_URL` format: `redis://localhost:6379` (not `redis-cli -u ...`)
- Check Redis is running: `redis-cli ping`
- Verify Redis authentication if configured
- Check network connectivity

### Email Not Sending

**Problem:** Verification emails not received

**Solutions:**

- Verify `RESEND_API_KEY` is correct
- Check Resend dashboard for rate limits and errors
- Ensure worker is running: `npm run worker`
- Check worker logs: `logs/debug.log`
- Verify `RESEND_FROM_EMAIL` is a verified domain in Resend
- Check spam folder

### Prisma Client Generation Fails

**Problem:** `Cannot find module '@prisma/client'`

**Solutions:**

- Ensure Prisma and @prisma/client versions match (currently 6.19.0)
- Regenerate client: `npx prisma generate`
- Clear and reinstall: `rm -rf node_modules/.prisma && npm install && npx prisma generate`

### Environment Variables Not Loading

**Problem:** Variables from `.env` not being read

**Solutions:**

- Ensure `.env` file exists (copy from `.env.example`)
- Verify `dotenv` package is installed: `npm list dotenv`
- Check file is in project root (same directory as `package.json`)
- Restart the application after changing `.env`

### Rate Limiting Issues

**Problem:** Getting rate limited too frequently

**Solutions:**

- Adjust `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW_MS` in `.env`
- Check if multiple users share same IP (NAT/proxy)
- Consider implementing user-based rate limiting for authenticated users

---

## License

MIT

## Support

For issues, questions, or contributions:

- **Email**: mwingamacowen@gmail.com
- **Issues**: Open an issue on GitHub
- **Documentation**: See inline code comments and API documentation above

---

## Changelog

### Version 1.0.0

- Initial release
- Email + password authentication
- Email verification with Resend
- Social logins (Google, GitHub)
- JWT token management with rotation
- Background job processing
- Comprehensive error handling
- Production-ready logging
- Docker support
