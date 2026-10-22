import { describe, it, expect } from 'vitest';
import { CashFlowScenarioEngine } from '../src/services/forecast/scenario-engine.js';
import type { ForecastEngineResult } from '../src/services/forecast/engine.interface.js';

describe('CashFlowScenarioEngine Unit Suite', () => {
  const createMockBaseline = (): ForecastEngineResult => ({
    currency: 'USD',
    horizonDays: 3,
    startDate: '2026-03-16',
    endDate: '2026-03-18',
    hasReliableOpeningBalance: true,
    openingBalanceMinor: 100000, // $1,000.00
    openingBalanceEffectiveDate: '2026-03-15',
    projectedInflowsMinor: 30000, // $300.00 ($100/day)
    projectedOutflowsMinor: 15000, // $150.00 ($50/day)
    expectedNetMovementMinor: 15000,
    projectedClosingBalanceMinor: 115000,
    lowestProjectedBalanceMinor: 105000,
    lowestBalanceDate: '2026-03-16',
    riskLevel: 'low_risk',
    riskReason: 'Positive baseline trajectory',
    dataQuality: 'high',
    historicalDailyAvgInflowMinor: 10000,
    historicalDailyAvgOutflowMinor: 5000,
    recurringOutflowsCount: 1,
    recurringOutflowsTotalMinor: 2000,
    points: [
      {
        date: '2026-03-16',
        projectedInflowMinor: 10000,
        projectedOutflowMinor: 5000,
        projectedNetMinor: 5000,
        estimatedBalanceMinor: 105000,
        recurringExpenseBreakdown: [],
        isHistorical: false,
      },
      {
        date: '2026-03-17',
        projectedInflowMinor: 10000,
        projectedOutflowMinor: 7000, // $50 baseline + $20 recurring
        projectedNetMinor: 3000,
        estimatedBalanceMinor: 108000,
        recurringExpenseBreakdown: [
          {
            findingId: 'f-rec-1',
            merchant: 'DATADOG MONITORING',
            amountMinor: 2000,
          },
        ],
        isHistorical: false,
      },
      {
        date: '2026-03-18',
        projectedInflowMinor: 10000,
        projectedOutflowMinor: 3000,
        projectedNetMinor: 7000,
        estimatedBalanceMinor: 115000,
        recurringExpenseBreakdown: [],
        isHistorical: false,
      },
    ],
    assumptions: ['Baseline test'],
    limitations: ['Test limitations'],
  });

  it('accurately applies revenue reduction percentage without modifying baseline', () => {
    const baseline = createMockBaseline();
    const originalInflows = baseline.projectedInflowsMinor;

    const result = CashFlowScenarioEngine.simulate(
      baseline,
      {
        revenueChangePercent: -20, // 20% drop in revenue
        expenseChangePercent: 0,
        recurringAdjustments: [],
        oneTimeEvents: [],
      },
      'scen-1',
      '20% Revenue Slump',
    );

    // Baseline object remains untouched
    expect(baseline.projectedInflowsMinor).toBe(originalInflows);

    // Scenario inflows: 30,000 * 0.8 = 24,000
    expect(result.scenarioSummary.projectedInflowsMinor).toBe(24000);
    expect(result.scenarioSummary.inflowVarianceMinor).toBe(-6000);
    expect(result.adjustmentsApplied[0]).toContain('Revenue adjusted by -20%');
  });

  it('accurately applies expense increase percentage to non-recurring operational base', () => {
    const baseline = createMockBaseline();

    const result = CashFlowScenarioEngine.simulate(
      baseline,
      {
        revenueChangePercent: 0,
        expenseChangePercent: 10, // 10% inflation on operating base
        recurringAdjustments: [],
        oneTimeEvents: [],
      },
      'scen-2',
      '10% Expense Inflation',
    );

    // Baseline non-recurring outflow was (5,000 + 5,000 + 3,000) = 13,000
    // +10% is 14,300. Plus $2,000 recurring = 16,300 total scenario outflow
    // Baseline was 15,000. Outflow variance should be +1,300
    expect(result.scenarioSummary.outflowVarianceMinor).toBe(1300);
    expect(result.scenarioSummary.projectedOutflowsMinor).toBe(16300);
  });

  it('cancels scheduled recurring subscription and reflects cash savings', () => {
    const baseline = createMockBaseline();

    const result = CashFlowScenarioEngine.simulate(
      baseline,
      {
        revenueChangePercent: 0,
        expenseChangePercent: 0,
        recurringAdjustments: [
          {
            findingId: 'f-rec-1',
            merchant: 'DATADOG MONITORING',
            amountAdjustmentMinor: 0,
            action: 'cancel',
          },
        ],
        oneTimeEvents: [],
      },
      'scen-3',
      'Cancel Datadog',
    );

    // Day 2 had $2,000 Datadog subscription. With cancellation, outflow reduces by $2,000
    expect(result.scenarioSummary.outflowVarianceMinor).toBe(-2000);
    expect(result.scenarioSummary.netVarianceMinor).toBe(2000); // +$20.00 more cash
    expect(
      result.adjustmentsApplied.some((a) =>
        a.includes('Cancelled recurring subscription: DATADOG MONITORING'),
      ),
    ).toBe(true);
  });

  it('injects one-time inflow and outflow events on specified dates', () => {
    const baseline = createMockBaseline();

    const result = CashFlowScenarioEngine.simulate(
      baseline,
      {
        revenueChangePercent: 0,
        expenseChangePercent: 0,
        recurringAdjustments: [],
        oneTimeEvents: [
          {
            id: 'ev-1',
            name: 'Tax Credit Refund',
            date: '2026-03-16',
            amountMinor: 50000, // +$500.00
            direction: 'inflow',
          },
          {
            id: 'ev-2',
            name: 'Annual Server License',
            date: '2026-03-17',
            amountMinor: 25000, // -$250.00
            direction: 'outflow',
          },
        ],
      },
      'scen-4',
      'One-Time Events Test',
    );

    expect(result.scenarioSummary.inflowVarianceMinor).toBe(50000);
    expect(result.scenarioSummary.outflowVarianceMinor).toBe(25000);
    expect(result.scenarioSummary.netVarianceMinor).toBe(25000);

    // Point 0 (2026-03-16) receives the $500.00 inflow
    expect(result.points[0]?.scenarioInflowMinor).toBe(60000); // 10000 + 50000
    // Point 1 (2026-03-17) receives the $250.00 outflow
    expect(result.points[1]?.scenarioOutflowMinor).toBe(32000); // 7000 + 25000
  });

  it('re-evaluates risk dynamically under extreme stress testing', () => {
    const baseline = createMockBaseline(); // $1,000.00 starting balance

    // Massive one-time tax penalty $2,000.00 > $1,000.00 balance
    const result = CashFlowScenarioEngine.simulate(
      baseline,
      {
        revenueChangePercent: -50,
        expenseChangePercent: 50,
        recurringAdjustments: [],
        oneTimeEvents: [
          {
            id: 'ev-huge',
            name: 'Emergency Equipment Repair',
            date: '2026-03-17',
            amountMinor: 200000, // $2,000.00
            direction: 'outflow',
          },
        ],
      },
      'scen-stress',
      'Catastrophic Stress Test',
    );

    // Closing balance drops negative, risk elevates to high_risk
    expect(result.scenarioSummary.riskLevel).toBe('high_risk');
    expect(result.scenarioSummary.riskReason).toContain('Projected cash deficit');
  });
});
