import type {
  ActionRecommendationRule,
  ActionRuleContext,
  GeneratedActionCandidate,
} from '../rule.interface.js';
import { generateActionFingerprint } from '../fingerprint.js';
import { calculateActionPriority } from '../scoring.js';
import { normalizeDescription } from '../../reconciliation/scoring.js';
import type { SupportedCurrency } from '@moneylens/shared';

export class RecurringExpenseReviewActionRule implements ActionRecommendationRule {
  public readonly ruleId = 'RULE_ACT_REC_EXPENSE_001';
  public readonly ruleVersion = 'v1.0.0';
  public readonly actionType = 'review_recurring_expense' as const;
  public readonly category = 'vendor_management' as const;

  public evaluate(context: ActionRuleContext): GeneratedActionCandidate[] {
    const candidates: GeneratedActionCandidate[] = [];

    // Identify merchants already covered by an active recurring_cost_increase finding
    const activeCostIncreaseMerchants = new Set<string>();
    for (const f of context.findings) {
      if (f.findingType === 'recurring_cost_increase' && f.status !== 'dismissed') {
        const evidence = (f.evidence || {}) as Record<string, unknown>;
        const descriptions = (evidence.normalizedDescriptions as string[]) || [];
        for (const desc of descriptions) {
          const tokens = normalizeDescription(desc);
          if (tokens.length > 0) {
            activeCostIncreaseMerchants.add(tokens.slice(0, 2).join('_'));
          }
        }
      }
    }

    // Filter active recurring expense findings
    const recFindings = context.findings.filter(
      (f) => f.findingType === 'recurring_expense' && f.status !== 'dismissed',
    );

    for (const finding of recFindings) {
      const currency = finding.currency as SupportedCurrency;
      const evidence = (finding.evidence || {}) as Record<string, unknown>;
      const descriptions = (evidence.normalizedDescriptions as string[]) || [];

      // Avoid duplicating recurring-cost-increase recommendations for the same vendor
      let merchantKey = '';
      for (const desc of descriptions) {
        const tokens = normalizeDescription(desc);
        if (tokens.length > 0) {
          merchantKey = tokens.slice(0, 2).join('_');
          break;
        }
      }

      if (merchantKey && activeCostIncreaseMerchants.has(merchantKey)) {
        continue;
      }

      const cadence = (evidence.cadence as string) || 'Monthly';
      const avgAmountMinor =
        (evidence.averageAmountMinor as number) || finding.estimatedAmountMinor || 0;
      const occurrencesCount = (evidence.occurrencesCount as number) || 0;

      // Potential exposure is the recurring amount commitment; avoidable cost is 0 until audited
      const financialImpact = {
        currency,
        potentialExposureMinor: avgAmountMinor,
        estimatedAvoidableCostMinor: 0,
        confirmedIssueMinor: 0,
        projectedCashFlowEffectMinor: 0,
        realizedSavingsMinor: 0,
      };

      const severity = avgAmountMinor >= 20000 ? ('high' as const) : ('medium' as const);
      const evidenceQuality = occurrencesCount >= 4 ? ('high' as const) : ('adequate' as const);

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
        title: `Review Active Subscription: ${finding.title}`,
        explanation: `Identified ongoing ${cadence.toLowerCase()} recurring commitment averaging ${currency} ${(
          avgAmountMinor / 100
        ).toFixed(
          2,
        )} across ${occurrencesCount} observed billing cycles. This represents an observed historical pattern; verify whether the service remains essential or qualifies for cancellation.`,
        severity,
        evidenceQuality,
        evidence: {
          findingId: finding._id,
          findingTitle: finding.title,
          ruleId: finding.ruleId,
          primaryTransactionIds: finding.primaryTransactionIds,
          relatedTransactionIds: finding.relatedTransactionIds,
          cadence,
          averageAmountMinor: avgAmountMinor,
          occurrencesCount,
          detectedAt: finding.detectedAt,
        },
        sourceFindingIds: [finding._id],
        currency,
        financialImpact,
        recommendedSteps: [
          {
            stepNumber: 1,
            label: 'Verify Business Utility',
            description:
              'Confirm with your team whether this subscription or service license is actively utilized in daily retail operations.',
            isOptional: false,
          },
          {
            stepNumber: 2,
            label: 'Check Contract Terms & Auto-Renewal',
            description:
              'Review notice period requirements and renewal dates to avoid unintended contract roll-overs.',
            isOptional: false,
          },
          {
            stepNumber: 3,
            label: 'Cancel or Consolidate Licenses',
            description:
              'If redundant, initiate cancellation directly with the vendor or downgrade to a lower service tier.',
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
