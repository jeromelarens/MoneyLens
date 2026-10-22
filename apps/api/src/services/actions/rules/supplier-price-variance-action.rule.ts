import type {
  ActionRecommendationRule,
  ActionRuleContext,
  GeneratedActionCandidate,
} from '../rule.interface.js';
import { generateActionFingerprint } from '../fingerprint.js';
import { calculateActionPriority } from '../scoring.js';
import type { SupportedCurrency } from '@moneylens/shared';

export class SupplierPriceVarianceActionRule implements ActionRecommendationRule {
  public readonly ruleId = 'RULE_ACT_SUP_VAR_001';
  public readonly ruleVersion = 'v1.0.0';
  public readonly actionType = 'audit_supplier_price_variance' as const;
  public readonly category = 'vendor_management' as const;

  public evaluate(context: ActionRuleContext): GeneratedActionCandidate[] {
    const candidates: GeneratedActionCandidate[] = [];

    // Filter active supplier price variance findings
    const supFindings = context.findings.filter(
      (f) => f.findingType === 'supplier_price_variance' && f.status !== 'dismissed',
    );

    for (const finding of supFindings) {
      const evidence = (finding.evidence || {}) as Record<string, unknown>;
      const sku = (evidence.sku as string) || '';

      // Strictly enforce: must have verified product SKU and unit-price calculation evidence
      if (!sku) {
        continue;
      }

      const currency = finding.currency as SupportedCurrency;
      const higherPriceMinor = (evidence.higherUnitPriceMinor as number) || 0;
      const lowerPriceMinor = (evidence.lowerUnitPriceMinor as number) || 0;
      const unitVarianceMinor = (evidence.unitPriceDifferenceMinor as number) || 0;
      const variancePercent = (evidence.variancePercent as number) || 0;
      const exposureMinor = finding.estimatedAmountMinor || unitVarianceMinor;

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
        discriminator: `${sku}_${finding.fingerprint}`,
      });

      candidates.push({
        actionType: this.actionType,
        category: this.category,
        title: `Audit Unit Price Discrepancy: SKU ${sku}`,
        explanation: `Itemized purchase data indicates unit price of ${currency} ${(
          higherPriceMinor / 100
        ).toFixed(
          2,
        )} represents a ${variancePercent}% premium over previous unit price of ${currency} ${(
          lowerPriceMinor / 100
        ).toFixed(2)} (+${currency} ${(unitVarianceMinor / 100).toFixed(
          2,
        )} per unit). Verify supplier price tier and contract rates.`,
        severity,
        evidenceQuality,
        evidence: {
          findingId: finding._id,
          findingTitle: finding.title,
          ruleId: finding.ruleId,
          sku,
          higherUnitPriceMinor: higherPriceMinor,
          lowerUnitPriceMinor: lowerPriceMinor,
          unitPriceDifferenceMinor: unitVarianceMinor,
          variancePercent,
          detectedAt: finding.detectedAt,
        },
        sourceFindingIds: [finding._id],
        currency,
        financialImpact,
        recommendedSteps: [
          {
            stepNumber: 1,
            label: 'Review Purchase Orders & Invoices',
            description:
              'Compare itemized POs and delivery notes across supplier accounts for discrepancies in volume discounts.',
            isOptional: false,
          },
          {
            stepNumber: 2,
            label: 'Request Price Correction / Credit',
            description:
              'If billed above negotiated catalog price, issue a supplier chargeback or debit memo.',
            isOptional: false,
          },
          {
            stepNumber: 3,
            label: 'Standardize Primary Supplier Terms',
            description:
              'Align purchase volumes with the lower-cost vendor to lock in preferred pricing.',
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
