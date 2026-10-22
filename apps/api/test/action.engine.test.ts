import { describe, it, expect } from 'vitest';
import { ActionRecommendationEngine } from '../src/services/actions/recommendation-engine.js';
import {
  DuplicatePaymentActionRule,
  UnusualExpenseActionRule,
  RecurringCostIncreaseActionRule,
  CashFlowPressureActionRule,
  ReconciliationInconsistencyActionRule,
  MissingDataActionRule,
  RecurringExpenseReviewActionRule,
  SupplierPriceVarianceActionRule,
} from '../src/services/actions/rules/index.js';
import { calculateActionPriority } from '../src/services/actions/scoring.js';
import { generateActionFingerprint } from '../src/services/actions/fingerprint.js';
import type { ActionRuleContext } from '../src/services/actions/rule.interface.js';
import type {
  IFinancialFinding,
  ICashFlowForecast,
  IForecastRun,
} from '../src/infrastructure/database/models/index.js';

function mockFinding(partial: Record<string, unknown>): IFinancialFinding {
  return partial as unknown as IFinancialFinding;
}

function mockForecast(partial: Record<string, unknown>): ICashFlowForecast {
  return partial as unknown as ICashFlowForecast;
}

function mockForecastRun(partial: Record<string, unknown>): IForecastRun {
  return partial as unknown as IForecastRun;
}

describe('Action Recommendation Engine & Rules Unit Suite', () => {
  const orgId = 'test-org-123';

  describe('Priority Scoring Algorithm', () => {
    it('calculates deterministic priority scores and categories accurately', () => {
      // Critical severity + high financial exposure + high quality + cash preservation
      const res1 = calculateActionPriority('critical', 'high', 'cash_preservation', {
        currency: 'USD',
        potentialExposureMinor: 150000,
        estimatedAvoidableCostMinor: 0,
        confirmedIssueMinor: 0,
        projectedCashFlowEffectMinor: -150000,
        realizedSavingsMinor: 0,
      });
      // 50 (critical) + 25 (>= $1k) + 15 (high) + 10 (cash_preservation) = 100
      expect(res1.priorityScore).toBe(100);
      expect(res1.priority).toBe('critical');

      // Low severity + low exposure + preliminary quality + vendor management
      const res2 = calculateActionPriority('low', 'preliminary', 'vendor_management', {
        currency: 'USD',
        potentialExposureMinor: 1000,
        estimatedAvoidableCostMinor: 0,
        confirmedIssueMinor: 0,
        projectedCashFlowEffectMinor: 0,
        realizedSavingsMinor: 0,
      });
      // 10 (low) + 3 (> 0) + 0 (preliminary) + 2 (vendor) = 15
      expect(res2.priorityScore).toBe(15);
      expect(res2.priority).toBe('low');
    });

    it('does not let unverified large exposure completely outrank well-supported critical issues', () => {
      const highQualityCritical = calculateActionPriority('critical', 'high', 'cost_reduction', {
        currency: 'USD',
        potentialExposureMinor: 1000,
        estimatedAvoidableCostMinor: 1000,
        confirmedIssueMinor: 0,
        projectedCashFlowEffectMinor: 0,
        realizedSavingsMinor: 0,
      });
      // 50 + 3 + 15 + 5 = 73

      const lowQualityLowSeverity = calculateActionPriority(
        'low',
        'preliminary',
        'vendor_management',
        {
          currency: 'USD',
          potentialExposureMinor: 500000,
          estimatedAvoidableCostMinor: 0,
          confirmedIssueMinor: 0,
          projectedCashFlowEffectMinor: 0,
          realizedSavingsMinor: 0,
        },
      );
      // 10 + 25 + 0 + 2 = 37

      expect(highQualityCritical.priorityScore).toBeGreaterThan(
        lowQualityLowSeverity.priorityScore,
      );
    });
  });

  describe('Stable Fingerprinting', () => {
    it('produces identical SHA-256 hashes for identical inputs regardless of finding ID ordering', () => {
      const fp1 = generateActionFingerprint({
        organizationId: orgId,
        ruleId: 'RULE_ACT_DUP_001',
        ruleVersion: 'v1.0.0',
        actionType: 'review_duplicate_payment',
        currency: 'USD',
        sourceFindingIds: ['finding-1', 'finding-2'],
      });

      const fp2 = generateActionFingerprint({
        organizationId: orgId,
        ruleId: 'RULE_ACT_DUP_001',
        ruleVersion: 'v1.0.0',
        actionType: 'review_duplicate_payment',
        currency: 'USD',
        sourceFindingIds: ['finding-2', 'finding-1'], // Reversed
      });

      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64);
    });
  });

  describe('Rule A: Potential Duplicate Payment', () => {
    const rule = new DuplicatePaymentActionRule();

    it('generates an action with proper evidence for active duplicate finding', () => {
      const context: ActionRuleContext = {
        organizationId: orgId,
        findings: [
          mockFinding({
            _id: 'find-dup-1',
            organizationId: orgId,
            findingType: 'potential_duplicate_payment',
            status: 'open',
            severity: 'high',
            title: 'Potential Duplicate Payment: Vendor XYZ ($150.00)',
            summary: 'Identical amount charged twice in 24 hours',
            primaryTransactionIds: ['tx-1'],
            relatedTransactionIds: ['tx-2'],
            estimatedAmountMinor: 15000,
            currency: 'USD',
            ruleId: 'RULE_DUP_001',
            ruleVersion: 'v1.0.0',
            detectedAt: new Date(),
            lastEvaluatedAt: new Date(),
            fingerprint: 'fp-dup-1',
            evidence: { primaryAmountMinor: 15000 },
          }),
        ],
        latestForecasts: [],
        latestForecastRun: null,
        transactionsCount: 10,
        accountsCount: 1,
      };

      const candidates = rule.evaluate(context);
      expect(candidates).toHaveLength(1);
      const cand = candidates[0]!;
      expect(cand.actionType).toBe('review_duplicate_payment');
      expect(cand.category).toBe('cost_reduction');
      expect(cand.currency).toBe('USD');
      expect(cand.financialImpact.potentialExposureMinor).toBe(15000);
      expect(cand.financialImpact.confirmedIssueMinor).toBe(0); // Not claimed as confirmed loss
      expect(cand.recommendedSteps.length).toBeGreaterThanOrEqual(2);
    });

    it('ignores dismissed duplicate payment findings', () => {
      const context: ActionRuleContext = {
        organizationId: orgId,
        findings: [
          mockFinding({
            _id: 'find-dup-2',
            findingType: 'potential_duplicate_payment',
            status: 'dismissed',
            estimatedAmountMinor: 15000,
            currency: 'USD',
          }),
        ],
        latestForecasts: [],
        latestForecastRun: null,
        transactionsCount: 10,
        accountsCount: 1,
      };

      expect(rule.evaluate(context)).toHaveLength(0);
    });
  });

  describe('Rule B: Unusual Expense', () => {
    const rule = new UnusualExpenseActionRule();

    it('surfaces variance and includes baseline limitation notes', () => {
      const context: ActionRuleContext = {
        organizationId: orgId,
        findings: [
          mockFinding({
            _id: 'find-unusual-1',
            findingType: 'unusual_expense',
            status: 'open',
            severity: 'medium',
            title: 'Unusual Expense: Tech Supplies ($450.00)',
            summary: 'Charge is 300% of median baseline',
            primaryTransactionIds: ['tx-10'],
            relatedTransactionIds: [],
            estimatedAmountMinor: 30000,
            currency: 'EUR',
            fingerprint: 'fp-unusual-1',
            detectedAt: new Date(),
            evidence: {
              actualAmountMinor: 45000,
              amountDifferenceMinor: 30000,
              historicalMedianMinor: 15000,
              historicalObservationsCount: 4, // Limited sample
              percentageChange: 200,
            },
          }),
        ],
        latestForecasts: [],
        latestForecastRun: null,
        transactionsCount: 20,
        accountsCount: 1,
      };

      const candidates = rule.evaluate(context);
      expect(candidates).toHaveLength(1);
      const cand = candidates[0]!;
      expect(cand.currency).toBe('EUR');
      expect(cand.financialImpact.potentialExposureMinor).toBe(30000);
      expect(cand.explanation).toContain('limited sample');
      expect(cand.explanation).toContain('does not inherently indicate an error');
    });
  });

  describe('Rule C: Recurring Cost Increase', () => {
    const rule = new RecurringCostIncreaseActionRule();

    it('calculates marginal increase without labeling full recurring amount as avoidable cost', () => {
      const context: ActionRuleContext = {
        organizationId: orgId,
        findings: [
          mockFinding({
            _id: 'find-cost-inc-1',
            findingType: 'recurring_cost_increase',
            status: 'open',
            severity: 'medium',
            title: 'Recurring Cost Increase: SaaS Vendor (+25%)',
            summary: 'Charge increased from $80.00 to $100.00',
            primaryTransactionIds: ['tx-latest'],
            relatedTransactionIds: ['tx-b1', 'tx-b2', 'tx-b3'],
            estimatedAmountMinor: 2000,
            currency: 'USD',
            fingerprint: 'fp-rec-inc-1',
            detectedAt: new Date(),
            evidence: {
              actualAmountMinor: 10000,
              amountDifferenceMinor: 2000,
              percentageChange: 25,
            },
          }),
        ],
        latestForecasts: [],
        latestForecastRun: null,
        transactionsCount: 30,
        accountsCount: 1,
      };

      const candidates = rule.evaluate(context);
      expect(candidates).toHaveLength(1);
      const cand = candidates[0]!;
      // Potential exposure and avoidable cost are the marginal $20.00, NOT the whole $100.00!
      expect(cand.financialImpact.estimatedAvoidableCostMinor).toBe(2000);
      expect(cand.financialImpact.potentialExposureMinor).toBe(2000);
      expect(cand.financialImpact.confirmedIssueMinor).toBe(0);
    });
  });

  describe('Rule D: Cash-Flow Pressure', () => {
    const rule = new CashFlowPressureActionRule();

    it('discusses projected net movement rather than absolute liquidity when opening balance is absent', () => {
      const context: ActionRuleContext = {
        organizationId: orgId,
        findings: [],
        latestForecasts: [
          mockForecast({
            _id: 'fc-1',
            organizationId: orgId,
            forecastRunId: 'run-1',
            currency: 'GBP',
            horizonDays: 30,
            hasReliableOpeningBalance: false,
            projectedInflowsMinor: 200000,
            projectedOutflowsMinor: 350000,
            expectedNetMovementMinor: -150000,
            riskLevel: 'moderate_risk',
            riskReason: 'Projected net outflow exceeds projected inflows',
            dataQuality: 'adequate',
            limitations: ['Opening balance unavailable; showing relative net movement.'],
          }),
        ],
        latestForecastRun: mockForecastRun({ _id: 'run-1' }),
        transactionsCount: 50,
        accountsCount: 1,
      };

      const candidates = rule.evaluate(context);
      expect(candidates).toHaveLength(1);
      const cand = candidates[0]!;
      expect(cand.actionType).toBe('mitigate_cash_flow_pressure');
      expect(cand.currency).toBe('GBP');
      expect(cand.financialImpact.projectedCashFlowEffectMinor).toBe(-150000);
      expect(cand.explanation).toContain('Absolute cash balance cannot be verified');
    });

    it('surfaces shortfall date when opening balance exists and lowest balance is negative', () => {
      const context: ActionRuleContext = {
        organizationId: orgId,
        findings: [],
        latestForecasts: [
          mockForecast({
            _id: 'fc-2',
            organizationId: orgId,
            forecastRunId: 'run-2',
            currency: 'USD',
            horizonDays: 60,
            hasReliableOpeningBalance: true,
            openingBalanceMinor: 50000,
            projectedInflowsMinor: 100000,
            projectedOutflowsMinor: 200000,
            expectedNetMovementMinor: -100000,
            lowestProjectedBalanceMinor: -50000,
            lowestBalanceDate: '2026-11-15',
            riskLevel: 'high_risk',
            riskReason: 'Projected deficit below zero',
            dataQuality: 'high',
            limitations: [],
          }),
        ],
        latestForecastRun: mockForecastRun({ _id: 'run-2' }),
        transactionsCount: 100,
        accountsCount: 1,
      };

      const candidates = rule.evaluate(context);
      expect(candidates).toHaveLength(1);
      const cand = candidates[0]!;
      expect(cand.severity).toBe('high');
      expect(cand.explanation).toContain('lowest estimated balance of USD -500.00 on 2026-11-15');
    });
  });

  describe('Rule E: Reconciliation Inconsistency', () => {
    const rule = new ReconciliationInconsistencyActionRule();

    it('generates an action without altering reconciliation state', () => {
      const context: ActionRuleContext = {
        organizationId: orgId,
        findings: [
          mockFinding({
            _id: 'find-recon-1',
            findingType: 'reconciliation_inconsistency',
            status: 'open',
            severity: 'high',
            title: 'Orphaned Reconciled Transaction: Tx-999',
            summary: 'Status marked reconciled without confirmed bipartite match record',
            primaryTransactionIds: ['tx-999'],
            relatedTransactionIds: [],
            estimatedAmountMinor: 12000,
            currency: 'USD',
            fingerprint: 'fp-recon-1',
            detectedAt: new Date(),
            evidence: { issueType: 'orphaned_reconciled_status' },
          }),
        ],
        latestForecasts: [],
        latestForecastRun: null,
        transactionsCount: 40,
        accountsCount: 2,
      };

      const candidates = rule.evaluate(context);
      expect(candidates).toHaveLength(1);
      const cand = candidates[0]!;
      expect(cand.actionType).toBe('resolve_reconciliation_inconsistency');
      expect(cand.category).toBe('data_integrity');
      expect(cand.explanation).toContain('without automated alterations');
    });
  });

  describe('Rule F: Missing Financial Data', () => {
    const rule = new MissingDataActionRule();

    it('identifies 0 transactions as material gap requiring statement import', () => {
      const context: ActionRuleContext = {
        organizationId: orgId,
        findings: [],
        latestForecasts: [],
        latestForecastRun: null,
        transactionsCount: 0,
        accountsCount: 1,
      };

      const candidates = rule.evaluate(context);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.title).toContain('Import Initial Bank Statement Data');
      expect(candidates[0]!.severity).toBe('critical');
    });

    it('identifies missing opening balance on cash flow forecast', () => {
      const context: ActionRuleContext = {
        organizationId: orgId,
        findings: [],
        latestForecasts: [
          mockForecast({
            _id: 'fc-usd',
            forecastRunId: 'run-10',
            currency: 'USD',
            hasReliableOpeningBalance: false,
            dataQuality: 'adequate',
          }),
        ],
        latestForecastRun: mockForecastRun({ _id: 'run-10' }),
        transactionsCount: 45,
        accountsCount: 1,
      };

      const candidates = rule.evaluate(context);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.title).toContain('Provide Opening Account Balance (USD)');
      expect(candidates[0]!.category).toBe('data_integrity');
    });
  });

  describe('Rule G: Recurring Expense Review & Deduplication', () => {
    const rule = new RecurringExpenseReviewActionRule();

    it('generates a subscription review action for recurring finding', () => {
      const context: ActionRuleContext = {
        organizationId: orgId,
        findings: [
          mockFinding({
            _id: 'find-sub-1',
            findingType: 'recurring_expense',
            status: 'open',
            title: 'Recurring Expense: Cloud Hosting ($50.00)',
            estimatedAmountMinor: 5000,
            currency: 'USD',
            fingerprint: 'fp-sub-1',
            detectedAt: new Date(),
            evidence: {
              normalizedDescriptions: ['CLOUD HOSTING PROVIDER'],
              cadence: 'Monthly',
              averageAmountMinor: 5000,
              occurrencesCount: 5,
            },
          }),
        ],
        latestForecasts: [],
        latestForecastRun: null,
        transactionsCount: 50,
        accountsCount: 1,
      };

      const candidates = rule.evaluate(context);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.category).toBe('vendor_management');
      expect(candidates[0]!.financialImpact.estimatedAvoidableCostMinor).toBe(0); // Not confirmed avoidable until audited
      expect(candidates[0]!.financialImpact.potentialExposureMinor).toBe(5000);
    });

    it('skips generating duplicate action if vendor already has active recurring_cost_increase finding', () => {
      const context: ActionRuleContext = {
        organizationId: orgId,
        findings: [
          mockFinding({
            _id: 'find-cost-inc-saas',
            findingType: 'recurring_cost_increase',
            status: 'open',
            evidence: {
              normalizedDescriptions: ['ZOOM VIDEO COMM'],
            },
          }),
          mockFinding({
            _id: 'find-rec-saas',
            findingType: 'recurring_expense',
            status: 'open',
            evidence: {
              normalizedDescriptions: ['ZOOM VIDEO COMM'],
              cadence: 'Monthly',
              averageAmountMinor: 1500,
            },
          }),
        ],
        latestForecasts: [],
        latestForecastRun: null,
        transactionsCount: 50,
        accountsCount: 1,
      };

      const candidates = rule.evaluate(context);
      // Should be deduplicated against the cost increase finding
      expect(candidates).toHaveLength(0);
    });
  });

  describe('Rule H: Supplier Price Variance', () => {
    const rule = new SupplierPriceVarianceActionRule();

    it('generates recommendation when itemized SKU evidence exists', () => {
      const context: ActionRuleContext = {
        organizationId: orgId,
        findings: [
          mockFinding({
            _id: 'find-sup-1',
            findingType: 'supplier_price_variance',
            status: 'open',
            severity: 'medium',
            title: 'Supplier Price Variance: SKU COFFEE-BEAN-01',
            estimatedAmountMinor: 4000,
            currency: 'USD',
            fingerprint: 'fp-sup-1',
            detectedAt: new Date(),
            evidence: {
              sku: 'COFFEE-BEAN-01',
              higherUnitPriceMinor: 2400,
              lowerUnitPriceMinor: 2000,
              unitPriceDifferenceMinor: 400,
              variancePercent: 20,
            },
          }),
        ],
        latestForecasts: [],
        latestForecastRun: null,
        transactionsCount: 50,
        accountsCount: 1,
      };

      const candidates = rule.evaluate(context);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]!.title).toContain('SKU COFFEE-BEAN-01');
      expect(candidates[0]!.category).toBe('vendor_management');
      expect(candidates[0]!.financialImpact.potentialExposureMinor).toBe(4000);
    });

    it('safely skips if SKU or itemized evidence is absent without fabricating prices', () => {
      const context: ActionRuleContext = {
        organizationId: orgId,
        findings: [
          mockFinding({
            _id: 'find-sup-2',
            findingType: 'supplier_price_variance',
            status: 'open',
            evidence: {}, // Missing SKU
          }),
        ],
        latestForecasts: [],
        latestForecastRun: null,
        transactionsCount: 50,
        accountsCount: 1,
      };

      expect(rule.evaluate(context)).toHaveLength(0);
    });
  });

  describe('Full Engine Orchestration & Currency Segregation', () => {
    it('executes all registered rules without cross-currency contamination', () => {
      const engine = new ActionRecommendationEngine();
      expect(engine.getRules()).toHaveLength(8);

      const context: ActionRuleContext = {
        organizationId: orgId,
        findings: [
          mockFinding({
            _id: 'find-dup-usd',
            findingType: 'potential_duplicate_payment',
            status: 'open',
            severity: 'high',
            title: 'Duplicate Payment USD',
            estimatedAmountMinor: 10000,
            currency: 'USD',
            primaryTransactionIds: ['tx-1'],
            relatedTransactionIds: ['tx-2'],
            fingerprint: 'fp-dup-usd',
            detectedAt: new Date(),
            evidence: {},
          }),
          mockFinding({
            _id: 'find-unusual-eur',
            findingType: 'unusual_expense',
            status: 'open',
            severity: 'medium',
            title: 'Unusual Expense EUR',
            estimatedAmountMinor: 20000,
            currency: 'EUR',
            primaryTransactionIds: ['tx-3'],
            relatedTransactionIds: [],
            fingerprint: 'fp-unusual-eur',
            detectedAt: new Date(),
            evidence: {
              actualAmountMinor: 25000,
              amountDifferenceMinor: 20000,
              historicalMedianMinor: 5000,
              historicalObservationsCount: 8,
              percentageChange: 400,
            },
          }),
        ],
        latestForecasts: [],
        latestForecastRun: null,
        transactionsCount: 50,
        accountsCount: 2,
      };

      const candidates = engine.evaluate(context);
      expect(candidates.length).toBeGreaterThanOrEqual(2);

      const usdCandidates = candidates.filter((c) => c.currency === 'USD');
      const eurCandidates = candidates.filter((c) => c.currency === 'EUR');

      expect(usdCandidates.length).toBeGreaterThanOrEqual(1);
      expect(eurCandidates.length).toBeGreaterThanOrEqual(1);

      // Verify strict currency preservation
      for (const c of usdCandidates) {
        expect(c.financialImpact.currency).toBe('USD');
      }
      for (const c of eurCandidates) {
        expect(c.financialImpact.currency).toBe('EUR');
      }
    });
  });
});
