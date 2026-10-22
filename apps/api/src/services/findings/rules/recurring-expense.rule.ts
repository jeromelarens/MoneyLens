import type {
  IDetectionRule,
  DetectionRuleContext,
  DetectionCandidateFinding,
} from '../rule.interface.js';
import { generateFindingFingerprint } from '../fingerprint.js';
import { normalizeDescription, calculateDateDifferenceDays } from '../../reconciliation/scoring.js';
import type { SupportedCurrency } from '@moneylens/shared';

interface CadenceDef {
  label: string;
  expectedDays: number;
  toleranceDays: number;
}

const CADENCES: CadenceDef[] = [
  { label: 'Weekly', expectedDays: 7, toleranceDays: 2 },
  { label: 'Bi-Weekly', expectedDays: 14, toleranceDays: 3 },
  { label: 'Monthly', expectedDays: 30, toleranceDays: 5 },
  { label: 'Quarterly', expectedDays: 90, toleranceDays: 8 },
  { label: 'Annual', expectedDays: 365, toleranceDays: 15 },
];

export class RecurringExpenseRule implements IDetectionRule {
  public readonly ruleId = 'RULE_REC_001';
  public readonly ruleVersion = 'v1.0.0';
  public readonly findingType = 'recurring_expense' as const;
  public readonly name = 'Recurring Expense & Subscription Detection';
  public readonly description =
    'Identifies predictable recurring debit commitments (subscriptions, SaaS, utilities) based on consistent intervals and stable amounts.';

  public readonly MIN_OCCURRENCES = 3;
  public readonly MAX_AMOUNT_VARIANCE = 0.1; // Amount within +/-10%

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
      if (txs.length < this.MIN_OCCURRENCES) continue;

      // Sort ascending by date
      txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Check amount stability
      const amounts = txs.map((t) => t.amountMinor);
      const avgAmount = Math.round(amounts.reduce((sum, a) => sum + a, 0) / amounts.length);
      if (avgAmount === 0) continue;

      const allAmountsStable = amounts.every(
        (amt) => Math.abs(amt - avgAmount) / avgAmount <= this.MAX_AMOUNT_VARIANCE,
      );
      if (!allAmountsStable) continue;

      // Calculate sequential intervals
      const intervals: number[] = [];
      let validIntervals = true;
      for (let i = 1; i < txs.length; i++) {
        const prev = txs[i - 1];
        const curr = txs[i];
        if (!prev || !curr) {
          validIntervals = false;
          break;
        }
        const diff = calculateDateDifferenceDays(new Date(prev.date), new Date(curr.date));
        if (diff === null) {
          validIntervals = false;
          break;
        }
        intervals.push(diff);
      }
      if (!validIntervals || intervals.length === 0) continue;

      const avgInterval = intervals.reduce((sum, int) => sum + int, 0) / intervals.length;

      // Find matching cadence
      const matchedCadence = CADENCES.find((cadence) => {
        const diffFromExpected = Math.abs(avgInterval - cadence.expectedDays);
        if (diffFromExpected > cadence.toleranceDays) return false;
        // Ensure every interval is within tolerance
        return intervals.every(
          (int) => Math.abs(int - cadence.expectedDays) <= cadence.toleranceDays * 1.5,
        );
      });

      if (!matchedCadence) continue;

      const firstTx = txs[0];
      const lastTx = txs[txs.length - 1];
      if (!firstTx || !lastTx) continue;

      const currency = firstTx.currency as SupportedCurrency;
      const txIds = txs.map((t) => t._id);
      const tokens = normalizeDescription(firstTx.description);
      const merchantLabel = tokens.slice(0, 2).join(' ').toUpperCase();

      const fingerprint = generateFindingFingerprint({
        organizationId: context.organizationId,
        ruleId: this.ruleId,
        ruleVersion: this.ruleVersion,
        findingType: this.findingType,
        currency,
        transactionIds: txIds,
        discriminator: `${merchantLabel}_${matchedCadence.label}`,
      });

      const startDate = new Date(firstTx.date).toISOString().split('T')[0];
      const endDate = new Date(lastTx.date).toISOString().split('T')[0];

      findings.push({
        ruleId: this.ruleId,
        ruleVersion: this.ruleVersion,
        findingType: this.findingType,
        severity: 'low',
        title: `Recurring Expense: ${merchantLabel} (${matchedCadence.label})`,
        summary: `Detected ${matchedCadence.label.toLowerCase()} recurring expense of ~${currency} ${(
          avgAmount / 100
        ).toFixed(
          2,
        )} observed across ${txs.length} transactions between ${startDate} and ${endDate}.`,
        primaryTransactionIds: [lastTx._id],
        relatedTransactionIds: txIds.slice(0, -1),
        currency,
        estimatedAmountMinor: 0, // Informational recurring commitment - not marked as leakage
        evidence: {
          ruleId: this.ruleId,
          ruleVersion: this.ruleVersion,
          reason: `Observed ${txs.length} transactions on a ~${matchedCadence.expectedDays}-day ${matchedCadence.label.toLowerCase()} cadence with stable amounts.`,
          primaryTransactionIds: [lastTx._id],
          relatedTransactionIds: txIds.slice(0, -1),
          transactionDates: txs.map((t) => new Date(t.date).toISOString()),
          amountsMinor: amounts,
          currency,
          direction: 'debit',
          normalizedDescriptions: [firstTx.description],
          historicalComparisonPeriod: {
            startDate,
            endDate,
            observationCount: txs.length,
            baselineAmountMinor: avgAmount,
            cadenceDays: matchedCadence.expectedDays,
          },
          dataQualityLimitations: [
            'Grouping is based on normalized bank statement descriptions and observed intervals.',
            'Subscription classification is informational and does not imply an unwanted or unauthorized charge.',
          ],
          recommendedChecks: [
            'Review active software subscriptions and recurring supplier services.',
            'Confirm recurring charge aligns with current contracted terms and seats.',
          ],
        },
        fingerprint,
      });
    }

    return findings;
  }
}
