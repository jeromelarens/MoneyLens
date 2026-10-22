import type {
  ActionRecommendationRule,
  ActionRuleContext,
  GeneratedActionCandidate,
} from '../rule.interface.js';
import { generateActionFingerprint } from '../fingerprint.js';
import { calculateActionPriority } from '../scoring.js';
import type { SupportedCurrency } from '@moneylens/shared';

export class CashFlowPressureActionRule implements ActionRecommendationRule {
  public readonly ruleId = 'RULE_ACT_CF_PRESSURE_001';
  public readonly ruleVersion = 'v1.0.0';
  public readonly actionType = 'mitigate_cash_flow_pressure' as const;
  public readonly category = 'cash_preservation' as const;

  public evaluate(context: ActionRuleContext): GeneratedActionCandidate[] {
    const candidates: GeneratedActionCandidate[] = [];

    // Evaluate latest forecasts
    for (const forecast of context.latestForecasts) {
      // Must have at least adequate or high data quality to avoid noisy projections
      if (
        forecast.dataQuality === 'insufficient_history' ||
        forecast.riskLevel === 'insufficient_data'
      ) {
        continue;
      }

      const isHighRisk = forecast.riskLevel === 'high_risk';
      const isModerateRisk = forecast.riskLevel === 'moderate_risk';
      const isNegativeNet = forecast.expectedNetMovementMinor < 0;
      const isProjectedDeficit =
        forecast.hasReliableOpeningBalance &&
        forecast.lowestProjectedBalanceMinor !== null &&
        forecast.lowestProjectedBalanceMinor !== undefined &&
        forecast.lowestProjectedBalanceMinor < 0;

      // Surface pressure if deficit or high/moderate risk or significant negative net movement
      if (!isHighRisk && !isModerateRisk && !isProjectedDeficit && !isNegativeNet) {
        continue;
      }

      const currency = forecast.currency as SupportedCurrency;
      const hasBalance = forecast.hasReliableOpeningBalance;
      const netMovementMinor = forecast.expectedNetMovementMinor;
      const lowestBalanceMinor = forecast.lowestProjectedBalanceMinor ?? null;

      let explanation: string;
      if (hasBalance && lowestBalanceMinor !== null && lowestBalanceMinor < 0) {
        explanation = `30-90 day projection indicates potential cash shortfall with lowest estimated balance of ${currency} ${(
          lowestBalanceMinor / 100
        ).toFixed(2)} on ${forecast.lowestBalanceDate || 'projection window'}.`;
      } else if (!hasBalance) {
        explanation = `Projected net outflow of ${currency} ${(
          Math.abs(netMovementMinor) / 100
        ).toFixed(
          2,
        )} over the next ${forecast.horizonDays} days exceeds anticipated inflows. Absolute cash balance cannot be verified without an opening balance import.`;
      } else {
        explanation = `Cash flow pressure identified (${forecast.riskReason}). Projected net change over ${forecast.horizonDays} days is ${currency} ${(
          netMovementMinor / 100
        ).toFixed(2)}.`;
      }

      // Add limitations disclaimer
      if (forecast.limitations && forecast.limitations.length > 0) {
        explanation += ` Limitations: ${forecast.limitations.slice(0, 2).join('; ')}.`;
      }

      const exposureMinor = Math.abs(lowestBalanceMinor ?? netMovementMinor);

      const financialImpact = {
        currency,
        potentialExposureMinor: exposureMinor,
        estimatedAvoidableCostMinor: 0,
        confirmedIssueMinor: 0,
        projectedCashFlowEffectMinor: netMovementMinor,
        realizedSavingsMinor: 0,
      };

      const severity = isHighRisk || isProjectedDeficit ? ('high' as const) : ('medium' as const);
      const evidenceQuality =
        forecast.dataQuality === 'high' && hasBalance ? ('high' as const) : ('adequate' as const);

      const { priorityScore, priority } = calculateActionPriority(
        severity,
        evidenceQuality,
        this.category,
        financialImpact,
      );

      const fingerprint = generateActionFingerprint({
        organizationId: context.organizationId,
        ruleId: this.ruleId,
        ruleVersion: this.ruleVersion,
        actionType: this.actionType,
        currency,
        sourceForecastRunId: forecast.forecastRunId,
        discriminator: `${forecast.currency}_${forecast.horizonDays}`,
      });

      candidates.push({
        actionType: this.actionType,
        category: this.category,
        title: `Mitigate Projected Cash Flow Pressure (${currency})`,
        explanation,
        severity,
        evidenceQuality,
        evidence: {
          forecastId: forecast._id,
          forecastRunId: forecast.forecastRunId,
          horizonDays: forecast.horizonDays,
          currency,
          hasReliableOpeningBalance: hasBalance,
          projectedInflowsMinor: forecast.projectedInflowsMinor,
          projectedOutflowsMinor: forecast.projectedOutflowsMinor,
          expectedNetMovementMinor: netMovementMinor,
          lowestProjectedBalanceMinor: lowestBalanceMinor,
          lowestBalanceDate: forecast.lowestBalanceDate,
          riskLevel: forecast.riskLevel,
          riskReason: forecast.riskReason,
          limitations: forecast.limitations,
        },
        sourceFindingIds: [],
        sourceForecastRunId: forecast.forecastRunId,
        currency,
        financialImpact,
        recommendedSteps: [
          {
            stepNumber: 1,
            label: 'Review Scheduled Outflows',
            description:
              'Evaluate non-essential discretionary expenses and upcoming supplier payments due in the next 30 days.',
            isOptional: false,
          },
          {
            stepNumber: 2,
            label: 'Accelerate Outstanding Receivables',
            description:
              'Follow up on pending retail client invoices or settle clearing account balances to enhance cash buffers.',
            isOptional: false,
          },
          {
            stepNumber: 3,
            label: 'Adjust Inventory Purchase Timing',
            description:
              'Stagger stock purchase orders to avoid concentrated outflows during the predicted cash-trough period.',
            isOptional: true,
          },
        ],
        ruleId: this.ruleId,
        ruleVersion: this.ruleVersion,
        fingerprint,
        initialPriorityScore: priorityScore,
        initialPriority: priority,
      });
    }

    return candidates;
  }
}
