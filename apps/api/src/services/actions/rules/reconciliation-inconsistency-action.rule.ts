import type {
  ActionRecommendationRule,
  ActionRuleContext,
  GeneratedActionCandidate,
} from '../rule.interface.js';
import { generateActionFingerprint } from '../fingerprint.js';
import { calculateActionPriority } from '../scoring.js';
import type { SupportedCurrency } from '@moneylens/shared';

export class ReconciliationInconsistencyActionRule implements ActionRecommendationRule {
  public readonly ruleId = 'RULE_ACT_REC_INCONSISTENCY_001';
  public readonly ruleVersion = 'v1.0.0';
  public readonly actionType = 'resolve_reconciliation_inconsistency' as const;
  public readonly category = 'data_integrity' as const;

  public evaluate(context: ActionRuleContext): GeneratedActionCandidate[] {
    const candidates: GeneratedActionCandidate[] = [];

    // Filter active reconciliation inconsistency findings
    const reconFindings = context.findings.filter(
      (f) => f.findingType === 'reconciliation_inconsistency' && f.status !== 'dismissed',
    );

    for (const finding of reconFindings) {
      const currency = finding.currency as SupportedCurrency;
      const amountMinor = finding.estimatedAmountMinor || 0;

      const financialImpact = {
        currency,
        potentialExposureMinor: amountMinor,
        estimatedAvoidableCostMinor: 0,
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
        title: `Investigate Ledger Inconsistency: ${finding.title}`,
        explanation: `Integrity check identified potential ledger anomalies (orphaned status, unreviewed candidate, or conflicting associations). Reconciled transactions must maintain traceable bipartite matches without automated alterations.`,
        severity,
        evidenceQuality,
        evidence: {
          findingId: finding._id,
          findingTitle: finding.title,
          ruleId: finding.ruleId,
          primaryTransactionIds: finding.primaryTransactionIds,
          relatedTransactionIds: finding.relatedTransactionIds,
          estimatedAmountMinor: amountMinor,
          detectedAt: finding.detectedAt,
          ruleEvidence: finding.evidence,
        },
        sourceFindingIds: [finding._id],
        currency,
        financialImpact,
        recommendedSteps: [
          {
            stepNumber: 1,
            label: 'Inspect Reconciliation Match Table',
            description:
              'Navigate to the Reconciliation tab to review match candidates and audit trail logs for the affected transaction IDs.',
            isOptional: false,
          },
          {
            stepNumber: 2,
            label: 'Verify External Source Documents',
            description:
              'Confirm counterparty statement and bank feed records to verify whether an actual settlement occurred.',
            isOptional: false,
          },
          {
            stepNumber: 3,
            label: 'Manually Confirm or Reject Match',
            description:
              'Approve valid pairings or reject stale candidate associations to restore ledger consistency.',
            isOptional: false,
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
