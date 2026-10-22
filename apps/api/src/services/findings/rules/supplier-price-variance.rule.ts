import type {
  IDetectionRule,
  DetectionRuleContext,
  DetectionCandidateFinding,
} from '../rule.interface.js';
import { generateFindingFingerprint } from '../fingerprint.js';
import { parseInputToMinorUnits, type SupportedCurrency } from '@moneylens/shared';

interface LineItemData {
  sku: string;
  unitPriceMinor: number;
  quantity: number;
}

function extractLineItemData(
  rawSourceData?: Record<string, string> | null,
  currency: string = 'USD',
): LineItemData | null {
  if (!rawSourceData) return null;

  const sku =
    rawSourceData.sku ||
    rawSourceData.SKU ||
    rawSourceData.product_code ||
    rawSourceData.item_number;
  const unitPriceStr =
    rawSourceData.unit_price || rawSourceData.unitPrice || rawSourceData.item_price;
  const qtyStr = rawSourceData.quantity || rawSourceData.qty;

  if (!sku || !unitPriceStr) return null;

  const unitPriceMinor = parseInputToMinorUnits(unitPriceStr, currency);
  const qty = qtyStr ? parseInt(qtyStr, 10) : 1;

  if (unitPriceMinor === null || isNaN(qty) || unitPriceMinor <= 0 || qty <= 0) return null;

  return {
    sku: sku.trim().toUpperCase(),
    unitPriceMinor,
    quantity: qty,
  };
}

export class SupplierPriceVarianceRule implements IDetectionRule {
  public readonly ruleId = 'RULE_SUP_VAR_001';
  public readonly ruleVersion = 'v1.0.0';
  public readonly findingType = 'supplier_price_variance' as const;
  public readonly name = 'Supplier Line-Item Price Variance Detection';
  public readonly description =
    'Compares unit purchase prices for identical products/SKUs across supplier invoices when structured itemized data is present.';

  public readonly MIN_PRICE_VARIANCE_PERCENT = 10; // At least 10% unit price variance

  public async execute(context: DetectionRuleContext): Promise<DetectionCandidateFinding[]> {
    const findings: DetectionCandidateFinding[] = [];
    const debits = context.transactions.filter((tx) => tx.direction === 'debit');

    // Group by currency + SKU (only where valid itemized data exists)
    const skuBuckets = new Map<string, Array<{ tx: (typeof debits)[0]; item: LineItemData }>>();

    for (const tx of debits) {
      const item = extractLineItemData(tx.rawSourceData, tx.currency);
      if (!item) continue;

      const key = `${tx.currency}:${item.sku}`;
      const bucket = skuBuckets.get(key) || [];
      bucket.push({ tx, item });
      skuBuckets.set(key, bucket);
    }

    // If no line-item data exists across the ledger, return empty array (do not fabricate findings)
    if (skuBuckets.size === 0) {
      return [];
    }

    for (const [, entries] of skuBuckets) {
      if (entries.length < 2) continue;

      entries.sort((a, b) => new Date(a.tx.date).getTime() - new Date(b.tx.date).getTime());

      for (let i = 0; i < entries.length - 1; i++) {
        const baseline = entries[i];
        const latest = entries[entries.length - 1];

        if (!baseline || !latest) continue;
        if (baseline.tx._id === latest.tx._id) continue;

        const baselinePrice = baseline.item.unitPriceMinor;
        const latestPrice = latest.item.unitPriceMinor;

        if (baselinePrice <= 0) continue;

        const unitDiffMinor = latestPrice - baselinePrice;
        const percentChange = Number(((unitDiffMinor / baselinePrice) * 100).toFixed(1));

        if (percentChange >= this.MIN_PRICE_VARIANCE_PERCENT) {
          const currency = latest.tx.currency as SupportedCurrency;
          const totalExcessExposureMinor = unitDiffMinor * latest.item.quantity;

          const fingerprint = generateFindingFingerprint({
            organizationId: context.organizationId,
            ruleId: this.ruleId,
            ruleVersion: this.ruleVersion,
            findingType: this.findingType,
            currency,
            transactionIds: [baseline.tx._id, latest.tx._id],
            discriminator: `SKU_${latest.item.sku}`,
          });

          findings.push({
            ruleId: this.ruleId,
            ruleVersion: this.ruleVersion,
            findingType: this.findingType,
            severity: percentChange >= 25 ? 'high' : 'medium',
            title: `Supplier Price Variance: SKU ${latest.item.sku} (+${percentChange}%)`,
            summary: `Unit price for SKU ${latest.item.sku} increased from ${currency} ${(
              baselinePrice / 100
            ).toFixed(2)} to ${currency} ${(latestPrice / 100).toFixed(2)} (+${percentChange}%).`,
            primaryTransactionIds: [latest.tx._id],
            relatedTransactionIds: [baseline.tx._id],
            currency,
            estimatedAmountMinor: totalExcessExposureMinor,
            evidence: {
              ruleId: this.ruleId,
              ruleVersion: this.ruleVersion,
              reason: `Unit price increased from ${baselinePrice} to ${latestPrice} minor units (+${percentChange}%) for SKU ${latest.item.sku}`,
              primaryTransactionIds: [latest.tx._id],
              relatedTransactionIds: [baseline.tx._id],
              transactionDates: [latest.tx.date.toISOString(), baseline.tx.date.toISOString()],
              amountsMinor: [latest.tx.amountMinor, baseline.tx.amountMinor],
              currency,
              direction: 'debit',
              normalizedDescriptions: [latest.tx.description, baseline.tx.description],
              actualAmountMinor: latestPrice,
              amountDifferenceMinor: unitDiffMinor,
              percentageChange: percentChange,
              metadata: {
                sku: latest.item.sku,
                baselineUnitPriceMinor: baselinePrice,
                latestUnitPriceMinor: latestPrice,
                quantity: latest.item.quantity,
              },
              dataQualityLimitations: [
                'Unit price variance requires itemized invoice/receipt data with explicit SKUs and quantities.',
                'Volume purchase discounts, shipping costs, or supplier tiering may justify price differentials.',
              ],
              recommendedChecks: [
                'Verify purchase order terms and negotiated supplier rate card.',
                'Check if order quantity was below minimum volume discount threshold.',
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
