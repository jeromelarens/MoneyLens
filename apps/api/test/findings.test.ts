import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/infrastructure/database/mongo.js';
import {
  TransactionModel,
  OrganizationModel,
  FinancialFindingModel,
  FindingHistoryModel,
  DetectionRunModel,
} from '../src/infrastructure/database/models/index.js';
import {
  DEV_DEFAULT_API_KEY,
  DEV_DEFAULT_ORG_ID,
  getOrCreateDevOrganization,
  createOrganizationForTesting,
} from '../src/middleware/auth.js';
import { ERROR_CODES } from '@moneylens/shared';

describe('Financial Leakage Findings API & Persistence Suite', () => {
  const app = createApp({ enableLogging: false });
  let primaryOrgId: string = DEV_DEFAULT_ORG_ID;
  let secondaryOrgId: string;
  let secondaryApiKey: string;

  beforeAll(async () => {
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/moneylens_test');
    await FinancialFindingModel.syncIndexes();
    await DetectionRunModel.syncIndexes();
    await FindingHistoryModel.syncIndexes();
    await TransactionModel.syncIndexes();

    const devOrg = await getOrCreateDevOrganization();
    primaryOrgId = devOrg.id;

    // Setup secondary organization for tenant isolation testing
    const created2 = await createOrganizationForTesting('Secondary Retail LLC', 'USD');
    secondaryOrgId = created2.organization.id;
    secondaryApiKey = created2.apiKey;
  });

  afterAll(async () => {
    await Promise.all([
      TransactionModel.deleteMany({}),
      FinancialFindingModel.deleteMany({}),
      FindingHistoryModel.deleteMany({}),
      DetectionRunModel.deleteMany({}),
      OrganizationModel.deleteMany({ _id: { $in: [primaryOrgId, secondaryOrgId] } }),
    ]);
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await Promise.all([
      TransactionModel.deleteMany({}),
      FinancialFindingModel.deleteMany({}),
      FindingHistoryModel.deleteMany({}),
      DetectionRunModel.deleteMany({}),
    ]);
  });

  describe('Authentication & Tenant Isolation', () => {
    it('rejects unauthenticated requests to findings endpoints with 401', async () => {
      const runRes = await request(app).post('/api/v1/findings/detection-runs').send({});
      expect(runRes.status).toBe(401);
      expect(runRes.body.error.code).toBe(ERROR_CODES.AUTHENTICATION_REQUIRED);

      const listRes = await request(app).get('/api/v1/findings');
      expect(listRes.status).toBe(401);

      const sumRes = await request(app).get('/api/v1/findings/summary');
      expect(sumRes.status).toBe(401);
    });

    it('rejects invalid API keys with 401', async () => {
      const res = await request(app)
        .get('/api/v1/findings')
        .set('x-api-key', 'ml_test_invalid_key_xyz');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe(ERROR_CODES.AUTHENTICATION_REQUIRED);
    });

    it('strictly isolates findings and returns 404 when querying another tenant finding', async () => {
      // Create finding belonging to secondary org
      const otherFinding = await FinancialFindingModel.create({
        _id: 'finding-secondary-1',
        organizationId: secondaryOrgId,
        findingType: 'unusual_expense',
        status: 'open',
        severity: 'high',
        title: 'Secret Expense Anomaly',
        summary: 'Other tenant confidential data',
        primaryTransactionIds: ['tx-sec-1'],
        evidence: {
          ruleId: 'RULE_UNUSUAL_001',
          ruleVersion: 'v1.0.0',
          reason: 'Test reason',
          primaryTransactionIds: ['tx-sec-1'],
        },
        estimatedAmountMinor: 10000,
        currency: 'USD',
        ruleId: 'RULE_UNUSUAL_001',
        ruleVersion: 'v1.0.0',
        detectedAt: new Date(),
        lastEvaluatedAt: new Date(),
        fingerprint: 'fp-secret-1',
      });

      // Primary org requests finding-secondary-1
      const res = await request(app)
        .get(`/api/v1/findings/${otherFinding._id}`)
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe(ERROR_CODES.FINDING_NOT_FOUND);

      // Secondary org requests finding-secondary-1
      const resSec = await request(app)
        .get(`/api/v1/findings/${otherFinding._id}`)
        .set('x-api-key', secondaryApiKey);

      expect(resSec.status).toBe(200);
      expect(resSec.body.finding.id).toBe(otherFinding._id);
    });
  });

  describe('Detection Run Execution & Idempotent Deduplication', () => {
    it('executes a detection run, identifies duplicates, and avoids duplicate creation on second run', async () => {
      // Seed 2 duplicate debit transactions in primary organization
      await TransactionModel.create([
        {
          _id: 'tx-dup-1',
          organizationId: primaryOrgId,
          accountId: 'acc-1',
          importJobId: 'job-1',
          date: new Date('2026-03-10T10:00:00.000Z'),
          description: 'CLOUD DATABASE STORAGE HOSTING',
          direction: 'debit',
          amountMinor: 8900,
          amountDecimal: '89.00',
          currency: 'USD',
          sourceReference: 'INV-4412',
          fingerprint: 'tx-fp-dup-1',
          reconciliationStatus: 'unreconciled',
        },
        {
          _id: 'tx-dup-2',
          organizationId: primaryOrgId,
          accountId: 'acc-1',
          importJobId: 'job-1',
          date: new Date('2026-03-11T12:00:00.000Z'),
          description: 'CLOUD DATABASE STORAGE HOSTING',
          direction: 'debit',
          amountMinor: 8900,
          amountDecimal: '89.00',
          currency: 'USD',
          sourceReference: 'INV-4412',
          fingerprint: 'tx-fp-dup-2',
          reconciliationStatus: 'unreconciled',
        },
      ]);

      // 1. Run detection
      const runRes = await request(app)
        .post('/api/v1/findings/detection-runs')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({});

      expect(runRes.status).toBe(201);
      expect(runRes.body.status).toBe('completed');
      expect(runRes.body.transactionsEvaluated).toBe(2);
      expect(runRes.body.findingsCreated).toBe(1);
      expect(runRes.body.findingsUpdated).toBe(0);

      const findingsAfterFirstRun = await FinancialFindingModel.find({
        organizationId: primaryOrgId,
      });
      expect(findingsAfterFirstRun).toHaveLength(1);

      // 2. Run detection again on identical data (idempotency check)
      const secondRunRes = await request(app)
        .post('/api/v1/findings/detection-runs')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({});

      expect(secondRunRes.status).toBe(201);
      expect(secondRunRes.body.findingsCreated).toBe(0);
      expect(secondRunRes.body.findingsUpdated).toBe(1);

      // Ensure no duplicate finding records exist
      const findingsAfterSecondRun = await FinancialFindingModel.find({
        organizationId: primaryOrgId,
      });
      expect(findingsAfterSecondRun).toHaveLength(1);
    });

    it('preserves user review status when a finding is re-evaluated', async () => {
      // Seed transactions
      await TransactionModel.create([
        {
          _id: 'tx-a',
          organizationId: primaryOrgId,
          accountId: 'acc-1',
          importJobId: 'job-1',
          date: new Date('2026-03-01T10:00:00.000Z'),
          description: 'SAAS TOOL SUBSCRIPTION',
          direction: 'debit',
          amountMinor: 3000,
          amountDecimal: '30.00',
          currency: 'USD',
          sourceReference: 'REF-3000',
          fingerprint: 'tx-fp-a',
        },
        {
          _id: 'tx-b',
          organizationId: primaryOrgId,
          accountId: 'acc-1',
          importJobId: 'job-1',
          date: new Date('2026-03-02T10:00:00.000Z'),
          description: 'SAAS TOOL SUBSCRIPTION',
          direction: 'debit',
          amountMinor: 3000,
          amountDecimal: '30.00',
          currency: 'USD',
          sourceReference: 'REF-3000',
          fingerprint: 'tx-fp-b',
        },
      ]);

      // Run 1
      await request(app)
        .post('/api/v1/findings/detection-runs')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({});

      const finding = await FinancialFindingModel.findOne({ organizationId: primaryOrgId });
      expect(finding).toBeTruthy();

      // Human user dismisses the finding with reason
      const dismissRes = await request(app)
        .post(`/api/v1/findings/${finding!._id}/review`)
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({
          action: 'dismiss',
          reason: 'Authorized duplicate for emergency staging server',
        });

      expect(dismissRes.status).toBe(200);
      expect(dismissRes.body.status).toBe('dismissed');

      // Re-run detection: must PRESERVE dismissed status!
      const reRunRes = await request(app)
        .post('/api/v1/findings/detection-runs')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({});

      expect(reRunRes.status).toBe(201);
      expect(reRunRes.body.findingsUnchanged).toBe(1);

      const refreshed = await FinancialFindingModel.findById(finding!._id);
      expect(refreshed?.status).toBe('dismissed');
      expect(refreshed?.dismissalReason).toBe('Authorized duplicate for emergency staging server');
    });
  });

  describe('Finding Lifecycle & State Transitions', () => {
    let testFindingId: string;

    beforeEach(async () => {
      const finding = await FinancialFindingModel.create({
        _id: 'finding-lifecycle-test',
        organizationId: primaryOrgId,
        findingType: 'unusual_expense',
        status: 'open',
        severity: 'high',
        title: 'High Server Spike',
        summary: 'Server charge 5x above median',
        primaryTransactionIds: ['tx-spk-1'],
        evidence: {
          ruleId: 'RULE_UNUSUAL_001',
          ruleVersion: 'v1.0.0',
          reason: 'Spike 5x above baseline',
          primaryTransactionIds: ['tx-spk-1'],
        },
        estimatedAmountMinor: 15000,
        currency: 'USD',
        ruleId: 'RULE_UNUSUAL_001',
        ruleVersion: 'v1.0.0',
        detectedAt: new Date(),
        lastEvaluatedAt: new Date(),
        fingerprint: 'fp-lifecycle-1',
      });
      testFindingId = finding._id;
    });

    it('progresses from open -> under_review -> confirmed_issue -> resolved', async () => {
      // 1. Move open -> under_review
      const res1 = await request(app)
        .post(`/api/v1/findings/${testFindingId}/review`)
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({ action: 'open_review' });

      expect(res1.status).toBe(200);
      expect(res1.body.status).toBe('under_review');

      // 2. Move under_review -> confirmed_issue
      const res2 = await request(app)
        .post(`/api/v1/findings/${testFindingId}/review`)
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({ action: 'confirm_issue', notes: 'Confirmed billing error with vendor' });

      expect(res2.status).toBe(200);
      expect(res2.body.status).toBe('confirmed_issue');

      // 3. Move confirmed_issue -> resolved
      const res3 = await request(app)
        .post(`/api/v1/findings/${testFindingId}/review`)
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({ action: 'resolve', notes: 'Vendor issued full credit memo' });

      expect(res3.status).toBe(200);
      expect(res3.body.status).toBe('resolved');

      // 4. Verify append-only history captured all transitions
      const historyRes = await request(app)
        .get(`/api/v1/findings/${testFindingId}/history`)
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(historyRes.status).toBe(200);
      expect(historyRes.body).toHaveLength(3);
    });

    it('rejects dismissal without a reason with 400 validation error', async () => {
      const res = await request(app)
        .post(`/api/v1/findings/${testFindingId}/review`)
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({ action: 'dismiss', reason: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    });

    it('rejects invalid status transitions with 400', async () => {
      // Cannot move resolved from open directly
      const res = await request(app)
        .post(`/api/v1/findings/${testFindingId}/review`)
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({ action: 'resolve' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ERROR_CODES.INVALID_FINDING_STATUS);
    });
  });

  describe('Explainable AI Intelligence Layer', () => {
    it('produces structured explanation with limitations without live Gemini key', async () => {
      const finding = await FinancialFindingModel.create({
        _id: 'finding-ai-test',
        organizationId: primaryOrgId,
        findingType: 'potential_duplicate_payment',
        status: 'open',
        severity: 'high',
        title: 'Potential Duplicate Payment (USD 50.00)',
        summary: 'Two debit transactions of USD 50.00 posted within 1 day.',
        primaryTransactionIds: ['tx-p-1'],
        relatedTransactionIds: ['tx-p-2'],
        evidence: {
          ruleId: 'RULE_DUP_001',
          ruleVersion: 'v1.0.0',
          reason: 'Matching reference INV-100 within 1 day',
          primaryTransactionIds: ['tx-p-1'],
          amountsMinor: [5000, 5000],
          currency: 'USD',
          dateDifferenceDays: 1,
          recommendedChecks: ['Check vendor order number.'],
          dataQualityLimitations: ['May represent separate orders.'],
        },
        estimatedAmountMinor: 5000,
        currency: 'USD',
        ruleId: 'RULE_DUP_001',
        ruleVersion: 'v1.0.0',
        detectedAt: new Date(),
        lastEvaluatedAt: new Date(),
        fingerprint: 'fp-ai-1',
      });

      const res = await request(app)
        .post(`/api/v1/findings/${finding._id}/explanation`)
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.findingId).toBe(finding._id);
      expect(res.body.whyItWasFlagged).toBe('Matching reference INV-100 within 1 day');
      expect(res.body.recommendedChecks).toBeInstanceOf(Array);
      expect(res.body.limitations).toBeInstanceOf(Array);
      expect(res.body.provider).toBeDefined();
    });
  });

  describe('Financial Exposure & Leakage Summary', () => {
    it('segregates exposure strictly by currency without cross-currency blending', async () => {
      // 1 open USD finding: $100.00
      await FinancialFindingModel.create({
        _id: 'f-usd-1',
        organizationId: primaryOrgId,
        findingType: 'unusual_expense',
        status: 'open',
        severity: 'high',
        title: 'USD Expense',
        summary: 'USD test',
        primaryTransactionIds: ['tx-u-1'],
        evidence: {
          ruleId: 'R1',
          ruleVersion: 'v1',
          reason: 'r',
          primaryTransactionIds: ['tx-u-1'],
        },
        estimatedAmountMinor: 10000,
        currency: 'USD',
        ruleId: 'R1',
        ruleVersion: 'v1',
        detectedAt: new Date(),
        lastEvaluatedAt: new Date(),
        fingerprint: 'fp-u1',
      });

      // 1 confirmed USD finding: $50.00
      await FinancialFindingModel.create({
        _id: 'f-usd-2',
        organizationId: primaryOrgId,
        findingType: 'potential_duplicate_payment',
        status: 'confirmed_issue',
        severity: 'high',
        title: 'USD Duplicate Confirmed',
        summary: 'USD dup confirmed',
        primaryTransactionIds: ['tx-u-2'],
        evidence: {
          ruleId: 'R1',
          ruleVersion: 'v1',
          reason: 'r',
          primaryTransactionIds: ['tx-u-2'],
        },
        estimatedAmountMinor: 5000,
        currency: 'USD',
        ruleId: 'R1',
        ruleVersion: 'v1',
        detectedAt: new Date(),
        lastEvaluatedAt: new Date(),
        fingerprint: 'fp-u2',
      });

      // 1 open EUR finding: €200.00
      await FinancialFindingModel.create({
        _id: 'f-eur-1',
        organizationId: primaryOrgId,
        findingType: 'recurring_cost_increase',
        status: 'open',
        severity: 'medium',
        title: 'EUR Price Hike',
        summary: 'EUR test',
        primaryTransactionIds: ['tx-e-1'],
        evidence: {
          ruleId: 'R1',
          ruleVersion: 'v1',
          reason: 'r',
          primaryTransactionIds: ['tx-e-1'],
        },
        estimatedAmountMinor: 20000,
        currency: 'EUR',
        ruleId: 'R1',
        ruleVersion: 'v1',
        detectedAt: new Date(),
        lastEvaluatedAt: new Date(),
        fingerprint: 'fp-e1',
      });

      const res = await request(app)
        .get('/api/v1/findings/summary')
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(res.status).toBe(200);
      expect(res.body.totalFindingsCount).toBe(3);
      expect(res.body.highSeverityCount).toBe(2);
      expect(res.body.mediumSeverityCount).toBe(1);

      // Verify USD partition
      expect(res.body.byCurrency.USD).toBeDefined();
      expect(res.body.byCurrency.USD.potentialExposureMinor).toBe(10000);
      expect(res.body.byCurrency.USD.confirmedExposureMinor).toBe(5000);
      expect(res.body.byCurrency.USD.openFindingCount).toBe(1);
      expect(res.body.byCurrency.USD.confirmedFindingCount).toBe(1);

      // Verify EUR partition
      expect(res.body.byCurrency.EUR).toBeDefined();
      expect(res.body.byCurrency.EUR.potentialExposureMinor).toBe(20000);
      expect(res.body.byCurrency.EUR.confirmedExposureMinor).toBe(0);
      expect(res.body.byCurrency.EUR.openFindingCount).toBe(1);
    });
  });
});
