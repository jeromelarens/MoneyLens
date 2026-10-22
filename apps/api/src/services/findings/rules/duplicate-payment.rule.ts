import type {
  IDetectionRule,
  DetectionRuleContext,
  DetectionCandidateFinding,
} from '../rule.interface.js';
import { generateFindingFingerprint } from '../fingerprint.js';
import {
  normalizeReference,
  calculateDescriptionSimilarity,
  calculateDateDifferenceDays,
} from '../../reconciliation/scoring.js';
import type { SupportedCurrency } from '@moneylens/shared';

export class DuplicatePaymentRule implements IDetectionRule {
  public readonly ruleId = 'RULE_DUP_001';
  public readonly ruleVersion = 'v1.0.0';
  public readonly findingType = 'potential_duplicate_payment' as const;
  public readonly name = 'Potential Duplicate Outgoing Payment Detection';
  public readonly description =
    'Identifies outgoing debit transactions with identical amounts, close transaction dates, and matching or highly similar merchant descriptions.';

  public readonly MAX_DATE_DIFFERENCE_DAYS = 5;
  public readonly MIN_DESCRIPTION_SIMILARITY = 0.6;

  public async execute(context: DetectionRuleContext): Promise<DetectionCandidateFinding[]> {
    const findings: DetectionCandidateFinding[] = [];
    const debits = context.transactions.filter((tx) => tx.direction === 'debit');

    // Group debits by currency and amountMinor to avoid O(N^2) over the full ledger
    const buckets = new Map<string, typeof debits>();
    for (const tx of debits) {
      const key = `${tx.currency}:${tx.amountMinor}`;
      const bucket = buckets.get(key) || [];
      bucket.push(tx);
      buckets.set(key, bucket);
    }

    const processedPairs = new Set<string>();

    for (const [, txs] of buckets) {
      if (txs.length < 2) continue;

      // Sort by date ascending
      txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      for (let i = 0; i < txs.length; i++) {
        for (let j = i + 1; j < txs.length; j++) {
          const t1 = txs[i];
          const t2 = txs[j];
          if (!t1 || !t2) continue;

          if (t1._id === t2._id) continue;

          const pairKey = [t1._id, t2._id].sort().join(':');
          if (processedPairs.has(pairKey)) continue;

          const dateDiffDays = calculateDateDifferenceDays(new Date(t1.date), new Date(t2.date));
          if (dateDiffDays === null || dateDiffDays > this.MAX_DATE_DIFFERENCE_DAYS) {
            continue;
          }

          const ref1 = normalizeReference(t1.sourceReference);
          const ref2 = normalizeReference(t2.sourceReference);
          const hasMatchingRef = Boolean(ref1 && ref2 && ref1 === ref2);

          const similarity = calculateDescriptionSimilarity(t1.description, t2.description);
          const hasSimilarDescription = similarity >= this.MIN_DESCRIPTION_SIMILARITY;

          // Equal amounts alone do NOT prove duplication - require matching reference or high description similarity
          if (!hasMatchingRef && !hasSimilarDescription) {
            continue;
          }

          processedPairs.add(pairKey);

          const severity =
            hasMatchingRef && dateDiffDays <= 2 ? ('high' as const) : ('medium' as const);
          const currency = t1.currency as SupportedCurrency;
          const txIds = [t1._id, t2._id].sort();

          const fingerprint = generateFindingFingerprint({
            organizationId: context.organizationId,
            ruleId: this.ruleId,
            ruleVersion: this.ruleVersion,
            findingType: this.findingType,
            currency,
            transactionIds: txIds,
          });

          findings.push({
            ruleId: this.ruleId,
            ruleVersion: this.ruleVersion,
            findingType: this.findingType,
            severity,
            title: `Potential Duplicate Payment (${currency} ${t1.amountDecimal})`,
            summary: `Two debit transactions of ${currency} ${t1.amountDecimal} were posted within ${dateDiffDays} day(s) with ${
              hasMatchingRef ? 'matching reference numbers' : 'highly similar merchant descriptions'
            }. This requires review to determine if an accidental duplicate charge occurred.`,
            primaryTransactionIds: [t1._id],
            relatedTransactionIds: [t2._id],
            currency,
            estimatedAmountMinor: t2.amountMinor,
            evidence: {
              ruleId: this.ruleId,
              ruleVersion: this.ruleVersion,
              reason: hasMatchingRef
                ? `Matching reference '${ref1}' with identical amount within ${dateDiffDays} day(s)`
                : `Description similarity ${(similarity * 100).toFixed(0)}% with identical amount within ${dateDiffDays} day(s)`,
              primaryTransactionIds: [t1._id],
              relatedTransactionIds: [t2._id],
              transactionDates: [new Date(t1.date).toISOString(), new Date(t2.date).toISOString()],
              amountsMinor: [t1.amountMinor, t2.amountMinor],
              currency,
              direction: 'debit',
              normalizedDescriptions: [t1.description, t2.description],
              dateDifferenceDays: dateDiffDays,
              dataQualityLimitations: [
                'Bank statement transactions may reflect separate legitimate transactions of equal value.',
                'Duplicate determination requires inspection of merchant receipts or bank clearance status.',
              ],
              recommendedChecks: [
                'Verify merchant invoices or order receipts for identical timestamp or order numbers.',
                'Check if one transaction was later reversed or credited.',
                'Confirm with vendor before requesting a bank chargeback or payment refund.',
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
