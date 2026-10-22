import { z } from 'zod';

export const CURRENCY_CONFIG = {
  USD: { decimals: 2, symbol: '$', name: 'US Dollar' },
  EUR: { decimals: 2, symbol: '€', name: 'Euro' },
  GBP: { decimals: 2, symbol: '£', name: 'British Pound' },
  CAD: { decimals: 2, symbol: 'CA$', name: 'Canadian Dollar' },
  AUD: { decimals: 2, symbol: 'A$', name: 'Australian Dollar' },
  INR: { decimals: 2, symbol: '₹', name: 'Indian Rupee' },
  JPY: { decimals: 0, symbol: '¥', name: 'Japanese Yen' },
  CHF: { decimals: 2, symbol: 'CHF', name: 'Swiss Franc' },
  NZD: { decimals: 2, symbol: 'NZ$', name: 'New Zealand Dollar' },
  SGD: { decimals: 2, symbol: 'S$', name: 'Singapore Dollar' },
  HKD: { decimals: 2, symbol: 'HK$', name: 'Hong Kong Dollar' },
  KWD: { decimals: 3, symbol: 'KD', name: 'Kuwaiti Dinar' },
  BHD: { decimals: 3, symbol: 'BD', name: 'Bahraini Dinar' },
  OMR: { decimals: 3, symbol: 'OMR', name: 'Omani Rial' },
} as const;

export type SupportedCurrency = keyof typeof CURRENCY_CONFIG;

export const ISO_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'INR',
  'JPY',
  'CHF',
  'NZD',
  'SGD',
  'HKD',
  'KWD',
  'BHD',
  'OMR',
] as const;

export const currencySchema = z.enum(ISO_CURRENCIES);

/**
 * Safely formats integer minor units into a localized currency string according to currency decimal rules.
 * Handles zero-decimal currencies (JPY) and 3-decimal currencies (KWD, BHD, OMR) with mathematical precision.
 */
export function formatCurrencyAmount(
  amountMinor: number,
  currency: string = 'USD',
  includeSymbol: boolean = false,
  useGrouping: boolean = false,
): string {
  const upper = currency.toUpperCase() as SupportedCurrency;
  const config = CURRENCY_CONFIG[upper] || { decimals: 2, symbol: upper };
  const divisor = Math.pow(10, config.decimals);
  const val = amountMinor / divisor;
  const formatted = useGrouping
    ? val.toLocaleString(undefined, {
        minimumFractionDigits: config.decimals,
        maximumFractionDigits: config.decimals,
      })
    : val.toFixed(config.decimals);
  return includeSymbol ? `${config.symbol} ${formatted}` : formatted;
}

/**
 * Safely parses a decimal string into integer minor units without binary float arithmetic.
 * Returns null if the string is invalid or exceeds the currency's allowed fractional digits.
 */
export function parseInputToMinorUnits(input: string, currency: string = 'USD'): number | null {
  const upper = currency.toUpperCase() as SupportedCurrency;
  const config = CURRENCY_CONFIG[upper] || { decimals: 2 };
  const trimmed = input.trim().replace(/,/g, '');
  if (!trimmed) return null;
  const isNegative = trimmed.startsWith('-');
  const clean = trimmed.replace(/^[-+]/, '');
  const parts = clean.split('.');
  if (parts.length > 2) return null;
  const integerPart = parts[0] || '0';
  const fractionalPart = parts[1] || '';
  if (!/^\d+$/.test(integerPart) || (fractionalPart && !/^\d+$/.test(fractionalPart))) {
    return null;
  }
  if (fractionalPart.length > config.decimals) {
    return null;
  }
  const paddedFraction = fractionalPart.padEnd(config.decimals, '0');
  const combined = config.decimals > 0 ? `${integerPart}${paddedFraction}` : integerPart;
  const result = parseInt(combined, 10);
  if (isNaN(result)) return null;
  return isNegative ? -result : result;
}

export const transactionDirectionSchema = z.enum(['debit', 'credit']);
export type TransactionDirection = z.infer<typeof transactionDirectionSchema>;

export const accountTypeSchema = z.enum(['checking', 'savings', 'credit_card', 'other']);
export type AccountType = z.infer<typeof accountTypeSchema>;

export const importStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);
export type ImportStatus = z.infer<typeof importStatusSchema>;

/**
 * Column mapping schema for CSV/XLSX imports.
 */
export const columnMappingSchema = z.object({
  date: z.string().min(1, 'Date column is required'),
  description: z.string().min(1, 'Description column is required'),
  amount: z.string().optional(),
  debit: z.string().optional(),
  credit: z.string().optional(),
  direction: z.string().optional(),
  reference: z.string().optional(),
  currency: z.string().optional(),
  dateFormat: z.enum(['auto', 'YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY']).default('auto'),
});
export type ColumnMapping = z.infer<typeof columnMappingSchema>;

/**
 * Normalized transaction contract.
 * Note: amountMinor represents integer minor currency units (e.g. cents).
 * Floating-point arithmetic is strictly avoided for calculations.
 */
export const transactionSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  accountId: z.string(),
  importJobId: z.string(),
  date: z.string().datetime(),
  description: z.string(),
  direction: transactionDirectionSchema,
  amountMinor: z.number().int().nonnegative(),
  amountDecimal: z.string(),
  currency: z.string().length(3),
  sourceReference: z.string().nullable().optional(),
  fingerprint: z.string(),
  rawSourceData: z.record(z.string()).nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Transaction = z.infer<typeof transactionSchema>;

/**
 * Import Job Contract.
 */
export const importJobSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  accountId: z.string(),
  fileName: z.string(),
  fileHash: z.string(),
  status: importStatusSchema,
  totalRows: z.number().int().nonnegative(),
  acceptedRows: z.number().int().nonnegative(),
  rejectedRows: z.number().int().nonnegative(),
  duplicateRows: z.number().int().nonnegative(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ImportJob = z.infer<typeof importJobSchema>;

/**
 * Import Row Error Contract.
 */
export const importRowErrorSchema = z.object({
  id: z.string(),
  importJobId: z.string(),
  organizationId: z.string(),
  rowNumber: z.number().int().positive(),
  rawData: z.record(z.string()),
  errorCode: z.string(),
  errorMessage: z.string(),
  createdAt: z.string().datetime(),
});
export type ImportRowError = z.infer<typeof importRowErrorSchema>;

/**
 * Financial Account Contract.
 */
export const financialAccountSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  type: accountTypeSchema,
  currency: z.string().length(3),
  institutionName: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type FinancialAccount = z.infer<typeof financialAccountSchema>;

/**
 * Paginated API Response Envelope.
 */
export function paginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    pagination: z.object({
      page: z.number().int().positive(),
      limit: z.number().int().positive(),
      totalItems: z.number().int().nonnegative(),
      totalPages: z.number().int().nonnegative(),
    }),
  });
}

export const transactionListResponseSchema = paginatedResponseSchema(transactionSchema);
export type TransactionListResponse = z.infer<typeof transactionListResponseSchema>;

export const importRowErrorListResponseSchema = paginatedResponseSchema(importRowErrorSchema);
export type ImportRowErrorListResponse = z.infer<typeof importRowErrorListResponseSchema>;

export const importJobListResponseSchema = paginatedResponseSchema(importJobSchema);
export type ImportJobListResponse = z.infer<typeof importJobListResponseSchema>;
