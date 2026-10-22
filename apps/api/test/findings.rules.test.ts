import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  DuplicatePaymentRule,
  UnusualExpenseRule,
  RecurringExpenseRule,
  RecurringCostIncreaseRule,
  SupplierPriceVarianceRule,
  ReconciliationInconsistencyRule,
  createDefaultDetectionRules,
} from '../src/services/findings/rules/index.js';
import { generateFindingFingerprint } from '../src/services/findings/fingerprint.js';
import type { ITransaction } from '../src/infrastructure/database/models/index.js';
import { ReconciliationMatchModel } from '../src/infrastructure/database/models/index.js';
import { connectDatabase, disconnectDatabase } from '../src/infrastructure/database/mongo.js';

function createMockTransaction(overrides: Partial<ITransaction>): ITransaction {
  return {
    _id: overrides._id || `tx-${Math.random().toString(36).substring(7)}`,
    organizationId: overrides.organizationId || 'org-test-1',
    accountId: overrides.accountId || 'acc-1',
    importJobId: overrides.importJobId || 'job-1',
    date: overrides.date || new Date('2026-03-15T12:00:00.000Z'),
    description: overrides.description || 'OFFICE SUPPLIES CORP',
    direction: overrides.direction || 'debit',
    amountMinor: overrides.amountMinor ?? 5000,
    amountDecimal: overrides.amountDecimal || '50.00',
    currency: overrides.currency || 'USD',
    sourceReference: overrides.sourceReference || null,
    fingerprint: overrides.fingerprint || `fp-${Math.random()}`,
    reconciliationStatus: overrides.reconciliationStatus || 'unreconciled',
    rawSourceData: overrides.rawSourceData || null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ITransaction;
}

describe('Detection Rule Suite (Deterministic & Evidence-Backed)', () => {
  const orgId = 'org-test-findings';

  beforeAll(async () => {
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/moneylens_test');
  });

  afterAll(async () => {
    await ReconciliationMatchModel.deleteMany({ organizationId: orgId });
    await disconnectDatabase();
  });

  describe('Finding Fingerprint Stability', () => {
    it('generates identical fingerprints regardless of transaction array ordering', () => {
      const fp1 = generateFindingFingerprint({
        organizationId: orgId,
        ruleId: 'RULE_DUP_001',
        ruleVersion: 'v1.0.0',
        findingType: 'potential_duplicate_payment',
        currency: 'USD',
        transactionIds: ['tx-alpha', 'tx-beta'],
      });

      const fp2 = generateFindingFingerprint({
        organizationId: orgId,
        ruleId: 'RULE_DUP_001',
        ruleVersion: 'v1.0.0',
        findingType: 'potential_duplicate_payment',
        currency: 'USD',
        transactionIds: ['tx-beta', 'tx-alpha'],
      });

      expect(fp1).toBe(fp2);
    });

    it('generates different fingerprints for different currencies or organizations', () => {
      const fpUsd = generateFindingFingerprint({
        organizationId: orgId,
        ruleId: 'RULE_DUP_001',
        ruleVersion: 'v1.0.0',
        findingType: 'potential_duplicate_payment',
        currency: 'USD',
        transactionIds: ['tx-1', 'tx-2'],
      });

      const fpEur = generateFindingFingerprint({
        organizationId: orgId,
        ruleId: 'RULE_DUP_001',
        ruleVersion: 'v1.0.0',
        findingType: 'potential_duplicate_payment',
        currency: 'EUR',
        transactionIds: ['tx-1', 'tx-2'],
      });

      expect(fpUsd).not.toBe(fpEur);
    });
  });

  describe('Rule A: Potential Duplicate Payment Rule (RULE_DUP_001)', () => {
    const rule = new DuplicatePaymentRule();

    it('flags two debit transactions with same amount, close dates, and matching reference', async () => {
      const tx1 = createMockTransaction({
        _id: 'tx-1',
        date: new Date('2026-03-10T10:00:00.000Z'),
        amountMinor: 12500,
        amountDecimal: '125.00',
        sourceReference: 'INV-9082',
        description: 'ACME SUPPLIES INC',
      });
      const tx2 = createMockTransaction({
        _id: 'tx-2',
        date: new Date('2026-03-11T14:00:00.000Z'),
        amountMinor: 12500,
        amountDecimal: '125.00',
        sourceReference: 'INV-9082',
        description: 'ACME SUPPLIES CORP',
      });

      const findings = await rule.execute({
        organizationId: orgId,
        transactions: [tx1, tx2],
      });

      expect(findings).toHaveLength(1);
      const f = findings[0]!;
      expect(f.findingType).toBe('potential_duplicate_payment');
      expect(f.estimatedAmountMinor).toBe(12500);
      expect(f.severity).toBe('high');
      expect(f.evidence.dateDifferenceDays).toBe(1);
      expect(f.evidence.primaryTransactionIds).toContain('tx-1');
      expect(f.evidence.relatedTransactionIds).toContain('tx-2');
    });

    it('flags two debit transactions with high description similarity within date window', async () => {
      const tx1 = createMockTransaction({
        _id: 'tx-10',
        date: new Date('2026-03-01T10:00:00.000Z'),
        amountMinor: 4500,
        amountDecimal: '45.00',
        description: 'GOOGLE WORKSPACE CLOUD SERVICES',
      });
      const tx2 = createMockTransaction({
        _id: 'tx-11',
        date: new Date('2026-03-03T10:00:00.000Z'),
        amountMinor: 4500,
        amountDecimal: '45.00',
        description: 'GOOGLE WORKSPACE SERVICES BILLING',
      });

      const findings = await rule.execute({
        organizationId: orgId,
        transactions: [tx1, tx2],
      });

      expect(findings).toHaveLength(1);
      expect(findings[0]!.severity).toBe('medium');
    });

    it('does NOT flag transactions with matching amount but unrelated descriptions and no reference', async () => {
      const tx1 = createMockTransaction({
        _id: 'tx-20',
        date: new Date('2026-03-01T10:00:00.000Z'),
        amountMinor: 5000,
        description: 'SHELL OIL GAS STATION',
      });
      const tx2 = createMockTransaction({
        _id: 'tx-21',
        date: new Date('2026-03-02T10:00:00.000Z'),
        amountMinor: 5000,
        description: 'WHOLE FOODS MARKET GROCERY',
      });

      const findings = await rule.execute({
        organizationId: orgId,
        transactions: [tx1, tx2],
      });

      expect(findings).toHaveLength(0);
    });

    it('ignores placeholder references like NA, NULL, 000 as reliable duplicate proof', async () => {
      const tx1 = createMockTransaction({
        _id: 'tx-30',
        date: new Date('2026-03-01T10:00:00.000Z'),
        amountMinor: 5000,
        sourceReference: 'NULL',
        description: 'COFFEE SHOP DOWNTOWN',
      });
      const tx2 = createMockTransaction({
        _id: 'tx-31',
        date: new Date('2026-03-02T10:00:00.000Z'),
        amountMinor: 5000,
        sourceReference: 'NULL',
        description: 'HARDWARE STORE TOOLS',
      });

      const findings = await rule.execute({
        organizationId: orgId,
        transactions: [tx1, tx2],
      });

      expect(findings).toHaveLength(0);
    });

    it('does NOT flag when date difference exceeds the duplicate window', async () => {
      const tx1 = createMockTransaction({
        _id: 'tx-40',
        date: new Date('2026-01-01T10:00:00.000Z'),
        amountMinor: 5000,
        sourceReference: 'REF-123',
        description: 'SOFTWARE SUBSCRIPTION',
      });
      const tx2 = createMockTransaction({
        _id: 'tx-41',
        date: new Date('2026-02-01T10:00:00.000Z'), // 31 days later
        amountMinor: 5000,
        sourceReference: 'REF-123',
        description: 'SOFTWARE SUBSCRIPTION',
      });

      const findings = await rule.execute({
        organizationId: orgId,
        transactions: [tx1, tx2],
      });

      expect(findings).toHaveLength(0);
    });

    it('excludes credits from duplicate payment detection', async () => {
      const tx1 = createMockTransaction({
        _id: 'tx-50',
        direction: 'credit',
        amountMinor: 10000,
        description: 'CUSTOMER INVOICE PAYMENT',
      });
      const tx2 = createMockTransaction({
        _id: 'tx-51',
        direction: 'credit',
        amountMinor: 10000,
        description: 'CUSTOMER INVOICE PAYMENT',
      });

      const findings = await rule.execute({
        organizationId: orgId,
        transactions: [tx1, tx2],
      });

      expect(findings).toHaveLength(0);
    });
  });

  describe('Rule B: Unusual Expense Detection (RULE_UNUSUAL_001)', () => {
    const rule = new UnusualExpenseRule();

    it('flags a debit spike >= 250% of the historical median with at least 4 observations', async () => {
      const baseDates = ['2026-01-10', '2026-01-25', '2026-02-10'];
      const baselineTxs = baseDates.map((d, i) =>
        createMockTransaction({
          _id: `tx-base-${i}`,
          date: new Date(`${d}T10:00:00.000Z`),
          amountMinor: 1000, // $10.00 median
          amountDecimal: '10.00',
          description: 'CLOUD COMPUTING CLUSTER SERVICES',
        }),
      );

      const spikeTx = createMockTransaction({
        _id: 'tx-spike',
        date: new Date('2026-02-28T10:00:00.000Z'),
        amountMinor: 5000, // $50.00 (5.0x median, +$40.00)
        amountDecimal: '50.00',
        description: 'CLOUD COMPUTING CLUSTER SERVICES',
      });

      const findings = await rule.execute({
        organizationId: orgId,
        transactions: [...baselineTxs, spikeTx],
      });

      expect(findings).toHaveLength(1);
      const f = findings[0]!;
      expect(f.findingType).toBe('unusual_expense');
      expect(f.estimatedAmountMinor).toBe(4000); // 5000 - 1000
      expect(f.evidence.percentageChange).toBe(400);
      expect(f.evidence.historicalComparisonPeriod?.observationCount).toBe(3);
    });

    it('does NOT flag when there is insufficient historical data (fewer than 4 transactions total)', async () => {
      const tx1 = createMockTransaction({
        date: new Date('2026-01-10T10:00:00.000Z'),
        amountMinor: 1000,
        description: 'NEW ADVERTISING AGENCY',
      });
      const tx2 = createMockTransaction({
        date: new Date('2026-01-20T10:00:00.000Z'),
        amountMinor: 10000,
        description: 'NEW ADVERTISING AGENCY',
      });

      const findings = await rule.execute({
        organizationId: orgId,
        transactions: [tx1, tx2],
      });

      expect(findings).toHaveLength(0);
    });

    it('does NOT flag when absolute difference is below minimum variance threshold ($20.00)', async () => {
      const baseDates = ['2026-01-01', '2026-01-08', '2026-01-15'];
      const baselineTxs = baseDates.map((d, i) =>
        createMockTransaction({
          _id: `tx-base-${i}`,
          date: new Date(`${d}T10:00:00.000Z`),
          amountMinor: 200, // $2.00
          description: 'POSTAGE STAMPS SERVICE',
        }),
      );
      const targetTx = createMockTransaction({
        _id: 'tx-target',
        date: new Date('2026-01-22T10:00:00.000Z'),
        amountMinor: 600, // $6.00 (3.0x ratio, but diff is only $4.00 < $20.00 min threshold)
        description: 'POSTAGE STAMPS SERVICE',
      });

      const findings = await rule.execute({
        organizationId: orgId,
        transactions: [...baselineTxs, targetTx],
      });

      expect(findings).toHaveLength(0);
    });
  });

  describe('Rule C: Recurring Expense & Subscription Detection (RULE_REC_001)', () => {
    const rule = new RecurringExpenseRule();

    it('identifies monthly recurring subscription with stable amounts and cadence', async () => {
      const tx1 = createMockTransaction({
        _id: 'rec-1',
        date: new Date('2026-01-05T10:00:00.000Z'),
        amountMinor: 4900,
        description: 'GITHUB ENTERPRISE SEATS',
      });
      const tx2 = createMockTransaction({
        _id: 'rec-2',
        date: new Date('2026-02-05T10:00:00.000Z'),
        amountMinor: 4900,
        description: 'GITHUB ENTERPRISE SEATS',
      });
      const tx3 = createMockTransaction({
        _id: 'rec-3',
        date: new Date('2026-03-07T10:00:00.000Z'),
        amountMinor: 4900,
        description: 'GITHUB ENTERPRISE SEATS',
      });

      const findings = await rule.execute({
        organizationId: orgId,
        transactions: [tx1, tx2, tx3],
      });

      expect(findings).toHaveLength(1);
      const f = findings[0]!;
      expect(f.findingType).toBe('recurring_expense');
      expect(f.severity).toBe('low');
      expect(f.estimatedAmountMinor).toBe(0); // Zero avoidable loss - informational tracking
      expect(f.title).toContain('Monthly');
    });

    it('does NOT classify two transactions as a recurring subscription without sufficient history', async () => {
      const tx1 = createMockTransaction({
        date: new Date('2026-01-05T10:00:00.000Z'),
        amountMinor: 4900,
        description: 'ZOOM VIDEO COMMUNICATIONS',
      });
      const tx2 = createMockTransaction({
        date: new Date('2026-02-05T10:00:00.000Z'),
        amountMinor: 4900,
        description: 'ZOOM VIDEO COMMUNICATIONS',
      });

      const findings = await rule.execute({
        organizationId: orgId,
        transactions: [tx1, tx2],
      });

      expect(findings).toHaveLength(0);
    });
  });

  describe('Rule D: Recurring Cost Increase Detection (RULE_REC_INC_001)', () => {
    const rule = new RecurringCostIncreaseRule();

    it('identifies a recurring charge increase > 10% after 3 stable baseline occurrences', async () => {
      const baseDates = ['2026-01-01', '2026-02-01', '2026-03-01'];
      const baseline = baseDates.map((d, i) =>
        createMockTransaction({
          _id: `base-inc-${i}`,
          date: new Date(`${d}T10:00:00.000Z`),
          amountMinor: 10000, // $100.00 baseline
          description: 'DATADOG MONITORING SAAS',
        }),
      );

      const latestIncreasedTx = createMockTransaction({
        _id: 'latest-inc',
        date: new Date('2026-04-01T10:00:00.000Z'),
        amountMinor: 13500, // $135.00 (+35% increase, +$35.00)
        amountDecimal: '135.00',
        description: 'DATADOG MONITORING SAAS',
      });

      const findings = await rule.execute({
        organizationId: orgId,
        transactions: [...baseline, latestIncreasedTx],
      });

      expect(findings).toHaveLength(1);
      const f = findings[0]!;
      expect(f.findingType).toBe('recurring_cost_increase');
      expect(f.estimatedAmountMinor).toBe(3500); // $35.00 cost variance
      expect(f.severity).toBe('high');
      expect(f.evidence.percentageChange).toBe(35);
    });
  });

  describe('Rule E: Supplier Price Variance (RULE_SUP_VAR_001)', () => {
    const rule = new SupplierPriceVarianceRule();

    it('returns empty array when ledger entries lack line-item unit pricing or SKUs (no fabrication)', async () => {
      const tx1 = createMockTransaction({
        description: 'SUPPLIER WHOLESALE BEVERAGES',
        amountMinor: 50000,
        rawSourceData: null,
      });
      const tx2 = createMockTransaction({
        description: 'SUPPLIER WHOLESALE BEVERAGES',
        amountMinor: 65000,
        rawSourceData: null,
      });

      const findings = await rule.execute({
        organizationId: orgId,
        transactions: [tx1, tx2],
      });

      expect(findings).toHaveLength(0);
    });

    it('detects unit price variance when structured SKU and unit_price are provided in raw source data', async () => {
      const tx1 = createMockTransaction({
        _id: 'tx-sku-1',
        date: new Date('2026-01-10T10:00:00.000Z'),
        amountMinor: 10000,
        description: 'OFFICE PAPER CARTONS',
        rawSourceData: {
          sku: 'PAPER-A4',
          unit_price: '20.00',
          quantity: '5',
        },
      });

      const tx2 = createMockTransaction({
        _id: 'tx-sku-2',
        date: new Date('2026-02-10T10:00:00.000Z'),
        amountMinor: 13000,
        description: 'OFFICE PAPER CARTONS',
        rawSourceData: {
          sku: 'PAPER-A4',
          unit_price: '26.00', // +30% unit price increase
          quantity: '5',
        },
      });

      const findings = await rule.execute({
        organizationId: orgId,
        transactions: [tx1, tx2],
      });

      expect(findings).toHaveLength(1);
      const f = findings[0]!;
      expect(f.findingType).toBe('supplier_price_variance');
      expect(f.estimatedAmountMinor).toBe(3000); // ($6.00 unit increase * 5 units = $30.00)
    });
  });

  describe('Rule F: Reconciliation Inconsistency (RULE_REC_INCONSISTENT_001)', () => {
    const rule = new ReconciliationInconsistencyRule();

    it('detects orphaned reconciled status where ledger is reconciled but no match document exists', async () => {
      const orphanedTx = createMockTransaction({
        _id: 'orphaned-tx-99',
        amountMinor: 25000,
        amountDecimal: '250.00',
        reconciliationStatus: 'reconciled',
        description: 'SETTLEMENT PAYOUT',
      });

      const findings = await rule.execute({
        organizationId: orgId,
        transactions: [orphanedTx],
      });

      expect(findings).toHaveLength(1);
      const f = findings[0]!;
      expect(f.findingType).toBe('reconciliation_inconsistency');
      expect(f.severity).toBe('high');
      expect(f.title).toContain('Orphaned Reconciled Transaction');
      expect(f.estimatedAmountMinor).toBe(25000);
    });

    it('instantiates the complete default rule set with valid IDs and versions', () => {
      const rules = createDefaultDetectionRules();
      expect(rules).toHaveLength(6);
      const ruleIds = rules.map((r) => r.ruleId);
      expect(ruleIds).toContain('RULE_DUP_001');
      expect(ruleIds).toContain('RULE_UNUSUAL_001');
      expect(ruleIds).toContain('RULE_REC_001');
      expect(ruleIds).toContain('RULE_REC_INC_001');
      expect(ruleIds).toContain('RULE_SUP_VAR_001');
      expect(ruleIds).toContain('RULE_REC_INCONSISTENT_001');
    });
  });
});
