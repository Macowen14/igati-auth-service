# Multi-stage Dockerfile for auth service
# Stage 1: Dependencies
FROM node:18-alpine AS deps

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (production only)
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Install Prisma CLI globally for better compatibility
RUN npm install -g prisma@6.19.0

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including dev for Prisma generation)
RUN npm ci && npm cache clean --force

# Copy Prisma schema
COPY prisma ./prisma

# Generate Prisma client
# Note: DATABASE_URL is not required for generation, but can be set if needed
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate || \
    npx prisma generate

# Stage 3: Production
FROM node:18-alpine AS runner

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Copy dependencies from deps stage
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy Prisma client from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/prisma ./node_modules/prisma

# Copy application code
COPY --chown=nodejs:nodejs package.json ./
COPY --chown=nodejs:nodejs package-lock.json* ./
COPY --chown=nodejs:nodejs prisma ./prisma
COPY --chown=nodejs:nodejs src ./src

# Create logs directory with proper permissions
RUN mkdir -p logs && chown nodejs:nodejs logs && chmod 755 logs

# Switch to non-root user
USER nodejs

# Expose port (default 4000, can be overridden via PORT env var)
EXPOSE 4000

# Set default environment variables (can be overridden)
ENV NODE_ENV=production \
    PORT=4000 \
    LOG_LEVEL=info

# Health check (uses default port 4000, override via PORT env var if needed)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const port = process.env.PORT || 4000; require('http').get('http://localhost:' + port + '/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)}).on('error', () => process.exit(1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Default command (can be overridden in docker-compose or docker run)
CMD ["node", "src/index.js"]

