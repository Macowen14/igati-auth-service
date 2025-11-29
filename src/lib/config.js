/**
 * Configuration Module
 * 
 * Validates and exports environment variables using envalid.
 * This ensures all required config is present at startup and provides
 * type-safe access to configuration throughout the application.
 */

import { cleanEnv, str, num, bool, url, host } from 'envalid';

const config = cleanEnv(process.env, {
  // Server
  PORT: num({ default: 4000, desc: 'HTTP server port' }),
  APP_URL: url({ default: 'http://localhost:4000', desc: 'Base URL of the application' }),
  NODE_ENV: str({ 
    choices: ['development', 'test', 'production'], 
    default: 'development',
    desc: 'Environment mode'
  }),

  // Database
  DATABASE_URL: str({ desc: 'PostgreSQL connection string' }),

  // Redis
  REDIS_URL: str({ default: 'redis://localhost:6379', desc: 'Redis connection URL for BullMQ' }),

  // Email (Resend)
  RESEND_API_KEY: str({ desc: 'Resend API key for sending emails' }),
  RESEND_FROM_EMAIL: str({ 
    default: 'noreply@example.com',
    desc: 'Default from email address for Resend'
  }),

  // JWT
  JWT_SECRET: str({ desc: 'Secret key for signing JWTs' }),
  JWT_ACCESS_EXPIRY: str({ 
    default: '15m',
    desc: 'Access token expiry (e.g., 15m, 1h)'
  }),
  JWT_REFRESH_EXPIRY: str({ 
    default: '30d',
    desc: 'Refresh token expiry (e.g., 7d, 30d)'
  }),

  // Token Hashing
  TOKEN_HASH_SECRET: str({ desc: 'Secret for HMAC hashing email verification tokens' }),

  // Cookies
  COOKIE_DOMAIN: str({ default: 'localhost', desc: 'Cookie domain' }),
  COOKIE_SECURE: bool({ 
    default: false,
    desc: 'Set Secure flag on cookies (should be true in production with HTTPS)'
  }),

  // OAuth - Google
  GOOGLE_CLIENT_ID: str({ default: '', desc: 'Google OAuth client ID' }),
  GOOGLE_CLIENT_SECRET: str({ default: '', desc: 'Google OAuth client secret' }),
  GOOGLE_CALLBACK_URL: url({ 
    default: 'http://localhost:4000/api/auth/oauth/google/callback',
    desc: 'Google OAuth callback URL'
  }),

  // OAuth - GitHub
  GITHUB_CLIENT_ID: str({ default: '', desc: 'GitHub OAuth client ID' }),
  GITHUB_CLIENT_SECRET: str({ default: '', desc: 'GitHub OAuth client secret' }),
  GITHUB_CALLBACK_URL: url({ 
    default: 'http://localhost:4000/api/auth/oauth/github/callback',
    desc: 'GitHub OAuth callback URL'
  }),

  // Logging
  LOG_LEVEL: str({ 
    choices: ['fatal', 'error', 'warn', 'info', 'debug', 'trace'],
    default: 'info',
    desc: 'Logging level'
  }),

  // Auth Configuration
  ALLOW_UNVERIFIED_LOGIN: bool({ 
    default: false,
    desc: 'Allow users to login without email verification (security trade-off)'
  }),
  EMAIL_TOKEN_EXPIRY_HOURS: num({ 
    default: 24,
    desc: 'Email verification token expiry in hours'
  }),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: num({ 
    default: 15 * 60 * 1000, // 15 minutes
    desc: 'Rate limit window in milliseconds'
  }),
  RATE_LIMIT_MAX_REQUESTS: num({ 
    default: 5,
    desc: 'Maximum requests per window for auth endpoints'
  }),
}, {
  // Envalid options
  strict: true, // Fail fast if required vars are missing
});

export default config;

