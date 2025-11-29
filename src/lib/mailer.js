/**
 * Mailer Module (Resend Wrapper)
 * 
 * Wrapper around Resend SDK for sending emails.
 * Provides a simple interface for sending verification emails.
 * 
 * Note: This module is used by the email worker, not directly in API routes.
 */

import { Resend } from 'resend';
import config from './config.js';
import logger from './logger.js';

/**
 * Resend client instance
 * Initialized with API key from environment variables.
 */
const resend = new Resend(config.RESEND_API_KEY);

/**
 * Send email verification email
 * 
 * @param {object} params - Email parameters
 * @param {string} params.to - Recipient email address
 * @param {string} params.token - Verification token (plain, not hashed)
 * @param {string} params.name - User name (optional)
 * @returns {Promise<{id: string, error?: Error}>} Resend response with message ID
 */
export async function sendVerificationEmail({ to, token, name }) {
  const verificationUrl = `${config.APP_URL}/api/auth/verify?token=${token}`;

  // Email template
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #4a90e2;">Verify Your Email Address</h1>
        <p>Hi${name ? ` ${name}` : ''},</p>
        <p>Thank you for signing up! Please verify your email address by clicking the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" 
             style="background-color: #4a90e2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
        <p style="margin-top: 30px; font-size: 12px; color: #999;">
          This link will expire in ${config.EMAIL_TOKEN_EXPIRY_HOURS} hours.
        </p>
        <p style="margin-top: 30px; font-size: 12px; color: #999;">
          If you didn't create an account, you can safely ignore this email.
        </p>
      </body>
    </html>
  `;

  const text = `
    Verify Your Email Address

    Hi${name ? ` ${name}` : ''},

    Thank you for signing up! Please verify your email address by visiting:
    ${verificationUrl}

    This link will expire in ${config.EMAIL_TOKEN_EXPIRY_HOURS} hours.

    If you didn't create an account, you can safely ignore this email.
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: config.RESEND_FROM_EMAIL,
      to,
      subject: 'Verify Your Email Address',
      html,
      text,
    });

    if (error) {
      logger.error({ error, to }, 'Failed to send verification email');
      throw error;
    }

    logger.info({ messageId: data?.id, to }, 'Verification email sent successfully');
    return { id: data?.id };
  } catch (error) {
    logger.error({ error, to }, 'Error sending verification email');
    throw error;
  }
}

/**
 * Send password reset email (optional, for future use)
 * 
 * @param {object} params - Email parameters
 * @param {string} params.to - Recipient email address
 * @param {string} params.token - Reset token
 * @param {string} params.name - User name (optional)
 * @returns {Promise<{id: string}>} Resend response with message ID
 */
export async function sendPasswordResetEmail({ to, token, name }) {
  const resetUrl = `${config.APP_URL}/api/auth/reset-password?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h1>Reset Your Password</h1>
        <p>Hi${name ? ` ${name}` : ''},</p>
        <p>You requested to reset your password. Click the button below to reset it:</p>
        <a href="${resetUrl}" style="background-color: #4a90e2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Reset Password
        </a>
        <p>Or copy and paste this link: ${resetUrl}</p>
        <p style="font-size: 12px; color: #999;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </body>
    </html>
  `;

  try {
    const { data, error } = await resend.emails.send({
      from: config.RESEND_FROM_EMAIL,
      to,
      subject: 'Reset Your Password',
      html,
    });

    if (error) {
      logger.error({ error, to }, 'Failed to send password reset email');
      throw error;
    }

    logger.info({ messageId: data?.id, to }, 'Password reset email sent');
    return { id: data?.id };
  } catch (error) {
    logger.error({ error, to }, 'Error sending password reset email');
    throw error;
  }
}

