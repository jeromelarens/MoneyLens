import crypto from 'node:crypto';
import {
  type TransactionDirection,
  type SupportedCurrency,
  CURRENCY_CONFIG,
} from '@moneylens/shared';

export interface ParsedAmountResult {
  amountMinor: number;
  amountDecimal: string;
  direction: TransactionDirection;
}

/**
 * Returns the minor-unit decimal precision for a given currency code.
 */
export function getCurrencyDecimals(currency = 'USD'): number {
  const upper = currency.toUpperCase().trim() as SupportedCurrency;
  if (upper in CURRENCY_CONFIG) {
    return CURRENCY_CONFIG[upper].decimals;
  }
  return 2;
}

/**
 * Sanitizes user-provided text to prevent formula injection (CSV/Excel macro injection)
 * while preserving legitimate transaction descriptions.
 */
export function sanitizeText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  let text = String(value).trim();

  // Strip unprintable control characters (keep standard whitespace: \t (9), \n (10), \r (13))
  text = Array.from(text)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return (code >= 32 && code !== 127) || code === 9 || code === 10 || code === 13;
    })
    .join('');

  // Formula injection defense:
  // Escapes formula execution triggers:
  // - Starts with '=' (e.g. =SUM, =CMD, =HYPERLINK)
  // - Starts with '@' followed by an identifier (e.g. @SUM)
  // - Starts with '+' or '-' immediately followed by a formula/identifier (e.g. +CMD, -HYPERLINK, +SUM)
  // - Starts with tab (\t) or carriage return (\r)
  // Legitimate transaction descriptions like "- Monthly Fee", "-10% discount", or "+ Dividend" are preserved!
  if (/^[=\t\r]|^@[a-zA-Z]|^[-+][a-zA-Z_]|^[-+][=@+-]/.test(text)) {
    text = `'${text}`;
  }

  return text;
}

/**
 * Normalizes dates from various common banking formats:
 * - ISO: 2026-03-15 or 2026-03-15T00:00:00.000Z
 * - US: MM/DD/YYYY or M/D/YYYY
 * - EU/UK: DD/MM/YYYY or D/M/YYYY or DD.MM.YYYY
 * - Excel Serial: e.g. 44927
 */
export function parseDate(rawDate: unknown, formatHint: string = 'auto'): Date | null {
  if (rawDate === null || rawDate === undefined || rawDate === '') {
    return null;
  }

  // Handle native Date objects
  if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
    return rawDate;
  }

  // Handle Excel serial date numbers (days since 1899-12-30)
  if (typeof rawDate === 'number' && !isNaN(rawDate)) {
    if (rawDate > 10000 && rawDate < 100000) {
      const utcDays = Math.floor(rawDate - 25569);
      const utcValue = utcDays * 86400;
      const dateInfo = new Date(utcValue * 1000);
      return isNaN(dateInfo.getTime()) ? null : dateInfo;
    }
  }

  const str = String(rawDate).trim();
  if (!str) return null;

  // 1. ISO format check: YYYY-MM-DD
  const isoMatch = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(str);
  if (isoMatch && isoMatch[1] && isoMatch[2] && isoMatch[3]) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const d = new Date(Date.UTC(year, month, day));
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day) {
      return d;
    }
  }

  // 2. Format with hint
  if (formatHint === 'DD/MM/YYYY') {
    const euMatch = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(str);
    if (euMatch && euMatch[1] && euMatch[2] && euMatch[3]) {
      const day = parseInt(euMatch[1], 10);
      const month = parseInt(euMatch[2], 10) - 1;
      const year = parseInt(euMatch[3], 10);
      const d = new Date(Date.UTC(year, month, day));
      if (d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day) {
        return d;
      }
    }
  }

  if (formatHint === 'MM/DD/YYYY') {
    const usMatch = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(str);
    if (usMatch && usMatch[1] && usMatch[2] && usMatch[3]) {
      const month = parseInt(usMatch[1], 10) - 1;
      const day = parseInt(usMatch[2], 10);
      const year = parseInt(usMatch[3], 10);
      const d = new Date(Date.UTC(year, month, day));
      if (d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day) {
        return d;
      }
    }
  }

  // 3. Fallback auto parsing
  const partsMatch = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(str);
  if (partsMatch && partsMatch[1] && partsMatch[2] && partsMatch[3]) {
    const first = parseInt(partsMatch[1], 10);
    const second = parseInt(partsMatch[2], 10);
    const year = parseInt(partsMatch[3], 10);

    // If first > 12, it must be DD/MM/YYYY
    if (first > 12 && second <= 12) {
      const d = new Date(Date.UTC(year, second - 1, first));
      if (d.getUTCDate() === first) return d;
    }

    // Default standard US fallback MM/DD/YYYY
    const d = new Date(Date.UTC(year, first - 1, second));
    if (d.getUTCMonth() === first - 1) return d;
  }

  // 4. Standard Date.parse check
  const timestamp = Date.parse(str);
  if (!isNaN(timestamp)) {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/**
 * Parses financial amount into integer minor units without floating-point inaccuracy.
 * Supports:
 * - Currency-specific minor units (e.g. 0 decimals for JPY, 2 for USD/INR, 3 for KWD/BHD/OMR)
 * - INR amounts with ₹ and Indian grouping (e.g. ₹12,34,567.89)
 * - Separate debit / credit columns
 * - Single signed amount (e.g. -150.25 is debit, +2000.00 is credit)
 * - Parenthesized negative amounts: (150.25)
 * - Trailing negatives: 150.25-
 * - Currency symbols and formatting: $1,250.00, €1.250,00, ₹1,234.56
 */
export function parseAmount(
  rawAmount: unknown,
  rawDebit?: unknown,
  rawCredit?: unknown,
  rawDirection?: unknown,
  currency = 'USD',
): ParsedAmountResult | null {
  const decimals = getCurrencyDecimals(currency);

  // Scenario 1: Separate Debit and Credit columns
  if (rawDebit !== undefined && rawDebit !== null && String(rawDebit).trim() !== '') {
    const debitMinor = parseToMinorUnits(rawDebit, decimals);
    if (debitMinor !== null && debitMinor > 0) {
      return {
        amountMinor: debitMinor,
        amountDecimal: formatDecimalString(debitMinor, decimals),
        direction: 'debit',
      };
    }
  }

  if (rawCredit !== undefined && rawCredit !== null && String(rawCredit).trim() !== '') {
    const creditMinor = parseToMinorUnits(rawCredit, decimals);
    if (creditMinor !== null && creditMinor > 0) {
      return {
        amountMinor: creditMinor,
        amountDecimal: formatDecimalString(creditMinor, decimals),
        direction: 'credit',
      };
    }
  }

  // Scenario 2: Single amount column
  if (rawAmount !== undefined && rawAmount !== null && String(rawAmount).trim() !== '') {
    const rawStr = String(rawAmount).trim();

    // Determine direction from negative signs or explicit direction field
    let isNegative = false;

    if (rawStr.startsWith('(') && rawStr.endsWith(')')) {
      isNegative = true;
    } else if (rawStr.startsWith('-') || rawStr.endsWith('-')) {
      isNegative = true;
    }

    const minorUnits = parseToMinorUnits(rawStr, decimals);
    if (minorUnits === null || minorUnits <= 0) {
      return null;
    }

    // Direction resolution
    let direction: TransactionDirection = isNegative ? 'debit' : 'credit';

    if (rawDirection) {
      const dirStr = String(rawDirection).trim().toLowerCase();
      if (dirStr === 'debit' || dirStr === 'dr' || dirStr === 'out' || dirStr === 'expense') {
        direction = 'debit';
      } else if (dirStr === 'credit' || dirStr === 'cr' || dirStr === 'in' || dirStr === 'income') {
        direction = 'credit';
      }
    }

    return {
      amountMinor: minorUnits,
      amountDecimal: formatDecimalString(minorUnits, decimals),
      direction,
    };
  }

  return null;
}

/**
 * Formats integer minor units into an exact decimal string for presentation.
 */
export function formatDecimalString(minorUnits: number, decimals: number): string {
  if (decimals === 0) {
    return minorUnits.toString();
  }

  const str = minorUnits.toString().padStart(decimals + 1, '0');
  const wholePart = str.slice(0, str.length - decimals);
  const fracPart = str.slice(str.length - decimals);
  return `${wholePart}.${fracPart}`;
}

/**
 * Converts a raw amount string/number to positive integer minor units using exact string parsing.
 * Eliminates IEEE-754 floating-point inaccuracies.
 * Enforces decimal limits, validates separators, and checks integer safety limits.
 */
export function parseToMinorUnits(value: unknown, decimals = 2): number | null {
  if (value === null || value === undefined) return null;

  let str = '';

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || isNaN(value)) return null;
    // Reject unsafe numbers outside safe integer range
    if (Math.abs(value) > Number.MAX_SAFE_INTEGER) return null;
    str = Math.abs(value).toString();
  } else {
    str = String(value).trim();
  }

  if (!str) return null;

  // Reject scientific notation
  if (/[eE]/.test(str)) return null;

  // Check parenthesized negative: (100.50)
  if (str.startsWith('(') && str.endsWith(')')) {
    str = str.slice(1, -1).trim();
  }

  // Strip leading and trailing sign
  if (str.startsWith('-') || str.startsWith('+')) {
    str = str.slice(1).trim();
  }
  if (str.endsWith('-') || str.endsWith('+')) {
    str = str.slice(0, -1).trim();
  }

  // If multiple signs or invalid characters remain, reject
  if (/[-+]/.test(str)) return null;

  // Strip supported currency symbols, ISO codes, and spaces
  // Symbols: $, €, £, ¥, ₹ (\u20B9), CA$, A$, S$, HK$, NZ$, KD, BD, OMR, CHF, Rs., Rs
  str = str.replace(/[()$€£¥\u20B9\s]/g, '');
  str = str.replace(
    /\b(USD|EUR|GBP|CAD|AUD|INR|JPY|CHF|NZD|SGD|HKD|KWD|BHD|OMR|RS\.?|CA\$|A\$|S\$|NZ\$|HK\$)\b/gi,
    '',
  );
  str = str.trim();

  if (!str) return null;

  // Reject any remaining alphabetic or invalid characters
  if (/[^\d.,]/.test(str)) return null;

  // Separate whole and fractional parts unambiguously
  let wholeStr = '';
  let fracStr = '';

  const hasDot = str.includes('.');
  const hasComma = str.includes(',');

  if (hasDot && hasComma) {
    const lastDotIndex = str.lastIndexOf('.');
    const lastCommaIndex = str.lastIndexOf(',');

    if (lastDotIndex > lastCommaIndex) {
      // Format: 1,234,567.89 or Indian: 12,34,567.89 (dot is decimal, comma is grouping)
      const parts = str.split('.');
      if (parts.length > 2) return null; // Multiple decimal points
      const wholeCandidate = parts[0]!;
      fracStr = parts[1]!;

      // Validate grouping with commas
      // Standard: 1,234,567 or Indian: 12,34,567 or 1,23,456
      const isValidStandard = /^\d{1,3}(,\d{3})+$/.test(wholeCandidate);
      const isValidIndian = /^\d{1,2}(,\d{2})*,\d{3}$/.test(wholeCandidate);

      if (!isValidStandard && !isValidIndian) {
        return null; // Malformed grouping separators
      }

      wholeStr = wholeCandidate.replace(/,/g, '');
    } else {
      // Format: 1.234.567,89 (comma is decimal, dot is grouping)
      const parts = str.split(',');
      if (parts.length > 2) return null; // Multiple decimal commas
      const wholeCandidate = parts[0]!;
      fracStr = parts[1]!;

      // Validate European dot grouping: 1.234.567
      const isValidEu = /^\d{1,3}(\.\d{3})+$/.test(wholeCandidate);
      if (!isValidEu) {
        return null; // Malformed dot grouping
      }

      wholeStr = wholeCandidate.replace(/\./g, '');
    }
  } else if (hasDot) {
    // Only dot present
    const parts = str.split('.');
    if (parts.length > 2) {
      // e.g. 1.234.567 (multiple dots without comma)
      const isValidEuGrouping = /^\d{1,3}(\.\d{3})+$/.test(str);
      if (isValidEuGrouping) {
        wholeStr = str.replace(/\./g, '');
        fracStr = '';
      } else {
        return null;
      }
    } else if (decimals === 0) {
      // For 0-decimal currencies (JPY), a dot with decimals is invalid (excess fractional digits)
      if (parts[1] && parts[1].length > 0) {
        return null;
      }
      wholeStr = parts[0]!;
      fracStr = '';
    } else {
      wholeStr = parts[0]!;
      fracStr = parts[1]!;
    }
  } else if (hasComma) {
    // Only comma present
    const parts = str.split(',');
    if (parts.length > 2) {
      // e.g. 1,234,567 (multiple commas without dot)
      const isValidStandard = /^\d{1,3}(,\d{3})+$/.test(str);
      const isValidIndian = /^\d{1,2}(,\d{2})*,\d{3}$/.test(str);
      if (isValidStandard || isValidIndian) {
        wholeStr = str.replace(/,/g, '');
        fracStr = '';
      } else {
        return null;
      }
    } else {
      // Single comma: e.g. 1,250 or 1250,50
      if (decimals === 0) {
        // e.g. 1,000 in JPY
        if (/^\d{1,3},\d{3}$/.test(str)) {
          wholeStr = str.replace(/,/g, '');
          fracStr = '';
        } else {
          return null;
        }
      } else {
        // Could be decimal comma (e.g. 1250,50) or thousands separator (e.g. 1,250)
        // If 2 decimals and part after comma is 2 digits -> decimal comma
        // If part after comma is 3 digits and currency has 2 decimals -> thousands separator
        if (parts[1]!.length === decimals) {
          wholeStr = parts[0]!;
          fracStr = parts[1]!;
        } else if (parts[1]!.length === 3 && decimals === 2) {
          wholeStr = parts[0]! + parts[1]!;
          fracStr = '';
        } else if (parts[1]!.length === 3 && decimals === 3) {
          // In 3-decimal currencies, a single comma like "1,234" is ambiguous between 1234 and 1.234
          // Reject ambiguous representation per Audit A
          return null;
        } else {
          return null;
        }
      }
    }
  } else {
    // Pure integer digits
    if (!/^\d+$/.test(str)) return null;
    wholeStr = str;
    fracStr = '';
  }

  // Reject empty wholeStr
  if (!wholeStr) return null;

  // Fractional digits check: avoid silently rounding values containing more fractional digits than supported
  if (fracStr.length > decimals) {
    return null; // Excess fractional digits rejected!
  }

  // Pad fraction to currency minor unit precision
  const paddedFrac = fracStr.padEnd(decimals, '0');

  // Convert to BigInt to prevent IEEE-754 precision issues
  try {
    const wholeBig = BigInt(wholeStr);
    const multiplier = 10n ** BigInt(decimals);
    const fracBig = decimals > 0 ? BigInt(paddedFrac) : 0n;
    const totalMinorBig = wholeBig * multiplier + fracBig;

    // Check safe integer boundary
    if (totalMinorBig > BigInt(Number.MAX_SAFE_INTEGER)) {
      return null;
    }

    const minorUnits = Number(totalMinorBig);
    return minorUnits >= 0 ? minorUnits : null;
  } catch {
    return null;
  }
}

/**
 * Computes a SHA-256 fingerprint for a transaction to prevent duplicate insertion.
 */
export function generateTransactionFingerprint(params: {
  organizationId: string;
  accountId: string;
  date: Date;
  amountMinor: number;
  direction: string;
  description: string;
  currency?: string;
  sourceReference?: string | null;
}): string {
  const isoDate = params.date.toISOString().split('T')[0];
  const cleanDesc = params.description.trim().toLowerCase().replace(/\s+/g, ' ');
  const cleanRef = (params.sourceReference || '').trim().toLowerCase();
  const currency = (params.currency || 'USD').toUpperCase().trim();

  const payload = [
    params.organizationId,
    params.accountId,
    isoDate,
    params.amountMinor,
    params.direction,
    currency,
    cleanDesc,
    cleanRef,
  ].join('|');

  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Computes SHA-256 hash of a file buffer to detect duplicate file uploads.
 */
export function computeFileHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
