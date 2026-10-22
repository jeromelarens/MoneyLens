import crypto from 'node:crypto';
import type { FindingType } from '@moneylens/shared';

export interface FingerprintParams {
  organizationId: string;
  ruleId: string;
  ruleVersion: string;
  findingType: FindingType;
  currency: string;
  transactionIds: string[];
  discriminator?: string;
}

/**
 * Generates a stable, deterministic SHA-256 fingerprint for a financial finding.
 * Transaction IDs are sorted to ensure identical sets generate identical fingerprints
 * regardless of detection iteration order.
 */
export function generateFindingFingerprint(params: FingerprintParams): string {
  const sortedTxIds = [...params.transactionIds].sort();
  const canonicalParts = [
    params.organizationId,
    params.ruleId,
    params.ruleVersion,
    params.findingType,
    params.currency.toUpperCase(),
    sortedTxIds.join(','),
  ];

  if (params.discriminator) {
    canonicalParts.push(params.discriminator);
  }

  const payload = canonicalParts.join('|');
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}
