import type {
  ActionRecommendationRule,
  ActionRuleContext,
  GeneratedActionCandidate,
} from '../rule.interface.js';
import { generateActionFingerprint } from '../fingerprint.js';
import { calculateActionPriority } from '../scoring.js';
import type { SupportedCurrency } from '@moneylens/shared';

export class UnusualExpenseActionRule implements ActionRecommendationRule {
  public readonly ruleId = 'RULE_ACT_UNUSUAL_001';
  public readonly ruleVersion = 'v1.0.0';
  public readonly actionType = 'verify_unusual_expense' as const;
  public readonly category = 'cost_reduction' as const;

  public evaluate(context: ActionRuleContext): GeneratedActionCandidate[] {
    const candidates: GeneratedActionCandidate[] = [];

    // Filter active, non-dismissed unusual expense findings
    const unusualFindings = context.findings.filter(
      (f) => f.findingType === 'unusual_expense' && f.status !== 'dismissed',
    );

    for (const finding of unusualFindings) {
      const currency = finding.currency as SupportedCurrency;
      const evidence = (finding.evidence || {}) as Record<string, unknown>;

      const actualAmountMinor =
        (evidence.actualAmountMinor as number) || finding.estimatedAmountMinor || 0;
      const varianceMinor =
        (evidence.amountDifferenceMinor as number) || finding.estimatedAmountMinor || 0;
      const medianMinor =
        (evidence.historicalMedianMinor as number) || actualAmountMinor - varianceMinor;
      const observationsCount = (evidence.historicalObservationsCount as number) || 0;
      const percentageChange = (evidence.percentageChange as number) || 0;

      const isLimitedHistory = observationsCount < 6;
      const historyNote = isLimitedHistory
        ? ' Note: Baseline is derived from a limited sample of historical transactions.'
        : '';

      const financialImpact = {
        currency,
        potentialExposureMinor: varianceMinor,
        estimatedAvoidableCostMinor: varianceMinor,
        confirmedIssueMinor: 0,
        projectedCashFlowEffectMinor: 0,
        realizedSavingsMinor: 0,
      };

      const severity = finding.severity === 'high' ? ('high' as const) : ('medium' as const);
      const evidenceQuality = isLimitedHistory ? ('adequate' as const) : ('high' as const);

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
        title: `Verify Unusual Outflow: ${finding.title}`,
        explanation: `Transaction of ${currency} ${(actualAmountMinor / 100).toFixed(
          2,
        )} is ${percentageChange}% higher than the typical baseline of ${currency} ${(
          medianMinor / 100
        ).toFixed(2)} (+${currency} ${(varianceMinor / 100).toFixed(
          2,
        )}). An unusual transaction does not inherently indicate an error, but warrants verification with source receipts or counterparties.${historyNote}`,
        severity,
        evidenceQuality,
        evidence: {
          findingId: finding._id,
          findingTitle: finding.title,
          ruleId: finding.ruleId,
          primaryTransactionIds: finding.primaryTransactionIds,
          relatedTransactionIds: finding.relatedTransactionIds,
          actualAmountMinor,
          historicalMedianMinor: medianMinor,
          varianceMinor,
          percentageChange,
          historicalObservationsCount: observationsCount,
          isLimitedHistory,
          detectedAt: finding.detectedAt,
        },
        sourceFindingIds: [finding._id],
        currency,
        financialImpact,
        recommendedSteps: [
          {
            stepNumber: 1,
            label: 'Review Counterparty & Invoice',
            description:
              'Inspect the vendor invoice or purchase order to verify whether additional items or scope changes caused the higher charge.',
            isOptional: false,
          },
          {
            stepNumber: 2,
            label: 'Verify Department Authorization',
            description:
              'Confirm that the discretionary outflow was approved by the authorized retail manager or owner.',
            isOptional: false,
          },
          {
            stepNumber: 3,
            label: 'Confirm or Dismiss Finding',
            description:
              'If the charge is legitimate business expansion, dismiss the finding. If unauthorized or billed in error, seek credit from the supplier.',
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
