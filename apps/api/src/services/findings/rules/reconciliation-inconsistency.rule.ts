import type {
  IDetectionRule,
  DetectionRuleContext,
  DetectionCandidateFinding,
} from '../rule.interface.js';
import { generateFindingFingerprint } from '../fingerprint.js';
import { ReconciliationMatchModel } from '../../../infrastructure/database/models/index.js';
import { calculateDateDifferenceDays } from '../../reconciliation/scoring.js';
import type { SupportedCurrency } from '@moneylens/shared';

export class ReconciliationInconsistencyRule implements IDetectionRule {
  public readonly ruleId = 'RULE_REC_INCONSISTENT_001';
  public readonly ruleVersion = 'v1.0.0';
  public readonly findingType = 'reconciliation_inconsistency' as const;
  public readonly name = 'Reconciliation Inconsistency & Audit Anomaly Detection';
  public readonly description =
    'Identifies orphaned reconciliation statuses, unreviewed stale match candidates, and conflicting match associations.';

  public readonly STALE_MATCH_DAYS = 14;

  public async execute(context: DetectionRuleContext): Promise<DetectionCandidateFinding[]> {
    const findings: DetectionCandidateFinding[] = [];

    // Query active reconciliation matches for this organization
    const matches = await ReconciliationMatchModel.find({
      organizationId: context.organizationId,
    })
      .lean()
      .exec();

    const confirmedTxIds = new Set<string>();
    const suggestedMatchesBySource = new Map<string, typeof matches>();

    for (const m of matches) {
      if (m.status === 'confirmed') {
        confirmedTxIds.add(m.sourceTransactionId);
        if (m.candidateTransactionId) {
          confirmedTxIds.add(m.candidateTransactionId);
        }
        if (Array.isArray(m.participatingTransactionIds)) {
          for (const txId of m.participatingTransactionIds) {
            confirmedTxIds.add(txId);
          }
        }
      } else if (m.status === 'suggested' || m.status === 'needs_review') {
        const list = suggestedMatchesBySource.get(m.sourceTransactionId) || [];
        list.push(m);
        suggestedMatchesBySource.set(m.sourceTransactionId, list);
      }
    }

    // 1. Audit Check: Orphaned 'reconciled' transactions without a confirmed match document
    for (const tx of context.transactions) {
      if (tx.reconciliationStatus === 'reconciled' && !confirmedTxIds.has(tx._id)) {
        const currency = tx.currency as SupportedCurrency;
        const fingerprint = generateFindingFingerprint({
          organizationId: context.organizationId,
          ruleId: this.ruleId,
          ruleVersion: this.ruleVersion,
          findingType: this.findingType,
          currency,
          transactionIds: [tx._id],
          discriminator: 'ORPHANED_STATUS',
        });

        findings.push({
          ruleId: this.ruleId,
          ruleVersion: this.ruleVersion,
          findingType: this.findingType,
          severity: 'high',
          title: `Orphaned Reconciled Transaction: ${tx._id}`,
          summary: `Transaction ${tx._id} (${currency} ${tx.amountDecimal}) is flagged as 'reconciled' in the ledger, but has no corresponding confirmed match record. This can occur after an interrupted reconciliation process.`,
          primaryTransactionIds: [tx._id],
          relatedTransactionIds: [],
          currency,
          estimatedAmountMinor: tx.amountMinor,
          evidence: {
            ruleId: this.ruleId,
            ruleVersion: this.ruleVersion,
            reason: `Ledger reconciliation status is 'reconciled' without matching confirmed audit match document.`,
            primaryTransactionIds: [tx._id],
            relatedTransactionIds: [],
            transactionDates: [new Date(tx.date).toISOString()],
            amountsMinor: [tx.amountMinor],
            currency,
            direction: tx.direction,
            normalizedDescriptions: [tx.description],
            dataQualityLimitations: [
              'Reconciliation engine audit requires verified match records for audit compliance.',
              'Detection engine does not alter transaction ledger status automatically.',
            ],
            recommendedChecks: [
              'Inspect reconciliation run history to verify if a matching job crashed mid-flight.',
              'Re-run reconciliation or reset transaction to unreconciled if match was reversed without unlocking ledger.',
            ],
          },
          fingerprint,
        });
      }
    }

    // 2. Audit Check: Stale unreviewed matches or competing candidates
    const now = new Date();
    for (const [sourceTxId, candidateMatches] of suggestedMatchesBySource) {
      const sourceTx = context.transactions.find((t) => t._id === sourceTxId);
      if (!sourceTx) continue;

      const currency = sourceTx.currency as SupportedCurrency;

      // Check competing candidates (multiple suggestions for the same source)
      if (candidateMatches.length > 1) {
        const participatingIds = candidateMatches
          .map((m) => m.candidateTransactionId)
          .filter((id): id is string => Boolean(id));

        const fingerprint = generateFindingFingerprint({
          organizationId: context.organizationId,
          ruleId: this.ruleId,
          ruleVersion: this.ruleVersion,
          findingType: this.findingType,
          currency,
          transactionIds: [sourceTxId, ...participatingIds],
          discriminator: 'COMPETING_MATCHES',
        });

        findings.push({
          ruleId: this.ruleId,
          ruleVersion: this.ruleVersion,
          findingType: this.findingType,
          severity: 'medium',
          title: `Conflicting Reconciliation Match Candidates (${candidateMatches.length} options)`,
          summary: `Transaction ${sourceTxId} (${currency} ${sourceTx.amountDecimal}) has ${candidateMatches.length} competing suggested matches awaiting disambiguation.`,
          primaryTransactionIds: [sourceTxId],
          relatedTransactionIds: participatingIds,
          currency,
          estimatedAmountMinor: sourceTx.amountMinor,
          evidence: {
            ruleId: this.ruleId,
            ruleVersion: this.ruleVersion,
            reason: `${candidateMatches.length} competing match proposals exist for this transaction.`,
            primaryTransactionIds: [sourceTxId],
            relatedTransactionIds: participatingIds,
            transactionDates: [new Date(sourceTx.date).toISOString()],
            amountsMinor: [sourceTx.amountMinor],
            currency,
            direction: sourceTx.direction,
            normalizedDescriptions: [sourceTx.description],
            metadata: {
              competingMatchIds: candidateMatches.map((m) => String(m._id)),
            },
            dataQualityLimitations: [
              'Competing candidates occur when multiple counterparty transactions share similar amounts or dates.',
            ],
            recommendedChecks: [
              'Review candidate matches in the Reconciliation Dashboard.',
              'Confirm the correct match or reject incorrect proposals.',
            ],
          },
          fingerprint,
        });
      }

      // Check stale suggestions (> 14 days old)
      for (const m of candidateMatches) {
        const createdAt = m.createdAt ? new Date(m.createdAt) : null;
        if (!createdAt) continue;

        const ageDays = calculateDateDifferenceDays(createdAt, now);
        if (ageDays !== null && ageDays >= this.STALE_MATCH_DAYS) {
          const fingerprint = generateFindingFingerprint({
            organizationId: context.organizationId,
            ruleId: this.ruleId,
            ruleVersion: this.ruleVersion,
            findingType: this.findingType,
            currency,
            transactionIds: [sourceTxId],
            discriminator: `STALE_MATCH_${m._id}`,
          });

          findings.push({
            ruleId: this.ruleId,
            ruleVersion: this.ruleVersion,
            findingType: this.findingType,
            severity: 'low',
            title: `Stale Reconciliation Proposal (${ageDays} days unreviewed)`,
            summary: `Suggested match ${m._id} for transaction ${sourceTxId} (${currency} ${sourceTx.amountDecimal}) has been awaiting review for ${ageDays} days.`,
            primaryTransactionIds: [sourceTxId],
            relatedTransactionIds: m.candidateTransactionId ? [m.candidateTransactionId] : [],
            currency,
            estimatedAmountMinor: sourceTx.amountMinor,
            evidence: {
              ruleId: this.ruleId,
              ruleVersion: this.ruleVersion,
              reason: `Match proposal unreviewed for ${ageDays} days (threshold: ${this.STALE_MATCH_DAYS} days).`,
              primaryTransactionIds: [sourceTxId],
              relatedTransactionIds: m.candidateTransactionId ? [m.candidateTransactionId] : [],
              transactionDates: [new Date(sourceTx.date).toISOString()],
              amountsMinor: [sourceTx.amountMinor],
              currency,
              direction: sourceTx.direction,
              normalizedDescriptions: [sourceTx.description],
              dateDifferenceDays: ageDays,
              metadata: {
                matchId: m._id,
                matchMethod: m.matchMethod,
                matchScore: m.matchScore,
              },
              dataQualityLimitations: [
                'Aging unreviewed proposals may delay month-end financial reporting.',
              ],
              recommendedChecks: [
                'Confirm or reject the suggested match in the Reconciliation tab.',
              ],
            },
            fingerprint,
          });
        }
      }
    }

    return findings;
  }
}
