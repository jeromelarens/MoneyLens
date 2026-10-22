import type {
  IDetectionRule,
  DetectionRuleContext,
  DetectionCandidateFinding,
} from '../rule.interface.js';
import { generateFindingFingerprint } from '../fingerprint.js';
import { normalizeDescription, calculateDateDifferenceDays } from '../../reconciliation/scoring.js';
import type { SupportedCurrency } from '@moneylens/shared';

export class RecurringCostIncreaseRule implements IDetectionRule {
  public readonly ruleId = 'RULE_REC_INC_001';
  public readonly ruleVersion = 'v1.0.0';
  public readonly findingType = 'recurring_cost_increase' as const;
  public readonly name = 'Recurring Cost Increase Detection';
  public readonly description =
    'Identifies recurring expenses and subscriptions where the latest payment exceeds the established historical baseline amount.';

  public readonly MIN_HISTORICAL_SERIES = 3;
  public readonly MIN_PERCENT_INCREASE = 10; // At least 10% increase
  public readonly MIN_ABSOLUTE_INCREASE_MINOR = 500; // At least 500 minor units ($5.00)

  public async execute(context: DetectionRuleContext): Promise<DetectionCandidateFinding[]> {
    const findings: DetectionCandidateFinding[] = [];
    const debits = context.transactions.filter((tx) => tx.direction === 'debit');

    // Group by currency + merchant prefix
    const groups = new Map<string, typeof debits>();
    for (const tx of debits) {
      const tokens = normalizeDescription(tx.description);
      const merchantKey = tokens.length > 0 ? tokens.slice(0, 2).join('_') : 'unknown';
      if (merchantKey === 'unknown') continue;

      const groupKey = `${tx.currency}:${merchantKey}`;
      const group = groups.get(groupKey) || [];
      group.push(tx);
      groups.set(groupKey, group);
    }

    for (const [, txs] of groups) {
      // Need at least 3 baseline transactions plus 1 latest transaction = 4 total
      if (txs.length < this.MIN_HISTORICAL_SERIES + 1) continue;

      txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const baselineTxs = txs.slice(0, -1);
      const latestTx = txs[txs.length - 1];
      if (!latestTx || baselineTxs.length < this.MIN_HISTORICAL_SERIES) continue;

      const firstBaseline = baselineTxs[0];
      const lastBaseline = baselineTxs[baselineTxs.length - 1];
      if (!firstBaseline || !lastBaseline) continue;

      // Verify regular interval between transactions
      const intervals: number[] = [];
      for (let i = 1; i < baselineTxs.length; i++) {
        const prev = baselineTxs[i - 1];
        const curr = baselineTxs[i];
        if (!prev || !curr) continue;
        const diff = calculateDateDifferenceDays(new Date(prev.date), new Date(curr.date));
        if (diff !== null) intervals.push(diff);
      }
      if (intervals.length === 0) continue;

      const avgInterval = intervals.reduce((sum, int) => sum + int, 0) / intervals.length;
      // Interval must look recurring (between 5 and 100 days)
      if (avgInterval < 5 || avgInterval > 100) continue;

      // Verify baseline amount stability
      const baselineAmounts = baselineTxs.map((t) => t.amountMinor);
      const baselineAvg = Math.round(
        baselineAmounts.reduce((sum, a) => sum + a, 0) / baselineAmounts.length,
      );

      // Safe arithmetic: baseline must be positive
      if (baselineAvg <= 0) continue;

      const baselineStable = baselineAmounts.every(
        (amt) => Math.abs(amt - baselineAvg) / baselineAvg <= 0.08,
      );
      if (!baselineStable) continue;

      const diffMinor = latestTx.amountMinor - baselineAvg;
      const percentIncrease = Number(((diffMinor / baselineAvg) * 100).toFixed(1));

      if (
        diffMinor >= this.MIN_ABSOLUTE_INCREASE_MINOR &&
        percentIncrease >= this.MIN_PERCENT_INCREASE
      ) {
        const currency = latestTx.currency as SupportedCurrency;
        const tokens = normalizeDescription(latestTx.description);
        const merchantLabel = tokens.slice(0, 2).join(' ').toUpperCase();

        const severity =
          percentIncrease >= 30 && diffMinor >= 2000 ? ('high' as const) : ('medium' as const);

        const fingerprint = generateFindingFingerprint({
          organizationId: context.organizationId,
          ruleId: this.ruleId,
          ruleVersion: this.ruleVersion,
          findingType: this.findingType,
          currency,
          transactionIds: [latestTx._id],
          discriminator: `COST_INC_${latestTx.date.toISOString().split('T')[0]}`,
        });

        const startDate = new Date(firstBaseline.date).toISOString().split('T')[0];
        const endDate = new Date(lastBaseline.date).toISOString().split('T')[0];

        findings.push({
          ruleId: this.ruleId,
          ruleVersion: this.ruleVersion,
          findingType: this.findingType,
          severity,
          title: `Recurring Cost Increase: ${merchantLabel} (+${percentIncrease}%)`,
          summary: `Recurring charge for ${merchantLabel} increased from baseline of ${currency} ${(
            baselineAvg / 100
          ).toFixed(2)} to ${currency} ${latestTx.amountDecimal} (+${currency} ${(
            diffMinor / 100
          ).toFixed(2)}, +${percentIncrease}%).`,
          primaryTransactionIds: [latestTx._id],
          relatedTransactionIds: baselineTxs.map((t) => t._id),
          currency,
          estimatedAmountMinor: diffMinor,
          evidence: {
            ruleId: this.ruleId,
            ruleVersion: this.ruleVersion,
            reason: `Latest recurring payment increased by ${percentIncrease}% (+${currency} ${(
              diffMinor / 100
            ).toFixed(2)}) compared to baseline of ${baselineTxs.length} previous charges.`,
            primaryTransactionIds: [latestTx._id],
            relatedTransactionIds: baselineTxs.map((t) => t._id),
            transactionDates: [latestTx.date.toISOString()],
            amountsMinor: [latestTx.amountMinor],
            currency,
            direction: 'debit',
            normalizedDescriptions: [latestTx.description],
            actualAmountMinor: latestTx.amountMinor,
            amountDifferenceMinor: diffMinor,
            percentageChange: percentIncrease,
            historicalComparisonPeriod: {
              startDate,
              endDate,
              observationCount: baselineTxs.length,
              baselineAmountMinor: baselineAvg,
              cadenceDays: Math.round(avgInterval),
            },
            dataQualityLimitations: [
              'Plan tier changes, additional user seats, or usage-based billing can cause legitimate price increases.',
              'Comparison is based on normalized bank statement amounts without access to vendor invoices.',
            ],
            recommendedChecks: [
              'Check recent vendor communication for announced price increases.',
              'Verify if additional user licenses, usage overages, or service add-ons were added.',
              'Review cancellation terms or contract renewal options if increase is unbudgeted.',
            ],
          },
          fingerprint,
        });
      }
    }

    return findings;
  }
}
