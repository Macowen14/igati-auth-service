/**
 * Logger Module
 * 
 * Configures Pino logger with:
 * - JSON structured logs to logs/app.log (info+)
 * - Debug logs to logs/debug.log
 * - Pretty console output in development
 * 
 * Uses request ID correlation for tracing requests across services.
 */

import pino from 'pino';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logsDir = join(__dirname, '../../logs');

/**
 * Ensure logs directory exists
 * Called on module load to create directory if missing
 */
async function ensureLogsDir() {
  try {
    await mkdir(logsDir, { recursive: true });
  } catch (error) {
    // Ignore if directory already exists
    if (error.code !== 'EEXIST') {
      console.error('Failed to create logs directory:', error);
      throw error;
    }
  }
}

// Create logs directory synchronously on import
await ensureLogsDir();

/**
 * File streams for logging
 * - app.log: info level and above (JSON format)
 * - debug.log: debug level (JSON format)
 */
const appLogStream = pino.destination({
  dest: join(logsDir, 'app.log'),
  sync: false, // async writes for better performance
});

const debugLogStream = pino.destination({
  dest: join(logsDir, 'debug.log'),
  sync: false,
});

/**
 * Multi-stream logger configuration
 * - info+ logs go to app.log
 * - debug logs go to debug.log
 * - console output in development (pretty format)
 */
const streams = [
  { level: 'info', stream: appLogStream },
  { level: 'debug', stream: debugLogStream },
];

// Add pretty console output in development
if (config.NODE_ENV === 'development') {
  const pretty = (await import('pino-pretty')).default;
  streams.push({
    level: config.LOG_LEVEL,
    stream: pretty({
      colorize: true,
      translateTime: 'HH:MM:ss.l',
      ignore: 'pid,hostname',
    }),
  });
}

/**
 * Root logger instance
 * Configured with appropriate level and streams
 */
const logger = pino(
  {
    level: config.LOG_LEVEL,
    base: {
      env: config.NODE_ENV,
      pid: process.pid,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
  },
  pino.multistream(streams)
);

/**
 * Create a child logger with request ID for request correlation
 * @param {string} reqId - Unique request identifier
 * @returns {pino.Logger} Child logger instance
 */
export function createRequestLogger(reqId) {
  return logger.child({ reqId });
}

/**
 * Gracefully flush all log streams
 * Call this during shutdown to ensure all logs are written
 */
export async function flushLogs() {
  return Promise.all([
    appLogStream.flushSync(),
    debugLogStream.flushSync(),
  ]);
}

export default logger;

