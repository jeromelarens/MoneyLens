# MoneyLens — Local Development Setup

This guide details prerequisites, environment setup, database configuration, and workspace workflows for local development across the MoneyLens monorepo.

---

## 1. Prerequisites

Ensure your development environment meets the following software requirements:

- **Node.js**: `v20.0.0` or higher (verified on Node `v24.x`)
- **npm**: `v10.0.0` or higher (verified on npm `v11.x`)
- **MongoDB**: Community Server `v6.0` or higher running locally (port `27017`) or a accessible remote MongoDB URI
- **Git**: (Version control; GitHub remote initialization is deferred per Phase 1 execution rules)

---

## 2. Monorepo Installation

Clone or open the workspace root and install all dependencies:

```bash
# From the repository root
npm install
```

This installs dependencies across the root and all workspaces (`apps/api`, `apps/web`, `packages/shared`) and links the local workspace package `@moneylens/shared`.

---

## 3. Environment Configuration

The monorepo uses `.env.example` as a template for local development variables.

Copy the template to initialize `.env` files:

```bash
# Create root environment file
cp .env.example .env

# Optionally copy to specific app directories if running apps independently
cp .env.example apps/api/.env
cp .env.example apps/web/.env
```

### Environment Variables Reference

| Variable       | Target | Description                                                                   | Default / Example                         |
| :------------- | :----- | :---------------------------------------------------------------------------- | :---------------------------------------- |
| `NODE_ENV`     | API    | Application execution mode (`development`, `production`, `test`)              | `development`                             |
| `PORT`         | API    | HTTP port for the Express API                                                 | `4000`                                    |
| `MONGODB_URI`  | API    | MongoDB connection string                                                     | `mongodb://127.0.0.1:27017/moneylens_dev` |
| `FRONTEND_URL` | API    | Allowed frontend origin for CORS                                              | `http://localhost:5173`                   |
| `LOG_LEVEL`    | API    | Pino log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`) | `info`                                    |
| `VITE_API_URL` | Web    | Base URL for backend API calls                                                | `http://localhost:4000/api/v1`            |

> [!IMPORTANT]
> Never commit actual credentials, database passwords, or secret tokens to source control. `.gitignore` is configured to prevent committing `.env` files.

---

## 4. Local MongoDB Setup

MoneyLens uses MongoDB with Mongoose for persistent data storage.

### Option A: Local MongoDB Service (Recommended for Windows)

Ensure MongoDB is installed and running as a Windows Service or via command prompt:

```powershell
# Verify MongoDB service status in PowerShell
Get-Service -Name MongoDB

# Or start mongod manually
mongod --dbpath="C:\data\db"
```

### Option B: Docker Container

If Docker is available on your machine, you can launch MongoDB in a container:

```bash
docker run -d --name moneylens-mongo -p 27017:27017 -v moneylens_data:/data/db mongo:7.0
```

---

## 5. Workspace Commands

Execute all common tasks from the repository root:

### Development

```bash
# Run both API and Web concurrently
npm run dev

# Run API only (tsx watch mode on http://localhost:4000)
npm run dev:api

# Run Web only (Vite dev server on http://localhost:5173)
npm run dev:web
```

### Code Quality & Formatting

```bash
# TypeScript strict type checking across all workspaces
npm run typecheck

# Lint with ESLint (v9 flat config)
npm run lint

# Check formatting with Prettier
npm run format:check

# Auto-format all code
npm run format
```

### Automated Testing

```bash
# Run unit & integration tests across all workspaces
npm run test
```

### Production Build

```bash
# Build shared contracts, API, and frontend bundle
npm run build
```

---

## 6. Troubleshooting

### Issue: `MONGODB_URI is required` on API boot

- **Cause**: The `.env` file was not created or `MONGODB_URI` is unset.
- **Fix**: Copy `.env.example` to `.env` in the root and ensure `MONGODB_URI` is populated.

### Issue: API starts with `MongoDB initial connection failed`

- **Cause**: The MongoDB service is stopped or unreachable on the configured port.
- **Behavior**: The API starts in degraded readiness mode. `/api/v1/health` will return `200 OK` (process alive), while `/api/v1/ready` will return `503 Service Unavailable` with `database: down`.
- **Fix**: Start your local MongoDB server and verify connection with `mongosh mongodb://127.0.0.1:27017`.

### Issue: CORS error in browser console

- **Cause**: The frontend origin does not match `FRONTEND_URL` in the API configuration.
- **Fix**: Check `FRONTEND_URL` in `.env` (default is `http://localhost:5173`).

---

## 7. Financial Statement Ingestion & Testing Guide (Phase 2 & Phase 2.1)

### 7.1 Organization Authentication & Security

All financial endpoints require organization authentication:

- **Header Name**: `x-api-key: <key>` or `Authorization: Bearer <key>`
- **API Key Hashing**: Incoming keys are hashed with SHA-256 (`apiKeyHash`) and matched against the tenant organization record.
- **Development Key**: `ml_dev_org_test_key_phase2` (auto-seeded for development and test environments).
- **Production Guard**: The development key is strictly rejected when `NODE_ENV === 'production'`. A real, securely generated API key is required.
- **Default Account**: Primary checking account (`dev-primary-checking`) created on first seed.
- **Frontend Key Injection**: The React client includes `VITE_API_KEY` (or the fallback dev key in development) but does NOT bundle the dev key in production builds.

### 7.2 Ingestion Limits & Precision Rules

| Parameter                | Limit / Specification                                                                                | Enforcement                                                           |
| :----------------------- | :--------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------- |
| **Max File Size**        | 15 MB (`15,728,640` bytes)                                                                           | Multer bounded upload buffer + client validation (`FILE_TOO_LARGE`)   |
| **Max Rows**             | 10,000 rows                                                                                          | Parsers abort with `MAX_ROW_COUNT_EXCEEDED`                           |
| **Supported Formats**    | CSV (`text/csv`), XLSX (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`)         | Content-type check and parser validation                              |
| **Supported Currencies** | USD, EUR, GBP, CAD, AUD, INR, JPY (0 dec), CHF, NZD, SGD, HKD, KWD (3 dec), BHD (3 dec), OMR (3 dec) | Exact decimal minor-unit parsing (`CURRENCY_CONFIG`)                  |
| **Number Precision**     | Exact string-based decimal parsing to integer minor units                                            | Binary float arithmetic (`parseFloat * 100`) strictly banned          |
| **Fractional Digits**    | Must not exceed currency precision (e.g. 2 for USD/INR, 0 for JPY, 3 for KWD)                        | Rejects excess fractions with `INVALID_ROW_DATA` (no silent rounding) |
| **Formula Injection**    | Escapes `=`, `@`, `+`, `\t`, `\r` with single quote `'`                                              | Context-aware: preserves valid descriptions like `- Monthly Fee`      |

### 7.3 Supported CSV & XLSX Formats

MoneyLens supports single-amount statements (using signs or Type columns), split Debit/Credit statements, and international currencies:

#### Format A: Single Amount Column (Standard CSV / INR / Multi-Currency)

```csv
Date,Description,Amount,Currency,Reference
2026-03-01,Office Depot Supplies,-124.50,USD,TXN-90812
2026-03-02,Client Retainer Payment,₹1,23,456.78,INR,INV-00452
2026-03-03,Tokyo Cloud Node,-15000,JPY,AWS-TYO-01
2026-03-04,Kuwait Branch Consulting,450.125,KWD,KWD-891
```

#### Format B: Debit / Credit Columns (Banking CSV/XLSX)

```csv
Date,Description,Debit,Credit,Currency
03/01/2026,Stripe Payout,,1450.00,USD
03/02/2026,Payroll Direct Debit,2800.50,,USD
03/03/2026,SaaS Subscription,49.99,,USD
```

#### Format C: Debit / Credit with Type Indicator

```csv
Date,Description,Amount,Type
2026-03-01,Supplier Payment,500.00,DEBIT
2026-03-02,Customer Refund,120.00,CREDIT
```

### 7.4 Financial Ingestion API Endpoints

| Method | Endpoint                           | Description                                               |
| :----- | :--------------------------------- | :-------------------------------------------------------- |
| `POST` | `/api/v1/imports`                  | Upload CSV or XLSX statement with optional column mapping |
| `GET`  | `/api/v1/imports`                  | List recent import jobs for authenticated tenant          |
| `GET`  | `/api/v1/imports/:importId`        | Retrieve import job status and summary statistics         |
| `GET`  | `/api/v1/imports/:importId/errors` | Inspect row-level validation errors for an import         |
| `GET`  | `/api/v1/transactions`             | Query normalized ledger transactions (paginated)          |
| `GET`  | `/api/v1/accounts`                 | List financial accounts for tenant                        |

---

## 8. Financial Reconciliation Engine Guide (Phase 3)

### 8.1 Reconciliation API Endpoints

| Method | Endpoint                                          | Description                                                          |
| :----- | :------------------------------------------------ | :------------------------------------------------------------------- |
| `POST` | `/api/v1/reconciliation/runs`                     | Trigger a scoped reconciliation run with date tolerance              |
| `GET`  | `/api/v1/reconciliation/runs`                     | List paginated reconciliation runs for organization                  |
| `GET`  | `/api/v1/reconciliation/runs/:runId`              | Get reconciliation run details and counters                          |
| `GET`  | `/api/v1/reconciliation/runs/:runId/audit-trail`  | Get chronological audit events for a reconciliation run              |
| `GET`  | `/api/v1/reconciliation/matches`                  | List candidate matches with populated transactions and review reason |
| `GET`  | `/api/v1/reconciliation/matches/:matchId`         | Get detailed match record and evidence                               |
| `POST` | `/api/v1/reconciliation/matches/:matchId/confirm` | Confirm a suggested or needs_review match                            |
| `POST` | `/api/v1/reconciliation/matches/:matchId/reject`  | Reject a match with an auditable reason                              |

### 8.2 Integrity & Concurrency Protections (Phase 3.1)

- **Double-Confirmation & Reciprocal Protection**: Backed by a MongoDB multikey partial unique index (`org_participating_tx_confirmed_unique`), confirming $A \leftrightarrow B$ strictly prohibits reciprocal $B \leftrightarrow A$ and conflicting $A \leftrightarrow C$ or $B \leftrightarrow D$ confirmations.
- **Atomic Two-Phase Locking**: Confirmation conditionally locks transactions (`reconciliationStatus: { $ne: 'reconciled' }`) and executes automatic compensation rollbacks if a concurrent race or candidate collision occurs, returning `409 Conflict`.
- **Run Counter Preservation**: Manual confirmation of a suggested match does not double-increment `matchedCount`. The invariant `totalSourceTransactions = matchedCount + reviewCount + unmatchedCount` is preserved across all state transitions.

### 8.3 Example Reconciliation Request

```bash
curl -X POST http://localhost:4000/api/v1/reconciliation/runs \
  -H "Content-Type: application/json" \
  -H "x-api-key: ml_dev_org_test_key_phase2" \
  -d '{
    "dateToleranceDays": 3,
    "rulesVersion": "v1.0.0"
  }'
```

### 8.4 Example Confirm & Reject Actions

```bash
# Confirm Match (returns 409 Conflict if transaction is already reconciled)
curl -X POST http://localhost:4000/api/v1/reconciliation/matches/<MATCH_ID>/confirm \
  -H "Content-Type: application/json" \
  -H "x-api-key: ml_dev_org_test_key_phase2" \
  -d '{"notes": "Verified inter-account transfer"}'

# Reject Match (mandatory reason required)
curl -X POST http://localhost:4000/api/v1/reconciliation/matches/<MATCH_ID>/reject \
  -H "Content-Type: application/json" \
  -H "x-api-key: ml_dev_org_test_key_phase2" \
  -d '{"reason": "Unrelated transactions with coincidental amounts"}'
```

---

## 9. Financial Findings & Explainable Intelligence Guide (Phase 4)

### 9.1 Financial Findings API Endpoints

| Method | Endpoint                                  | Description                                                                            |
| :----- | :---------------------------------------- | :------------------------------------------------------------------------------------- |
| `POST` | `/api/v1/findings/detection-runs`         | Trigger a deterministic leakage detection run across active ledger data                |
| `GET`  | `/api/v1/findings/detection-runs/:runId`  | Inspect detection run status, evaluated transactions, and rule counts                  |
| `GET`  | `/api/v1/findings/summary`                | Retrieve currency-segregated financial exposure metrics and finding counts             |
| `GET`  | `/api/v1/findings`                        | List paginated findings with filters (`findingType`, `status`, `severity`, `currency`) |
| `GET`  | `/api/v1/findings/:findingId`             | Inspect finding details, structured evidence, linked transactions, and review history  |
| `POST` | `/api/v1/findings/:findingId/review`      | Submit human decision (`open_review`, `confirm_issue`, `dismiss`, `resolve`)           |
| `POST` | `/api/v1/findings/:findingId/explanation` | Request explainable intelligence analysis (deterministic or Gemini)                    |
| `GET`  | `/api/v1/findings/:findingId/history`     | Retrieve append-only audit trail of lifecycle changes for a finding                    |

### 9.2 Example Findings Requests

```bash
# 1. Trigger Leakage Detection Run
curl -X POST http://localhost:4000/api/v1/findings/detection-runs \
  -H "Content-Type: application/json" \
  -H "x-api-key: ml_dev_org_test_key_phase2" \
  -d '{
    "observationScope": {
      "startDate": "2026-01-01",
      "endDate": "2026-03-31",
      "currencies": ["USD", "EUR"]
    }
  }'

# 2. Retrieve Financial Exposure Summary
curl -X GET http://localhost:4000/api/v1/findings/summary \
  -H "x-api-key: ml_dev_org_test_key_phase2"

# 3. List Open High-Severity Findings
curl -X GET "http://localhost:4000/api/v1/findings?status=open&severity=high&limit=10" \
  -H "x-api-key: ml_dev_org_test_key_phase2"

# 4. Review a Finding (Confirm as Issue)
curl -X POST http://localhost:4000/api/v1/findings/<FINDING_ID>/review \
  -H "Content-Type: application/json" \
  -H "x-api-key: ml_dev_org_test_key_phase2" \
  -d '{
    "action": "confirm_issue",
    "notes": "Verified dual billing on invoice INV-7711 with supplier"
  }'

# 5. Dismiss a Finding (Mandatory Reason Required)
curl -X POST http://localhost:4000/api/v1/findings/<FINDING_ID>/review \
  -H "Content-Type: application/json" \
  -H "x-api-key: ml_dev_org_test_key_phase2" \
  -d '{
    "action": "dismiss",
    "reason": "Legitimate expedited freight surcharge approved by management"
  }'

# 6. Request Explainable Intelligence Analysis
curl -X POST http://localhost:4000/api/v1/findings/<FINDING_ID>/explanation \
  -H "Content-Type: application/json" \
  -H "x-api-key: ml_dev_org_test_key_phase2" \
  -d '{"forceFresh": false}'
```

### 9.3 Environment Variables for Future Live AI Providers

In Phase 4, the explainable intelligence layer operates provider-neutrally with a built-in deterministic rule explainer. When live Gemini cloud integration is activated in future phases, the following environment variables will be provisioned:

| Variable            | Description                                                                | Validation Rule                   | Provisioning Requirements                                  |
| :------------------ | :------------------------------------------------------------------------- | :-------------------------------- | :--------------------------------------------------------- |
| `GEMINI_API_KEY`    | Google Gemini API secret credential                                        | Non-empty secret string           | Provision via cloud secret manager; never commit to `.env` |
| `GEMINI_MODEL`      | Target Gemini model endpoint                                               | e.g. `gemini-1.5-flash`           | Validated against supported Gemini API models              |
| `GEMINI_TIMEOUT_MS` | Max latency for AI response before falling back to deterministic explainer | Positive integer, default `10000` | Prevent blocking HTTP workers on provider network stalls   |

---

## 10. Cash Flow Forecasting & Scenario Planning API Testing (Phase 5)

Phase 5 adds deterministic cash flow forecasting and scenario planning endpoints under `/api/v1/cash-flow`. All endpoints require organization authentication via `x-api-key` or `Authorization: Bearer <token>`.

### 10.1 Forecast Run & Summary Endpoints

```bash
# 1. Trigger a Deterministic Cash Flow Forecast Run
curl -X POST http://localhost:4000/api/v1/cash-flow/forecasts \
  -H "Content-Type: application/json" \
  -H "x-api-key: ml_dev_org_test_key_phase2" \
  -d '{
    "horizon": "30d",
    "currencies": ["USD"],
    "openingBalances": [
      {
        "currency": "USD",
        "amountMinor": 2500000,
        "effectiveDate": "2026-03-20"
      }
    ],
    "historyWindowDays": 90
  }'

# 2. Retrieve Specific Forecast Run and Daily Projections
curl -X GET http://localhost:4000/api/v1/cash-flow/forecasts/<FORECAST_RUN_ID> \
  -H "x-api-key: ml_dev_org_test_key_phase2"

# 3. List Past Forecast Runs (Paginated)
curl -X GET "http://localhost:4000/api/v1/cash-flow/forecasts?page=1&limit=10" \
  -H "x-api-key: ml_dev_org_test_key_phase2"

# 4. Retrieve Executive Cash Flow Summary (Segregated by Currency)
curl -X GET http://localhost:4000/api/v1/cash-flow/summary \
  -H "x-api-key: ml_dev_org_test_key_phase2"
```

### 10.2 Scenario Planning & Simulation Endpoints

```bash
# 5. Simulate Ad-Hoc What-If Scenario (In-Memory, No Entity Created)
curl -X POST http://localhost:4000/api/v1/cash-flow/simulate \
  -H "Content-Type: application/json" \
  -H "x-api-key: ml_dev_org_test_key_phase2" \
  -d '{
    "currency": "USD",
    "horizon": "30d",
    "assumptions": {
      "revenueChangePercent": -15,
      "expenseChangePercent": 10,
      "recurringAdjustments": [],
      "oneTimeEvents": [
        {
          "id": "event-tax-1",
          "name": "Quarterly Tax Payment",
          "date": "2026-04-10",
          "amountMinor": 350000,
          "direction": "outflow"
        }
      ]
    },
    "openingBalanceMinor": 2500000
  }'

# 6. Create Saved Scenario
curl -X POST http://localhost:4000/api/v1/cash-flow/scenarios \
  -H "Content-Type: application/json" \
  -H "x-api-key: ml_dev_org_test_key_phase2" \
  -d '{
    "name": "Conservative Recession Scenario",
    "currency": "USD",
    "horizon": "60d",
    "assumptions": {
      "revenueChangePercent": -25,
      "expenseChangePercent": 5,
      "recurringAdjustments": [],
      "oneTimeEvents": []
    }
  }'

# 7. Retrieve Saved Scenario with Calculated Baseline Comparison
curl -X GET http://localhost:4000/api/v1/cash-flow/scenarios/<SCENARIO_ID> \
  -H "x-api-key: ml_dev_org_test_key_phase2"

# 8. List Saved Scenarios
curl -X GET "http://localhost:4000/api/v1/cash-flow/scenarios?page=1&limit=20" \
  -H "x-api-key: ml_dev_org_test_key_phase2"

# 9. Delete Saved Scenario
curl -X DELETE http://localhost:4000/api/v1/cash-flow/scenarios/<SCENARIO_ID> \
  -H "x-api-key: ml_dev_org_test_key_phase2"
```

---

## 11. Business Action Center & Decision Intelligence Testing (Phase 6)

Phase 6 implements a unified Business Action Center under `/api/v1/actions`. It translates active financial leakage findings (Phase 4), cash flow projections (Phase 5), and data gaps into actionable, prioritized, evidence-backed steps for small retail business owners.

### 11.1 Action Center API Endpoints

| Method | Endpoint                               | Description                                                                               |
| :----- | :------------------------------------- | :---------------------------------------------------------------------------------------- |
| `POST` | `/api/v1/actions/evaluate`             | Runs deterministic recommendation engine; generates/updates candidate actions             |
| `GET`  | `/api/v1/actions/summary`              | Returns counts by status, priority, and currency-segregated exposure                      |
| `GET`  | `/api/v1/actions`                      | Returns paginated actions with filters (`status`, `priority`, `category`, `search`, etc.) |
| `GET`  | `/api/v1/actions/:actionId`            | Returns detailed action with structured evidence, next steps, and audit history           |
| `POST` | `/api/v1/actions/:actionId/transition` | Validates and applies lifecycle transition (`start`, `complete`, `dismiss`, `snooze`)     |
| `GET`  | `/api/v1/actions/:actionId/history`    | Retrieves append-only chronological audit trail for the action                            |

### 11.2 Example Action Center Requests

```bash
# 1. Trigger Deterministic Action Evaluation
curl -X POST http://localhost:4000/api/v1/actions/evaluate \
  -H "Content-Type: application/json" \
  -H "x-api-key: ml_dev_org_test_key_phase2" \
  -d '{}'

# 2. Retrieve Executive Action Dashboard Summary
curl -X GET http://localhost:4000/api/v1/actions/summary \
  -H "x-api-key: ml_dev_org_test_key_phase2"

# 3. List Filtered Actions (Open, High/Critical Priority)
curl -X GET "http://localhost:4000/api/v1/actions?status=open&priority=high&page=1&limit=10" \
  -H "x-api-key: ml_dev_org_test_key_phase2"

# 4. Inspect Action Details & Evidence
curl -X GET http://localhost:4000/api/v1/actions/<ACTION_ID> \
  -H "x-api-key: ml_dev_org_test_key_phase2"

# 5. Start Action (Transition from open to in_progress)
curl -X POST http://localhost:4000/api/v1/actions/<ACTION_ID>/transition \
  -H "Content-Type: application/json" \
  -H "x-api-key: ml_dev_org_test_key_phase2" \
  -d '{
    "action": "start",
    "notes": "Initiated dispute with merchant regarding duplicate billing"
  }'

# 6. Complete Action (Requires in_progress or open)
curl -X POST http://localhost:4000/api/v1/actions/<ACTION_ID>/transition \
  -H "Content-Type: application/json" \
  -H "x-api-key: ml_dev_org_test_key_phase2" \
  -d '{
    "action": "complete",
    "notes": "Vendor credited duplicate charge on subsequent statement"
  }'

# 7. Dismiss Action (Mandatory Non-Empty Reason Required)
curl -X POST http://localhost:4000/api/v1/actions/<ACTION_ID>/transition \
  -H "Content-Type: application/json" \
  -H "x-api-key: ml_dev_org_test_key_phase2" \
  -d '{
    "action": "dismiss",
    "reason": "Legitimate dual charges for two distinct software licenses"
  }'

# 8. Snooze Action (Requires valid future ISO-8601 date)
curl -X POST http://localhost:4000/api/v1/actions/<ACTION_ID>/transition \
  -H "Content-Type: application/json" \
  -H "x-api-key: ml_dev_org_test_key_phase2" \
  -d '{
    "action": "snooze",
    "snoozeUntil": "2026-04-01T00:00:00.000Z",
    "notes": "Waiting for month-end reconciliation before reviewing"
  }'

# 9. Retrieve Audit Trail History
curl -X GET http://localhost:4000/api/v1/actions/<ACTION_ID>/history \
  -H "x-api-key: ml_dev_org_test_key_phase2"
```

### 11.3 Database Indexes & Concurrency Controls

- **Compound Unique Action Constraint**:
  `{ organizationId: 1, fingerprint: 1 }` with `unique: true`. Guarantees that concurrent evaluations or race conditions cannot insert duplicate actions for the exact same normalized evidence.
- **Query Indexes**:
  `{ organizationId: 1, status: 1, priority: 1, score: -1 }`
  `{ organizationId: 1, actionType: 1 }`
  `{ organizationId: 1, snoozeUntil: 1 }`
- **Append-Only Audit Trail**:
  `ActionHistoryModel` tracks every lifecycle transition with `{ organizationId: 1, actionId: 1, createdAt: -1 }`.

---

## 12. Phase 7: Verification & Cross-Phase Testing Guide

### 12.1 Executing the Full Audit Verification Suite

Execute the following commands from the root directory to validate monorepo integrity, security, and reliability:

```bash
# 1. Monorepo Unit, API & Cross-Phase Integration Test Suite (217 tests)
npm run test

# 2. Strict TypeScript Typecheck Across All Workspaces (0 errors)
npm run typecheck

# 3. Static Code Analysis & Linting (0 warnings)
npm run lint

# 4. Code Formatting Validation
npm run format:check

# 5. Production Build Validation Across Shared, API, and Web
npm run build
```

### 12.2 Cross-Phase Integration Scenarios Tested

The end-to-end integration test suite (`apps/api/test/cross-phase.integration.test.ts` and `apps/web/src/test/cross-phase-navigation.test.tsx`) validates the following 10 mission-critical workflows:

1. **Scenario 1 (E2E Ingestion to Action)**: Ingests statements via multipart CSV, triggers leakage detection (`potential_duplicate_payment`), confirms the finding via review API, and verifies recommendation action generation (`RULE_ACT_DUP_001`).
2. **Scenario 2 (Ledger Invariance)**: Generates cash flow forecasts and simulates a -30% revenue stress scenario, asserting that the underlying ledger transactions, amounts, and reconciliation statuses remain strictly invariant.
3. **Scenario 3 (Reconciliation Match Locking)**: Proposes reciprocal matches, confirms a match to lock participating transactions (`reconciled`), and verifies that rerun reconciliation produces 0 duplicate matches.
4. **Scenario 4 (Reconciliation Inconsistency Action)**: Detects an orphaned transaction marked reconciled without a match, verifies detection of `reconciliation_inconsistency`, and confirms action generation under `data_integrity`.
5. **Scenario 5 (Dismissal Lifecycle Preservation)**: Dismisses a detected leakage finding with a non-empty reason, reruns detection, and verifies that re-evaluation preserves dismissal and does not generate an active action.
6. **Scenario 6 (Recurring Cost Finding & Forecasting)**: Projects a recurring subscription finding into cash flow forecasts, updates it to a cost increase, and verifies the projection reflects the updated cost without double-counting.
7. **Scenario 7 (Concurrent Evaluation Deduplication)**: Fires 5 concurrent action evaluation requests for an organization and confirms that compound unique index `{ organizationId, fingerprint }` deduplicates safely without HTTP 500 errors.
8. **Scenario 8 (Multi-Tenant Isolation)**: Queries and attempts to mutate primary organization imports, findings, actions, and audit trails using secondary organization credentials, asserting strict HTTP 404 responses.
9. **Scenario 9 (Atomic Lifecycle Validation)**: Attempts invalid action transitions (empty dismissal reason, past snooze date), confirming HTTP 400 errors, zero partial audit records, and pristine action state preservation.
10. **Scenario 10 (Frontend Resilience & Empty States)**: Navigates across all 6 dashboard sections, asserting understandable empty states when zero records exist and clear error states on API network failure.
