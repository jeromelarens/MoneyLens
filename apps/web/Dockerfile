# ==============================================================================
# Production Dockerfile for MoneyLens Web Frontend
# Multi-stage build producing static distribution served by Nginx Alpine
# ==============================================================================

FROM node:20-alpine AS builder

WORKDIR /app

# Build arguments for frontend build-time public variables
ARG VITE_API_URL=http://localhost:4000/api/v1
ENV VITE_API_URL=$VITE_API_URL

# Copy root and workspace manifests
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/

# Install dependencies
RUN npm ci

# Copy configuration and source files
COPY tsconfig*.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

# Build shared types and frontend production bundle
RUN npm run build --workspace=@moneylens/shared && \
    npm run build --workspace=@moneylens/web

# ------------------------------------------------------------------------------
# Production Nginx Runtime
# ------------------------------------------------------------------------------
FROM nginx:1.25-alpine AS runner

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy custom Nginx configuration
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder stage
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:80/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
