# MoneyLens — Production Operations & Deployment Guide

## 1. Architectural Overview & Topology

MoneyLens is architected as a modular, stateless fintech intelligence platform comprising three primary operational components:

```
                      ┌────────────────────────────────────────┐
                      │        HTTPS / TLS 1.3 Ingress         │
                      │  (Cloudflare / AWS ALB / Nginx Proxy)  │
                      └───────────────────┬────────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
     ┌─────────────────────────┐                     ┌─────────────────────────┐
     │   Static Web SPA Tier   │                     │  REST API Service Tier  │
     │      (Nginx / CDN)      │                     │     (Node.js 20 LTS)    │
     │      Port: 80 / 443     │                     │        Port: 4000       │
     └─────────────────────────┘                     └────────────┬────────────┘
                                                                  │
                                                TLS Connection Pool (ACID Sessions)
                                                                  │
                                                                  ▼
                                                     ┌─────────────────────────┐
                                                     │  MongoDB 7.0+ Replica   │
                                                     │           Set           │
                                                     │ (Atlas / Managed 3-Node)│
                                                     └─────────────────────────┘
```

### Component Roles

1. **Client Tier (`apps/web`)**:
   - High-performance Single Page Application (SPA) compiled via Vite into static assets (`HTML`, `JS`, `CSS`).
   - Served by Nginx or distributed via CDN (Cloudflare, AWS CloudFront, GCP Cloud Storage).
   - Interacts strictly with the REST API using credentialed JSON requests.
2. **API Tier (`apps/api`)**:
   - Stateless Express service built on Node.js 20 LTS.
   - Handles tenant-isolated ledger persistence, file ingestion, deterministic reconciliation, financial leakage heuristics, scenario forecasting, and action management.
   - Horizontally scalable across multiple container instances behind a round-robin load balancer.
3. **Database Tier (MongoDB 7.0+)**:
   - **Mandatory Replica Set**: Production environments **must** run a MongoDB Replica Set (e.g. MongoDB Atlas M10+ or 3-node self-hosted replica set).
   - **Reason**: Multi-document ACID transactions (`session.withTransaction()`) are utilized during financial file imports, transaction fingerprint deduplication, and reconciliation state transitions to ensure zero partial writes. Standalone MongoDB instances do not support ACID transactions across multiple collections.

---

## 2. Environment Configuration Matrix

The following environment variables govern MoneyLens across development, staging, and production runtimes:

| Variable Name             | Workspace  | Classification  | Required in Prod | Accepted Values / Format                                                 | Safe Dev Default               | Production Behavior & Security Requirements                                                                                   |
| :------------------------ | :--------- | :-------------- | :--------------- | :----------------------------------------------------------------------- | :----------------------------- | :---------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                | `apps/api` | Public Config   | **Yes**          | `production` \| `development` \| `test`                                  | `development`                  | In `production`, strictly disables developer authentication bypasses, enforces helmet CSP, and disables Mongoose `autoIndex`. |
| `PORT`                    | `apps/api` | Public Config   | Optional         | Integer (`1024` - `65535`)                                               | `4000`                         | Port for the Express HTTP server listener. Default `4000`.                                                                    |
| `MONGODB_URI`             | `apps/api` | **SECRET**      | **Yes**          | `mongodb://` or `mongodb+srv://`                                         | Local dev URI                  | Connection string to MongoDB Replica Set. Must include TLS and replica set name. **Never commit to Git**.                     |
| `FRONTEND_URL`            | `apps/api` | Public Config   | **Yes**          | Single URL or comma-separated URLs                                       | `http://localhost:5173`        | Allowed CORS origins for credentialed browser access. In `production`, wildcard `*` is strictly forbidden.                    |
| `CORS_ORIGIN`             | `apps/api` | Public Config   | Optional         | Single URL or comma-separated URLs                                       | Same as `FRONTEND_URL`         | Explicit alias for `FRONTEND_URL`.                                                                                            |
| `LOG_LEVEL`               | `apps/api` | Public Config   | Optional         | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` \| `silent` | `info`                         | Structured Pino log level. Production recommended: `info` or `warn`.                                                          |
| `RATE_LIMIT_WINDOW_MS`    | `apps/api` | Public Config   | Optional         | Positive Integer (ms)                                                    | `900000` (15 min)              | Time window for client IP rate limiting.                                                                                      |
| `RATE_LIMIT_MAX_REQUESTS` | `apps/api` | Public Config   | Optional         | Positive Integer                                                         | `100`                          | Maximum requests per IP per window before returning HTTP 429.                                                                 |
| `GEMINI_API_KEY`          | `apps/api` | **SECRET**      | Optional         | Google AI Studio Key string                                              | _(Empty)_                      | If omitted, the system seamlessly uses the deterministic financial explainer with 100% availability.                          |
| `VITE_API_URL`            | `apps/web` | Public (Client) | **Yes**          | Valid HTTP/HTTPS URL                                                     | `http://localhost:4000/api/v1` | Public backend API endpoint baked into frontend JavaScript at build time.                                                     |
| `VITE_API_KEY`            | `apps/web` | Public (Client) | Optional         | String                                                                   | _(Empty in prod)_              | Local testing override. In production builds, leave unset or empty.                                                           |

---

## 3. Database Preparation & Index Synchronization

### Why Mongoose `autoIndex` is Disabled in Production

In development mode (`NODE_ENV=development`), Mongoose automatically builds indexes on startup. However, in production:

- Running `autoIndex: true` on application startup blocks process initialization, increases boot latency, and causes replica set lock contention.
- Conflicting existing data can cause fatal unhandled index build exceptions.

### Safe Non-Destructive Index Procedure

MoneyLens provides a pre-flight index synchronization utility that runs a read-only aggregation to detect duplicate data before attempting index creation:

```bash
# From repository root
npm run db:index

# Or within apps/api
cd apps/api
npm run db:index
```

The script performs:

1. Read-only conflict check across unique compound keys (`organizationId + fingerprint`, `organizationId + fileHash`, `organizationId + accountId + fingerprint`, etc.).
2. Aborts safely with descriptive error logs if duplicate conflicts exist.
3. Builds and optimizes all compound, partial, and unique indexes non-destructively if checks pass.

---

## 4. Containerized Production Deployment

### Docker Multi-Stage Architecture

MoneyLens includes two production Dockerfiles:

- `apps/api/Dockerfile`: Multi-stage build producing a lean Node 20 Alpine container running as non-root user `node`.
- `apps/web/Dockerfile`: Multi-stage build compiling static Vite assets and serving them via Nginx Alpine with gzip and security headers.

### Production Docker Compose

For containerized environments (e.g. single-node VPS or Docker Swarm), use `docker-compose.yml`:

```bash
# 1. Prepare environment variables
cp .env.example .env
# Edit .env with your real MONGODB_URI and FRONTEND_URL

# 2. Build and launch services in detached mode
docker compose up -d --build

# 3. Verify container status and health
docker compose ps

# 4. View service logs
docker compose logs -f api
```

---

## 5. Bare-Metal & Process Manager Deployment (PM2 / systemd)

If deploying to bare-metal servers or Linux virtual machines (Ubuntu / Debian):

### 1. Build Production Bundles

```bash
# Install dependencies
npm ci

# Run all verification checks
npm run typecheck
npm run lint
npm run test

# Compile production builds
npm run build
```

### 2. Configure PM2 for API

Create `ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [
    {
      name: 'moneylens-api',
      script: './apps/api/dist/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
        LOG_LEVEL: 'info',
      },
    },
  ],
};
```

Launch with PM2:

```bash
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup
```

### 3. Configure Nginx Reverse Proxy & Static Host

Place the following configuration in `/etc/nginx/sites-available/moneylens`:

```nginx
# Upstream API cluster
upstream api_backend {
    server 127.0.0.1:4000;
    keepalive 32;
}

server {
    listen 80;
    server_name app.moneylens.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.moneylens.com;

    ssl_certificate /etc/letsencrypt/live/app.moneylens.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.moneylens.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    root /var/www/moneylens/apps/web/dist;
    index index.html;

    # Static frontend routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API reverse proxy
    location /api/ {
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }
}
```

---

## 6. Health & Readiness Probes

MoneyLens implements dual diagnostic endpoints compliant with Kubernetes, AWS ALB, and Docker healthcheck standards:

### Process Liveness: `GET /api/v1/health`

- **Purpose**: Verifies that the Express event loop is active and accepting connections.
- **Success Code**: HTTP `200 OK`
- **Payload**:
  ```json
  {
    "status": "ok",
    "timestamp": "2026-10-21T21:00:00.000Z",
    "uptime": 1245.32,
    "version": "0.1.0",
    "environment": "production"
  }
  ```
- **Security**: Contains zero connection strings, passwords, or host infrastructure details.

### Infrastructure Readiness: `GET /api/v1/ready`

- **Purpose**: Verifies downstream connectivity to required infrastructure (MongoDB).
- **Success Code**: HTTP `200 OK` (when MongoDB `readyState === 1`)
- **Degraded Code**: HTTP `503 Service Unavailable` (when MongoDB is disconnected)
- **Payload (Healthy)**:
  ```json
  {
    "status": "ready",
    "timestamp": "2026-10-21T21:00:00.000Z",
    "services": {
      "database": {
        "status": "up"
      }
    }
  }
  ```

---

## 7. Backup, Disaster Recovery & Multi-Document Transactions

1. **Point-In-Time Recovery (PITR)**:
   - Because MoneyLens uses multi-document transactions for import deduplication and ledger updates, production databases should enable Continuous Cloud Backups (PITR) with oplog retention.
2. **Consistent Logical Backups**:
   - When taking logical backups with `mongodump`, always include the `--oplog` flag to ensure ACID consistency across related collections:
     ```bash
     mongodump --uri="mongodb+srv://<db_user>:<db_password>@<cluster_host>/moneylens" --oplog --gzip --out=/backups/$(date +%F)
     ```
3. **Graceful Shutdown**:
   - The API server handles `SIGTERM` and `SIGINT` signals by pausing connection acceptance, completing active HTTP requests, and cleanly disconnecting Mongoose pools before exit.

---

## 8. Pre-Deployment Release Verification Checklist

- [ ] All unit and integration tests passing (`npm run test`).
- [ ] TypeScript compilation passing with 0 errors (`npm run typecheck`).
- [ ] Static analysis passing with 0 warnings (`npm run lint`).
- [ ] Code formatting verified with Prettier (`npm run format:check`).
- [ ] Production build succeeds (`npm run build`).
- [ ] Production security tests passing (`npx vitest run test/production-security.test.ts`).
- [ ] MongoDB Replica Set is provisioned with TLS enabled.
- [ ] Indexes prepared using `npm run db:index`.
- [ ] Environment variables configured via secrets manager (no real secrets committed).
- [ ] Frontend built with production `VITE_API_URL` matching the API domain.
- [ ] HTTPS / TLS termination configured with valid certificates.
