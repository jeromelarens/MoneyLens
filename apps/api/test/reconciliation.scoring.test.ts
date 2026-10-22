import { describe, it, expect } from 'vitest';
import {
  normalizeReference,
  calculateDescriptionSimilarity,
  hasTransferKeywords,
  calculateDateDifferenceDays,
  evaluateCandidate,
} from '../src/services/reconciliation/scoring.js';
import type { ITransaction } from '../src/infrastructure/database/models/index.js';

describe('Reconciliation Engine — Deterministic Rules & Scoring', () => {
  describe('normalizeReference', () => {
    it('normalizes references by trimming, uppercasing, and removing special characters', () => {
      expect(normalizeReference(' tx-123_456 ')).toBe('TX123456');
      expect(normalizeReference('REF#9988-ABC')).toBe('REF9988ABC');
      expect(normalizeReference('')).toBe('');
      expect(normalizeReference(null)).toBe('');
    });

    it('rejects generic placeholder references as empty strings', () => {
      expect(normalizeReference('N/A')).toBe('');
      expect(normalizeReference('NA')).toBe('');
      expect(normalizeReference('NONE')).toBe('');
      expect(normalizeReference('NULL')).toBe('');
      expect(normalizeReference('REF')).toBe('');
      expect(normalizeReference('UNKNOWN')).toBe('');
      expect(normalizeReference('000')).toBe('');
      expect(normalizeReference('000000')).toBe('');
      expect(normalizeReference('VOID')).toBe('');
    });
  });

  describe('calculateDescriptionSimilarity & hasTransferKeywords', () => {
    it('calculates token overlap accurately', () => {
      const descA = 'Office Depot Supplies San Francisco';
      const descB = 'Office Depot Supplies Austin';
      const sim = calculateDescriptionSimilarity(descA, descB);
      expect(sim).toBeGreaterThanOrEqual(0.5);
    });

    it('returns 0 for completely disjoint descriptions', () => {
      const sim = calculateDescriptionSimilarity('Amazon Web Services', 'Starbucks Coffee');
      expect(sim).toBe(0);
    });

    it('returns 0 when either description is empty', () => {
      expect(calculateDescriptionSimilarity('', 'Vendor Payment')).toBe(0);
      expect(calculateDescriptionSimilarity('Vendor Payment', '')).toBe(0);
    });

    it('identifies transfer keywords accurately', () => {
      expect(hasTransferKeywords('Internal Transfer to Checking')).toBe(true);
      expect(hasTransferKeywords('Wire Out to Vendor')).toBe(true);
      expect(hasTransferKeywords('ACH Payout Stripe')).toBe(true);
      expect(hasTransferKeywords('Grocery Store Purchase')).toBe(false);
    });
  });

  describe('calculateDateDifferenceDays', () => {
    it('calculates calendar day difference in UTC', () => {
      const d1 = new Date('2026-03-01T10:00:00Z');
      const d2 = new Date('2026-03-04T18:00:00Z');
      expect(calculateDateDifferenceDays(d1, d2)).toBe(3);
    });

    it('returns 0 for same day timestamps in UTC', () => {
      const d1 = new Date('2026-03-01T02:00:00Z');
      const d2 = new Date('2026-03-01T22:00:00Z');
      expect(calculateDateDifferenceDays(d1, d2)).toBe(0);
    });

    it('returns null if either date is invalid', () => {
      const invalidDate = new Date('invalid-date');
      const validDate = new Date('2026-03-01T00:00:00Z');
      expect(calculateDateDifferenceDays(invalidDate, validDate)).toBeNull();
      expect(calculateDateDifferenceDays(validDate, invalidDate)).toBeNull();
    });
  });

  describe('evaluateCandidate', () => {
    const baseSource: Partial<ITransaction> = {
      _id: 'tx-source-1',
      organizationId: 'org-1',
      accountId: 'acc-checking',
      date: new Date('2026-03-01T00:00:00Z'),
      description: 'Transfer Out to Savings',
      direction: 'debit',
      amountMinor: 50000,
      currency: 'USD',
      sourceReference: 'XFER-20260301-99',
    };

    const baseCandidate: Partial<ITransaction> = {
      _id: 'tx-candidate-1',
      organizationId: 'org-1',
      accountId: 'acc-savings',
      date: new Date('2026-03-02T00:00:00Z'),
      description: 'Transfer In from Checking',
      direction: 'credit',
      amountMinor: 50000,
      currency: 'USD',
      sourceReference: 'XFER-20260301-99',
    };

    it('evaluates exact reference match with high score and suggested status', () => {
      const result = evaluateCandidate(
        baseSource as ITransaction,
        baseCandidate as ITransaction,
        3,
        1,
      );

      expect(result).not.toBeNull();
      expect(result?.matchMethod).toBe('exact_reference');
      expect(result?.status).toBe('suggested');
      expect(result?.matchScore).toBeGreaterThanOrEqual(90);
      expect(result?.evidence.externalReferenceMatch).toBe(true);
      expect(result?.evidence.amountMatch).toBe(true);
      expect(result?.evidence.directionCompatible).toBe(true);
    });

    it('rejects cross-currency candidates immediately', () => {
      const inrCandidate: Partial<ITransaction> = {
        ...baseCandidate,
        currency: 'INR',
      };

      const result = evaluateCandidate(
        baseSource as ITransaction,
        inrCandidate as ITransaction,
        3,
        1,
      );
      expect(result).toBeNull();
    });

    it('rejects candidates when amounts in minor units do not match', () => {
      const differentAmountCandidate: Partial<ITransaction> = {
        ...baseCandidate,
        amountMinor: 50001, // 1 cent difference
      };

      const result = evaluateCandidate(
        baseSource as ITransaction,
        differentAmountCandidate as ITransaction,
        3,
        1,
      );
      expect(result).toBeNull();
    });

    it('rejects candidates exceeding the date tolerance', () => {
      const lateCandidate: Partial<ITransaction> = {
        ...baseCandidate,
        date: new Date('2026-03-10T00:00:00Z'), // 9 days later
      };

      const result = evaluateCandidate(
        baseSource as ITransaction,
        lateCandidate as ITransaction,
        3, // 3 days tolerance
        1,
      );
      expect(result).toBeNull();
    });

    it('excludes self-matches', () => {
      const result = evaluateCandidate(
        baseSource as ITransaction,
        baseSource as ITransaction,
        3,
        1,
      );
      expect(result).toBeNull();
    });

    it('flags candidate as needs_review when multiple competing candidates exist', () => {
      const noRefSource: Partial<ITransaction> = {
        ...baseSource,
        sourceReference: null,
      };
      const noRefCandidate: Partial<ITransaction> = {
        ...baseCandidate,
        sourceReference: null,
      };

      const candidateIds = ['tx-cand-1', 'tx-cand-2', 'tx-cand-3'];
      const result = evaluateCandidate(
        noRefSource as ITransaction,
        noRefCandidate as ITransaction,
        3,
        3, // 3 competing candidates
        candidateIds,
      );

      expect(result).not.toBeNull();
      expect(result?.status).toBe('needs_review');
      expect(result?.reviewReason).toContain('competing candidates');
      expect(result?.evidence.competingCandidatesCount).toBe(3);
      expect(result?.evidence.competingCandidateIds).toEqual(candidateIds);
    });

    it('does not classify equal amount opposite directions as transfer_match without transfer evidence', () => {
      const unrelatedSource: Partial<ITransaction> = {
        _id: 'tx-unrel-1',
        organizationId: 'org-1',
        accountId: 'acc-1',
        date: new Date('2026-03-01T00:00:00Z'),
        description: 'Office Supplies Purchase',
        direction: 'debit',
        amountMinor: 50000,
        currency: 'USD',
        sourceReference: null,
      };

      const unrelatedCandidate: Partial<ITransaction> = {
        _id: 'tx-unrel-2',
        organizationId: 'org-1',
        accountId: 'acc-2',
        date: new Date('2026-03-01T00:00:00Z'),
        description: 'Customer Refund Credit',
        direction: 'credit',
        amountMinor: 50000,
        currency: 'USD',
        sourceReference: null,
      };

      const result = evaluateCandidate(
        unrelatedSource as ITransaction,
        unrelatedCandidate as ITransaction,
        3,
        1,
      );

      expect(result).not.toBeNull();
      // Must NOT be classified as transfer_match without transfer narrative
      expect(result?.matchMethod).toBe('amount_date_description');
      expect(result?.status).toBe('needs_review');
      expect(result?.evidence.notes).toEqual(
        expect.arrayContaining([expect.stringContaining('unrelated narratives')]),
      );
    });

    it('rejects candidate when date tolerance is negative or exceeds 30 days', () => {
      expect(
        evaluateCandidate(baseSource as ITransaction, baseCandidate as ITransaction, -1, 1),
      ).toBeNull();

      expect(
        evaluateCandidate(baseSource as ITransaction, baseCandidate as ITransaction, 31, 1),
      ).toBeNull();
    });

    it('rejects candidate when either transaction date is invalid', () => {
      const invalidSource: Partial<ITransaction> = {
        ...baseSource,
        date: new Date('not-a-date'),
      };

      expect(
        evaluateCandidate(invalidSource as ITransaction, baseCandidate as ITransaction, 3, 1),
      ).toBeNull();
    });

    it('evaluates description similarity accurately when transfer keywords are absent', () => {
      const storeSource: Partial<ITransaction> = {
        _id: 'tx-store-1',
        organizationId: 'org-1',
        accountId: 'acc-1',
        date: new Date('2026-03-01T00:00:00Z'),
        description: 'Acme Wholesale Goods Seattle Warehouse',
        direction: 'debit',
        amountMinor: 75000,
        currency: 'USD',
        sourceReference: null,
      };

      const storeCandidate: Partial<ITransaction> = {
        _id: 'tx-store-2',
        organizationId: 'org-1',
        accountId: 'acc-1',
        date: new Date('2026-03-01T00:00:00Z'),
        description: 'Acme Wholesale Goods Portland Delivery',
        direction: 'credit',
        amountMinor: 75000,
        currency: 'USD',
        sourceReference: null,
      };

      const result = evaluateCandidate(
        storeSource as ITransaction,
        storeCandidate as ITransaction,
        3,
        1,
      );

      expect(result).not.toBeNull();
      expect(result?.matchMethod).toBe('amount_date_description');
      expect(result?.evidence.descriptionSimilarity).toBeGreaterThan(0.4);
    });

    it('produces deterministic scores across repeated executions', () => {
      const run1 = evaluateCandidate(
        baseSource as ITransaction,
        baseCandidate as ITransaction,
        3,
        1,
      );
      const run2 = evaluateCandidate(
        baseSource as ITransaction,
        baseCandidate as ITransaction,
        3,
        1,
      );

      expect(run1?.matchScore).toBe(run2?.matchScore);
      expect(run1?.evidence).toEqual(run2?.evidence);
      expect(run1?.matchScore).toBeGreaterThanOrEqual(0);
      expect(run1?.matchScore).toBeLessThanOrEqual(100);
    });
  });
});
