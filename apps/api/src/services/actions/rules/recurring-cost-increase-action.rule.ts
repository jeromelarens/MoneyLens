import type {
  ActionRecommendationRule,
  ActionRuleContext,
  GeneratedActionCandidate,
} from '../rule.interface.js';
import { generateActionFingerprint } from '../fingerprint.js';
import { calculateActionPriority } from '../scoring.js';
import type { SupportedCurrency } from '@moneylens/shared';

export class RecurringCostIncreaseActionRule implements ActionRecommendationRule {
  public readonly ruleId = 'RULE_ACT_REC_INC_001';
  public readonly ruleVersion = 'v1.0.0';
  public readonly actionType = 'review_recurring_cost_increase' as const;
  public readonly category = 'cost_reduction' as const;

  public evaluate(context: ActionRuleContext): GeneratedActionCandidate[] {
    const candidates: GeneratedActionCandidate[] = [];

    // Filter active recurring cost increase findings
    const incFindings = context.findings.filter(
      (f) => f.findingType === 'recurring_cost_increase' && f.status !== 'dismissed',
    );

    for (const finding of incFindings) {
      const currency = finding.currency as SupportedCurrency;
      const evidence = (finding.evidence || {}) as Record<string, unknown>;

      const actualAmountMinor = (evidence.actualAmountMinor as number) || 0;
      const diffMinor =
        (evidence.amountDifferenceMinor as number) || finding.estimatedAmountMinor || 0;
      const baselineAvgMinor = actualAmountMinor - diffMinor;
      const percentIncrease = (evidence.percentageChange as number) || 0;

      // Avoid presenting the entire charge as avoidable cost; only the marginal increase is avoidable cost
      const financialImpact = {
        currency,
        potentialExposureMinor: diffMinor,
        estimatedAvoidableCostMinor: diffMinor,
        confirmedIssueMinor: 0,
        projectedCashFlowEffectMinor: 0,
        realizedSavingsMinor: 0,
      };

      const severity = finding.severity === 'high' ? ('high' as const) : ('medium' as const);
      const evidenceQuality = 'high' as const;

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
        sourceFindingIds: [finding._id],
        discriminator: finding.fingerprint,
      });

      candidates.push({
        actionType: this.actionType,
        category: this.category,
        title: `Review Recurring Cost Hike: ${finding.title}`,
        explanation: `Subscription/recurring charge increased by ${percentIncrease}% (+${currency} ${(
          diffMinor / 100
        ).toFixed(2)}) from baseline average of ${currency} ${(baselineAvgMinor / 100).toFixed(
          2,
        )} to ${currency} ${(actualAmountMinor / 100).toFixed(
          2,
        )}. Review the active plan, tier changes, or vendor price increases.`,
        severity,
        evidenceQuality,
        evidence: {
          findingId: finding._id,
          findingTitle: finding.title,
          ruleId: finding.ruleId,
          primaryTransactionIds: finding.primaryTransactionIds,
          relatedTransactionIds: finding.relatedTransactionIds,
          previousBaselineMinor: baselineAvgMinor,
          newAmountMinor: actualAmountMinor,
          increaseAmountMinor: diffMinor,
          percentageIncrease: percentIncrease,
          detectedAt: finding.detectedAt,
        },
        sourceFindingIds: [finding._id],
        currency,
        financialImpact,
        recommendedSteps: [
          {
            stepNumber: 1,
            label: 'Review Vendor Contract or Invoice',
            description:
              'Check whether a scheduled rate increase, license seat addition, or unnoticed auto-renewal occurred.',
            isOptional: false,
          },
          {
            stepNumber: 2,
            label: 'Audit Usage or Seat Count',
            description:
              'Assess whether active retail staff are utilizing the expanded software tier or service capacity.',
            isOptional: false,
          },
          {
            stepNumber: 3,
            label: 'Renegotiate or Downgrade Plan',
            description:
              'Contact vendor representative to revert to standard tier or negotiate grandfathered pricing.',
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
