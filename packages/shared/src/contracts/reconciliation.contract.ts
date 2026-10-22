import { z } from 'zod';
import { transactionSchema, paginatedResponseSchema } from './financial.contract.js';

export const reconciliationRunStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'completed_with_errors',
  'failed',
]);
export type ReconciliationRunStatus = z.infer<typeof reconciliationRunStatusSchema>;

export const reconciliationMatchStatusSchema = z.enum([
  'suggested',
  'confirmed',
  'rejected',
  'needs_review',
]);
export type ReconciliationMatchStatus = z.infer<typeof reconciliationMatchStatusSchema>;

export const reconciliationMatchMethodSchema = z.enum([
  'exact_reference',
  'transfer_match',
  'amount_date_reference',
  'amount_date_description',
  'manual',
]);
export type ReconciliationMatchMethod = z.infer<typeof reconciliationMatchMethodSchema>;

export const reconciliationEvidenceSchema = z.object({
  externalReferenceMatch: z.boolean().optional(),
  amountMatch: z.boolean(),
  currencyMatch: z.boolean(),
  dateDifferenceDays: z.number().int(),
  descriptionSimilarity: z.number().min(0).max(1).optional(),
  directionCompatible: z.boolean(),
  competingCandidatesCount: z.number().int().nonnegative().optional(),
  competingCandidateIds: z.array(z.string()).optional(),
  notes: z.array(z.string()).optional(),
});
export type ReconciliationEvidence = z.infer<typeof reconciliationEvidenceSchema>;

export const reconciliationMatchSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  reconciliationRunId: z.string(),
  sourceTransactionId: z.string(),
  candidateTransactionId: z.string().nullable().optional(),
  participatingTransactionIds: z.array(z.string()).optional(),
  status: reconciliationMatchStatusSchema,
  matchMethod: reconciliationMatchMethodSchema,
  matchScore: z.number().int().min(0).max(100),
  evidence: reconciliationEvidenceSchema,
  amountDifferenceMinor: z.number().int(),
  dateDifferenceDays: z.number().int(),
  reviewReason: z.string().nullable().optional(),
  rejectionReason: z.string().nullable().optional(),
  decisionSource: z.enum(['rule_engine', 'manual_review']),
  confirmedAt: z.string().datetime().nullable().optional(),
  rejectedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  sourceTransaction: transactionSchema.optional(),
  candidateTransaction: transactionSchema.nullable().optional(),
});
export type ReconciliationMatch = z.infer<typeof reconciliationMatchSchema>;

export const reconciliationRunSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  accountId: z.string().nullable().optional(),
  targetAccountId: z.string().nullable().optional(),
  status: reconciliationRunStatusSchema,
  rulesVersion: z.string(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  dateToleranceDays: z.number().int().min(0).max(30),
  totalSourceTransactions: z.number().int().nonnegative(),
  matchedCount: z.number().int().nonnegative(),
  reviewCount: z.number().int().nonnegative(),
  unmatchedCount: z.number().int().nonnegative(),
  errorCount: z.number().int().nonnegative(),
  summary: z.record(z.unknown()).nullable().optional(),
  startedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ReconciliationRun = z.infer<typeof reconciliationRunSchema>;

export const reconciliationAuditActionSchema = z.enum([
  'run_started',
  'matches_generated',
  'match_confirmed',
  'match_rejected',
  'match_reversed',
  'run_completed',
  'run_failed',
]);
export type ReconciliationAuditAction = z.infer<typeof reconciliationAuditActionSchema>;

export const reconciliationAuditEventSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  reconciliationRunId: z.string().nullable().optional(),
  matchId: z.string().nullable().optional(),
  action: reconciliationAuditActionSchema,
  details: z.record(z.unknown()),
  timestamp: z.string().datetime(),
});
export type ReconciliationAuditEvent = z.infer<typeof reconciliationAuditEventSchema>;

export const createReconciliationRunRequestSchema = z
  .object({
    accountId: z.string().optional(),
    targetAccountId: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    dateToleranceDays: z.number().int().min(0).max(30).default(3),
    rulesVersion: z.string().default('v1.0.0'),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) <= new Date(data.endDate);
      }
      return true;
    },
    { message: 'startDate must be less than or equal to endDate' },
  );
export type CreateReconciliationRunRequest = z.infer<typeof createReconciliationRunRequestSchema>;

export const confirmMatchRequestSchema = z.object({
  notes: z.string().max(500).optional(),
});
export type ConfirmMatchRequest = z.infer<typeof confirmMatchRequestSchema>;

export const rejectMatchRequestSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required').max(500),
});
export type RejectMatchRequest = z.infer<typeof rejectMatchRequestSchema>;

export const queryMatchesRequestSchema = z.object({
  runId: z.string().optional(),
  status: reconciliationMatchStatusSchema.optional(),
  accountId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});
export type QueryMatchesRequest = z.infer<typeof queryMatchesRequestSchema>;

export const queryRunsRequestSchema = z.object({
  accountId: z.string().optional(),
  status: reconciliationRunStatusSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});
export type QueryRunsRequest = z.infer<typeof queryRunsRequestSchema>;

export const reconciliationRunListResponseSchema = paginatedResponseSchema(reconciliationRunSchema);
export type ReconciliationRunListResponse = z.infer<typeof reconciliationRunListResponseSchema>;

export const reconciliationMatchListResponseSchema =
  paginatedResponseSchema(reconciliationMatchSchema);
export type ReconciliationMatchListResponse = z.infer<typeof reconciliationMatchListResponseSchema>;

export const reconciliationAuditEventListResponseSchema = paginatedResponseSchema(
  reconciliationAuditEventSchema,
);
export type ReconciliationAuditEventListResponse = z.infer<
  typeof reconciliationAuditEventListResponseSchema
>;
