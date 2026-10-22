import type { IFinancialExplainer } from './explainer.interface.js';
import type { AiExplanation, FinancialFinding } from '@moneylens/shared';
import { aiExplanationSchema } from '@moneylens/shared';

export class DeterministicExplainer implements IFinancialExplainer {
  public async explain(finding: FinancialFinding): Promise<AiExplanation> {
    const { evidence } = finding;
    const whyItWasFlagged = evidence.reason || finding.summary;

    let evidenceSummary = `Evaluated against rule ${finding.ruleId} (${finding.ruleVersion}). Primary transactions: ${finding.primaryTransactionIds.join(', ')}.`;

    const amount0 = evidence.amountsMinor?.[0];
    if (amount0 !== undefined) {
      evidenceSummary += ` Amount: ${finding.currency} ${(amount0 / 100).toFixed(2)}.`;
    }

    if (evidence.dateDifferenceDays !== undefined) {
      evidenceSummary += ` Time difference: ${evidence.dateDifferenceDays} day(s).`;
    }

    if (evidence.historicalComparisonPeriod) {
      const p = evidence.historicalComparisonPeriod;
      evidenceSummary += ` Evaluated across ${p.observationCount || 0} historical records from ${p.startDate || 'N/A'} to ${p.endDate || 'N/A'}.`;
    }

    const recommendedChecks =
      evidence.recommendedChecks && evidence.recommendedChecks.length > 0
        ? evidence.recommendedChecks
        : [
            'Inspect original counterparty statements and invoices.',
            'Confirm internal business authorization for this transaction.',
            'Ensure counterparty banking details match the approved vendor registry.',
          ];

    const limitations =
      evidence.dataQualityLimitations && evidence.dataQualityLimitations.length > 0
        ? evidence.dataQualityLimitations
        : [
            'Analysis is based on normalized statement ledger transactions.',
            'This finding represents an alert for review, not a confirmation of billing error or fraud.',
          ];

    const explanation: AiExplanation = {
      findingId: finding.id,
      organizationId: finding.organizationId,
      summary: finding.summary,
      whyItWasFlagged,
      evidenceSummary,
      recommendedChecks,
      limitations,
      generatedAt: new Date().toISOString(),
      provider: 'deterministic_rule_engine',
    };

    // Strict contract validation
    return aiExplanationSchema.parse(explanation);
  }
}
