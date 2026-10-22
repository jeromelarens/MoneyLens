import { z } from 'zod';
import {
  currencySchema,
  paginatedResponseSchema,
  transactionDirectionSchema,
} from './financial.contract.js';

/**
 * Supported Finding Types for Financial Leakage & Inconsistency Detection.
 */
export const findingTypeSchema = z.enum([
  'potential_duplicate_payment',
  'unusual_expense',
  'recurring_expense',
  'recurring_cost_increase',
  'supplier_price_variance',
  'reconciliation_inconsistency',
]);
export type FindingType = z.infer<typeof findingTypeSchema>;

/**
 * Finding Lifecycle Statuses.
 * Strictly prevents unevidenced 'fraud_confirmed'.
 */
export const findingStatusSchema = z.enum([
  'open',
  'under_review',
  'confirmed_issue',
  'dismissed',
  'resolved',
]);
export type FindingStatus = z.infer<typeof findingStatusSchema>;

/**
 * Deterministic Finding Severity.
 */
export const findingSeveritySchema = z.enum(['low', 'medium', 'high']);
export type FindingSeverity = z.infer<typeof findingSeveritySchema>;

/**
 * Historical observation context embedded inside structured evidence.
 */
export const historicalComparisonPeriodSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  observationCount: z.number().int().nonnegative().optional(),
  baselineAmountMinor: z.number().int().optional(),
  medianAmountMinor: z.number().int().optional(),
  minAmountMinor: z.number().int().optional(),
  maxAmountMinor: z.number().int().optional(),
  cadenceDays: z.number().int().positive().optional(),
});
export type HistoricalComparisonPeriod = z.infer<typeof historicalComparisonPeriodSchema>;

/**
 * Structured, verifiable evidence supporting a financial finding.
 */
export const findingEvidenceSchema = z.object({
  ruleId: z.string().min(1),
  ruleVersion: z.string().min(1),
  reason: z.string().min(1),
  primaryTransactionIds: z.array(z.string()).min(1),
  relatedTransactionIds: z.array(z.string()).default([]),
  transactionDates: z.array(z.string()).optional(),
  amountsMinor: z.array(z.number().int()).optional(),
  currency: currencySchema.optional(),
  direction: transactionDirectionSchema.optional(),
  normalizedDescriptions: z.array(z.string()).optional(),
  sourceImportReferences: z.array(z.string()).optional(),
  historicalComparisonPeriod: historicalComparisonPeriodSchema.optional(),
  actualAmountMinor: z.number().int().optional(),
  amountDifferenceMinor: z.number().int().optional(),
  percentageChange: z.number().optional(),
  dateDifferenceDays: z.number().int().optional(),
  dataQualityLimitations: z.array(z.string()).optional(),
  recommendedChecks: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type FindingEvidence = z.infer<typeof findingEvidenceSchema>;

/**
 * Financial Finding Domain Model Contract.
 */
export const financialFindingSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  findingType: findingTypeSchema,
  status: findingStatusSchema,
  severity: findingSeveritySchema,
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(2000),
  primaryTransactionIds: z.array(z.string()).min(1),
  relatedTransactionIds: z.array(z.string()).default([]),
  evidence: findingEvidenceSchema,
  estimatedAmountMinor: z.number().int().nonnegative(),
  currency: currencySchema,
  ruleId: z.string().min(1),
  ruleVersion: z.string().min(1),
  detectedAt: z.string().datetime(),
  lastEvaluatedAt: z.string().datetime(),
  reviewedAt: z.string().datetime().nullable().optional(),
  dismissalReason: z.string().nullable().optional(),
  resolutionNotes: z.string().nullable().optional(),
  fingerprint: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type FinancialFinding = z.infer<typeof financialFindingSchema>;

/**
 * Audit actions for finding lifecycle transitions.
 */
export const findingHistoryActionSchema = z.enum([
  'created',
  're_evaluated',
  'opened_for_review',
  'confirmed',
  'dismissed',
  'resolved',
  'explanation_generated',
]);
export type FindingHistoryAction = z.infer<typeof findingHistoryActionSchema>;

/**
 * Append-only Finding Review and Lifecycle History entry.
 */
export const findingHistorySchema = z.object({
  id: z.string(),
  findingId: z.string(),
  organizationId: z.string(),
  action: findingHistoryActionSchema,
  actorId: z.string().optional(),
  previousStatus: findingStatusSchema.optional(),
  newStatus: findingStatusSchema.optional(),
  reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type FindingHistory = z.infer<typeof findingHistorySchema>;

/**
 * Detection Run Lifecycle Statuses.
 */
export const detectionRunStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'completed_with_errors',
  'failed',
]);
export type DetectionRunStatus = z.infer<typeof detectionRunStatusSchema>;

/**
 * Per-rule execution metrics for detection runs.
 */
export const perRuleRunResultSchema = z.object({
  ruleId: z.string(),
  ruleVersion: z.string(),
  evaluatedCount: z.number().int().nonnegative(),
  findingsCount: z.number().int().nonnegative(),
  error: z.string().optional(),
});
export type PerRuleRunResult = z.infer<typeof perRuleRunResultSchema>;

/**
 * Detection Run Model Contract.
 */
export const detectionRunSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  ruleVersion: z.string(),
  status: detectionRunStatusSchema,
  observationScope: z
    .object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      currencies: z.array(currencySchema).optional(),
    })
    .optional(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().optional(),
  transactionsEvaluated: z.number().int().nonnegative(),
  findingsCreated: z.number().int().nonnegative(),
  findingsUpdated: z.number().int().nonnegative(),
  findingsUnchanged: z.number().int().nonnegative(),
  errors: z.array(z.string()).default([]),
  perRuleResults: z.record(perRuleRunResultSchema).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type DetectionRun = z.infer<typeof detectionRunSchema>;

/**
 * Explainable AI Explanation Contract.
 * Validates responses whether from deterministic engine or AI provider.
 */
export const aiExplanationProviderSchema = z.enum([
  'deterministic_rule_engine',
  'google_gemini',
  'mock_provider',
]);
export type AiExplanationProvider = z.infer<typeof aiExplanationProviderSchema>;

export const aiExplanationSchema = z.object({
  findingId: z.string(),
  organizationId: z.string(),
  summary: z.string().min(1),
  whyItWasFlagged: z.string().min(1),
  evidenceSummary: z.string().min(1),
  recommendedChecks: z.array(z.string()).min(1),
  limitations: z.array(z.string()).min(1),
  generatedAt: z.string().datetime(),
  provider: aiExplanationProviderSchema,
  model: z.string().optional(),
});
export type AiExplanation = z.infer<typeof aiExplanationSchema>;

/**
 * Segregated Exposure and Leakage Summary by Currency.
 * Strictly separates potential exposure from confirmed issues and never adds cross-currency totals.
 */
export const currencyExposureDetailSchema = z.object({
  currency: currencySchema,
  potentialExposureMinor: z.number().int().nonnegative(),
  confirmedExposureMinor: z.number().int().nonnegative(),
  openFindingCount: z.number().int().nonnegative(),
  underReviewFindingCount: z.number().int().nonnegative(),
  confirmedFindingCount: z.number().int().nonnegative(),
  dismissedFindingCount: z.number().int().nonnegative(),
  resolvedFindingCount: z.number().int().nonnegative(),
});
export type CurrencyExposureDetail = z.infer<typeof currencyExposureDetailSchema>;

export const financialExposureSummarySchema = z.object({
  byCurrency: z.record(currencyExposureDetailSchema),
  totalFindingsCount: z.number().int().nonnegative(),
  highSeverityCount: z.number().int().nonnegative(),
  mediumSeverityCount: z.number().int().nonnegative(),
  lowSeverityCount: z.number().int().nonnegative(),
  lastDetectionRunAt: z.string().datetime().nullable().optional(),
});
export type FinancialExposureSummary = z.infer<typeof financialExposureSummarySchema>;

/**
 * Request Schemas
 */
export const createDetectionRunRequestSchema = z.object({
  observationScope: z
    .object({
      startDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date format must be YYYY-MM-DD')
        .optional(),
      endDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date format must be YYYY-MM-DD')
        .optional(),
      currencies: z.array(currencySchema).optional(),
    })
    .optional(),
});
export type CreateDetectionRunRequest = z.infer<typeof createDetectionRunRequestSchema>;

export const findingsFilterQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  findingType: findingTypeSchema.optional(),
  status: findingStatusSchema.optional(),
  severity: findingSeveritySchema.optional(),
  currency: currencySchema.optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sortBy: z.enum(['detectedAt', 'estimatedAmountMinor', 'severity']).default('detectedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type FindingsFilterQuery = z.infer<typeof findingsFilterQuerySchema>;

export const reviewFindingActionSchema = z.enum([
  'open_review',
  'confirm_issue',
  'dismiss',
  'resolve',
]);
export type ReviewFindingAction = z.infer<typeof reviewFindingActionSchema>;

export const reviewFindingRequestSchema = z
  .object({
    action: reviewFindingActionSchema,
    reason: z.string().max(500).optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (data) => {
      if (data.action === 'dismiss' && (!data.reason || data.reason.trim().length === 0)) {
        return false;
      }
      return true;
    },
    {
      message: 'A dismissal reason is required when dismissing a finding',
      path: ['reason'],
    },
  );
export type ReviewFindingRequest = z.infer<typeof reviewFindingRequestSchema>;

export const requestAiExplanationRequestSchema = z.object({
  forceFresh: z.boolean().default(false),
});
export type RequestAiExplanationRequest = z.infer<typeof requestAiExplanationRequestSchema>;

/**
 * Paginated Responses
 */
export const findingListResponseSchema = paginatedResponseSchema(financialFindingSchema);
export type FindingListResponse = z.infer<typeof findingListResponseSchema>;

export const findingHistoryListResponseSchema = paginatedResponseSchema(findingHistorySchema);
export type FindingHistoryListResponse = z.infer<typeof findingHistoryListResponseSchema>;

export const detectionRunListResponseSchema = paginatedResponseSchema(detectionRunSchema);
export type DetectionRunListResponse = z.infer<typeof detectionRunListResponseSchema>;
