# Auth Service

Production-ready Express.js authentication microservice with email verification, social logins (Google, GitHub), and JWT-based authentication.

## Features

- ✅ Email + password authentication with secure password hashing (argon2)
- ✅ Email verification via Resend (background worker)
- ✅ Social logins (Google, GitHub) via Passport.js
- ✅ JWT tokens stored in HttpOnly Secure cookies
- ✅ Background job queue (BullMQ + Redis) for email processing
- ✅ Robust error handling and logging (Pino)
- ✅ Graceful shutdown and health checks
- ✅ Rate limiting for security
- ✅ Docker support for local development

## Tech Stack

- **Runtime**: Node.js 18+ (ES Modules)
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Queue**: BullMQ with Redis
- **Email**: Resend SDK
- **Authentication**: JWT (jose), Passport.js
- **Logging**: Pino
- **Testing**: Jest + Supertest

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 15+ (or use Docker)
- Redis (or use Docker)
- Resend API key ([get one here](https://resend.com/api-keys))

### Installation

1. **Clone and install dependencies**

   ```bash
   git clone <repository-url>
   cd auth_service
   npm ci
   ```

2. **Set up environment variables**

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

   Required variables:
   - `DATABASE_URL` - PostgreSQL connection string
   - `REDIS_URL` - Redis connection URL
   - `RESEND_API_KEY` - Resend API key
   - `JWT_SECRET` - Secret for signing JWTs (generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)
   - `TOKEN_HASH_SECRET` - Secret for hashing email tokens

3. **Run database migrations**

   ```bash
   npm run migrate
   ```

   This will:
   - Create the database schema
   - Generate Prisma client

4. **Start services with Docker (recommended)**

   ```bash
   docker-compose up -d
   ```

   This starts PostgreSQL and Redis. The API and worker containers are optional - you can run them locally instead.

5. **Start the API server**

   ```bash
   npm run dev
   ```

   Server will start on `http://localhost:4000`

6. **Start the email worker** (in a separate terminal)

   ```bash
   npm run worker:dev
   ```

   Worker processes email jobs from the queue.

### Using Docker Compose (All-in-one)

```bash
# Start all services (PostgreSQL, Redis, API, Worker)
docker-compose up

# Or run in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## API Endpoints

### Authentication

- `POST /api/auth/signup` - Create new account
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePass123",
    "name": "John Doe" // optional
  }
  ```

- `GET /api/auth/verify?token=<token>` - Verify email token

- `POST /api/auth/login` - Login with email/password
  ```json
  {
    "email": "user@example.com",
    "password": "SecurePass123"
  }
  ```

- `POST /api/auth/refresh` - Refresh access token (uses refresh token cookie)

- `POST /api/auth/logout` - Logout (clears cookies)

- `GET /api/auth/me` - Get current user info (requires authentication)

### OAuth

- `GET /api/auth/oauth/google` - Initiate Google OAuth
- `GET /api/auth/oauth/google/callback` - Google OAuth callback
- `GET /api/auth/oauth/github` - Initiate GitHub OAuth
- `GET /api/auth/oauth/github/callback` - GitHub OAuth callback

### Health Checks

- `GET /health` - Basic health check
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe (checks database + Redis)

## Project Structure

```
auth_service/
├── src/
│   ├── api/              # API routes
│   │   ├── auth.js       # Authentication routes
│   │   └── oauth.js      # OAuth routes
│   ├── lib/              # Core libraries
│   │   ├── config.js     # Environment config
│   │   ├── logger.js     # Pino logger
│   │   ├── prisma.js     # Prisma client
│   │   ├── jwt.js        # JWT utilities
│   │   ├── queue.js      # BullMQ queue
│   │   └── mailer.js     # Resend wrapper
│   ├── middlewares/      # Express middlewares
│   │   ├── errorHandler.js
│   │   ├── asyncHandler.js
│   │   └── rateLimiter.js
│   ├── services/         # Business logic
│   │   └── authService.js
│   ├── workers/          # Background workers
│   │   └── emailWorker.js
│   ├── utils/            # Utilities
│   │   └── tokenUtils.js
│   ├── tests/            # Test files
│   │   ├── setup.js
│   │   └── auth.test.js
│   ├── server.js         # Express app
│   └── index.js          # Entry point
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── seed.js           # Seed script
├── logs/                 # Log files (created automatically)
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## Development

### Scripts

```bash
npm run dev          # Start API server with watch mode
npm run worker       # Start email worker
npm run worker:dev   # Start email worker with watch mode
npm run migrate      # Run Prisma migrations
npm run migrate:deploy  # Deploy migrations (production)
npm run db:studio    # Open Prisma Studio
npm run db:seed      # Run seed script
npm test             # Run tests
npm run lint         # Lint code
npm run format       # Format code
```

### Database Migrations

```bash
# Create a new migration
npm run migrate

# Reset database (dev only)
npm run migrate:reset

# Deploy migrations (production)
npm run migrate:deploy
```

### Logging

Logs are written to:
- `logs/app.log` - Info level and above (JSON format)
- `logs/debug.log` - Debug logs (JSON format)
- Console - Pretty format in development

Log levels: `fatal`, `error`, `warn`, `info`, `debug`, `trace`

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm test -- --coverage
```

Tests use Jest with Supertest. BullMQ is mocked to avoid requiring Redis during tests.

## Security Considerations

1. **Password Hashing**: Uses argon2id (memory-hard, resistant to GPU attacks)
2. **Tokens**: Email verification tokens are hashed before database storage
3. **Cookies**: HttpOnly, Secure (production), SameSite=Lax
4. **Rate Limiting**: IP-based rate limiting on auth endpoints
5. **Error Messages**: Generic messages prevent user enumeration
6. **JWT**: Short-lived access tokens (15m), long-lived refresh tokens (30d) with rotation

## Environment Variables

See `.env.example` for all available environment variables.

### Required

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection URL
- `RESEND_API_KEY` - Resend API key
- `JWT_SECRET` - JWT signing secret
- `TOKEN_HASH_SECRET` - Token hashing secret

### Optional

- `PORT` - Server port (default: 4000)
- `NODE_ENV` - Environment (development, test, production)
- `LOG_LEVEL` - Logging level (default: info)
- `ALLOW_UNVERIFIED_LOGIN` - Allow login without email verification (default: false)

## Resume Checklist

If you need to resume development after interruption, follow this checklist:

1. ✅ **Verify Prisma schema exists**
   - Check: `prisma/schema.prisma`
   - Line: 1

2. ✅ **Install dependencies**
   ```bash
   npm ci
   ```

3. ✅ **Run database migrations**
   ```bash
   npm run migrate
   ```
   - Check: `prisma/migrations/` directory exists

4. ✅ **Create `.env` file**
   ```bash
   cp .env.example .env
   # Edit with your values
   ```

5. ✅ **Start local services**
   ```bash
   docker-compose up -d postgres redis
   ```
   Or use external PostgreSQL/Redis

6. ✅ **Start API server**
   ```bash
   npm run dev
   ```
   - Check: `logs/` directory created
   - Check: `logs/app.log` has entries

7. ✅ **Start email worker**
   ```bash
   npm run worker:dev
   ```
   - Check: `logs/debug.log` has worker activity

8. **Continue from TODO markers:**
   - `src/api/auth.js` - Line with `// TODO: RESUME-HERE` - Add resend verification email endpoint
   - `src/workers/emailWorker.js` - Line with `// TODO: RESUME-HERE` - Add more email types
   - `prisma/seed.js` - Line with `// TODO: RESUME-HERE` - Uncomment admin user creation
   - `src/tests/auth.test.js` - Line with `# RESUME-HERE` - Complete test implementations

## Production Deployment

1. **Set environment variables** (use secrets manager)
2. **Run migrations**: `npm run migrate:deploy`
3. **Build Docker image**: `docker build -t auth-service .`
4. **Use process manager**: See `ecosystem.config.js` example for PM2
5. **Set up reverse proxy** (nginx/traefik) with HTTPS
6. **Configure health checks** for load balancer
7. **Set up log aggregation** (ELK, Datadog, etc.)
8. **Monitor** queue depth and worker health

### PM2 Example

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'auth-api',
      script: 'src/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'auth-worker',
      script: 'src/workers/emailWorker.js',
      instances: 2, // Scale workers
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
```

Run with: `pm2 start ecosystem.config.js`

## Troubleshooting

### Database connection fails
- Check `DATABASE_URL` is correct
- Ensure PostgreSQL is running
- Check network/firewall settings

### Redis connection fails
- Check `REDIS_URL` is correct
- Ensure Redis is running
- Check Redis authentication if configured

### Email not sending
- Verify `RESEND_API_KEY` is set correctly
- Check Resend dashboard for rate limits
- Check worker logs: `logs/debug.log`
- Verify worker is running: `npm run worker`

### Migration errors
- Check database permissions
- Verify `DATABASE_URL` has correct credentials
- Run `npx prisma migrate reset` (dev only) to start fresh

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.

# igati-auth-service
