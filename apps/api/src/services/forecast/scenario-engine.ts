import type {
  ScenarioAssumptions,
  ScenarioCalculationResult,
  ScenarioComparisonPoint,
  SupportedCurrency,
} from '@moneylens/shared';
import type { ForecastEngineResult } from './engine.interface.js';
import { CashFlowRiskEngine } from './risk-engine.js';

export class CashFlowScenarioEngine {
  /**
   * Deterministically calculates hypothetical scenario impact against a baseline forecast.
   * Guaranteed financial safety: does not modify baseline forecast or actual ledger transactions.
   */
  public static simulate(
    baseline: ForecastEngineResult,
    assumptions: ScenarioAssumptions,
    scenarioId = 'adhoc',
    scenarioName = 'Hypothetical Scenario',
  ): ScenarioCalculationResult {
    const {
      currency,
      horizonDays,
      hasReliableOpeningBalance,
      openingBalanceMinor,
      points: baselinePoints,
    } = baseline;

    const adjustmentsApplied: string[] = [];

    // 1. Prepare adjustment mappings
    if (assumptions.revenueChangePercent !== 0) {
      adjustmentsApplied.push(
        `Revenue adjusted by ${assumptions.revenueChangePercent > 0 ? '+' : ''}${
          assumptions.revenueChangePercent
        }% across projection horizon.`,
      );
    }

    if (assumptions.expenseChangePercent !== 0) {
      adjustmentsApplied.push(
        `Operating expenses adjusted by ${assumptions.expenseChangePercent > 0 ? '+' : ''}${
          assumptions.expenseChangePercent
        }% across projection horizon.`,
      );
    }

    const cancelledFindingIds = new Set<string>();
    const modifiedFindingAmounts = new Map<string, number>();

    for (const adj of assumptions.recurringAdjustments || []) {
      if (adj.action === 'cancel') {
        cancelledFindingIds.add(adj.findingId);
        adjustmentsApplied.push(`Cancelled recurring subscription: ${adj.merchant}.`);
      } else if (adj.action === 'modify') {
        modifiedFindingAmounts.set(adj.findingId, adj.amountAdjustmentMinor);
        adjustmentsApplied.push(
          `Modified recurring obligation: ${adj.merchant} by ${
            adj.amountAdjustmentMinor > 0 ? '+' : ''
          }${currency} ${(adj.amountAdjustmentMinor / 100).toFixed(2)}.`,
        );
      }
    }

    // Map one-time events by date YYYY-MM-DD
    const oneTimeByDate = new Map<
      string,
      Array<{ name: string; amountMinor: number; direction: 'inflow' | 'outflow' }>
    >();

    for (const event of assumptions.oneTimeEvents || []) {
      const list = oneTimeByDate.get(event.date) || [];
      list.push({
        name: event.name,
        amountMinor: event.amountMinor,
        direction: event.direction,
      });
      oneTimeByDate.set(event.date, list);
      adjustmentsApplied.push(
        `One-time ${event.direction}: "${event.name}" (${currency} ${(
          event.amountMinor / 100
        ).toFixed(2)}) scheduled on ${event.date}.`,
      );
    }

    if (adjustmentsApplied.length === 0) {
      adjustmentsApplied.push('No adjustments applied (identical to baseline projection).');
    }

    // 2. Build comparison timeline
    const comparisonPoints: ScenarioComparisonPoint[] = [];
    let scenarioRunningBalance: number | null = hasReliableOpeningBalance
      ? openingBalanceMinor
      : null;

    let scenarioTotalInflows = 0;
    let scenarioTotalOutflows = 0;
    let scenarioLowestBalance: number | null = scenarioRunningBalance;
    let scenarioLowestDate: string | null = baselinePoints[0]?.date || null;

    for (const bPoint of baselinePoints) {
      // Apply revenue percentage change
      const revMultiplier = 1 + assumptions.revenueChangePercent / 100;
      let adjInflow = Math.round(bPoint.projectedInflowMinor * revMultiplier);

      // Separate baseline recurring vs non-recurring outflow
      const recurringSum = bPoint.recurringExpenseBreakdown.reduce(
        (sum, item) => sum + item.amountMinor,
        0,
      );
      const nonRecurringBase = Math.max(0, bPoint.projectedOutflowMinor - recurringSum);

      // Apply expense percentage change to non-recurring operational base
      const expMultiplier = 1 + assumptions.expenseChangePercent / 100;
      let adjNonRecurringOutflow = Math.round(nonRecurringBase * expMultiplier);

      // Adjust recurring items
      let adjRecurringSum = 0;
      for (const recItem of bPoint.recurringExpenseBreakdown) {
        if (cancelledFindingIds.has(recItem.findingId)) {
          // Cancelled: omitted
          continue;
        }
        const delta = modifiedFindingAmounts.get(recItem.findingId) || 0;
        adjRecurringSum += Math.max(0, recItem.amountMinor + delta);
      }

      // Add one-time events for this date
      const eventsForDate = oneTimeByDate.get(bPoint.date) || [];
      for (const ev of eventsForDate) {
        if (ev.direction === 'inflow') {
          adjInflow += ev.amountMinor;
        } else {
          adjNonRecurringOutflow += ev.amountMinor;
        }
      }

      const scenarioOutflow = adjNonRecurringOutflow + adjRecurringSum;
      const scenarioNet = adjInflow - scenarioOutflow;

      scenarioTotalInflows += adjInflow;
      scenarioTotalOutflows += scenarioOutflow;

      if (scenarioRunningBalance !== null) {
        scenarioRunningBalance += scenarioNet;
        if (scenarioLowestBalance === null || scenarioRunningBalance < scenarioLowestBalance) {
          scenarioLowestBalance = scenarioRunningBalance;
          scenarioLowestDate = bPoint.date;
        }
      }

      comparisonPoints.push({
        date: bPoint.date,
        baselineInflowMinor: bPoint.projectedInflowMinor,
        baselineOutflowMinor: bPoint.projectedOutflowMinor,
        baselineNetMinor: bPoint.projectedNetMinor,
        scenarioInflowMinor: adjInflow,
        scenarioOutflowMinor: scenarioOutflow,
        scenarioNetMinor: scenarioNet,
        baselineBalanceMinor: bPoint.estimatedBalanceMinor,
        scenarioBalanceMinor: scenarioRunningBalance,
        netDifferenceMinor: scenarioNet - bPoint.projectedNetMinor,
      });
    }

    const scenarioExpectedNetMinor = scenarioTotalInflows - scenarioTotalOutflows;
    const scenarioClosingBalanceMinor = scenarioRunningBalance;

    // 3. Evaluate risk for scenario
    const scenarioRisk = CashFlowRiskEngine.evaluateRisk({
      currency: currency as SupportedCurrency,
      horizonDays,
      dataQuality: baseline.dataQuality,
      hasReliableOpeningBalance,
      openingBalanceMinor,
      projectedInflowsMinor: scenarioTotalInflows,
      projectedOutflowsMinor: scenarioTotalOutflows,
      expectedNetMovementMinor: scenarioExpectedNetMinor,
      lowestProjectedBalanceMinor: scenarioLowestBalance,
      lowestBalanceDate: scenarioLowestDate,
    });

    return {
      scenarioId,
      scenarioName,
      currency,
      horizonDays,
      baselineSummary: {
        projectedInflowsMinor: baseline.projectedInflowsMinor,
        projectedOutflowsMinor: baseline.projectedOutflowsMinor,
        expectedNetMovementMinor: baseline.expectedNetMovementMinor,
        projectedClosingBalanceMinor: baseline.projectedClosingBalanceMinor,
        riskLevel: baseline.riskLevel,
      },
      scenarioSummary: {
        projectedInflowsMinor: scenarioTotalInflows,
        projectedOutflowsMinor: scenarioTotalOutflows,
        expectedNetMovementMinor: scenarioExpectedNetMinor,
        projectedClosingBalanceMinor: scenarioClosingBalanceMinor,
        inflowVarianceMinor: scenarioTotalInflows - baseline.projectedInflowsMinor,
        outflowVarianceMinor: scenarioTotalOutflows - baseline.projectedOutflowsMinor,
        netVarianceMinor: scenarioExpectedNetMinor - baseline.expectedNetMovementMinor,
        riskLevel: scenarioRisk.riskLevel,
        riskReason: scenarioRisk.riskReason,
      },
      points: comparisonPoints,
      adjustmentsApplied,
    };
  }
}
