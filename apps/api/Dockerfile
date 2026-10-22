# ==============================================================================
# Production Dockerfile for MoneyLens API
# Multi-stage build for minimal image size and non-root execution
# ==============================================================================

FROM node:20-alpine AS builder

WORKDIR /app

# Copy root and workspace manifests
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/

# Install all dependencies for build
RUN npm ci

# Copy configuration and source files
COPY tsconfig*.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Build shared library and API service
RUN npm run build --workspace=@moneylens/shared && \
    npm run build --workspace=@moneylens/api

# ------------------------------------------------------------------------------
# Production Runner
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy manifests and install production-only dependencies
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/api/package*.json ./apps/api/

RUN npm ci --omit=dev

# Copy compiled artifacts from builder stage
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Security: Run as non-root user
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4000/api/v1/health || exit 1

CMD ["node", "apps/api/dist/server.js"]
