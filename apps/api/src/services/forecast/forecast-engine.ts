import type {
  CashFlowProjectionPoint,
  ForecastDataQuality,
  RecurringProjectionItem,
  SupportedCurrency,
} from '@moneylens/shared';
import type {
  ForecastEngineInput,
  ForecastEngineResult,
  ScheduledRecurringItem,
} from './engine.interface.js';
import { CashFlowRiskEngine } from './risk-engine.js';
import type { IFinancialFinding } from '../../infrastructure/database/models/index.js';

export class ForecastEngine {
  /**
   * Deterministically generates cash flow projection points, risk assessment, and explainability metadata.
   */
  public static calculateForecast(input: ForecastEngineInput): ForecastEngineResult {
    const {
      currency,
      horizonDays,
      forecastStartDate,
      historyWindowDays,
      transactions,
      recurringFindings,
      openingBalance,
    } = input;

    // 1. Filter and sort transactions strictly for this currency and organization
    const currencyTxs = transactions.filter(
      (tx) => tx.currency.toUpperCase() === currency.toUpperCase(),
    );

    // Calculate observation window cutoff
    const windowStart = new Date(forecastStartDate.getTime() - historyWindowDays * 86400000);
    const historicalTxs = currencyTxs
      .filter((tx) => {
        const txDate = new Date(tx.date);
        return txDate >= windowStart && txDate <= forecastStartDate;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 2. Assess historical data quality
    const uniqueDaysSet = new Set(
      historicalTxs.map((tx) => new Date(tx.date).toISOString().split('T')[0]),
    );
    const activeDaysCount = uniqueDaysSet.size;

    let dataQuality: ForecastDataQuality = 'high';
    if (activeDaysCount < 7 || historicalTxs.length < 5) {
      dataQuality = 'insufficient_history';
    } else if (activeDaysCount < 14) {
      dataQuality = 'sparse_history';
    } else if (activeDaysCount < 45) {
      dataQuality = 'adequate';
    } else {
      dataQuality = 'high';
    }

    // 3. Separate historical inflows and outflows, filtering extreme one-offs
    const creditAmounts: number[] = [];
    const debitAmounts: number[] = [];

    for (const tx of historicalTxs) {
      if (tx.direction === 'credit') {
        creditAmounts.push(tx.amountMinor);
      } else if (tx.direction === 'debit') {
        debitAmounts.push(tx.amountMinor);
      }
    }

    const effectiveDays = Math.max(activeDaysCount, Math.min(historyWindowDays, 30));

    // Calculate robust daily inflow (filter out extreme one-offs > 5x median)
    const medianCredit = ForecastEngine.calculateMedian(creditAmounts);
    const normalCredits = creditAmounts.filter((amt) => {
      if (medianCredit > 0 && amt > medianCredit * 5 && amt > 50000) return false;
      return true;
    });
    const totalCreditMinor = normalCredits.reduce((sum, amt) => sum + amt, 0);
    const historicalDailyAvgInflowMinor =
      dataQuality === 'insufficient_history'
        ? 0
        : Math.round(totalCreditMinor / Math.max(effectiveDays, 1));

    // Calculate robust daily non-recurring outflow
    const medianDebit = ForecastEngine.calculateMedian(debitAmounts);
    const normalDebits = debitAmounts.filter((amt) => {
      if (medianDebit > 0 && amt > medianDebit * 5 && amt > 50000) return false;
      return true;
    });
    const totalDebitMinor = normalDebits.reduce((sum, amt) => sum + amt, 0);
    const totalDailyOutflowMinor =
      dataQuality === 'insufficient_history'
        ? 0
        : Math.round(totalDebitMinor / Math.max(effectiveDays, 1));

    // 4. Extract and schedule Phase 4 active recurring obligations
    const scheduledRecurringList = ForecastEngine.extractScheduledRecurring(
      recurringFindings,
      currency,
    );

    // Compute recurring daily equivalent to prevent double-counting in daily baseline
    let recurringDailyEquivalentMinor = 0;
    for (const item of scheduledRecurringList) {
      if (item.cadenceDays > 0) {
        recurringDailyEquivalentMinor += Math.round(item.amountMinor / item.cadenceDays);
      }
    }

    const historicalDailyAvgOutflowMinor = Math.max(
      0,
      totalDailyOutflowMinor - recurringDailyEquivalentMinor,
    );

    // 5. Build future daily calendar and map scheduled recurring charges
    const startDateStr = new Date(forecastStartDate.getTime() + 86400000)
      .toISOString()
      .split('T')[0]!;
    const endDateStr = new Date(forecastStartDate.getTime() + horizonDays * 86400000)
      .toISOString()
      .split('T')[0]!;

    const recurringByDate = new Map<string, RecurringProjectionItem[]>();
    let totalScheduledRecurringOutflowMinor = 0;
    let scheduledRecurringCount = 0;

    for (const item of scheduledRecurringList) {
      const projectedDates = ForecastEngine.projectRecurringDates(
        item.lastDate,
        item.cadenceDays,
        forecastStartDate,
        horizonDays,
      );

      for (const pDate of projectedDates) {
        const list = recurringByDate.get(pDate) || [];
        list.push({
          findingId: item.findingId,
          merchant: item.merchant,
          amountMinor: item.amountMinor,
        });
        recurringByDate.set(pDate, list);
        totalScheduledRecurringOutflowMinor += item.amountMinor;
        scheduledRecurringCount++;
      }
    }

    // 6. Generate day-by-day projection points
    const points: CashFlowProjectionPoint[] = [];
    const hasReliableOpeningBalance =
      openingBalance !== undefined && openingBalance.amountMinor !== null;
    let runningBalance: number | null = hasReliableOpeningBalance
      ? openingBalance.amountMinor
      : null;

    let lowestProjectedBalanceMinor: number | null = runningBalance;
    let lowestBalanceDate: string | null = runningBalance !== null ? startDateStr : null;

    let totalProjectedInflowsMinor = 0;
    let totalProjectedOutflowsMinor = 0;

    for (let dayIdx = 1; dayIdx <= horizonDays; dayIdx++) {
      const currentDayDate = new Date(forecastStartDate.getTime() + dayIdx * 86400000);
      const dateStr = currentDayDate.toISOString().split('T')[0]!;

      // Daily inflow from normal run rate
      const dayInflow = historicalDailyAvgInflowMinor;

      // Daily outflow = operational non-recurring baseline + scheduled recurring items
      const dayRecurringItems = recurringByDate.get(dateStr) || [];
      const dayRecurringSum = dayRecurringItems.reduce((acc, item) => acc + item.amountMinor, 0);
      const dayOutflow = historicalDailyAvgOutflowMinor + dayRecurringSum;
      const dayNet = dayInflow - dayOutflow;

      totalProjectedInflowsMinor += dayInflow;
      totalProjectedOutflowsMinor += dayOutflow;

      if (runningBalance !== null) {
        runningBalance += dayNet;
        if (lowestProjectedBalanceMinor === null || runningBalance < lowestProjectedBalanceMinor) {
          lowestProjectedBalanceMinor = runningBalance;
          lowestBalanceDate = dateStr;
        }
      }

      points.push({
        date: dateStr,
        projectedInflowMinor: dayInflow,
        projectedOutflowMinor: dayOutflow,
        projectedNetMinor: dayNet,
        estimatedBalanceMinor: runningBalance,
        recurringExpenseBreakdown: dayRecurringItems,
        isHistorical: false,
      });
    }

    const expectedNetMovementMinor = totalProjectedInflowsMinor - totalProjectedOutflowsMinor;
    const projectedClosingBalanceMinor = runningBalance;

    // 7. Evaluate cash flow risk using risk engine
    const riskAssessment = CashFlowRiskEngine.evaluateRisk({
      currency,
      horizonDays,
      dataQuality,
      hasReliableOpeningBalance,
      openingBalanceMinor: hasReliableOpeningBalance ? openingBalance.amountMinor : null,
      projectedInflowsMinor: totalProjectedInflowsMinor,
      projectedOutflowsMinor: totalProjectedOutflowsMinor,
      expectedNetMovementMinor,
      lowestProjectedBalanceMinor,
      lowestBalanceDate,
    });

    // 8. Synthesize transparent explainability assumptions and limitations
    const assumptions: string[] = [
      `Baseline daily revenue estimated at ${currency} ${(
        historicalDailyAvgInflowMinor / 100
      ).toFixed(
        2,
      )} based on ${historicalTxs.length} historical transactions over ${effectiveDays} days.`,
      `Baseline daily operational expense estimated at ${currency} ${(
        historicalDailyAvgOutflowMinor / 100
      ).toFixed(2)} (excluding scheduled recurring obligations).`,
      `${scheduledRecurringList.length} recurring subscription/supplier obligation(s) scheduled across the horizon, totaling ${currency} ${(
        totalScheduledRecurringOutflowMinor / 100
      ).toFixed(2)}.`,
    ];

    if (hasReliableOpeningBalance && openingBalance) {
      assumptions.push(
        `Opening cash balance of ${currency} ${(openingBalance.amountMinor / 100).toFixed(
          2,
        )} established for balance trajectory tracking.`,
      );
    } else {
      assumptions.push(
        `No opening bank balance provided. Projections reflect estimated net cash movement only.`,
      );
    }

    const limitations: string[] = [
      'Projections are deterministic estimates based on historical ledger run rates and detected recurring charges. They do not guarantee future financial performance.',
      'Unscheduled one-off expenses, irregular client payment delays, and seasonal shifts outside the observation window are not captured in the baseline.',
      `All monetary calculations are strictly isolated to ${currency}. Cross-currency conversions are not performed.`,
    ];

    if (!hasReliableOpeningBalance) {
      limitations.push(
        'Without a verified opening bank balance, closing balance and absolute insolvency cannot be calculated. Values represent net cash movement only.',
      );
    }

    return {
      currency,
      horizonDays,
      startDate: startDateStr,
      endDate: endDateStr,
      hasReliableOpeningBalance,
      openingBalanceMinor: hasReliableOpeningBalance ? openingBalance.amountMinor : null,
      openingBalanceEffectiveDate: openingBalance?.effectiveDate || null,
      projectedInflowsMinor: totalProjectedInflowsMinor,
      projectedOutflowsMinor: totalProjectedOutflowsMinor,
      expectedNetMovementMinor,
      projectedClosingBalanceMinor,
      lowestProjectedBalanceMinor,
      lowestBalanceDate,
      riskLevel: riskAssessment.riskLevel,
      riskReason: riskAssessment.riskReason,
      dataQuality,
      historicalDailyAvgInflowMinor,
      historicalDailyAvgOutflowMinor,
      recurringOutflowsCount: scheduledRecurringCount,
      recurringOutflowsTotalMinor: totalScheduledRecurringOutflowMinor,
      points,
      assumptions,
      limitations,
    };
  }

  /**
   * Extracts active recurring findings, prioritizing recurring cost increases over base recurring series.
   */
  public static extractScheduledRecurring(
    findings: IFinancialFinding[],
    targetCurrency: SupportedCurrency,
  ): ScheduledRecurringItem[] {
    const activeFindings = findings.filter(
      (f) =>
        f.currency.toUpperCase() === targetCurrency.toUpperCase() &&
        f.status !== 'dismissed' &&
        (f.findingType === 'recurring_expense' || f.findingType === 'recurring_cost_increase'),
    );

    // Deduplicate series by normalized title/merchant
    const seriesMap = new Map<string, ScheduledRecurringItem>();

    for (const f of activeFindings) {
      const merchant = f.title
        .replace(/^Recurring (Expense|Cost Increase):\s*/i, '')
        .replace(/\s*\([^)]*\)\s*$/, '')
        .trim();
      const key = merchant.toLowerCase();

      // Extract cadence days
      let cadenceDays = f.evidence?.historicalComparisonPeriod?.cadenceDays || 30;
      if (cadenceDays <= 0) cadenceDays = 30;

      // Extract typical or new amount in minor units
      let amountMinor = 0;
      if (f.findingType === 'recurring_cost_increase') {
        amountMinor =
          f.evidence?.actualAmountMinor ||
          f.evidence?.amountsMinor?.[0] ||
          f.evidence?.historicalComparisonPeriod?.baselineAmountMinor ||
          0;
      } else {
        amountMinor =
          f.evidence?.historicalComparisonPeriod?.baselineAmountMinor ||
          f.evidence?.amountsMinor?.[0] ||
          0;
      }

      // Determine latest observed date
      let lastDate = new Date();
      if (f.evidence?.transactionDates && f.evidence.transactionDates.length > 0) {
        const sortedDates = [...f.evidence.transactionDates].sort();
        const latestDateStr = sortedDates[sortedDates.length - 1];
        if (latestDateStr) {
          lastDate = new Date(latestDateStr);
        }
      }

      const item: ScheduledRecurringItem = {
        findingId: f._id,
        merchant,
        amountMinor,
        cadenceDays,
        lastDate,
      };

      // If we already have a base recurring_expense and this is a recurring_cost_increase, supersede it
      if (seriesMap.has(key)) {
        const existing = seriesMap.get(key)!;
        if (f.findingType === 'recurring_cost_increase') {
          seriesMap.set(key, item);
        } else if (existing.amountMinor === 0 && item.amountMinor > 0) {
          seriesMap.set(key, item);
        }
      } else {
        seriesMap.set(key, item);
      }
    }

    return Array.from(seriesMap.values());
  }

  /**
   * Projects future occurrence dates within the forecast horizon window.
   */
  public static projectRecurringDates(
    lastDate: Date,
    cadenceDays: number,
    forecastStartDate: Date,
    horizonDays: number,
  ): string[] {
    const dates: string[] = [];
    const forecastStartMs = forecastStartDate.getTime();
    const forecastEndMs = forecastStartMs + horizonDays * 86400000;
    const cadenceMs = cadenceDays * 86400000;

    let nextMs = lastDate.getTime() + cadenceMs;

    // Advance until we reach or pass forecast start
    while (nextMs < forecastStartMs) {
      nextMs += cadenceMs;
    }

    // Collect dates falling within horizon
    while (nextMs <= forecastEndMs) {
      if (nextMs >= forecastStartMs + 86400000) {
        dates.push(new Date(nextMs).toISOString().split('T')[0]!);
      }
      nextMs += cadenceMs;
    }

    return dates;
  }

  private static calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 !== 0) {
      return sorted[mid] || 0;
    }
    return Math.round(((sorted[mid - 1] || 0) + (sorted[mid] || 0)) / 2);
  }
}
