import crypto from 'node:crypto';

export function generateActionFingerprint(params: {
  organizationId: string;
  ruleId: string;
  ruleVersion: string;
  actionType: string;
  currency?: string | null;
  sourceFindingIds?: string[];
  sourceForecastRunId?: string | null;
  discriminator?: string;
}): string {
  const sortedFindings = [...(params.sourceFindingIds || [])].sort().join(',');
  const raw = [
    params.organizationId,
    params.ruleId,
    params.ruleVersion,
    params.actionType,
    params.currency || 'NONE',
    sortedFindings,
    params.sourceForecastRunId || 'NONE',
    params.discriminator || 'NONE',
  ].join('|');

  return crypto.createHash('sha256').update(raw).digest('hex');
}
