# MoneyLens

> **AI-Powered Financial Intelligence and Money Leakage Detection Platform**

MoneyLens is engineered for small business owners, retail operators, finance managers, and accountants. It provides the technological foundation to import financial records, track financial performance, uncover potential payment discrepancies, investigate unusual expenses, and make evidence-based decisions with complete transparency.

---

## 1. Project Phase

**Current Phase**: Phase 2 — Financial Domain Modeling & Data Ingestion Foundation.

This phase implements the domain models and ingestion pipeline for importing financial records (CSV and XLSX statements), enforcing exact integer minor-unit arithmetic, row-level error tracking, multi-tenant isolation, two-tier duplicate prevention, and a frontend statement ingestion and ledger interface.

---

## 2. Monorepo Architecture

The workspace is organized as an npm monorepo with clean boundaries:

```
moneylens/
├── apps/
│   ├── api/            # Express REST API with TypeScript, Mongoose, Multer & Parsers
│   └── web/            # React + Vite + Tailwind CSS frontend application
├── packages/
│   └── shared/         # Reusable Zod contracts, financial schemas, and error codes
├── docs/               # System architecture and setup documentation
├── .env.example        # Validated environment configuration template
└── package.json        # Unified root workspace manager
```

---

## 3. Technology Stack

### Frontend (`apps/web`)

- **Framework**: React 18 with TypeScript in strict mode
- **Bundler**: Vite
- **Styling**: Tailwind CSS with custom design tokens
- **Routing**: React Router
- **Data Fetching**: TanStack Query (React Query)
- **Validation**: Zod
- **Components**: File upload dropzone, import statistics banner, error inspector drawer, and paginated ledger table
- **Testing**: Vitest + React Testing Library + jsdom

### Backend (`apps/api`)

- **Runtime**: Node.js v20+ with TypeScript in strict mode
- **Server**: Express
- **Database**: MongoDB via Mongoose (with UUID string primary keys and compound indexes)
- **File Ingestion**: Multer bounded memory storage, `csv-parse` streaming, `exceljs` formula-safe workbook parser
- **Validation**: Zod
- **Observability**: Pino structured JSON logging & Pino-HTTP
- **Security**: Tenant auth verification (`requireOrganizationAuth`), Helmet, CORS, Express Rate Limit, Formula injection sanitization
- **Testing**: Vitest + Supertest

### Shared Package (`packages/shared`)

- Canonical response contracts (`HealthResponse`, `ReadinessResponse`, `ApiErrorResponse`, `paginatedResponseSchema`)
- Financial domain schemas (`Transaction`, `ImportJob`, `ImportRowError`, `FinancialAccount`, `ColumnMapping`, `SupportedCurrency`)
- Financial limits (`MAX_FILE_SIZE_BYTES = 15MB`, `MAX_ROW_COUNT = 10,000`)
- Common constants and error codes

---

## 4. Prerequisites

- **Node.js**: `v20.0.0` or higher (verified on Node `v24.x`)
- **npm**: `v10.0.0` or higher (verified on npm `v11.x`)
- **MongoDB**: Local MongoDB instance (`mongodb://127.0.0.1:27017`) or accessible cluster

---

## 5. Quickstart & Installation

```bash
# 1. Clone repository and navigate to root
cd moneylens

# 2. Install monorepo dependencies
npm install

# 3. Initialize local environment file
cp .env.example .env
```

Review `.env` to verify your local `MONGODB_URI` and ports.

---

## 6. Development Commands

Execute all common development commands directly from the monorepo root:

| Command                | Action                                                            |
| :--------------------- | :---------------------------------------------------------------- |
| `npm run dev`          | Launch both API and Web concurrently in development mode          |
| `npm run dev:api`      | Launch API server with hot-reloading (`tsx watch`) on port `4000` |
| `npm run dev:web`      | Launch Vite frontend development server on port `5173`            |
| `npm run build`        | Build all packages (`shared` -> `api` -> `web`) for production    |
| `npm run test`         | Run automated test suites across all workspaces                   |
| `npm run typecheck`    | Perform TypeScript strict typechecking across all workspaces      |
| `npm run lint`         | Execute ESLint v9 checks with zero-warning threshold              |
| `npm run format`       | Automatically format all codebase files with Prettier             |
| `npm run format:check` | Verify code formatting compliance                                 |

---

## 7. Operational & Financial Endpoints

### Operational Probes

- **`GET /api/v1/health`**: Process liveness probe. Returns HTTP `200` with uptime, version, and environment.
- **`GET /api/v1/ready`**: Infrastructure readiness probe. Returns HTTP `200` when MongoDB is connected, or HTTP `503` if database connectivity is unavailable.

### Financial Endpoints (Organization Authenticated)

- **`POST /api/v1/imports`**: Upload CSV or XLSX statement with bounded streaming/parsing, sanitization, and deduplication.
- **`GET /api/v1/imports`**: List recent import jobs for authenticated tenant.
- **`GET /api/v1/imports/:importId`**: Retrieve status and summary of an import job.
- **`GET /api/v1/imports/:importId/errors`**: Retrieve row-level validation errors for an import.
- **`GET /api/v1/transactions`**: Query normalized ledger transactions with pagination, date range, direction, and search filters.
- **`GET /api/v1/accounts`**: List active financial accounts.

---

## 8. Documentation

- [Local Development Setup Guide](file:///docs/development-setup.md): Environment configuration, database setup, and statement ingestion fixtures.
- [System Architecture Specification](file:///docs/architecture.md): Deep-dive into domain models, minor-unit financial precision, deduplication, and security controls.

---


