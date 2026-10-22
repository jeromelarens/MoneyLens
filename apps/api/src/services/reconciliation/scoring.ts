import type { ITransaction } from '../../infrastructure/database/models/index.js';
import type { ReconciliationMatchMethod, ReconciliationEvidence } from '@moneylens/shared';

export const RULES_VERSION = 'v1.0.0';

const TRANSFER_KEYWORDS = new Set([
  'transfer',
  'wire',
  'internal',
  'ach',
  'payout',
  'sweep',
  'settlement',
  'contra',
  'xfer',
  'tfr',
  'interac',
  'neft',
  'rtgs',
  'imps',
  'upi',
]);

const PLACEHOLDER_REFERENCES = new Set([
  'NA',
  'NONE',
  'NULL',
  'REF',
  'UNKNOWN',
  'TEST',
  'NIL',
  'VOID',
  '000',
  '000000',
  'TRANSACTION',
  'DEFAULT',
]);

/**
 * Normalizes an external reference string for deterministic comparison.
 * Filters out common non-unique placeholders.
 */
export function normalizeReference(ref?: string | null): string {
  if (!ref) return '';
  const cleaned = ref
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (PLACEHOLDER_REFERENCES.has(cleaned)) {
    return '';
  }
  return cleaned;
}

/**
 * Normalizes transaction description for comparison.
 */
export function normalizeDescription(desc: string): string[] {
  if (!desc) return [];
  return desc
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((token) => token.length > 1);
}

/**
 * Calculates token-based Jaccard similarity between two descriptions (0.0 to 1.0).
 */
export function calculateDescriptionSimilarity(descA: string, descB: string): number {
  const tokensA = new Set(normalizeDescription(descA));
  const tokensB = new Set(normalizeDescription(descB));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersectionCount = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersectionCount++;
    }
  }

  const unionSize = new Set([...tokensA, ...tokensB]).size;
  if (unionSize === 0) return 0;

  return Number((intersectionCount / unionSize).toFixed(4));
}

/**
 * Checks if a description contains recognized transfer or inter-account keywords.
 */
export function hasTransferKeywords(desc: string): boolean {
  const tokens = normalizeDescription(desc);
  return tokens.some((token) => TRANSFER_KEYWORDS.has(token));
}

/**
 * Calculates calendar day difference between two dates in UTC.
 * Returns null if either date is invalid.
 */
export function calculateDateDifferenceDays(dateA: Date, dateB: Date): number | null {
  if (!dateA || !dateB || isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
    return null;
  }
  const utcA = Date.UTC(dateA.getUTCFullYear(), dateA.getUTCMonth(), dateA.getUTCDate());
  const utcB = Date.UTC(dateB.getUTCFullYear(), dateB.getUTCMonth(), dateB.getUTCDate());
  const diffMs = Math.abs(utcA - utcB);
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export interface CandidateEvaluationResult {
  candidate: ITransaction;
  matchMethod: ReconciliationMatchMethod;
  matchScore: number;
  status: 'suggested' | 'needs_review';
  evidence: ReconciliationEvidence;
  amountDifferenceMinor: number;
  dateDifferenceDays: number;
  reviewReason?: string;
}

/**
 * Evaluates a single candidate transaction against a source transaction using deterministic rules.
 */
export function evaluateCandidate(
  source: ITransaction,
  candidate: ITransaction,
  dateToleranceDays: number,
  competingCandidatesCount: number,
  competingCandidateIds?: string[],
): CandidateEvaluationResult | null {
  // Validate date tolerance bounds
  if (dateToleranceDays < 0 || dateToleranceDays > 30) {
    return null;
  }

  // Rule 1: Exclude self-matches
  if (source._id === candidate._id) {
    return null;
  }

  // Rule 2: Currency compatibility (Never compare different currencies directly)
  if (source.currency !== candidate.currency) {
    return null;
  }

  // Amount difference
  const amountDifferenceMinor = Math.abs(source.amountMinor - candidate.amountMinor);

  // Exact amount is required for initial rules
  if (amountDifferenceMinor !== 0) {
    return null;
  }

  // Direction compatibility
  // Across accounts or statements: a transfer or offsetting record typically pairs debit with credit
  const isOppositeDirection =
    (source.direction === 'debit' && candidate.direction === 'credit') ||
    (source.direction === 'credit' && candidate.direction === 'debit');

  const isSameAccount = source.accountId === candidate.accountId;

  // Date difference calculation with UTC boundary handling
  const dateDiffDays = calculateDateDifferenceDays(source.date, candidate.date);
  if (dateDiffDays === null || dateDiffDays > dateToleranceDays) {
    return null;
  }

  // External reference comparison (excluding placeholders)
  const normSourceRef = normalizeReference(source.sourceReference);
  const normCandidateRef = normalizeReference(candidate.sourceReference);
  const isReferenceMatch =
    normSourceRef.length >= 3 && normCandidateRef.length >= 3 && normSourceRef === normCandidateRef;

  // Description similarity
  const descSim = calculateDescriptionSimilarity(source.description, candidate.description);
  const transferWordsPresent =
    hasTransferKeywords(source.description) || hasTransferKeywords(candidate.description);

  // Rule evaluation and method determination
  let matchMethod: ReconciliationMatchMethod;
  let matchScore = 0;
  const notes: string[] = [];

  // Base score for exact amount and currency
  matchScore += 30; // exact amount
  matchScore += 10; // exact currency

  if (isOppositeDirection) {
    matchScore += 20; // direction compatible
  }

  // Date scoring
  if (dateDiffDays === 0) {
    matchScore += 10;
  } else if (dateDiffDays === 1) {
    matchScore += 7;
  } else {
    matchScore += Math.max(1, 10 - dateDiffDays * 3);
  }

  if (isReferenceMatch) {
    matchMethod = 'exact_reference';
    matchScore += 30;
    notes.push(`Exact external reference match: ${source.sourceReference}`);
  } else if (!isSameAccount && isOppositeDirection && (transferWordsPresent || descSim > 0.3)) {
    matchMethod = 'transfer_match';
    matchScore += transferWordsPresent ? 20 : 15;
    notes.push('Inter-account transfer match across distinct accounts with narrative alignment');
  } else if (descSim > 0.4) {
    matchMethod = 'amount_date_description';
    matchScore += Math.round(descSim * 20);
    notes.push(`Description similarity: ${(descSim * 100).toFixed(0)}%`);
  } else {
    // Unrelated descriptions across accounts must NOT be assumed to be a transfer without evidence
    matchMethod = 'amount_date_description';
    matchScore += 5;
    if (isOppositeDirection && !isSameAccount) {
      notes.push('Equal amount and opposite direction across accounts, but unrelated narratives');
    } else {
      notes.push('Matching amount and date within tolerance');
    }
  }

  // If multiple candidates exist with matching criteria, penalize and require review
  let status: 'suggested' | 'needs_review' = 'suggested';
  let reviewReason: string | undefined;

  if (competingCandidatesCount > 1) {
    matchScore = Math.max(30, matchScore - 25);
    status = 'needs_review';
    reviewReason = `Found ${competingCandidatesCount} competing candidates with matching amount and compatible date. Manual review required.`;
    notes.push(reviewReason);
  } else if (matchMethod === 'amount_date_description' && descSim <= 0.4) {
    status = 'needs_review';
    reviewReason =
      'Amount and date match without external reference or narrative alignment; manual review required';
    notes.push(reviewReason);
  } else if (matchScore < 80) {
    status = 'needs_review';
    reviewReason = 'Moderate confidence match requiring human review';
  }

  // Ensure score is strictly bounded [0, 100]
  matchScore = Math.min(100, Math.max(0, matchScore));

  const evidence: ReconciliationEvidence = {
    externalReferenceMatch: isReferenceMatch,
    amountMatch: true,
    currencyMatch: true,
    dateDifferenceDays: dateDiffDays,
    descriptionSimilarity: descSim,
    directionCompatible: isOppositeDirection,
    competingCandidatesCount,
    competingCandidateIds,
    notes,
  };

  return {
    candidate,
    matchMethod,
    matchScore,
    status,
    evidence,
    amountDifferenceMinor: 0,
    dateDifferenceDays: dateDiffDays,
    reviewReason,
  };
}
