/**
 * PM2 Ecosystem Configuration Example
 * 
 * Copy this file to ecosystem.config.js and customize for your deployment.
 * 
 * Usage: pm2 start ecosystem.config.js
 */

module.exports = {
  apps: [
    {
      name: 'auth-api',
      script: 'src/index.js',
      instances: 'max', // Use all CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '500M',
      // Graceful shutdown
      kill_timeout: 10000,
      wait_ready: true,
      listen_timeout: 10000,
    },
    {
      name: 'auth-worker',
      script: 'src/workers/emailWorker.js',
      instances: 2, // Scale workers based on email volume
      exec_mode: 'fork', // Workers don't benefit from cluster mode
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/pm2-worker-error.log',
      out_file: './logs/pm2-worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '500M',
      // Auto restart on crash
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};

