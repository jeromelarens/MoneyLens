import { describe, it, expect } from 'vitest';
import {
  parseDate,
  parseAmount,
  parseToMinorUnits,
  getCurrencyDecimals,
  sanitizeText,
  generateTransactionFingerprint,
  computeFileHash,
} from '../src/services/normalization.js';

describe('Financial Normalization Engine', () => {
  describe('parseDate', () => {
    it('parses standard ISO date formats correctly', () => {
      const d1 = parseDate('2026-03-15');
      expect(d1).not.toBeNull();
      expect(d1!.getUTCFullYear()).toBe(2026);
      expect(d1!.getUTCMonth()).toBe(2); // March = 2 (0-indexed)
      expect(d1!.getUTCDate()).toBe(15);
    });

    it('parses US format MM/DD/YYYY', () => {
      const d = parseDate('03/15/2026', 'MM/DD/YYYY');
      expect(d).not.toBeNull();
      expect(d!.getUTCFullYear()).toBe(2026);
      expect(d!.getUTCMonth()).toBe(2);
      expect(d!.getUTCDate()).toBe(15);
    });

    it('parses EU format DD/MM/YYYY', () => {
      const d = parseDate('15/03/2026', 'DD/MM/YYYY');
      expect(d).not.toBeNull();
      expect(d!.getUTCFullYear()).toBe(2026);
      expect(d!.getUTCMonth()).toBe(2);
      expect(d!.getUTCDate()).toBe(15);
    });

    it('parses Excel serial date numbers', () => {
      // 44927 is 2023-01-01
      const d = parseDate(44927);
      expect(d).not.toBeNull();
      expect(d!.getUTCFullYear()).toBe(2023);
      expect(d!.getUTCMonth()).toBe(0);
      expect(d!.getUTCDate()).toBe(1);
    });

    it('returns null for invalid dates', () => {
      expect(parseDate('not-a-date')).toBeNull();
      expect(parseDate('')).toBeNull();
      expect(parseDate(null)).toBeNull();
      expect(parseDate('2026-99-99')).toBeNull();
    });
  });

  describe('parseAmount & Financial Precision (Audit A)', () => {
    it('converts boundary values (0.01, 1.10, 1000.99) without floating-point distortion', () => {
      expect(parseAmount('0.01', undefined, undefined, undefined, 'USD')).toEqual({
        amountMinor: 1,
        amountDecimal: '0.01',
        direction: 'credit',
      });

      expect(parseAmount('1.10', undefined, undefined, undefined, 'USD')).toEqual({
        amountMinor: 110,
        amountDecimal: '1.10',
        direction: 'credit',
      });

      expect(parseAmount('1000.99', undefined, undefined, undefined, 'USD')).toEqual({
        amountMinor: 100099,
        amountDecimal: '1000.99',
        direction: 'credit',
      });
    });

    it('parses INR amounts with ₹ and Indian grouping separators (lakhs & crores)', () => {
      const res1 = parseAmount('₹1,234.56', undefined, undefined, undefined, 'INR');
      expect(res1).toEqual({
        amountMinor: 123456,
        amountDecimal: '1234.56',
        direction: 'credit',
      });

      // 12,34,567.89 INR (12 lakhs 34 thousand 567 rupees and 89 paise)
      const res2 = parseAmount('₹12,34,567.89', undefined, undefined, undefined, 'INR');
      expect(res2).toEqual({
        amountMinor: 123456789,
        amountDecimal: '1234567.89',
        direction: 'credit',
      });
    });

    it('supports zero-decimal currencies (JPY) correctly', () => {
      expect(getCurrencyDecimals('JPY')).toBe(0);

      const jpyRes = parseAmount('¥1,500', undefined, undefined, undefined, 'JPY');
      expect(jpyRes).toEqual({
        amountMinor: 1500,
        amountDecimal: '1500',
        direction: 'credit',
      });

      // Fractional digits in JPY are rejected (not silently rounded or truncated)
      expect(parseAmount('1500.50', undefined, undefined, undefined, 'JPY')).toBeNull();
    });

    it('supports three-decimal currencies (KWD, BHD, OMR) correctly', () => {
      expect(getCurrencyDecimals('KWD')).toBe(3);

      const kwdRes = parseAmount('1.250', undefined, undefined, undefined, 'KWD');
      expect(kwdRes).toEqual({
        amountMinor: 1250,
        amountDecimal: '1.250',
        direction: 'credit',
      });

      // 4 fractional digits in KWD is rejected
      expect(parseAmount('1.2505', undefined, undefined, undefined, 'KWD')).toBeNull();
    });

    it('rejects excess fractional digits instead of silently guessing or rounding', () => {
      // USD has 2 decimals, 3 decimals should be rejected
      expect(parseAmount('100.999', undefined, undefined, undefined, 'USD')).toBeNull();
      expect(parseAmount('0.001', undefined, undefined, undefined, 'USD')).toBeNull();
      expect(parseAmount('12.3456', undefined, undefined, undefined, 'USD')).toBeNull();
    });

    it('handles negative values, trailing minus, and parenthesized bank outflow amounts', () => {
      const negRes = parseAmount('-100.50');
      expect(negRes).toEqual({
        amountMinor: 10050,
        amountDecimal: '100.50',
        direction: 'debit',
      });

      const trailRes = parseAmount('100.50-');
      expect(trailRes).toEqual({
        amountMinor: 10050,
        amountDecimal: '100.50',
        direction: 'debit',
      });

      const parenRes = parseAmount('(250.75)');
      expect(parenRes).toEqual({
        amountMinor: 25075,
        amountDecimal: '250.75',
        direction: 'debit',
      });
    });

    it('handles separate debit and credit columns correctly', () => {
      const debitRes = parseAmount(undefined, '45.00', undefined);
      expect(debitRes).toEqual({
        amountMinor: 4500,
        amountDecimal: '45.00',
        direction: 'debit',
      });

      const creditRes = parseAmount(undefined, undefined, '800.00');
      expect(creditRes).toEqual({
        amountMinor: 80000,
        amountDecimal: '800.00',
        direction: 'credit',
      });
    });

    it('rejects invalid separators, scientific notation, and alphabetic garbage', () => {
      expect(parseAmount('1,2,3.45')).toBeNull(); // malformed grouping
      expect(parseAmount('1.2.3.45')).toBeNull(); // multiple dots
      expect(parseAmount('1e5')).toBeNull(); // scientific notation
      expect(parseAmount('1E5')).toBeNull(); // scientific notation
      expect(parseAmount('10-0')).toBeNull(); // internal sign
      expect(parseAmount('--100')).toBeNull(); // multiple signs
      expect(parseAmount('abc')).toBeNull(); // alphabetic garbage
      expect(parseAmount('100usd')).toBeNull(); // trailing alphanumeric attached without space
      expect(parseAmount('')).toBeNull(); // empty
      expect(parseAmount(null)).toBeNull(); // null
    });

    it('rejects unsafe integer overflow boundaries', () => {
      const overflowNum = Number.MAX_SAFE_INTEGER + 1000;
      expect(parseToMinorUnits(overflowNum)).toBeNull();
      expect(parseToMinorUnits('99999999999999999999.99')).toBeNull();
    });

    it('guarantees repeated parsing of the same value produces identical results', () => {
      const val = '1,250.75';
      const r1 = parseAmount(val, undefined, undefined, undefined, 'USD');
      const r2 = parseAmount(val, undefined, undefined, undefined, 'USD');
      const r3 = parseAmount(val, undefined, undefined, undefined, 'USD');

      expect(r1).toEqual(r2);
      expect(r2).toEqual(r3);
    });
  });

  describe('sanitizeText (Formula Injection Defense - Audit D)', () => {
    it('escapes cells starting with formula trigger characters (=, @, +cmd, -cmd, tab)', () => {
      expect(sanitizeText('=SUM(A1:B1)')).toBe(`'=SUM(A1:B1)`);
      expect(sanitizeText('+cmd|/c calc')).toBe(`'+cmd|/c calc`);
      expect(sanitizeText('-cmd|/c calc')).toBe(`'-cmd|/c calc`);
      expect(sanitizeText('@macro')).toBe(`'@macro`);
    });

    it('preserves valid financial descriptions starting with minus or plus signs', () => {
      // Must not indiscriminately prepend quotes to valid transaction descriptions!
      expect(sanitizeText('- Monthly Account Fee')).toBe('- Monthly Account Fee');
      expect(sanitizeText('-10% Discount')).toBe('-10% Discount');
      expect(sanitizeText('+ Dividend Payout')).toBe('+ Dividend Payout');
    });

    it('leaves standard text unchanged', () => {
      expect(sanitizeText('Payment to Acme Supplies')).toBe('Payment to Acme Supplies');
      expect(sanitizeText('Invoice #100234')).toBe('Invoice #100234');
    });

    it('strips non-printable ASCII control characters', () => {
      expect(sanitizeText('Safe\x00Text\x07')).toBe('SafeText');
    });
  });

  describe('generateTransactionFingerprint & Idempotency (Audit B)', () => {
    it('generates consistent SHA-256 fingerprint for identical transaction data', () => {
      const params = {
        organizationId: 'org-1',
        accountId: 'acc-1',
        date: new Date('2026-03-15T00:00:00.000Z'),
        amountMinor: 5000,
        direction: 'debit',
        currency: 'USD',
        description: 'Office Depot',
        sourceReference: 'CHQ-100',
      };

      const fp1 = generateTransactionFingerprint(params);
      const fp2 = generateTransactionFingerprint({
        ...params,
        description: 'Office   Depot  ', // differing whitespace is normalized
      });

      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64);
    });

    it('produces different fingerprints when financial values or currencies differ', () => {
      const base = {
        organizationId: 'org-1',
        accountId: 'acc-1',
        date: new Date('2026-03-15T00:00:00.000Z'),
        amountMinor: 5000,
        direction: 'debit',
        currency: 'USD',
        description: 'Office Depot',
      };

      const fp1 = generateTransactionFingerprint(base);
      const fp2 = generateTransactionFingerprint({ ...base, amountMinor: 5001 });
      const fp3 = generateTransactionFingerprint({ ...base, currency: 'EUR' });

      expect(fp1).not.toBe(fp2);
      expect(fp1).not.toBe(fp3);
    });
  });

  describe('computeFileHash', () => {
    it('generates consistent SHA-256 hash from file buffer', () => {
      const buffer = Buffer.from('Date,Description,Amount\n2026-03-01,Test,100');
      const hash1 = computeFileHash(buffer);
      const hash2 = computeFileHash(buffer);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });
});
