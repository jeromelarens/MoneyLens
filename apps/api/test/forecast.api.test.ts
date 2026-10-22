import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/infrastructure/database/mongo.js';
import {
  TransactionModel,
  FinancialFindingModel,
  ForecastRunModel,
  CashFlowForecastModel,
  CashFlowScenarioModel,
} from '../src/infrastructure/database/models/index.js';
import {
  DEV_DEFAULT_API_KEY,
  DEV_DEFAULT_ORG_ID,
  getOrCreateDevOrganization,
  createOrganizationForTesting,
} from '../src/middleware/auth.js';
import { ERROR_CODES } from '@moneylens/shared';

describe('Cash Flow Forecasting & Scenario Planning API Suite', () => {
  const app = createApp({ enableLogging: false });
  let primaryOrgId: string = DEV_DEFAULT_ORG_ID;
  let secondaryOrgId: string;
  let _secondaryApiKey: string;

  beforeAll(async () => {
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/moneylens_test');
    await ForecastRunModel.syncIndexes();
    await CashFlowForecastModel.syncIndexes();
    await CashFlowScenarioModel.syncIndexes();
    await TransactionModel.syncIndexes();

    const devOrg = await getOrCreateDevOrganization();
    primaryOrgId = devOrg.id;

    const secondary = await createOrganizationForTesting('Secondary Retail Store', 'USD');
    secondaryOrgId = secondary.organization.id;
    _secondaryApiKey = secondary.apiKey;
  });

  afterAll(async () => {
    await ForecastRunModel.deleteMany({ organizationId: { $in: [primaryOrgId, secondaryOrgId] } });
    await CashFlowForecastModel.deleteMany({
      organizationId: { $in: [primaryOrgId, secondaryOrgId] },
    });
    await CashFlowScenarioModel.deleteMany({
      organizationId: { $in: [primaryOrgId, secondaryOrgId] },
    });
    await TransactionModel.deleteMany({ organizationId: { $in: [primaryOrgId, secondaryOrgId] } });
    await FinancialFindingModel.deleteMany({
      organizationId: { $in: [primaryOrgId, secondaryOrgId] },
    });
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await ForecastRunModel.deleteMany({ organizationId: { $in: [primaryOrgId, secondaryOrgId] } });
    await CashFlowForecastModel.deleteMany({
      organizationId: { $in: [primaryOrgId, secondaryOrgId] },
    });
    await CashFlowScenarioModel.deleteMany({
      organizationId: { $in: [primaryOrgId, secondaryOrgId] },
    });
    await TransactionModel.deleteMany({ organizationId: { $in: [primaryOrgId, secondaryOrgId] } });
    await FinancialFindingModel.deleteMany({
      organizationId: { $in: [primaryOrgId, secondaryOrgId] },
    });
  });

  // 1. Authentication & Security
  describe('Authentication & Tenant Isolation', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/cash-flow/summary');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe(ERROR_CODES.AUTHENTICATION_REQUIRED);
    });

    it('rejects cross-tenant forecast run retrieval with 404', async () => {
      // Seed a run belonging to secondary organization
      const secRun = await ForecastRunModel.create({
        organizationId: secondaryOrgId,
        status: 'completed',
        horizonDays: 30,
        methodology: 'deterministic_moving_average_v1',
        methodologyVersion: '1.0.0',
        historyWindowDays: 90,
        transactionsEvaluated: 10,
        currencies: ['USD'],
        warnings: [],
        errorMessages: [],
        startedAt: new Date(),
        completedAt: new Date(),
      });

      // Primary org attempts to view secondary org's forecast run
      const res = await request(app)
        .get(`/api/v1/cash-flow/forecasts/${secRun._id}`)
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe(ERROR_CODES.FORECAST_RUN_NOT_FOUND);
    });

    it('rejects cross-tenant scenario retrieval or deletion with 404', async () => {
      const secScenario = await CashFlowScenarioModel.create({
        organizationId: secondaryOrgId,
        name: 'Secondary Secret Scenario',
        currency: 'USD',
        horizonDays: 30,
        assumptions: {
          revenueChangePercent: -10,
          expenseChangePercent: 5,
          recurringAdjustments: [],
          oneTimeEvents: [],
        },
      });

      // Primary org attempts to read scenario
      const getRes = await request(app)
        .get(`/api/v1/cash-flow/scenarios/${secScenario._id}`)
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(getRes.status).toBe(404);
      expect(getRes.body.error.code).toBe(ERROR_CODES.SCENARIO_NOT_FOUND);

      // Primary org attempts to delete scenario
      const delRes = await request(app)
        .delete(`/api/v1/cash-flow/scenarios/${secScenario._id}`)
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(delRes.status).toBe(404);
      expect(delRes.body.error.code).toBe(ERROR_CODES.SCENARIO_NOT_FOUND);
    });
  });

  // 2. Forecast Run Execution
  describe('Forecast Run Execution & Retrieval', () => {
    it('creates a forecast run and computes currency projections', async () => {
      // Seed historical transactions for primary org
      const now = new Date();
      for (let i = 1; i <= 30; i++) {
        await TransactionModel.create({
          organizationId: primaryOrgId,
          accountId: 'acc-1',
          importJobId: 'job-1',
          date: new Date(now.getTime() - i * 86400000),
          description: `Daily Sales Payout #${i}`,
          direction: 'credit',
          amountMinor: 15000, // $150.00/day
          amountDecimal: '150.00',
          currency: 'USD',
          fingerprint: `fp-tx-sales-${i}`,
        });
        await TransactionModel.create({
          organizationId: primaryOrgId,
          accountId: 'acc-1',
          importJobId: 'job-1',
          date: new Date(now.getTime() - i * 86400000),
          description: `Inventory Supplier #${i}`,
          direction: 'debit',
          amountMinor: 6000, // $60.00/day
          amountDecimal: '60.00',
          currency: 'USD',
          fingerprint: `fp-tx-supp-${i}`,
        });
      }

      const res = await request(app)
        .post('/api/v1/cash-flow/forecasts')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({
          horizon: '30d',
          currencies: ['USD'],
          openingBalances: [
            {
              currency: 'USD',
              amountMinor: 500000, // $5,000.00 opening balance
              effectiveDate: '2026-03-15',
            },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.run).toBeDefined();
      expect(res.body.data.run.status).toBe('completed');
      expect(res.body.data.run.horizonDays).toBe(30);
      expect(res.body.data.run.transactionsEvaluated).toBe(60);

      expect(res.body.data.forecasts).toHaveLength(1);
      const fc = res.body.data.forecasts[0];
      expect(fc.currency).toBe('USD');
      expect(fc.horizonDays).toBe(30);
      expect(fc.hasReliableOpeningBalance).toBe(true);
      expect(fc.openingBalanceMinor).toBe(500000);
      expect(fc.projectedInflowsMinor).toBe(450000); // 30 * $150.00 = $4,500.00
      expect(fc.projectedOutflowsMinor).toBe(180000); // 30 * $60.00 = $1,800.00
      expect(fc.expectedNetMovementMinor).toBe(270000); // +$2,700.00
      expect(fc.projectedClosingBalanceMinor).toBe(770000); // $5,000 + $2,700 = $7,700.00
      expect(fc.riskLevel).toBe('low_risk');
      expect(fc.points).toHaveLength(30);
    });

    it('rejects invalid horizons with 400 validation error', async () => {
      const res = await request(app)
        .post('/api/v1/cash-flow/forecasts')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({
          horizon: '365d', // invalid
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    });

    it('lists paginated forecast runs', async () => {
      await ForecastRunModel.create({
        organizationId: primaryOrgId,
        status: 'completed',
        horizonDays: 30,
        methodology: 'deterministic_moving_average_v1',
        methodologyVersion: '1.0.0',
        historyWindowDays: 90,
        transactionsEvaluated: 10,
        currencies: ['USD'],
        warnings: [],
        errorMessages: [],
        startedAt: new Date(),
        completedAt: new Date(),
      });

      const res = await request(app)
        .get('/api/v1/cash-flow/forecasts?page=1&limit=10')
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination.totalItems).toBe(1);
    });

    it('returns currency-segregated executive summary', async () => {
      const run = await ForecastRunModel.create({
        organizationId: primaryOrgId,
        status: 'completed',
        horizonDays: 30,
        methodology: 'deterministic_moving_average_v1',
        methodologyVersion: '1.0.0',
        historyWindowDays: 90,
        transactionsEvaluated: 10,
        currencies: ['USD'],
        warnings: [],
        errorMessages: [],
        startedAt: new Date(),
        completedAt: new Date(),
      });

      await CashFlowForecastModel.create({
        organizationId: primaryOrgId,
        forecastRunId: run._id,
        currency: 'USD',
        horizonDays: 30,
        startDate: '2026-03-16',
        endDate: '2026-04-15',
        hasReliableOpeningBalance: false,
        openingBalanceMinor: null,
        projectedInflowsMinor: 200000,
        projectedOutflowsMinor: 150000,
        expectedNetMovementMinor: 50000,
        projectedClosingBalanceMinor: null,
        riskLevel: 'low_risk',
        riskReason: 'Positive net movement',
        dataQuality: 'adequate',
        historicalDailyAvgInflowMinor: 6667,
        historicalDailyAvgOutflowMinor: 5000,
        recurringOutflowsCount: 0,
        recurringOutflowsTotalMinor: 0,
        points: [],
        assumptions: [],
        limitations: [],
      });

      const res = await request(app)
        .get('/api/v1/cash-flow/summary')
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.data.byCurrency.USD).toBeDefined();
      expect(res.body.data.byCurrency.USD.expectedNetMovementMinor).toBe(50000);
      expect(res.body.data.byCurrency.USD.hasReliableOpeningBalance).toBe(false);
    });
  });

  // 3. Scenario Planning & Stress Testing
  describe('Scenario Planning & Simulation', () => {
    it('creates, retrieves, updates, and deletes a hypothetical scenario', async () => {
      // 1. Create scenario
      const createRes = await request(app)
        .post('/api/v1/cash-flow/scenarios')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({
          name: 'Conservative Downside Scenario',
          currency: 'USD',
          horizon: '30d',
          assumptions: {
            revenueChangePercent: -15,
            expenseChangePercent: 10,
            recurringAdjustments: [],
            oneTimeEvents: [],
          },
        });

      expect(createRes.status).toBe(201);
      const scenarioId = createRes.body.data.id;
      expect(createRes.body.data.name).toBe('Conservative Downside Scenario');

      // 2. Get scenario with live simulation
      const getRes = await request(app)
        .get(`/api/v1/cash-flow/scenarios/${scenarioId}`)
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.scenario.id).toBe(scenarioId);
      expect(getRes.body.data.simulation).toBeDefined();
      expect(getRes.body.data.simulation.adjustmentsApplied).toBeDefined();

      // 3. Update scenario
      const updateRes = await request(app)
        .patch(`/api/v1/cash-flow/scenarios/${scenarioId}`)
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({
          name: 'Updated Downside Scenario',
          assumptions: {
            revenueChangePercent: -25,
            expenseChangePercent: 15,
            recurringAdjustments: [],
            oneTimeEvents: [],
          },
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.name).toBe('Updated Downside Scenario');
      expect(updateRes.body.data.assumptions.revenueChangePercent).toBe(-25);

      // 4. Delete scenario
      const deleteRes = await request(app)
        .delete(`/api/v1/cash-flow/scenarios/${scenarioId}`)
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(deleteRes.status).toBe(200);

      // Verify deletion
      const checkRes = await request(app)
        .get(`/api/v1/cash-flow/scenarios/${scenarioId}`)
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(checkRes.status).toBe(404);
    });

    it('simulates ad-hoc scenario without persisting an entity', async () => {
      const res = await request(app)
        .post('/api/v1/cash-flow/scenarios/simulate')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({
          currency: 'USD',
          horizon: '30d',
          assumptions: {
            revenueChangePercent: -10,
            expenseChangePercent: 5,
            recurringAdjustments: [],
            oneTimeEvents: [
              {
                id: 'ev-tax',
                name: 'Quarterly Corporate Tax',
                date: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0],
                amountMinor: 250000,
                direction: 'outflow',
              },
            ],
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.baselineSummary).toBeDefined();
      expect(res.body.data.scenarioSummary).toBeDefined();
      expect(res.body.data.points).toBeDefined();
      expect(res.body.data.adjustmentsApplied).toHaveLength(3);
    });
  });
});
