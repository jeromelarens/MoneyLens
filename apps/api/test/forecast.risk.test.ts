import { describe, it, expect } from 'vitest';
import { CashFlowRiskEngine } from '../src/services/forecast/risk-engine.js';

describe('CashFlowRiskEngine Unit Suite', () => {
  it('returns insufficient_data when historical data quality is insufficient_history', () => {
    const res = CashFlowRiskEngine.evaluateRisk({
      currency: 'USD',
      horizonDays: 30,
      dataQuality: 'insufficient_history',
      hasReliableOpeningBalance: true,
      openingBalanceMinor: 100000,
      projectedInflowsMinor: 50000,
      projectedOutflowsMinor: 20000,
      expectedNetMovementMinor: 30000,
      lowestProjectedBalanceMinor: 100000,
      lowestBalanceDate: '2026-03-15',
    });

    expect(res.riskLevel).toBe('insufficient_data');
    expect(res.riskReason).toContain('Insufficient transaction history');
  });

  it('triggers high_risk when projected balance dips below 0 (cash deficit)', () => {
    const res = CashFlowRiskEngine.evaluateRisk({
      currency: 'USD',
      horizonDays: 30,
      dataQuality: 'high',
      hasReliableOpeningBalance: true,
      openingBalanceMinor: 50000, // $500.00
      projectedInflowsMinor: 20000, // +$200.00
      projectedOutflowsMinor: 90000, // -$900.00
      expectedNetMovementMinor: -70000,
      lowestProjectedBalanceMinor: -20000, // -$200.00 deficit
      lowestBalanceDate: '2026-03-25',
    });

    expect(res.riskLevel).toBe('high_risk');
    expect(res.riskReason).toContain('Projected cash deficit of USD 200.00');
    expect(res.riskReason).toContain('2026-03-25');
  });

  it('triggers moderate_risk when balance stays positive but dips below 20% buffer threshold', () => {
    const res = CashFlowRiskEngine.evaluateRisk({
      currency: 'USD',
      horizonDays: 30,
      dataQuality: 'high',
      hasReliableOpeningBalance: true,
      openingBalanceMinor: 100000, // $1,000.00
      projectedInflowsMinor: 50000,
      projectedOutflowsMinor: 85000,
      expectedNetMovementMinor: -35000,
      lowestProjectedBalanceMinor: 15000, // $150.00 (below 20% of $1,000.00)
      lowestBalanceDate: '2026-03-28',
    });

    expect(res.riskLevel).toBe('moderate_risk');
    expect(res.riskReason).toContain('falling below the recommended safety buffer');
  });

  it('returns low_risk when balance remains healthy throughout the horizon', () => {
    const res = CashFlowRiskEngine.evaluateRisk({
      currency: 'USD',
      horizonDays: 30,
      dataQuality: 'high',
      hasReliableOpeningBalance: true,
      openingBalanceMinor: 500000, // $5,000.00
      projectedInflowsMinor: 300000,
      projectedOutflowsMinor: 200000,
      expectedNetMovementMinor: 100000,
      lowestProjectedBalanceMinor: 500000,
      lowestBalanceDate: '2026-03-15',
    });

    expect(res.riskLevel).toBe('low_risk');
    expect(res.riskReason).toContain('remain positive and above safety thresholds');
  });

  it('evaluates cash flow pressure without opening balance: triggers moderate_risk on acute net burn', () => {
    const res = CashFlowRiskEngine.evaluateRisk({
      currency: 'USD',
      horizonDays: 30,
      dataQuality: 'high',
      hasReliableOpeningBalance: false,
      openingBalanceMinor: null,
      projectedInflowsMinor: 100000, // $1,000.00
      projectedOutflowsMinor: 150000, // $1,500.00 (deficit $500 > 25% of inflows)
      expectedNetMovementMinor: -50000,
      lowestProjectedBalanceMinor: null,
      lowestBalanceDate: null,
    });

    expect(res.riskLevel).toBe('moderate_risk');
    expect(res.riskReason).toContain('Negative net cash flow pressure');
    expect(res.riskReason).toContain(
      'Configure an opening bank balance to assess absolute insolvency risk',
    );
  });

  it('returns low_risk without opening balance when net cash movement is positive', () => {
    const res = CashFlowRiskEngine.evaluateRisk({
      currency: 'EUR',
      horizonDays: 60,
      dataQuality: 'adequate',
      hasReliableOpeningBalance: false,
      openingBalanceMinor: null,
      projectedInflowsMinor: 400000,
      projectedOutflowsMinor: 300000,
      expectedNetMovementMinor: 100000, // +$1,000.00
      lowestProjectedBalanceMinor: null,
      lowestBalanceDate: null,
    });

    expect(res.riskLevel).toBe('low_risk');
    expect(res.riskReason).toContain('Projected net cash movement is positive (+EUR 1000.00)');
  });
});
