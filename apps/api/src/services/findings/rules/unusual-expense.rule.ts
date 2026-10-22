import type {
  IDetectionRule,
  DetectionRuleContext,
  DetectionCandidateFinding,
} from '../rule.interface.js';
import { generateFindingFingerprint } from '../fingerprint.js';
import { normalizeDescription } from '../../reconciliation/scoring.js';
import type { SupportedCurrency } from '@moneylens/shared';

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const midVal = sorted[mid];
  if (sorted.length % 2 !== 0) {
    return midVal ?? 0;
  }
  const midPrev = sorted[mid - 1] ?? 0;
  return Math.round(((midVal ?? 0) + midPrev) / 2);
}

export class UnusualExpenseRule implements IDetectionRule {
  public readonly ruleId = 'RULE_UNUSUAL_001';
  public readonly ruleVersion = 'v1.0.0';
  public readonly findingType = 'unusual_expense' as const;
  public readonly name = 'Unusual Expense Detection';
  public readonly description =
    'Detects outgoing debit transactions that materially exceed historical baseline amounts for the same merchant or expense category.';

  public readonly MIN_OBSERVATIONS = 4;
  public readonly MIN_ABSOLUTE_DIFF_MINOR = 2000; // $20.00 minimum variance
  public readonly MIN_RELATIVE_RATIO = 2.5; // Amount is >= 250% of the median

  public async execute(context: DetectionRuleContext): Promise<DetectionCandidateFinding[]> {
    const findings: DetectionCandidateFinding[] = [];
    const debits = context.transactions.filter((tx) => tx.direction === 'debit');

    // Cluster by currency + accountId + primary merchant token
    const clusters = new Map<string, typeof debits>();
    for (const tx of debits) {
      const tokens = normalizeDescription(tx.description);
      const merchantKey = tokens.length > 0 ? tokens.slice(0, 2).join('_') : 'unknown';
      if (merchantKey === 'unknown') continue;

      const clusterKey = `${tx.currency}:${tx.accountId}:${merchantKey}`;
      const group = clusters.get(clusterKey) || [];
      group.push(tx);
      clusters.set(clusterKey, group);
    }

    for (const [, txs] of clusters) {
      // Require sufficient historical observations
      if (txs.length < this.MIN_OBSERVATIONS) {
        continue;
      }

      // Sort chronological
      txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Evaluate the latest transaction against the preceding baseline transactions
      const baselineTxs = txs.slice(0, -1);
      const targetTx = txs[txs.length - 1];

      if (!targetTx || baselineTxs.length < 3) continue;

      const firstBaseline = baselineTxs[0];
      const lastBaseline = baselineTxs[baselineTxs.length - 1];
      if (!firstBaseline || !lastBaseline) continue;

      const amounts = baselineTxs.map((t) => t.amountMinor);
      const medianAmountMinor = calculateMedian(amounts);

      // Safe arithmetic: if median is zero, skip relative percentage calculation to avoid division by zero
      if (medianAmountMinor <= 0) continue;

      const diffMinor = targetTx.amountMinor - medianAmountMinor;
      const ratio = targetTx.amountMinor / medianAmountMinor;

      if (diffMinor >= this.MIN_ABSOLUTE_DIFF_MINOR && ratio >= this.MIN_RELATIVE_RATIO) {
        const currency = targetTx.currency as SupportedCurrency;
        const percentageChange = Math.round(
          ((targetTx.amountMinor - medianAmountMinor) / medianAmountMinor) * 100,
        );

        const severity =
          ratio >= 4.0 && diffMinor >= 10000 ? ('high' as const) : ('medium' as const);

        const fingerprint = generateFindingFingerprint({
          organizationId: context.organizationId,
          ruleId: this.ruleId,
          ruleVersion: this.ruleVersion,
          findingType: this.findingType,
          currency,
          transactionIds: [targetTx._id],
          discriminator: targetTx.date.toISOString().split('T')[0],
        });

        const startDate = new Date(firstBaseline.date).toISOString().split('T')[0];
        const endDate = new Date(lastBaseline.date).toISOString().split('T')[0];

        findings.push({
          ruleId: this.ruleId,
          ruleVersion: this.ruleVersion,
          findingType: this.findingType,
          severity,
          title: `Unusual Expense Spike (${currency} ${targetTx.amountDecimal})`,
          summary: `Debit of ${currency} ${targetTx.amountDecimal} exceeds the typical baseline of ${currency} ${(
            medianAmountMinor / 100
          ).toFixed(
            2,
          )} by ${percentageChange}%. Observed ${baselineTxs.length} previous transactions between ${startDate} and ${endDate}.`,
          primaryTransactionIds: [targetTx._id],
          relatedTransactionIds: baselineTxs.map((t) => t._id),
          currency,
          estimatedAmountMinor: diffMinor,
          evidence: {
            ruleId: this.ruleId,
            ruleVersion: this.ruleVersion,
            reason: `Charge exceeds historical median by ${percentageChange}% (ratio ${ratio.toFixed(1)}x, baseline count: ${baselineTxs.length})`,
            primaryTransactionIds: [targetTx._id],
            relatedTransactionIds: baselineTxs.map((t) => t._id),
            transactionDates: [targetTx.date.toISOString()],
            amountsMinor: [targetTx.amountMinor],
            currency,
            direction: 'debit',
            normalizedDescriptions: [targetTx.description],
            actualAmountMinor: targetTx.amountMinor,
            amountDifferenceMinor: diffMinor,
            percentageChange,
            historicalComparisonPeriod: {
              startDate,
              endDate,
              observationCount: baselineTxs.length,
              medianAmountMinor,
              minAmountMinor: Math.min(...amounts),
              maxAmountMinor: Math.max(...amounts),
            },
            dataQualityLimitations: [
              'Baseline calculated exclusively from observed bank statement entries.',
              'One-off capital investments, seasonal inventory purchases, or prepaid services may be legitimate.',
            ],
            recommendedChecks: [
              'Verify vendor invoice to confirm whether quantity, rates, or billable scope changed.',
              'Check whether this represents an intentional annual prepay or bulk purchase.',
            ],
          },
          fingerprint,
        });
      }
    }

    return findings;
  }
}
