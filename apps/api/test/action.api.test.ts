import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/infrastructure/database/mongo.js';
import {
  BusinessActionModel,
  ActionHistoryModel,
  FinancialFindingModel,
  OrganizationModel,
  TransactionModel,
} from '../src/infrastructure/database/models/index.js';
import {
  DEV_DEFAULT_API_KEY,
  DEV_DEFAULT_ORG_ID,
  getOrCreateDevOrganization,
  createOrganizationForTesting,
} from '../src/middleware/auth.js';
import crypto from 'node:crypto';

describe('Business Actions API & Tenant Isolation Suite', () => {
  const app = createApp({ enableLogging: false });
  let primaryOrgId: string = DEV_DEFAULT_ORG_ID;
  let secondaryOrgId: string;
  let secondaryApiKey: string;

  beforeAll(async () => {
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/moneylens_test');
    await BusinessActionModel.syncIndexes();
    await ActionHistoryModel.syncIndexes();
    await FinancialFindingModel.syncIndexes();
    await TransactionModel.syncIndexes();

    const devOrg = await getOrCreateDevOrganization();
    primaryOrgId = devOrg.id;

    const org2 = await createOrganizationForTesting('Action Sec Org LLC', 'USD');
    secondaryOrgId = org2.organization.id;
    secondaryApiKey = org2.apiKey;
  });

  afterAll(async () => {
    await Promise.all([
      BusinessActionModel.deleteMany({ organizationId: { $in: [primaryOrgId, secondaryOrgId] } }),
      ActionHistoryModel.deleteMany({ organizationId: { $in: [primaryOrgId, secondaryOrgId] } }),
      FinancialFindingModel.deleteMany({ organizationId: { $in: [primaryOrgId, secondaryOrgId] } }),
      TransactionModel.deleteMany({ organizationId: { $in: [primaryOrgId, secondaryOrgId] } }),
      OrganizationModel.deleteMany({ _id: { $in: [primaryOrgId, secondaryOrgId] } }),
    ]);
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await Promise.all([
      BusinessActionModel.deleteMany({ organizationId: { $in: [primaryOrgId, secondaryOrgId] } }),
      ActionHistoryModel.deleteMany({ organizationId: { $in: [primaryOrgId, secondaryOrgId] } }),
      FinancialFindingModel.deleteMany({ organizationId: { $in: [primaryOrgId, secondaryOrgId] } }),
      TransactionModel.deleteMany({ organizationId: { $in: [primaryOrgId, secondaryOrgId] } }),
    ]);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/v1/actions');
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/actions/evaluate triggers evaluation and creates actions', async () => {
    // Seed finding for primary org
    await FinancialFindingModel.create({
      _id: `find_${crypto.randomUUID()}`,
      organizationId: primaryOrgId,
      findingType: 'potential_duplicate_payment',
      status: 'open',
      severity: 'high',
      title: 'Potential Duplicate Payment ($50.00)',
      summary: 'Duplicate payment detected',
      primaryTransactionIds: ['tx-1'],
      relatedTransactionIds: ['tx-2'],
      estimatedAmountMinor: 5000,
      currency: 'USD',
      ruleId: 'RULE_DUP_001',
      ruleVersion: 'v1.0.0',
      detectedAt: new Date(),
      lastEvaluatedAt: new Date(),
      fingerprint: 'fp_eval_api_1',
      evidence: {},
    });

    await TransactionModel.create({
      _id: 'tx-api-1',
      organizationId: primaryOrgId,
      accountId: 'acc-1',
      importJobId: 'job-1',
      date: new Date(),
      amountMinor: 5000,
      amountDecimal: '50.00',
      currency: 'USD',
      direction: 'debit',
      description: 'TEST DEBIT',
      fingerprint: 'fp_tx_api_1',
      reconciliationStatus: 'unreconciled',
    });

    const res = await request(app)
      .post('/api/v1/actions/evaluate')
      .set('x-api-key', DEV_DEFAULT_API_KEY);

    expect(res.status).toBe(200);
    expect(res.body.data.createdCount).toBe(1);
    expect(res.body.data.totalEvaluated).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/v1/actions/summary returns segregated currency summaries', async () => {
    // Create an action with USD exposure
    await BusinessActionModel.create({
      _id: `act_${crypto.randomUUID()}`,
      organizationId: primaryOrgId,
      actionType: 'review_duplicate_payment',
      category: 'cost_reduction',
      title: 'Duplicate Payment USD',
      explanation: 'Explanation',
      priority: 'high',
      priorityScore: 70,
      severity: 'high',
      status: 'open',
      evidence: {},
      currency: 'USD',
      financialImpact: {
        currency: 'USD',
        potentialExposureMinor: 10000,
        estimatedAvoidableCostMinor: 10000,
        confirmedIssueMinor: 0,
        projectedCashFlowEffectMinor: 0,
        realizedSavingsMinor: 0,
      },
      evidenceQuality: 'high',
      recommendedSteps: [],
      ruleId: 'RULE_ACT_DUP_001',
      ruleVersion: 'v1.0.0',
      fingerprint: 'fp_sum_usd',
    });

    const res = await request(app)
      .get('/api/v1/actions/summary')
      .set('x-api-key', DEV_DEFAULT_API_KEY);

    expect(res.status).toBe(200);
    expect(res.body.data.totalOpen).toBe(1);
    expect(res.body.data.highPriorityCount).toBe(1);
    expect(res.body.data.byCurrency.USD).toBeDefined();
    expect(res.body.data.byCurrency.USD.potentialExposureMinor).toBe(10000);
  });

  it('GET /api/v1/actions paginates and filters by category and status', async () => {
    await BusinessActionModel.create([
      {
        _id: 'act-p1',
        organizationId: primaryOrgId,
        actionType: 'review_duplicate_payment',
        category: 'cost_reduction',
        title: 'Action 1 Cost Reduction',
        explanation: 'Explanation 1',
        priority: 'high',
        priorityScore: 80,
        severity: 'high',
        status: 'open',
        evidence: {},
        currency: 'USD',
        financialImpact: {
          currency: 'USD',
          potentialExposureMinor: 5000,
          estimatedAvoidableCostMinor: 5000,
          confirmedIssueMinor: 0,
          projectedCashFlowEffectMinor: 0,
          realizedSavingsMinor: 0,
        },
        evidenceQuality: 'high',
        recommendedSteps: [],
        ruleId: 'RULE_ACT_DUP_001',
        ruleVersion: 'v1.0.0',
        fingerprint: 'fp_act_1',
      },
      {
        _id: 'act-p2',
        organizationId: primaryOrgId,
        actionType: 'mitigate_cash_flow_pressure',
        category: 'cash_preservation',
        title: 'Action 2 Cash Preservation',
        explanation: 'Explanation 2',
        priority: 'medium',
        priorityScore: 50,
        severity: 'medium',
        status: 'completed',
        evidence: {},
        currency: 'USD',
        financialImpact: {
          currency: 'USD',
          potentialExposureMinor: 0,
          estimatedAvoidableCostMinor: 0,
          confirmedIssueMinor: 0,
          projectedCashFlowEffectMinor: 0,
          realizedSavingsMinor: 0,
        },
        evidenceQuality: 'adequate',
        recommendedSteps: [],
        ruleId: 'RULE_ACT_CF_PRESSURE_001',
        ruleVersion: 'v1.0.0',
        fingerprint: 'fp_act_2',
      },
    ]);

    // Filter by category: cost_reduction
    const resCategory = await request(app)
      .get('/api/v1/actions?category=cost_reduction')
      .set('x-api-key', DEV_DEFAULT_API_KEY);

    expect(resCategory.status).toBe(200);
    expect(resCategory.body.items).toHaveLength(1);
    expect(resCategory.body.items[0].id).toBe('act-p1');

    // Filter by status: completed
    const resStatus = await request(app)
      .get('/api/v1/actions?status=completed')
      .set('x-api-key', DEV_DEFAULT_API_KEY);

    expect(resStatus.status).toBe(200);
    expect(resStatus.body.items).toHaveLength(1);
    expect(resStatus.body.items[0].id).toBe('act-p2');
  });

  it('enforces strict tenant isolation: secondary org cannot read or transition primary org actions', async () => {
    const primaryAction = await BusinessActionModel.create({
      _id: 'act_primary_secret',
      organizationId: primaryOrgId,
      actionType: 'review_duplicate_payment',
      category: 'cost_reduction',
      title: 'Secret Primary Action',
      explanation: 'Confidential corporate data',
      priority: 'critical',
      priorityScore: 95,
      severity: 'critical',
      status: 'open',
      evidence: {},
      currency: 'USD',
      financialImpact: {
        currency: 'USD',
        potentialExposureMinor: 100000,
        estimatedAvoidableCostMinor: 100000,
        confirmedIssueMinor: 0,
        projectedCashFlowEffectMinor: 0,
        realizedSavingsMinor: 0,
      },
      evidenceQuality: 'high',
      recommendedSteps: [],
      ruleId: 'RULE_ACT_DUP_001',
      ruleVersion: 'v1.0.0',
      fingerprint: 'fp_primary_iso',
    });

    // 1. Cross-tenant GET by ID returns 404
    const getRes = await request(app)
      .get(`/api/v1/actions/${primaryAction._id}`)
      .set('x-api-key', secondaryApiKey);
    expect(getRes.status).toBe(404);

    // 2. Cross-tenant transition returns 404
    const transitionRes = await request(app)
      .post(`/api/v1/actions/${primaryAction._id}/transition`)
      .set('x-api-key', secondaryApiKey)
      .send({
        status: 'dismissed',
        reason: 'Attempted cross-tenant dismissal',
      });
    expect(transitionRes.status).toBe(404);

    // 3. Cross-tenant history returns 404
    const historyRes = await request(app)
      .get(`/api/v1/actions/${primaryAction._id}/history`)
      .set('x-api-key', secondaryApiKey);
    expect(historyRes.status).toBe(404);

    // 4. Primary org action remains unchanged in DB
    const checkDoc = await BusinessActionModel.findById(primaryAction._id);
    expect(checkDoc!.status).toBe('open');
  });

  it('POST /api/v1/actions/:actionId/transition and GET history succeed for authenticated tenant', async () => {
    const action = await BusinessActionModel.create({
      _id: 'act_transition_test',
      organizationId: primaryOrgId,
      actionType: 'verify_unusual_expense',
      category: 'cost_reduction',
      title: 'Verify Unusual Charge',
      explanation: 'Explanation',
      priority: 'high',
      priorityScore: 70,
      severity: 'high',
      status: 'open',
      evidence: {},
      currency: 'USD',
      financialImpact: {
        currency: 'USD',
        potentialExposureMinor: 5000,
        estimatedAvoidableCostMinor: 5000,
        confirmedIssueMinor: 0,
        projectedCashFlowEffectMinor: 0,
        realizedSavingsMinor: 0,
      },
      evidenceQuality: 'high',
      recommendedSteps: [],
      ruleId: 'RULE_ACT_UNUSUAL_001',
      ruleVersion: 'v1.0.0',
      fingerprint: 'fp_trans_flow',
    });

    // Dismiss with valid reason
    const transRes = await request(app)
      .post(`/api/v1/actions/${action._id}/transition`)
      .set('x-api-key', DEV_DEFAULT_API_KEY)
      .send({
        status: 'dismissed',
        reason: 'Authorized inventory restock payment for holiday season',
      });

    expect(transRes.status).toBe(200);
    expect(transRes.body.data.status).toBe('dismissed');
    expect(transRes.body.data.dismissalReason).toContain('holiday season');

    // Retrieve history
    const histRes = await request(app)
      .get(`/api/v1/actions/${action._id}/history`)
      .set('x-api-key', DEV_DEFAULT_API_KEY);

    expect(histRes.status).toBe(200);
    expect(histRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(histRes.body.data[0].eventType).toBe('dismissed');
  });
});
