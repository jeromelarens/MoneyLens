import { describe, it, expect } from 'vitest';
import { ForecastEngine } from '../src/services/forecast/forecast-engine.js';
import type {
  ITransaction,
  IFinancialFinding,
} from '../src/infrastructure/database/models/index.js';

function createMockTx(overrides: Partial<ITransaction>): ITransaction {
  return {
    _id: overrides._id || `tx-${Math.random().toString(36).substring(7)}`,
    organizationId: overrides.organizationId || 'org-test-1',
    accountId: overrides.accountId || 'acc-1',
    importJobId: overrides.importJobId || 'job-1',
    date: overrides.date || new Date('2026-03-01T12:00:00.000Z'),
    description: overrides.description || 'SALES REVENUE',
    direction: overrides.direction || 'credit',
    amountMinor: overrides.amountMinor ?? 10000,
    amountDecimal: overrides.amountDecimal || '100.00',
    currency: overrides.currency || 'USD',
    fingerprint: overrides.fingerprint || `fp-${Math.random().toString(36).substring(7)}`,
    reconciliationStatus: overrides.reconciliationStatus || 'unreconciled',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ITransaction;
}

function createMockRecurringFinding(overrides: Partial<IFinancialFinding>): IFinancialFinding {
  return {
    _id: overrides._id || `finding-${Math.random().toString(36).substring(7)}`,
    organizationId: overrides.organizationId || 'org-test-1',
    findingType: overrides.findingType || 'recurring_expense',
    status: overrides.status || 'open',
    severity: overrides.severity || 'low',
    title: overrides.title || 'Recurring Expense: AWS CLOUD HOSTING',
    summary: overrides.summary || 'Monthly recurring expense',
    primaryTransactionIds: overrides.primaryTransactionIds || ['tx-rec-1'],
    relatedTransactionIds: overrides.relatedTransactionIds || [],
    currency: overrides.currency || 'USD',
    estimatedAmountMinor: overrides.estimatedAmountMinor ?? 0,
    evidence: {
      ruleId: 'RULE_REC_001',
      ruleVersion: 'v1.0.0',
      reason: 'Observed monthly charges',
      primaryTransactionIds: ['tx-rec-1'],
      relatedTransactionIds: [],
      transactionDates: ['2026-01-15T00:00:00.000Z', '2026-02-15T00:00:00.000Z'],
      amountsMinor: [5000, 5000],
      historicalComparisonPeriod: {
        baselineAmountMinor: 5000,
        cadenceDays: 30,
      },
      ...overrides.evidence,
    },
    fingerprint: overrides.fingerprint || `fp-finding-${Math.random().toString(36).substring(7)}`,
    ruleId: 'RULE_REC_001',
    ruleVersion: 'v1.0.0',
    detectedAt: new Date(),
    lastEvaluatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as IFinancialFinding;
}

describe('ForecastEngine Unit Suite', () => {
  const baseDate = new Date('2026-03-15T00:00:00.000Z');

  it('aggregates daily inflows and outflows using exact integer minor units', () => {
    // Generate 30 days of consistent historical transactions
    const txs: ITransaction[] = [];
    for (let i = 1; i <= 30; i++) {
      const d = new Date(baseDate.getTime() - i * 86400000);
      txs.push(
        createMockTx({
          date: d,
          direction: 'credit',
          amountMinor: 20000, // $200.00 revenue/day
          currency: 'USD',
        }),
      );
      txs.push(
        createMockTx({
          date: d,
          direction: 'debit',
          amountMinor: 8000, // $80.00 expense/day
          currency: 'USD',
        }),
      );
    }

    const result = ForecastEngine.calculateForecast({
      organizationId: 'org-test-1',
      currency: 'USD',
      horizonDays: 30,
      forecastStartDate: baseDate,
      historyWindowDays: 60,
      transactions: txs,
      recurringFindings: [],
    });

    expect(result.currency).toBe('USD');
    expect(result.horizonDays).toBe(30);
    expect(result.points).toHaveLength(30);
    expect(result.historicalDailyAvgInflowMinor).toBe(20000);
    expect(result.historicalDailyAvgOutflowMinor).toBe(8000);
    expect(result.projectedInflowsMinor).toBe(600000); // 30 * $200.00 = $6,000.00
    expect(result.projectedOutflowsMinor).toBe(240000); // 30 * $80.00 = $2,400.00
    expect(result.expectedNetMovementMinor).toBe(360000); // +$3,600.00 net
  });

  it('strictly isolates currencies and ignores transactions in other currencies', () => {
    const txs: ITransaction[] = [
      createMockTx({ currency: 'USD', amountMinor: 10000, direction: 'credit' }),
      createMockTx({ currency: 'EUR', amountMinor: 9999999, direction: 'credit' }),
      createMockTx({ currency: 'INR', amountMinor: 8888888, direction: 'credit' }),
    ];

    const result = ForecastEngine.calculateForecast({
      organizationId: 'org-test-1',
      currency: 'USD',
      horizonDays: 7,
      forecastStartDate: baseDate,
      historyWindowDays: 30,
      transactions: txs,
      recurringFindings: [],
    });

    expect(result.currency).toBe('USD');
    // None of the EUR or INR amounts leaked into the USD projection
    expect(result.projectedInflowsMinor).toBeLessThan(100000);
  });

  it('incorporates active recurring findings with explicit scheduled due dates', () => {
    // 30 days of history
    const txs: ITransaction[] = [];
    for (let i = 1; i <= 30; i++) {
      txs.push(
        createMockTx({
          date: new Date(baseDate.getTime() - i * 86400000),
          direction: 'credit',
          amountMinor: 10000,
        }),
      );
    }

    // Monthly recurring bill of $120.00 due ~every 30 days
    const recurringFinding = createMockRecurringFinding({
      title: 'Recurring Expense: SHOPIFY SUBSCRIPTION',
      findingType: 'recurring_expense',
      status: 'open',
      evidence: {
        ruleId: 'RULE_REC_001',
        ruleVersion: 'v1.0.0',
        reason: 'Monthly charge',
        primaryTransactionIds: ['tx-1'],
        relatedTransactionIds: [],
        transactionDates: ['2026-02-18T00:00:00.000Z'],
        amountsMinor: [12000],
        historicalComparisonPeriod: {
          baselineAmountMinor: 12000,
          cadenceDays: 30,
        },
      },
    });

    const result = ForecastEngine.calculateForecast({
      organizationId: 'org-test-1',
      currency: 'USD',
      horizonDays: 30,
      forecastStartDate: baseDate,
      historyWindowDays: 60,
      transactions: txs,
      recurringFindings: [recurringFinding],
    });

    expect(result.recurringOutflowsCount).toBe(1);
    expect(result.recurringOutflowsTotalMinor).toBe(12000);

    // Verify scheduled item is tagged in points
    const scheduledPoint = result.points.find((p) => p.recurringExpenseBreakdown.length > 0);
    expect(scheduledPoint).toBeDefined();
    expect(scheduledPoint?.recurringExpenseBreakdown[0]?.merchant).toContain(
      'SHOPIFY SUBSCRIPTION',
    );
    expect(scheduledPoint?.recurringExpenseBreakdown[0]?.amountMinor).toBe(12000);
  });

  it('excludes dismissed recurring findings from active forecast assumptions', () => {
    const txs = [createMockTx({ date: new Date('2026-03-01T00:00:00.000Z') })];

    const dismissedFinding = createMockRecurringFinding({
      status: 'dismissed',
      title: 'Recurring Expense: CANCELLED SAAS TOOL',
      dismissalReason: 'Cancelled subscription with vendor',
    });

    const result = ForecastEngine.calculateForecast({
      organizationId: 'org-test-1',
      currency: 'USD',
      horizonDays: 30,
      forecastStartDate: baseDate,
      historyWindowDays: 60,
      transactions: txs,
      recurringFindings: [dismissedFinding],
    });

    expect(result.recurringOutflowsCount).toBe(0);
    expect(result.recurringOutflowsTotalMinor).toBe(0);
  });

  it('prioritizes recurring_cost_increase over base recurring_expense without double-counting', () => {
    const baseFinding = createMockRecurringFinding({
      title: 'Recurring Expense: ACME STORAGE',
      findingType: 'recurring_expense',
      evidence: {
        ruleId: 'RULE_REC_001',
        ruleVersion: 'v1.0.0',
        reason: 'Monthly storage',
        primaryTransactionIds: ['tx-1'],
        amountsMinor: [10000],
        historicalComparisonPeriod: {
          baselineAmountMinor: 10000,
          cadenceDays: 30,
        },
      },
    });

    const costIncreaseFinding = createMockRecurringFinding({
      title: 'Recurring Cost Increase: ACME STORAGE (+20%)',
      findingType: 'recurring_cost_increase',
      evidence: {
        ruleId: 'RULE_REC_INC_001',
        ruleVersion: 'v1.0.0',
        reason: 'Price increased from $100 to $120',
        primaryTransactionIds: ['tx-2'],
        amountsMinor: [12000],
        actualAmountMinor: 12000,
        historicalComparisonPeriod: {
          baselineAmountMinor: 10000,
          cadenceDays: 30,
        },
      },
    });

    const scheduled = ForecastEngine.extractScheduledRecurring(
      [baseFinding, costIncreaseFinding],
      'USD',
    );

    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.amountMinor).toBe(12000); // Uses increased amount $120.00, not $100.00 + $120.00
  });

  it('correctly tracks balance trajectory when a reliable opening balance is provided', () => {
    const txs: ITransaction[] = [];
    for (let i = 1; i <= 15; i++) {
      txs.push(
        createMockTx({
          date: new Date(baseDate.getTime() - i * 86400000),
          direction: 'credit',
          amountMinor: 10000, // +$100.00/day
        }),
      );
      txs.push(
        createMockTx({
          date: new Date(baseDate.getTime() - i * 86400000),
          direction: 'debit',
          amountMinor: 5000, // -$50.00/day
        }),
      );
    }

    const result = ForecastEngine.calculateForecast({
      organizationId: 'org-test-1',
      currency: 'USD',
      horizonDays: 7,
      forecastStartDate: baseDate,
      historyWindowDays: 15,
      transactions: txs,
      recurringFindings: [],
      openingBalance: {
        currency: 'USD',
        amountMinor: 50000, // $500.00 starting balance
        effectiveDate: '2026-03-15',
      },
    });

    expect(result.hasReliableOpeningBalance).toBe(true);
    expect(result.openingBalanceMinor).toBe(50000);
    expect(result.points[0]?.estimatedBalanceMinor).toBe(55000); // 50000 + (10000 - 5000)
    expect(result.projectedClosingBalanceMinor).toBe(50000 + 7 * 5000); // 85000 ($850.00)
  });

  it('sets balance fields to null when no opening balance is available and outputs net movement only', () => {
    const txs = [createMockTx({ amountMinor: 10000, direction: 'credit' })];

    const result = ForecastEngine.calculateForecast({
      organizationId: 'org-test-1',
      currency: 'USD',
      horizonDays: 30,
      forecastStartDate: baseDate,
      historyWindowDays: 30,
      transactions: txs,
      recurringFindings: [],
      // openingBalance omitted!
    });

    expect(result.hasReliableOpeningBalance).toBe(false);
    expect(result.openingBalanceMinor).toBeNull();
    expect(result.projectedClosingBalanceMinor).toBeNull();
    expect(result.lowestProjectedBalanceMinor).toBeNull();
    expect(result.points.every((p) => p.estimatedBalanceMinor === null)).toBe(true);
    expect(result.limitations.some((l) => l.includes('opening bank balance'))).toBe(true);
  });

  it('marks dataQuality as insufficient_history when active history is sparse (< 14 days)', () => {
    // Only 2 transactions
    const txs = [
      createMockTx({ date: new Date('2026-03-10T00:00:00.000Z') }),
      createMockTx({ date: new Date('2026-03-11T00:00:00.000Z') }),
    ];

    const result = ForecastEngine.calculateForecast({
      organizationId: 'org-test-1',
      currency: 'USD',
      horizonDays: 30,
      forecastStartDate: baseDate,
      historyWindowDays: 30,
      transactions: txs,
      recurringFindings: [],
    });

    expect(result.dataQuality).toBe('insufficient_history');
    expect(result.riskLevel).toBe('insufficient_data');
  });

  it('produces identical outputs for identical inputs (determinism)', () => {
    const txs = [
      createMockTx({ date: new Date('2026-03-01T00:00:00.000Z'), amountMinor: 15000 }),
      createMockTx({ date: new Date('2026-03-05T00:00:00.000Z'), amountMinor: 25000 }),
    ];

    const input = {
      organizationId: 'org-test-1',
      currency: 'USD' as const,
      horizonDays: 30,
      forecastStartDate: baseDate,
      historyWindowDays: 60,
      transactions: txs,
      recurringFindings: [],
    };

    const res1 = ForecastEngine.calculateForecast(input);
    const res2 = ForecastEngine.calculateForecast(input);

    expect(res1.projectedInflowsMinor).toBe(res2.projectedInflowsMinor);
    expect(res1.projectedOutflowsMinor).toBe(res2.projectedOutflowsMinor);
    expect(res1.expectedNetMovementMinor).toBe(res2.expectedNetMovementMinor);
    expect(res1.points).toEqual(res2.points);
  });
});
