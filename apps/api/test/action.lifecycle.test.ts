import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectDatabase, disconnectDatabase } from '../src/infrastructure/database/mongo.js';
import {
  BusinessActionModel,
  ActionHistoryModel,
  FinancialFindingModel,
  ForecastRunModel,
  CashFlowForecastModel,
  TransactionModel,
  FinancialAccountModel,
  OrganizationModel,
} from '../src/infrastructure/database/models/index.js';
import { ActionService } from '../src/services/actions/action.service.js';
import { AppError } from '../src/middleware/error-handler.js';
import crypto from 'node:crypto';

describe('Business Action Lifecycle & Persistence Service Suite', () => {
  const service = new ActionService();
  const testOrgId = `org_lifecycle_${crypto.randomUUID()}`;

  beforeAll(async () => {
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/moneylens_test');
    await BusinessActionModel.syncIndexes();
    await ActionHistoryModel.syncIndexes();
    await FinancialFindingModel.syncIndexes();
    await TransactionModel.syncIndexes();
  });

  afterAll(async () => {
    await Promise.all([
      BusinessActionModel.deleteMany({ organizationId: testOrgId }),
      ActionHistoryModel.deleteMany({ organizationId: testOrgId }),
      FinancialFindingModel.deleteMany({ organizationId: testOrgId }),
      ForecastRunModel.deleteMany({ organizationId: testOrgId }),
      CashFlowForecastModel.deleteMany({ organizationId: testOrgId }),
      TransactionModel.deleteMany({ organizationId: testOrgId }),
      FinancialAccountModel.deleteMany({ organizationId: testOrgId }),
      OrganizationModel.deleteMany({ _id: testOrgId }),
    ]);
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await Promise.all([
      BusinessActionModel.deleteMany({ organizationId: testOrgId }),
      ActionHistoryModel.deleteMany({ organizationId: testOrgId }),
      FinancialFindingModel.deleteMany({ organizationId: testOrgId }),
      ForecastRunModel.deleteMany({ organizationId: testOrgId }),
      CashFlowForecastModel.deleteMany({ organizationId: testOrgId }),
      TransactionModel.deleteMany({ organizationId: testOrgId }),
      FinancialAccountModel.deleteMany({ organizationId: testOrgId }),
    ]);
  });

  it('evaluates findings, persists new actions, and appends creation history', async () => {
    await FinancialFindingModel.create({
      _id: `find_${crypto.randomUUID()}`,
      organizationId: testOrgId,
      findingType: 'potential_duplicate_payment',
      status: 'open',
      severity: 'high',
      title: 'Potential Duplicate Payment: Supplier A ($200.00)',
      summary: 'Two debits posted within 12 hours',
      primaryTransactionIds: ['tx-1'],
      relatedTransactionIds: ['tx-2'],
      estimatedAmountMinor: 20000,
      currency: 'USD',
      ruleId: 'RULE_DUP_001',
      ruleVersion: 'v1.0.0',
      detectedAt: new Date(),
      lastEvaluatedAt: new Date(),
      fingerprint: 'fp_dup_test_1',
      evidence: { primaryAmountMinor: 20000 },
    });

    await TransactionModel.create({
      _id: 'tx-1',
      organizationId: testOrgId,
      accountId: 'acc-1',
      importJobId: 'job-1',
      date: new Date(),
      amountMinor: 20000,
      amountDecimal: '200.00',
      currency: 'USD',
      direction: 'debit',
      description: 'SUPPLIER A INVOICE',
      fingerprint: 'fp_tx_1',
      reconciliationStatus: 'unreconciled',
    });

    const summary = await service.evaluateActions(testOrgId);
    expect(summary.createdCount).toBe(1);
    expect(summary.totalEvaluated).toBeGreaterThanOrEqual(1);

    const actions = await BusinessActionModel.find({ organizationId: testOrgId }).exec();
    expect(actions).toHaveLength(1);
    const action = actions[0]!;
    expect(action.status).toBe('open');
    expect(action.priority).toBeDefined();

    // Verify history trail
    const history = await ActionHistoryModel.find({
      organizationId: testOrgId,
      actionId: action._id,
    }).exec();
    expect(history).toHaveLength(1);
    expect(history[0]!.eventType).toBe('created');
    expect(history[0]!.nextStatus).toBe('open');
  });

  it('demonstrates evaluation idempotency on repeated runs', async () => {
    await FinancialFindingModel.create({
      _id: `find_${crypto.randomUUID()}`,
      organizationId: testOrgId,
      findingType: 'potential_duplicate_payment',
      status: 'open',
      severity: 'high',
      title: 'Potential Duplicate Payment: Vendor B ($100.00)',
      summary: 'Two debits posted within 12 hours',
      primaryTransactionIds: ['tx-10'],
      relatedTransactionIds: ['tx-20'],
      estimatedAmountMinor: 10000,
      currency: 'USD',
      ruleId: 'RULE_DUP_001',
      ruleVersion: 'v1.0.0',
      detectedAt: new Date(),
      lastEvaluatedAt: new Date(),
      fingerprint: 'fp_dup_test_2',
      evidence: {},
    });

    await TransactionModel.create({
      _id: 'tx-10',
      organizationId: testOrgId,
      accountId: 'acc-1',
      importJobId: 'job-1',
      date: new Date(),
      amountMinor: 10000,
      amountDecimal: '100.00',
      currency: 'USD',
      direction: 'debit',
      description: 'VENDOR B PAYMENT',
      fingerprint: 'fp_tx_10',
      reconciliationStatus: 'unreconciled',
    });

    // Run 1
    const run1 = await service.evaluateActions(testOrgId);
    expect(run1.createdCount).toBe(1);

    // Run 2: same evidence
    const run2 = await service.evaluateActions(testOrgId);
    expect(run2.createdCount).toBe(0);
    expect(run2.updatedCount).toBe(1); // Evidence refreshed

    // Count in DB remains 1
    const count = await BusinessActionModel.countDocuments({ organizationId: testOrgId });
    expect(count).toBe(1);
  });

  it('enforces valid lifecycle state transitions and prevents invalid ones', async () => {
    const action = await BusinessActionModel.create({
      _id: `act_${crypto.randomUUID()}`,
      organizationId: testOrgId,
      actionType: 'review_duplicate_payment',
      category: 'cost_reduction',
      title: 'Review Duplication',
      explanation: 'Explanation',
      priority: 'high',
      priorityScore: 70,
      severity: 'high',
      status: 'open',
      evidence: {},
      sourceFindingIds: ['find-1'],
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
      fingerprint: 'fp_test_transition',
    });

    // 1. Valid: open -> in_progress
    const inProgress = await service.transitionAction(testOrgId, action._id, {
      status: 'in_progress',
      notes: 'Investigating with vendor billing dept',
    });
    expect(inProgress.status).toBe('in_progress');

    // 2. Valid: in_progress -> completed
    const completed = await service.transitionAction(testOrgId, action._id, {
      status: 'completed',
      notes: 'Vendor credited invoice #1234',
    });
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBeDefined();

    // 3. Invalid: completed -> dismissed (terminal branch, can only reopen)
    await expect(
      service.transitionAction(testOrgId, action._id, {
        status: 'dismissed',
        reason: 'Attempting invalid transition',
      }),
    ).rejects.toThrow(AppError);

    // 4. Valid: completed -> open (reopen)
    const reopened = await service.transitionAction(testOrgId, action._id, {
      status: 'open',
      notes: 'Reopening due to recurring debit discrepancy',
    });
    expect(reopened.status).toBe('open');
  });

  it('strictly enforces mandatory non-empty dismissal reasons', async () => {
    const action = await BusinessActionModel.create({
      _id: `act_${crypto.randomUUID()}`,
      organizationId: testOrgId,
      actionType: 'verify_unusual_expense',
      category: 'cost_reduction',
      title: 'Verify Unusual Outflow',
      explanation: 'Explanation',
      priority: 'medium',
      priorityScore: 50,
      severity: 'medium',
      status: 'open',
      evidence: {},
      financialImpact: {
        currency: 'USD',
        potentialExposureMinor: 1000,
        estimatedAvoidableCostMinor: 1000,
        confirmedIssueMinor: 0,
        projectedCashFlowEffectMinor: 0,
        realizedSavingsMinor: 0,
      },
      evidenceQuality: 'adequate',
      recommendedSteps: [],
      ruleId: 'RULE_ACT_UNUSUAL_001',
      ruleVersion: 'v1.0.0',
      fingerprint: 'fp_test_dismissal',
    });

    // Omitted reason
    await expect(
      service.transitionAction(testOrgId, action._id, {
        status: 'dismissed',
      }),
    ).rejects.toThrow(AppError);

    // Empty whitespace reason
    await expect(
      service.transitionAction(testOrgId, action._id, {
        status: 'dismissed',
        reason: '   ',
      }),
    ).rejects.toThrow(AppError);

    // Valid non-empty reason
    const dismissed = await service.transitionAction(testOrgId, action._id, {
      status: 'dismissed',
      reason: 'Legitimate annual insurance premium authorized by store owner.',
    });
    expect(dismissed.status).toBe('dismissed');
    expect(dismissed.dismissalReason).toContain('insurance premium');
    expect(dismissed.dismissedAt).toBeDefined();
  });

  it('validates snooze deadlines and wakes up expired snoozed actions upon re-evaluation', async () => {
    await FinancialFindingModel.create({
      _id: 'find-rec-inc',
      organizationId: testOrgId,
      findingType: 'recurring_cost_increase',
      status: 'open',
      severity: 'high',
      title: 'Recurring Cost Increase',
      summary: 'Summary',
      primaryTransactionIds: ['tx-1'],
      relatedTransactionIds: [],
      estimatedAmountMinor: 1500,
      currency: 'USD',
      ruleId: 'RULE_REC_INC_001',
      ruleVersion: 'v1.0.0',
      detectedAt: new Date(),
      lastEvaluatedAt: new Date(),
      fingerprint: 'fp_test_snooze_find',
      evidence: { actualAmountMinor: 10000, amountDifferenceMinor: 1500, percentageChange: 15 },
    });

    await TransactionModel.create({
      _id: 'tx-snooze-1',
      organizationId: testOrgId,
      accountId: 'acc-1',
      importJobId: 'job-1',
      date: new Date(),
      amountMinor: 10000,
      amountDecimal: '100.00',
      currency: 'USD',
      direction: 'debit',
      description: 'SNOOZE SERVICE',
      fingerprint: 'fp_tx_snooze_1',
      reconciliationStatus: 'unreconciled',
    });

    await service.evaluateActions(testOrgId);
    const actions = await BusinessActionModel.find({ organizationId: testOrgId }).exec();
    expect(actions).toHaveLength(1);
    const action = actions[0]!;

    // 1. Past snooze date should be rejected
    await expect(
      service.transitionAction(testOrgId, action._id, {
        status: 'snoozed',
        snoozedUntil: new Date(Date.now() - 3600000).toISOString(),
      }),
    ).rejects.toThrow(AppError);

    // 2. Future snooze date accepted
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const snoozed = await service.transitionAction(testOrgId, action._id, {
      status: 'snoozed',
      snoozedUntil: futureDate,
    });
    expect(snoozed.status).toBe('snoozed');
    expect(snoozed.snoozedUntil).toBeDefined();

    // 3. Manually advance snooze date to past to test wakeup logic
    await BusinessActionModel.updateOne(
      { _id: action._id },
      { snoozedUntil: new Date(Date.now() - 1000) },
    );

    // Re-evaluate: expired snooze should wake up to 'open'
    await service.evaluateActions(testOrgId);
    const refreshed = await service.getActionById(testOrgId, action._id);
    expect(refreshed.status).toBe('open');
    expect(refreshed.snoozedUntil).toBeNull();
  });

  it('marks actions superseded when their underlying evidence is resolved or deleted', async () => {
    // Action created with fingerprint 'fp_old_evidence'
    const action = await BusinessActionModel.create({
      _id: `act_${crypto.randomUUID()}`,
      organizationId: testOrgId,
      actionType: 'review_duplicate_payment',
      category: 'cost_reduction',
      title: 'Review Duplication',
      explanation: 'Explanation',
      priority: 'high',
      priorityScore: 70,
      severity: 'high',
      status: 'open',
      evidence: {},
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
      fingerprint: 'fp_old_evidence',
    });

    // Run evaluation with zero findings in DB: old open action should become superseded!
    const summary = await service.evaluateActions(testOrgId);
    expect(summary.supersededCount).toBe(1);

    const updated = await service.getActionById(testOrgId, action._id);
    expect(updated.status).toBe('superseded');

    // Check history trail
    const history = await service.getActionHistory(testOrgId, action._id);
    const lastEvent = history[history.length - 1]!;
    expect(lastEvent.eventType).toBe('superseded');
    expect(lastEvent.nextStatus).toBe('superseded');
  });
});
