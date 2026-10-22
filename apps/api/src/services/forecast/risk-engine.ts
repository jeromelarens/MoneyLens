import type { CashFlowRiskLevel, ForecastDataQuality, SupportedCurrency } from '@moneylens/shared';

export interface RiskAssessmentParams {
  currency: SupportedCurrency;
  horizonDays: number;
  dataQuality: ForecastDataQuality;
  hasReliableOpeningBalance: boolean;
  openingBalanceMinor: number | null;
  projectedInflowsMinor: number;
  projectedOutflowsMinor: number;
  expectedNetMovementMinor: number;
  lowestProjectedBalanceMinor: number | null;
  lowestBalanceDate: string | null;
}

export interface RiskAssessmentResult {
  riskLevel: CashFlowRiskLevel;
  riskReason: string;
}

export class CashFlowRiskEngine {
  /**
   * Deterministically evaluates cash shortage and cash-flow pressure risk.
   * Enforces financial integrity: never claims an absolute cash shortage without a verified opening balance.
   */
  public static evaluateRisk(params: RiskAssessmentParams): RiskAssessmentResult {
    const {
      currency,
      horizonDays,
      dataQuality,
      hasReliableOpeningBalance,
      openingBalanceMinor,
      projectedInflowsMinor,
      projectedOutflowsMinor,
      expectedNetMovementMinor,
      lowestProjectedBalanceMinor,
      lowestBalanceDate,
    } = params;

    // 1. Data quality check
    if (dataQuality === 'insufficient_history') {
      return {
        riskLevel: 'insufficient_data',
        riskReason:
          'Insufficient transaction history (< 14 days) to establish reliable operational run rates. Cash flow risk cannot be assessed reliably.',
      };
    }

    // 2. Risk evaluation WITH verified opening balance
    if (hasReliableOpeningBalance && openingBalanceMinor !== null) {
      if (lowestProjectedBalanceMinor !== null && lowestProjectedBalanceMinor < 0) {
        const formattedDeficit = (Math.abs(lowestProjectedBalanceMinor) / 100).toFixed(2);
        return {
          riskLevel: 'high_risk',
          riskReason: `Projected cash deficit of ${currency} ${formattedDeficit} on ${lowestBalanceDate} based on scheduled obligations and operational burn rates.`,
        };
      }

      // Safety buffer threshold: 20% of opening balance or 7 days of average daily outflow
      const dailyAvgOutflow = projectedOutflowsMinor / horizonDays;
      const bufferThreshold = Math.max(openingBalanceMinor * 0.2, dailyAvgOutflow * 7);

      if (lowestProjectedBalanceMinor !== null && lowestProjectedBalanceMinor < bufferThreshold) {
        const formattedLow = (lowestProjectedBalanceMinor / 100).toFixed(2);
        return {
          riskLevel: 'moderate_risk',
          riskReason: `Projected cash balance dips to ${currency} ${formattedLow} on ${lowestBalanceDate}, falling below the recommended safety buffer threshold.`,
        };
      }

      return {
        riskLevel: 'low_risk',
        riskReason: `Projected cash reserves remain positive and above safety thresholds throughout the ${horizonDays}-day horizon.`,
      };
    }

    // 3. Risk evaluation WITHOUT opening balance (Net Cash Flow Pressure only)
    if (expectedNetMovementMinor < 0) {
      const netDeficit = Math.abs(expectedNetMovementMinor);
      const isAcuteBurn = projectedInflowsMinor === 0 || netDeficit > projectedInflowsMinor * 0.25;

      if (isAcuteBurn) {
        const formattedNet = (netDeficit / 100).toFixed(2);
        return {
          riskLevel: 'moderate_risk',
          riskReason: `Negative net cash flow pressure: projected outflows exceed inflows by ${currency} ${formattedNet} over ${horizonDays} days. Configure an opening bank balance to assess absolute insolvency risk.`,
        };
      }

      return {
        riskLevel: 'no_balance_data',
        riskReason: `Mild net cash outflow projected. Absolute cash shortage cannot be confirmed without a verified opening balance.`,
      };
    }

    // Positive net movement without opening balance
    const formattedSurplus = (expectedNetMovementMinor / 100).toFixed(2);
    return {
      riskLevel: 'low_risk',
      riskReason: `Projected net cash movement is positive (+${currency} ${formattedSurplus}) over ${horizonDays} days.`,
    };
  }
}
