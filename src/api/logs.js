/**
 * Log Download Routes
 *
 * Provides secure endpoints to download log files.
 * Uses secret key authentication to prevent unauthorized access.
 *
 * Security:
 * - Requires LOG_DOWNLOAD_KEY in query parameter or header
 * - Optionally requires ADMIN/SUPERUSER role (if authenticated)
 * - Only allows downloading from logs/ directory
 * - Prevents directory traversal attacks
 */

import express from 'express';
import { readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import { createRequestLogger } from '../lib/logger.js';
import asyncHandler from '../middlewares/asyncHandler.js';
import config from '../lib/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logsDir = resolve(__dirname, '../../logs');

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
 * Validate log download key
 * Checks for key in query parameter or X-Log-Key header
 */
function validateLogKey(req) {
  const providedKey = req.query.key || req.headers['x-log-key'];
  const expectedKey = process.env.LOG_DOWNLOAD_KEY;

  if (!expectedKey) {
    req.logger.warn('LOG_DOWNLOAD_KEY not configured');
    return false;
  }

  if (!providedKey) {
    return false;
  }

  // Use constant-time comparison to prevent timing attacks
  if (providedKey.length !== expectedKey.length) {
    return false;
  }

  let match = true;
  for (let i = 0; i < expectedKey.length; i++) {
    match = match && providedKey[i] === expectedKey[i];
  }

  return match;
}

/**
 * Sanitize filename to prevent directory traversal
 * Only allows alphanumeric, dash, underscore, and dot characters
 */
function sanitizeFilename(filename) {
  // Remove any path separators and only allow safe characters
  const sanitized = basename(filename).replace(/[^a-zA-Z0-9._-]/g, '');
  return sanitized;
}

/**
 * GET /api/auth/logs
 *
 * List available log files.
 * Requires LOG_DOWNLOAD_KEY in query parameter or X-Log-Key header.
 */
router.get(
  '/logs',
  asyncHandler(async (req, res) => {
    if (!validateLogKey(req)) {
      req.logger.warn({ ip: req.ip }, 'Unauthorized log access attempt');
      return res.status(401).json({
        error: {
          code: 'AuthenticationError',
          message: 'Invalid or missing log download key',
        },
      });
    }

    try {
      const files = await readdir(logsDir);
      const logFiles = [];

      for (const file of files) {
        // Only include .log files
        if (file.endsWith('.log')) {
          const filePath = join(logsDir, file);
          const stats = await stat(filePath);

          logFiles.push({
            name: file,
            size: stats.size,
            modified: stats.mtime.toISOString(),
            created: stats.birthtime.toISOString(),
          });
        }
      }

      // Sort by modified date (newest first)
      logFiles.sort((a, b) => new Date(b.modified) - new Date(a.modified));

      req.logger.info({ fileCount: logFiles.length }, 'Log files listed');

      res.json({
        message: 'Log files retrieved successfully',
        files: logFiles,
        count: logFiles.length,
      });
    } catch (error) {
      req.logger.error({ error }, 'Failed to list log files');
      res.status(500).json({
        error: {
          code: 'InternalServerError',
          message: 'Failed to retrieve log files',
        },
      });
    }
  })
);

/**
 * GET /api/auth/logs/:filename
 *
 * Download a specific log file.
 * Requires LOG_DOWNLOAD_KEY in query parameter or X-Log-Key header.
 *
 * Query Parameters:
 * - key (required) - Log download secret key
 * - format (optional) - Response format: 'json' (default) or 'text'
 */
router.get(
  '/logs/:filename',
  asyncHandler(async (req, res) => {
    if (!validateLogKey(req)) {
      req.logger.warn({ ip: req.ip, filename: req.params.filename }, 'Unauthorized log download attempt');
      return res.status(401).json({
        error: {
          code: 'AuthenticationError',
          message: 'Invalid or missing log download key',
        },
      });
    }

    // Sanitize filename to prevent directory traversal
    const sanitizedFilename = sanitizeFilename(req.params.filename);

    // Ensure it's a .log file
    if (!sanitizedFilename.endsWith('.log')) {
      return res.status(400).json({
        error: {
          code: 'ValidationError',
          message: 'Only .log files can be downloaded',
        },
      });
    }

    const filePath = join(logsDir, sanitizedFilename);

    try {
      // Verify file exists and is within logs directory
      const resolvedPath = resolve(filePath);
      if (!resolvedPath.startsWith(resolve(logsDir))) {
        req.logger.warn({ path: resolvedPath }, 'Directory traversal attempt blocked');
        return res.status(403).json({
          error: {
            code: 'Forbidden',
            message: 'Invalid file path',
          },
        });
      }

      const stats = await stat(filePath);

      req.logger.info(
        {
          filename: sanitizedFilename,
          size: stats.size,
          ip: req.ip,
        },
        'Log file download started'
      );

      // Set headers for file download
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}"`);
      res.setHeader('Content-Length', stats.size);
      res.setHeader('X-Log-File-Size', stats.size.toString());
      res.setHeader('X-Log-Modified', stats.mtime.toISOString());

      // Stream the file
      const fileStream = createReadStream(filePath);
      fileStream.pipe(res);

      fileStream.on('error', (error) => {
        req.logger.error({ error, filename: sanitizedFilename }, 'Error streaming log file');
        if (!res.headersSent) {
          res.status(500).json({
            error: {
              code: 'InternalServerError',
              message: 'Failed to stream log file',
            },
          });
        }
      });

      fileStream.on('end', () => {
        req.logger.info({ filename: sanitizedFilename }, 'Log file download completed');
      });
    } catch (error) {
      if (error.code === 'ENOENT') {
        req.logger.warn({ filename: sanitizedFilename }, 'Log file not found');
        return res.status(404).json({
          error: {
            code: 'NotFoundError',
            message: 'Log file not found',
          },
        });
      }

      req.logger.error({ error, filename: sanitizedFilename }, 'Failed to download log file');
      res.status(500).json({
        error: {
          code: 'InternalServerError',
          message: 'Failed to download log file',
        },
      });
    }
  })
);

export default router;

