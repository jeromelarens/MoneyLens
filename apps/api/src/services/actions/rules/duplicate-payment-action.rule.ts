import type {
  ActionRecommendationRule,
  ActionRuleContext,
  GeneratedActionCandidate,
} from '../rule.interface.js';
import { generateActionFingerprint } from '../fingerprint.js';
import { calculateActionPriority } from '../scoring.js';
import type { SupportedCurrency } from '@moneylens/shared';

export class DuplicatePaymentActionRule implements ActionRecommendationRule {
  public readonly ruleId = 'RULE_ACT_DUP_001';
  public readonly ruleVersion = 'v1.0.0';
  public readonly actionType = 'review_duplicate_payment' as const;
  public readonly category = 'cost_reduction' as const;

  public evaluate(context: ActionRuleContext): GeneratedActionCandidate[] {
    const candidates: GeneratedActionCandidate[] = [];

    // Filter active, non-dismissed potential duplicate payment findings
    const dupFindings = context.findings.filter(
      (f) => f.findingType === 'potential_duplicate_payment' && f.status !== 'dismissed',
    );

    for (const finding of dupFindings) {
      const currency = finding.currency as SupportedCurrency;
      const exposureMinor = finding.estimatedAmountMinor || 0;

      const financialImpact = {
        currency,
        potentialExposureMinor: exposureMinor,
        estimatedAvoidableCostMinor: exposureMinor,
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
        title: `Review Suspected Duplicate Charge: ${finding.title}`,
        explanation: `Multiple debit transactions posted within a short time window share identical amounts and reference tokens. Verify counterparty invoice to confirm whether this represents duplicate billing.`,
        severity,
        evidenceQuality,
        evidence: {
          findingId: finding._id,
          findingTitle: finding.title,
          ruleId: finding.ruleId,
          primaryTransactionIds: finding.primaryTransactionIds,
          relatedTransactionIds: finding.relatedTransactionIds,
          detectedAt: finding.detectedAt,
          ruleEvidence: finding.evidence,
        },
        sourceFindingIds: [finding._id],
        currency,
        financialImpact,
        recommendedSteps: [
          {
            stepNumber: 1,
            label: 'Review Linked Transactions',
            description:
              'Compare the primary and related transaction details in your statement ledger.',
            isOptional: false,
          },
          {
            stepNumber: 2,
            label: 'Check Supplier Invoices',
            description:
              'Verify with the vendor whether distinct purchase orders or duplicate invoices were issued.',
            isOptional: false,
          },
          {
            stepNumber: 3,
            label: 'Request Refund or Credit Note',
            description:
              'If verified as a dual charge, request a reversal or credit note from the counterparty.',
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
