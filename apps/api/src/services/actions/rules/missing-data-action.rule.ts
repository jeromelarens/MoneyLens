import type {
  ActionRecommendationRule,
  ActionRuleContext,
  GeneratedActionCandidate,
} from '../rule.interface.js';
import { generateActionFingerprint } from '../fingerprint.js';
import { calculateActionPriority } from '../scoring.js';
import type { SupportedCurrency } from '@moneylens/shared';

export class MissingDataActionRule implements ActionRecommendationRule {
  public readonly ruleId = 'RULE_ACT_MISSING_DATA_001';
  public readonly ruleVersion = 'v1.0.0';
  public readonly actionType = 'complete_financial_data' as const;
  public readonly category = 'data_integrity' as const;

  public evaluate(context: ActionRuleContext): GeneratedActionCandidate[] {
    const candidates: GeneratedActionCandidate[] = [];

    // Case 1: Organization has zero transactions imported
    if (context.transactionsCount === 0) {
      const severity = 'critical' as const;
      const evidenceQuality = 'high' as const;

      const financialImpact = {
        currency: null,
        potentialExposureMinor: 0,
        estimatedAvoidableCostMinor: 0,
        confirmedIssueMinor: 0,
        projectedCashFlowEffectMinor: 0,
        realizedSavingsMinor: 0,
      };

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
        discriminator: 'ZERO_TRANSACTIONS',
      });

      candidates.push({
        actionType: this.actionType,
        category: this.category,
        title: 'Import Initial Bank Statement Data',
        explanation:
          'No transaction records have been imported yet. Leakage detection, reconciliation, and cash-flow forecasting require transaction history to generate financial intelligence.',
        severity,
        evidenceQuality,
        evidence: {
          transactionsCount: 0,
          accountsCount: context.accountsCount,
          reason: 'Zero ledger transactions found for organization.',
        },
        sourceFindingIds: [],
        currency: null,
        financialImpact,
        recommendedSteps: [
          {
            stepNumber: 1,
            label: 'Upload Bank or POS Statements',
            description:
              'Navigate to Ingestion and upload 90+ days of CSV or XLSX transaction records.',
            isOptional: false,
          },
          {
            stepNumber: 2,
            label: 'Run Ingestion Pipeline',
            description:
              'Verify column mappings and complete ingestion into the normalized ledger.',
            isOptional: false,
          },
        ],
        ruleId: this.ruleId,
        ruleVersion: this.ruleVersion,
        fingerprint,
        initialPriorityScore: priorityScore,
        initialPriority: priority,
      });

      return candidates;
    }

    // Case 2: Forecasts missing reliable opening balance
    const seenOpeningCurrencies = new Set<string>();
    for (const forecast of context.latestForecasts) {
      if (!forecast.hasReliableOpeningBalance && !seenOpeningCurrencies.has(forecast.currency)) {
        seenOpeningCurrencies.add(forecast.currency);

        const currency = forecast.currency as SupportedCurrency;
        const severity = 'high' as const;
        const evidenceQuality = 'high' as const;

        const financialImpact = {
          currency,
          potentialExposureMinor: 0,
          estimatedAvoidableCostMinor: 0,
          confirmedIssueMinor: 0,
          projectedCashFlowEffectMinor: 0,
          realizedSavingsMinor: 0,
        };

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
          sourceForecastRunId: forecast.forecastRunId,
          discriminator: `MISSING_OPENING_BALANCE_${currency}`,
        });

        candidates.push({
          actionType: this.actionType,
          category: this.category,
          title: `Provide Opening Account Balance (${currency})`,
          explanation: `Cash-flow forecast for ${currency} lacks a verified starting balance. Without an opening balance, MoneyLens can only project relative net changes rather than absolute liquidity or overdraft risk.`,
          severity,
          evidenceQuality,
          evidence: {
            forecastId: forecast._id,
            forecastRunId: forecast.forecastRunId,
            currency,
            hasReliableOpeningBalance: false,
            dataQuality: forecast.dataQuality,
          },
          sourceFindingIds: [],
          sourceForecastRunId: forecast.forecastRunId,
          currency,
          financialImpact,
          recommendedSteps: [
            {
              stepNumber: 1,
              label: 'Verify Current Bank Balance',
              description:
                'Retrieve the latest cleared balance from your financial institution or statement.',
              isOptional: false,
            },
            {
              stepNumber: 2,
              label: 'Import Statement with Opening Balance',
              description:
                'Ingest a bank statement that includes an explicit statement balance header.',
              isOptional: false,
            },
            {
              stepNumber: 3,
              label: 'Rerun Cash Flow Forecast',
              description:
                'Generate an updated projection to evaluate absolute cash reserves and liquidity cushions.',
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
    }

    return candidates;
  }
}
