/**
 * OAuth Routes
 * 
 * Handles OAuth authentication flows for Google and GitHub.
 * Uses Passport.js with sessionless strategy (stateless OAuth).
 * 
 * Flow:
 * 1. User clicks "Login with Google/GitHub"
 * 2. Redirects to provider authorization
 * 3. Provider redirects back to callback URL
 * 4. We create/link user and issue JWT cookies
 */

import express from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { v4 as uuidv4 } from 'uuid';
import { createRequestLogger } from '../lib/logger.js';
import asyncHandler from '../middlewares/asyncHandler.js';
import { findOrCreateOAuthUser } from '../services/authService.js';
import { createAccessToken, createRefreshToken, setAuthCookies } from '../lib/jwt.js';
import { hashToken } from '../utils/tokenUtils.js';
import { storeRefreshToken } from '../services/authService.js';
import config from '../lib/config.js';

const router = express.Router();

/**
 * Request ID middleware
 */
router.use((req, res, next) => {
  req.id = uuidv4();
  req.logger = createRequestLogger(req.id);
  next();
});

/**
 * Configure Google OAuth Strategy
 * Only if credentials are provided
 */
if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.GOOGLE_CLIENT_ID,
        clientSecret: config.GOOGLE_CLIENT_SECRET,
        callbackURL: config.GOOGLE_CALLBACK_URL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Extract user information from Google profile
          const email = profile.emails?.[0]?.value;
          const name = profile.displayName || profile.name?.givenName;

          if (!email) {
            return done(new Error('Email not provided by Google'));
          }

          // Find or create user
          const { user } = await findOrCreateOAuthUser({
            provider: 'google',
            providerUserId: profile.id,
            email,
            name,
            accessToken,
            refreshToken,
            meta: {
              displayName: profile.displayName,
              photo: profile.photos?.[0]?.value,
              locale: profile._json?.locale,
            },
          });

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );
}

/**
 * Configure GitHub OAuth Strategy
 * Only if credentials are provided
 */
if (config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: config.GITHUB_CLIENT_ID,
        clientSecret: config.GITHUB_CLIENT_SECRET,
        callbackURL: config.GITHUB_CALLBACK_URL,
        scope: ['user:email'], // Request email scope
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Extract user information from GitHub profile
          // Note: GitHub email might be private, so we might need to fetch it separately
          const email = profile.emails?.[0]?.value || profile.username + '@users.noreply.github.com';
          const name = profile.displayName || profile.username;

          // Find or create user
          const { user } = await findOrCreateOAuthUser({
            provider: 'github',
            providerUserId: profile.id,
            email,
            name,
            accessToken,
            refreshToken: refreshToken || null, // GitHub doesn't always provide refresh tokens
            meta: {
              username: profile.username,
              displayName: profile.displayName,
              photo: profile.photos?.[0]?.value,
              profileUrl: profile.profileUrl,
            },
          });

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );
}

/**
 * Helper function to handle OAuth success
 * Issues JWT cookies and redirects to frontend or returns JSON
 */
async function handleOAuthSuccess(user, req, res) {
  try {
    // Create JWT tokens
    const accessToken = await createAccessToken(user.id, user.email);
    const refreshToken = await createRefreshToken(user.id);

    // Store refresh token hash in database
    const refreshTokenHash = hashToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    await storeRefreshToken(user.id, refreshTokenHash, expiresAt);

    // Set cookies
    setAuthCookies(res, accessToken, refreshToken);

    req.logger.info({ userId: user.id, email: user.email }, 'OAuth authentication successful');

    // Redirect to frontend with success
    // In production, change this to your frontend URL
    const frontendUrl = process.env.FRONTEND_URL || config.APP_URL;
    res.redirect(`${frontendUrl}/auth/callback?success=true`);
  } catch (error) {
    req.logger.error({ error }, 'Error in OAuth success handler');
    res.redirect(`${config.APP_URL}/auth/callback?error=oauth_failed`);
  }
}

/**
 * GET /api/auth/oauth/google
 * 
 * Initiates Google OAuth flow
 * Redirects user to Google authorization page
 */
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false, // We're using stateless JWT auth
  })
);

/**
 * GET /api/auth/oauth/google/callback
 * 
 * Google OAuth callback handler
 * Receives authorization code from Google and exchanges for user info
 */
router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${config.APP_URL}/auth/callback?error=google_failed`,
  }),
  asyncHandler(async (req, res) => {
    // req.user is set by Passport after successful authentication
    const user = req.user;
    await handleOAuthSuccess(user, req, res);
  })
);

/**
 * GET /api/auth/oauth/github
 * 
 * Initiates GitHub OAuth flow
 * Redirects user to GitHub authorization page
 */
router.get(
  '/github',
  passport.authenticate('github', {
    scope: ['user:email'],
    session: false,
  })
);

/**
 * GET /api/auth/oauth/github/callback
 * 
 * GitHub OAuth callback handler
 * Receives authorization code from GitHub and exchanges for user info
 */
router.get(
  '/github/callback',
  passport.authenticate('github', {
    session: false,
    failureRedirect: `${config.APP_URL}/auth/callback?error=github_failed`,
  }),
  asyncHandler(async (req, res) => {
    const user = req.user;
    await handleOAuthSuccess(user, req, res);
  })
);

export default router;

