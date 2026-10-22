import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/infrastructure/database/mongo.js';
import {
  BusinessActionModel,
  ActionHistoryModel,
  FinancialFindingModel,
  FindingHistoryModel,
  ForecastRunModel,
  CashFlowScenarioModel,
  ReconciliationRunModel,
  ReconciliationMatchModel,
  ReconciliationAuditEventModel,
  ImportJobModel,
  ImportRowErrorModel,
  TransactionModel,
  FinancialAccountModel,
  OrganizationModel,
} from '../src/infrastructure/database/models/index.js';
import {
  DEV_DEFAULT_API_KEY,
  DEV_DEFAULT_ORG_ID,
  getOrCreateDevOrganization,
  createOrganizationForTesting,
} from '../src/middleware/auth.js';
import crypto from 'node:crypto';

describe('Cross-Phase Integration, Security & Reliability Audit Suite', () => {
  const app = createApp({ enableLogging: false });
  let primaryOrgId: string = DEV_DEFAULT_ORG_ID;
  let secondaryOrgId: string;
  let secondaryApiKey: string;
  let primaryAccountId: string;

  beforeAll(async () => {
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/moneylens_test');
    await BusinessActionModel.syncIndexes();
    await ActionHistoryModel.syncIndexes();
    await FinancialFindingModel.syncIndexes();
    await FindingHistoryModel.syncIndexes();
    await ForecastRunModel.syncIndexes();
    await CashFlowScenarioModel.syncIndexes();
    await ReconciliationMatchModel.syncIndexes();
    await ReconciliationRunModel.syncIndexes();
    await TransactionModel.syncIndexes();
    await ImportJobModel.syncIndexes();

    const devOrg = await getOrCreateDevOrganization();
    primaryOrgId = devOrg.id;

    const org2 = await createOrganizationForTesting('Cross Phase Sec Org LLC', 'USD');
    secondaryOrgId = org2.organization.id;
    secondaryApiKey = org2.apiKey;

    primaryAccountId = crypto.randomUUID();
    await FinancialAccountModel.create({
      _id: primaryAccountId,
      organizationId: primaryOrgId,
      name: 'Primary Checking',
      type: 'checking',
      currency: 'USD',
      institutionName: 'Primary Bank',
    });
  });

  afterAll(async () => {
    const orgs = [primaryOrgId, secondaryOrgId];
    await Promise.all([
      BusinessActionModel.deleteMany({ organizationId: { $in: orgs } }),
      ActionHistoryModel.deleteMany({ organizationId: { $in: orgs } }),
      FinancialFindingModel.deleteMany({ organizationId: { $in: orgs } }),
      FindingHistoryModel.deleteMany({ organizationId: { $in: orgs } }),
      ForecastRunModel.deleteMany({ organizationId: { $in: orgs } }),
      CashFlowScenarioModel.deleteMany({ organizationId: { $in: orgs } }),
      ReconciliationMatchModel.deleteMany({ organizationId: { $in: orgs } }),
      ReconciliationRunModel.deleteMany({ organizationId: { $in: orgs } }),
      ReconciliationAuditEventModel.deleteMany({ organizationId: { $in: orgs } }),
      TransactionModel.deleteMany({ organizationId: { $in: orgs } }),
      ImportJobModel.deleteMany({ organizationId: { $in: orgs } }),
      ImportRowErrorModel.deleteMany({ organizationId: { $in: orgs } }),
      FinancialAccountModel.deleteMany({ organizationId: { $in: orgs } }),
      OrganizationModel.deleteMany({ _id: { $in: orgs } }),
    ]);
    await disconnectDatabase();
  });

  beforeEach(async () => {
    const orgs = [primaryOrgId, secondaryOrgId];
    await Promise.all([
      BusinessActionModel.deleteMany({ organizationId: { $in: orgs } }),
      ActionHistoryModel.deleteMany({ organizationId: { $in: orgs } }),
      FinancialFindingModel.deleteMany({ organizationId: { $in: orgs } }),
      FindingHistoryModel.deleteMany({ organizationId: { $in: orgs } }),
      ForecastRunModel.deleteMany({ organizationId: { $in: orgs } }),
      CashFlowScenarioModel.deleteMany({ organizationId: { $in: orgs } }),
      ReconciliationMatchModel.deleteMany({ organizationId: { $in: orgs } }),
      ReconciliationRunModel.deleteMany({ organizationId: { $in: orgs } }),
      ReconciliationAuditEventModel.deleteMany({ organizationId: { $in: orgs } }),
      TransactionModel.deleteMany({ organizationId: { $in: orgs } }),
      ImportJobModel.deleteMany({ organizationId: { $in: orgs } }),
      ImportRowErrorModel.deleteMany({ organizationId: { $in: orgs } }),
    ]);
  });

  // ============================================================================
  // Scenario 1: Import -> Detect Finding -> Review Finding -> Generate Action
  // ============================================================================
  it('Scenario 1: End-to-end import -> leakage detection -> review finding -> generate action', async () => {
    const csvContent =
      'Date,Description,Amount,Currency,Reference\n' +
      '2026-03-01,Office Tech Supplies,-250.00,USD,TX-101\n' +
      '2026-03-02,Office Tech Supplies,-250.00,USD,TX-102\n';

    // 1. Ingest statement
    const importRes = await request(app)
      .post('/api/v1/imports')
      .set('x-api-key', DEV_DEFAULT_API_KEY)
      .attach('file', Buffer.from(csvContent, 'utf-8'), 'statement.csv');

    expect(importRes.status).toBe(201);
    expect(importRes.body.status).toBe('completed');
    expect(importRes.body.acceptedRows).toBe(2);

    // 2. Trigger leakage detection
    const detectRes = await request(app)
      .post('/api/v1/findings/detection-runs')
      .set('x-api-key', DEV_DEFAULT_API_KEY)
      .send({
        observationScope: {
          startDate: '2026-02-01',
          endDate: '2026-03-31',
          currencies: ['USD'],
        },
      });

    expect(detectRes.status).toBe(201);
    expect(detectRes.body.status).toBe('completed');

    const findingsListRes = await request(app)
      .get('/api/v1/findings')
      .set('x-api-key', DEV_DEFAULT_API_KEY);

    expect(findingsListRes.status).toBe(200);
    expect(findingsListRes.body.items.length).toBeGreaterThanOrEqual(1);

    const dupFinding = findingsListRes.body.items.find(
      (f: { findingType: string }) => f.findingType === 'potential_duplicate_payment',
    );
    expect(dupFinding).toBeDefined();

    // 3. Review finding (confirm as issue)
    const reviewRes = await request(app)
      .post(`/api/v1/findings/${dupFinding.id}/review`)
      .set('x-api-key', DEV_DEFAULT_API_KEY)
      .send({
        action: 'confirm_issue',
        notes: 'Verified dual payment on vendor portal',
      });

    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.status).toBe('confirmed_issue');

    // 4. Generate recommendations in Action Center
    const actionEvalRes = await request(app)
      .post('/api/v1/actions/evaluate')
      .set('x-api-key', DEV_DEFAULT_API_KEY)
      .send({});

    expect(actionEvalRes.status).toBe(200);
    expect(actionEvalRes.body.data.createdCount).toBeGreaterThanOrEqual(1);

    const actionsListRes = await request(app)
      .get('/api/v1/actions')
      .set('x-api-key', DEV_DEFAULT_API_KEY);

    expect(actionsListRes.status).toBe(200);
    const action = actionsListRes.body.items.find(
      (a: { ruleId: string }) => a.ruleId === 'RULE_ACT_DUP_001',
    );
    expect(action).toBeDefined();
    expect(action.sourceFindingIds).toContain(dupFinding.id);
    expect(action.financialImpact.potentialExposureMinor).toBe(25000);
  });

  // ============================================================================
  // Scenario 2: Ingest -> Forecast -> Simulate Scenario -> Ledger Invariance
  // ============================================================================
  it('Scenario 2: Forecast and scenario simulation strictly preserve ledger transaction invariance', async () => {
    // Seed 3 historical transactions
    const tx1 = await TransactionModel.create({
      _id: crypto.randomUUID(),
      organizationId: primaryOrgId,
      accountId: primaryAccountId,
      importJobId: crypto.randomUUID(),
      date: new Date('2026-03-01'),
      description: 'Retail Inflow Customer A',
      direction: 'credit',
      amountMinor: 500000,
      amountDecimal: '5000.00',
      currency: 'USD',
      fingerprint: 'fp-sc2-1',
    });

    const tx2 = await TransactionModel.create({
      _id: crypto.randomUUID(),
      organizationId: primaryOrgId,
      accountId: primaryAccountId,
      importJobId: crypto.randomUUID(),
      date: new Date('2026-03-05'),
      description: 'Inventory Purchase',
      direction: 'debit',
      amountMinor: 200000,
      amountDecimal: '2000.00',
      currency: 'USD',
      fingerprint: 'fp-sc2-2',
    });

    // Capture exact database snapshot
    const baselineTxs = await TransactionModel.find({ organizationId: primaryOrgId }).lean();
    expect(baselineTxs.length).toBe(2);

    // Run Forecast
    const forecastRes = await request(app)
      .post('/api/v1/cash-flow/forecasts')
      .set('x-api-key', DEV_DEFAULT_API_KEY)
      .send({
        horizon: '30d',
        currencies: ['USD'],
        openingBalances: [
          {
            currency: 'USD',
            amountMinor: 1000000,
            effectiveDate: '2026-03-10',
          },
        ],
      });

    expect(forecastRes.status).toBe(201);

    // Simulate aggressive stress scenario
    const simRes = await request(app)
      .post('/api/v1/cash-flow/scenarios/simulate')
      .set('x-api-key', DEV_DEFAULT_API_KEY)
      .send({
        currency: 'USD',
        horizon: '30d',
        assumptions: {
          revenueChangePercent: -30,
          expenseChangePercent: 20,
          recurringAdjustments: [],
          oneTimeEvents: [
            {
              id: 'ev-tax',
              name: 'Emergency Equipment Replacement',
              date: '2026-03-25',
              amountMinor: 150000,
              direction: 'outflow',
            },
          ],
        },
        openingBalanceMinor: 1000000,
      });

    expect(simRes.status).toBe(200);
    expect(simRes.body.data.scenarioSummary).toBeDefined();

    // Verify ledger invariance: records, counts, balances, and reconciliationStatus untouched
    const afterTxs = await TransactionModel.find({ organizationId: primaryOrgId }).lean();
    expect(afterTxs.length).toBe(baselineTxs.length);
    expect(afterTxs[0].amountMinor).toBe(tx1.amountMinor);
    expect(afterTxs[0].reconciliationStatus).toBe('unreconciled');
    expect(afterTxs[1].amountMinor).toBe(tx2.amountMinor);
    expect(afterTxs[1].reconciliationStatus).toBe('unreconciled');
  });

  // ============================================================================
  // Scenario 3: Confirm match -> Rerun reconciliation -> No duplicate match
  // ============================================================================
  it('Scenario 3: Confirming a match locks transactions and prevents duplicate or conflicting confirmations on rerun', async () => {
    const txSource = await TransactionModel.create({
      _id: crypto.randomUUID(),
      organizationId: primaryOrgId,
      accountId: primaryAccountId,
      importJobId: crypto.randomUUID(),
      date: new Date('2026-03-01'),
      description: 'Account Transfer Out',
      direction: 'debit',
      amountMinor: 100000,
      amountDecimal: '1000.00',
      currency: 'USD',
      fingerprint: 'fp-rec-src',
    });

    const txCandidate = await TransactionModel.create({
      _id: crypto.randomUUID(),
      organizationId: primaryOrgId,
      accountId: primaryAccountId,
      importJobId: crypto.randomUUID(),
      date: new Date('2026-03-01'),
      description: 'Account Transfer In',
      direction: 'credit',
      amountMinor: 100000,
      amountDecimal: '1000.00',
      currency: 'USD',
      fingerprint: 'fp-rec-cand',
    });

    // 1. Initial reconciliation run
    const runRes = await request(app)
      .post('/api/v1/reconciliation/runs')
      .set('x-api-key', DEV_DEFAULT_API_KEY)
      .send({ dateToleranceDays: 3 });

    expect(runRes.status).toBe(201);

    const matchesRes = await request(app)
      .get(`/api/v1/reconciliation/matches?runId=${runRes.body.id}`)
      .set('x-api-key', DEV_DEFAULT_API_KEY);

    expect(matchesRes.status).toBe(200);
    expect(matchesRes.body.items.length).toBeGreaterThanOrEqual(1);
    const matchId = matchesRes.body.items[0].id;

    // 2. Confirm match
    const confirmRes = await request(app)
      .post(`/api/v1/reconciliation/matches/${matchId}/confirm`)
      .set('x-api-key', DEV_DEFAULT_API_KEY)
      .send({ notes: 'Verified inter-account fund transfer' });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.status).toBe('confirmed');

    // Verify transactions are locked
    const lockedSrc = await TransactionModel.findById(txSource._id);
    const lockedCand = await TransactionModel.findById(txCandidate._id);
    expect(lockedSrc?.reconciliationStatus).toBe('reconciled');
    expect(lockedCand?.reconciliationStatus).toBe('reconciled');

    // 3. Rerun reconciliation
    const rerunRes = await request(app)
      .post('/api/v1/reconciliation/runs')
      .set('x-api-key', DEV_DEFAULT_API_KEY)
      .send({ dateToleranceDays: 3 });

    expect(rerunRes.status).toBe(201);
    expect(rerunRes.body.matchedCount).toBe(0);

    const rerunMatches = await request(app)
      .get(`/api/v1/reconciliation/matches?runId=${rerunRes.body.id}`)
      .set('x-api-key', DEV_DEFAULT_API_KEY);

    expect(rerunMatches.body.items.length).toBe(0);
  });

  // ============================================================================
  // Scenario 4: Reconciliation Inconsistency -> Finding -> Action
  // ============================================================================
  it('Scenario 4: Reconciliation inconsistency generates targeted finding and evidence-backed action', async () => {
    // Seed conflicting reconciliation records
    const orphanTx = await TransactionModel.create({
      _id: crypto.randomUUID(),
      organizationId: primaryOrgId,
      accountId: primaryAccountId,
      importJobId: crypto.randomUUID(),
      date: new Date('2026-03-01'),
      description: 'Orphaned Transfer Flagged',
      direction: 'debit',
      amountMinor: 88000,
      amountDecimal: '880.00',
      currency: 'USD',
      reconciliationStatus: 'reconciled', // Marked reconciled but lacks confirmed match
      fingerprint: 'fp-rec-orphan',
    });

    // Run finding detection
    const detectRes = await request(app)
      .post('/api/v1/findings/detection-runs')
      .set('x-api-key', DEV_DEFAULT_API_KEY)
      .send({});

    expect(detectRes.status).toBe(201);

    const findingsRes = await request(app)
      .get('/api/v1/findings')
      .set('x-api-key', DEV_DEFAULT_API_KEY);

    const recFinding = findingsRes.body.items.find(
      (f: { findingType: string }) => f.findingType === 'reconciliation_inconsistency',
    );
    expect(recFinding).toBeDefined();

    // Run action evaluation
    const actionEvalRes = await request(app)
      .post('/api/v1/actions/evaluate')
      .set('x-api-key', DEV_DEFAULT_API_KEY)
      .send({});

    expect(actionEvalRes.status).toBe(200);

    const actionsRes = await request(app)
      .get('/api/v1/actions')
      .set('x-api-key', DEV_DEFAULT_API_KEY);

    const recAction = actionsRes.body.items.find(
      (a: { ruleId: string }) => a.ruleId === 'RULE_ACT_REC_INCONSISTENCY_001',
    );
    expect(recAction).toBeDefined();
    expect(recAction.category).toBe('data_integrity');
    expect(recAction.sourceFindingIds).toContain(recFinding.id);

    // Verify reconciliation state was not altered automatically
    const unchangedTx = await TransactionModel.findById(orphanTx._id);
    expect(unchangedTx?.reconciliationStatus).toBe('reconciled');
  });

  // ============================================================================
  // Scenario 5: Dismissed finding respected on re-run
  // ============================================================================
  it('Scenario 5: Dismissed finding is not overwritten or converted into active action on re-run', async () => {
    // Seed duplicate payment transactions
    const jobId = crypto.randomUUID();
    await TransactionModel.create([
      {
        _id: crypto.randomUUID(),
        organizationId: primaryOrgId,
        accountId: primaryAccountId,
        importJobId: jobId,
        date: new Date('2026-03-01'),
        description: 'Vendor Fee Duplicated',
        direction: 'debit',
        amountMinor: 15000,
        amountDecimal: '150.00',
        currency: 'USD',
        fingerprint: 'fp-dup-d1',
      },
      {
        _id: crypto.randomUUID(),
        organizationId: primaryOrgId,
        accountId: primaryAccountId,
        importJobId: jobId,
        date: new Date('2026-03-01'),
        description: 'Vendor Fee Duplicated',
        direction: 'debit',
        amountMinor: 15000,
        amountDecimal: '150.00',
        currency: 'USD',
        fingerprint: 'fp-dup-d2',
      },
    ]);

    // Initial detection
    await request(app)
      .post('/api/v1/findings/detection-runs')
      .set('x-api-key', DEV_DEFAULT_API_KEY)
      .send({});

    const findingsRes = await request(app)
      .get('/api/v1/findings')
      .set('x-api-key', DEV_DEFAULT_API_KEY);

    const finding = findingsRes.body.items[0];
    expect(finding).toBeDefined();

    // Dismiss finding with mandatory reason
    const dismissRes = await request(app)
      .post(`/api/v1/findings/${finding.id}/review`)
      .set('x-api-key', DEV_DEFAULT_API_KEY)
      .send({
        action: 'dismiss',
        reason: 'Authorized duplicate monthly service fees for two separate locations',
      });

    expect(dismissRes.status).toBe(200);
    expect(dismissRes.body.status).toBe('dismissed');

    // Re-run detection
    await request(app)
      .post('/api/v1/findings/detection-runs')
      .set('x-api-key', DEV_DEFAULT_API_KEY)
      .send({});

    // Verify finding remains dismissed
    const findingAfter = await FinancialFindingModel.findById(finding.id);
    expect(findingAfter?.status).toBe('dismissed');

    // Run action evaluation -> must not create action for dismissed finding
    await request(app)
      .post('/api/v1/actions/evaluate')
      .set('x-api-key', DEV_DEFAULT_API_KEY)
      .send({});

    const actionsRes = await request(app)
      .get('/api/v1/actions')
      .set('x-api-key', DEV_DEFAULT_API_KEY);

    const activeDupAction = actionsRes.body.items.find(
      (a: { ruleId: string }) => a.ruleId === 'RULE_ACT_DUP_001',
    );
    expect(activeDupAction).toBeUndefined();
  });

  // ============================================================================
  // Scenario 6: Recurring-cost finding integration with forecasting
  // ============================================================================
  it('Scenario 6: Recurring costs are projected accurately into cash flow forecasts without double-counting', async () => {
    // 1. Seed recurring expense finding
    const finding = await FinancialFindingModel.create({
      _id: crypto.randomUUID(),
      organizationId: primaryOrgId,
      findingType: 'recurring_expense',
      severity: 'low',
      status: 'open',
      currency: 'USD',
      estimatedAmountMinor: 9900,
      title: 'Recurring Expense: SaaS Software Platform',
      summary: 'Recurring monthly subscription detected',
      evidence: {
        merchant: 'SaaS Software Platform',
        historicalComparisonPeriod: {
          cadenceDays: 30,
          baselineAmountMinor: 9900,
        },
        amountsMinor: [9900, 9900, 9900],
        transactionDates: ['2026-01-05', '2026-02-05', '2026-03-05'],
      },
      primaryTransactionIds: [crypto.randomUUID()],
      fingerprint: 'fp-rec-saas-1',
      ruleId: 'RULE_REC_EXP_001',
      ruleVersion: 'v1.0.0',
    });

    // Run baseline forecast for 30d
    const fcRes = await request(app)
      .post('/api/v1/cash-flow/forecasts')
      .set('x-api-key', DEV_DEFAULT_API_KEY)
      .send({
        horizon: '30d',
        currencies: ['USD'],
      });

    expect(fcRes.status).toBe(201);
    const forecast = fcRes.body.data.forecasts[0];
    expect(forecast.recurringOutflowsCount).toBe(1);
    expect(forecast.recurringOutflowsTotalMinor).toBe(9900);

    // 2. Change recurring-cost finding (cost increase observed)
    finding.findingType = 'recurring_cost_increase';
    finding.title = 'Recurring Cost Increase: SaaS Software Platform';
    finding.evidence = {
      merchant: 'SaaS Software Platform',
      actualAmountMinor: 14900,
      historicalComparisonPeriod: {
        cadenceDays: 30,
        baselineAmountMinor: 9900,
      },
      amountsMinor: [9900, 9900, 14900],
      transactionDates: ['2026-01-05', '2026-02-05', '2026-03-05'],
    };
    await finding.save();

    // Rerun forecast -> verify updated cost is projected without double-counting (count is still 1)
    const rerunFcRes = await request(app)
      .post('/api/v1/cash-flow/forecasts')
      .set('x-api-key', DEV_DEFAULT_API_KEY)
      .send({
        horizon: '30d',
        currencies: ['USD'],
      });

    expect(rerunFcRes.status).toBe(201);
    const updatedForecast = rerunFcRes.body.data.forecasts[0];
    expect(updatedForecast.recurringOutflowsCount).toBe(1);
    expect(updatedForecast.recurringOutflowsTotalMinor).toBe(14900);
  });

  // ============================================================================
  // Scenario 7: Concurrent Evaluation Deduplication
  // ============================================================================
  it('Scenario 7: Concurrent recommendation evaluations deduplicate safely via compound unique index', async () => {
    // Seed candidate finding
    await FinancialFindingModel.create({
      _id: crypto.randomUUID(),
      organizationId: primaryOrgId,
      findingType: 'unusual_expense',
      severity: 'medium',
      status: 'open',
      currency: 'USD',
      estimatedAmountMinor: 45000,
      title: 'Unusual Software Expense Spike',
      summary: 'Unusual expense observed',
      evidence: {
        reason: 'Variance exceeds threshold',
        baselineAmountMinor: 18000,
        observedAmountMinor: 45000,
      },
      primaryTransactionIds: [crypto.randomUUID()],
      fingerprint: 'fp-concurrent-finding',
      ruleId: 'RULE_UNUSUAL_001',
      ruleVersion: 'v1.0.0',
    });

    // Fire 5 concurrent evaluation requests
    const promises = Array.from({ length: 5 }).map(() =>
      request(app).post('/api/v1/actions/evaluate').set('x-api-key', DEV_DEFAULT_API_KEY).send({}),
    );

    const responses = await Promise.all(promises);
    for (const res of responses) {
      expect(res.status).toBe(200);
    }

    // Exactly one action must exist for RULE_ACT_UNUSUAL_001
    const actions = await BusinessActionModel.find({
      organizationId: primaryOrgId,
      ruleId: 'RULE_ACT_UNUSUAL_001',
    });

    expect(actions.length).toBe(1);
  });

  // ============================================================================
  // Scenario 8: Tenant Isolation Across All Resource Boundaries
  // ============================================================================
  it('Scenario 8: Strictly prevents cross-tenant access and mutation across all resource types', async () => {
    // Create resources in Primary Org
    const importJob = await ImportJobModel.create({
      _id: crypto.randomUUID(),
      organizationId: primaryOrgId,
      accountId: primaryAccountId,
      fileName: 'org1_statement.csv',
      fileHash: 'hash-org1',
      status: 'completed',
    });

    const finding = await FinancialFindingModel.create({
      _id: crypto.randomUUID(),
      organizationId: primaryOrgId,
      findingType: 'potential_duplicate_payment',
      severity: 'high',
      status: 'open',
      currency: 'USD',
      estimatedAmountMinor: 30000,
      title: 'Org1 Finding',
      summary: 'Duplicate payment in Org1',
      evidence: { reason: 'Same amount on same date' },
      primaryTransactionIds: [crypto.randomUUID()],
      fingerprint: 'fp-org1-finding',
      ruleId: 'RULE_DUP_001',
      ruleVersion: 'v1.0.0',
    });

    const action = await BusinessActionModel.create({
      _id: crypto.randomUUID(),
      organizationId: primaryOrgId,
      actionType: 'review_duplicate_payment',
      category: 'cost_reduction',
      title: 'Review Duplicate in Org1',
      explanation: 'Org1 internal action',
      priority: 'high',
      priorityScore: 75,
      severity: 'high',
      status: 'open',
      evidence: {},
      financialImpact: {
        currency: 'USD',
        potentialExposureMinor: 30000,
        estimatedAvoidableCostMinor: 0,
        confirmedIssueMinor: 0,
        projectedCashFlowEffectMinor: 0,
        realizedSavingsMinor: 0,
      },
      evidenceQuality: 'high',
      recommendedSteps: [],
      ruleId: 'RULE_ACT_DUP_001',
      ruleVersion: 'v1.0.0',
      fingerprint: 'fp-org1-action',
    });

    // Attempt to access Primary Org resources using Secondary Org credentials
    // 1. Import Access
    const impAccess = await request(app)
      .get(`/api/v1/imports/${importJob._id}`)
      .set('x-api-key', secondaryApiKey);
    expect(impAccess.status).toBe(404);

    // 2. Finding Access
    const findAccess = await request(app)
      .get(`/api/v1/findings/${finding._id}`)
      .set('x-api-key', secondaryApiKey);
    expect(findAccess.status).toBe(404);

    // 3. Finding Mutation
    const findMutate = await request(app)
      .post(`/api/v1/findings/${finding._id}/review`)
      .set('x-api-key', secondaryApiKey)
      .send({ action: 'dismiss', reason: 'Cross tenant attempt' });
    expect(findMutate.status).toBe(404);

    // 4. Action Access
    const actAccess = await request(app)
      .get(`/api/v1/actions/${action._id}`)
      .set('x-api-key', secondaryApiKey);
    expect(actAccess.status).toBe(404);

    // 5. Action Transition Mutation
    const actMutate = await request(app)
      .post(`/api/v1/actions/${action._id}/transition`)
      .set('x-api-key', secondaryApiKey)
      .send({ status: 'in_progress' });
    expect(actMutate.status).toBe(404);

    // 6. Action History Access
    const actHist = await request(app)
      .get(`/api/v1/actions/${action._id}/history`)
      .set('x-api-key', secondaryApiKey);
    expect(actHist.status).toBe(404);
  });

  // ============================================================================
  // Scenario 9: Safe Error Recovery & Idempotent Failures
  // ============================================================================
  it('Scenario 9: Rejects invalid lifecycle transitions without silent partial state corruption', async () => {
    const action = await BusinessActionModel.create({
      _id: crypto.randomUUID(),
      organizationId: primaryOrgId,
      actionType: 'review_duplicate_payment',
      category: 'cost_reduction',
      title: 'Action for Transition Test',
      explanation: 'Testing invalid transitions',
      priority: 'medium',
      priorityScore: 50,
      severity: 'medium',
      status: 'open',
      evidence: {},
      financialImpact: {
        currency: 'USD',
        potentialExposureMinor: 10000,
        estimatedAvoidableCostMinor: 0,
        confirmedIssueMinor: 0,
        projectedCashFlowEffectMinor: 0,
        realizedSavingsMinor: 0,
      },
      evidenceQuality: 'adequate',
      recommendedSteps: [],
      ruleId: 'RULE_ACT_DUP_001',
      ruleVersion: 'v1.0.0',
      fingerprint: 'fp-err-action',
    });

    // 1. Attempt dismiss without mandatory reason
    const failDismiss = await request(app)
      .post(`/api/v1/actions/${action._id}/transition`)
      .set('x-api-key', DEV_DEFAULT_API_KEY)
      .send({ status: 'dismissed', reason: '   ' });

    expect(failDismiss.status).toBe(400);
    expect(failDismiss.body.error.code).toBe('DISMISSAL_REASON_REQUIRED');

    // Verify action status remained open
    const checkAction = await BusinessActionModel.findById(action._id);
    expect(checkAction?.status).toBe('open');

    // Verify no history event was created for the failed transition
    const historyCount = await ActionHistoryModel.countDocuments({ actionId: action._id });
    expect(historyCount).toBe(0);

    // 2. Attempt snooze with invalid past date
    const failSnooze = await request(app)
      .post(`/api/v1/actions/${action._id}/transition`)
      .set('x-api-key', DEV_DEFAULT_API_KEY)
      .send({ status: 'snoozed', snoozedUntil: '2020-01-01T00:00:00.000Z' });

    expect(failSnooze.status).toBe(400);
    expect(failSnooze.body.error.code).toBe('INVALID_SNOOZE_DATE');

    // Verify status still untouched
    const checkAction2 = await BusinessActionModel.findById(action._id);
    expect(checkAction2?.status).toBe('open');
  });
});
