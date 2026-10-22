import { z } from 'zod';
import { currencySchema, paginatedResponseSchema } from './financial.contract.js';

/**
 * Action Type Enumeration
 */
export const actionTypeSchema = z.enum([
  'review_duplicate_payment',
  'verify_unusual_expense',
  'review_recurring_cost_increase',
  'mitigate_cash_flow_pressure',
  'resolve_reconciliation_inconsistency',
  'complete_financial_data',
  'review_recurring_expense',
  'audit_supplier_price_variance',
]);
export type ActionType = z.infer<typeof actionTypeSchema>;

/**
 * Action Category
 */
export const actionCategorySchema = z.enum([
  'cost_reduction',
  'cash_preservation',
  'data_integrity',
  'vendor_management',
]);
export type ActionCategory = z.infer<typeof actionCategorySchema>;

/**
 * Action Priority & Severity Levels
 */
export const actionPrioritySchema = z.enum(['critical', 'high', 'medium', 'low']);
export type ActionPriority = z.infer<typeof actionPrioritySchema>;

export const actionSeveritySchema = z.enum(['critical', 'high', 'medium', 'low']);
export type ActionSeverity = z.infer<typeof actionSeveritySchema>;

/**
 * Action Lifecycle Status
 */
export const actionStatusSchema = z.enum([
  'open',
  'in_progress',
  'completed',
  'dismissed',
  'snoozed',
  'superseded',
]);
export type ActionStatus = z.infer<typeof actionStatusSchema>;

/**
 * Confidence / Evidence Quality Classification
 */
export const actionEvidenceQualitySchema = z.enum(['high', 'adequate', 'preliminary']);
export type ActionEvidenceQuality = z.infer<typeof actionEvidenceQualitySchema>;

/**
 * Granular Financial Impact Classification (separated from speculative savings)
 */
export const actionFinancialImpactSchema = z.object({
  currency: currencySchema.nullable().default(null),
  potentialExposureMinor: z.number().int().nonnegative().default(0),
  estimatedAvoidableCostMinor: z.number().int().nonnegative().default(0),
  confirmedIssueMinor: z.number().int().nonnegative().default(0),
  projectedCashFlowEffectMinor: z.number().int().default(0),
  realizedSavingsMinor: z.number().int().nonnegative().default(0),
});
export type ActionFinancialImpact = z.infer<typeof actionFinancialImpactSchema>;

/**
 * Recommended Next Step Item
 */
export const actionRecommendedStepSchema = z.object({
  stepNumber: z.number().int().positive(),
  label: z.string().min(1).max(200),
  description: z.string().min(1).max(500),
  isOptional: z.boolean().default(false),
});
export type ActionRecommendedStep = z.infer<typeof actionRecommendedStepSchema>;

/**
 * Core Business Action Entity Contract
 */
export const businessActionSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  actionType: actionTypeSchema,
  category: actionCategorySchema,
  title: z.string().min(1).max(200),
  explanation: z.string().min(1).max(1000),
  priority: actionPrioritySchema,
  priorityScore: z.number().min(0).max(100),
  severity: actionSeveritySchema,
  status: actionStatusSchema,
  evidence: z.record(z.unknown()),
  sourceFindingIds: z.array(z.string()).default([]),
  sourceForecastRunId: z.string().nullable().default(null),
  currency: currencySchema.nullable().default(null),
  financialImpact: actionFinancialImpactSchema,
  evidenceQuality: actionEvidenceQualitySchema,
  recommendedSteps: z.array(actionRecommendedStepSchema),
  ruleId: z.string(),
  ruleVersion: z.string(),
  fingerprint: z.string(),
  snoozedUntil: z.string().datetime().nullable().default(null),
  completedAt: z.string().datetime().nullable().default(null),
  completionNotes: z.string().nullable().default(null),
  dismissedAt: z.string().datetime().nullable().default(null),
  dismissalReason: z.string().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastEvaluatedAt: z.string().datetime(),
});
export type BusinessAction = z.infer<typeof businessActionSchema>;

/**
 * Action Lifecycle History Event Contract
 */
export const actionHistoryEventTypeSchema = z.enum([
  'created',
  'status_transition',
  'snoozed',
  'reopened',
  'dismissed',
  'completed',
  'superseded',
  're_evaluated',
]);
export type ActionHistoryEventType = z.infer<typeof actionHistoryEventTypeSchema>;

export const actionHistorySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  actionId: z.string(),
  previousStatus: actionStatusSchema.nullable(),
  nextStatus: actionStatusSchema,
  eventType: actionHistoryEventTypeSchema,
  actorId: z.string().default('system'),
  reason: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  metadata: z.record(z.unknown()).nullable().default(null),
  createdAt: z.string().datetime(),
});
export type ActionHistory = z.infer<typeof actionHistorySchema>;

/**
 * Action Lifecycle Transition Request Contract
 */
export const actionTransitionRequestSchema = z.object({
  status: actionStatusSchema,
  reason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
  snoozedUntil: z.string().optional(),
});
export type ActionTransitionRequest = z.infer<typeof actionTransitionRequestSchema>;

/**
 * Filter & Pagination Query Schema for Actions List
 */
export const actionListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: actionStatusSchema.optional(),
  priority: actionPrioritySchema.optional(),
  category: actionCategorySchema.optional(),
  currency: currencySchema.optional(),
  search: z.string().max(100).optional(),
  sortBy: z
    .enum(['priorityScore', 'createdAt', 'updatedAt', 'potentialExposureMinor'])
    .default('priorityScore'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type ActionListQuery = z.infer<typeof actionListQuerySchema>;

/**
 * Paginated Action List Response
 */
export const actionListResponseSchema = paginatedResponseSchema(businessActionSchema);
export type ActionListResponse = z.infer<typeof actionListResponseSchema>;

/**
 * Currency-segregated Action Financial Total Summary
 */
export const actionCurrencySummarySchema = z.object({
  currency: currencySchema,
  potentialExposureMinor: z.number().int().nonnegative().default(0),
  estimatedAvoidableCostMinor: z.number().int().nonnegative().default(0),
  confirmedIssueMinor: z.number().int().nonnegative().default(0),
  realizedSavingsMinor: z.number().int().nonnegative().default(0),
  actionCount: z.number().int().nonnegative().default(0),
});
export type ActionCurrencySummary = z.infer<typeof actionCurrencySummarySchema>;

/**
 * Business Action Center Executive Dashboard Summary Contract
 */
export const actionDashboardSummarySchema = z.object({
  totalOpen: z.number().int().nonnegative(),
  totalInProgress: z.number().int().nonnegative(),
  totalSnoozed: z.number().int().nonnegative(),
  totalCompleted: z.number().int().nonnegative(),
  totalDismissed: z.number().int().nonnegative(),
  criticalPriorityCount: z.number().int().nonnegative(),
  highPriorityCount: z.number().int().nonnegative(),
  mediumPriorityCount: z.number().int().nonnegative(),
  lowPriorityCount: z.number().int().nonnegative(),
  byCurrency: z.record(actionCurrencySummarySchema),
  lastEvaluatedAt: z.string().datetime().nullable(),
});
export type ActionDashboardSummary = z.infer<typeof actionDashboardSummarySchema>;

/**
 * Recommendation Evaluation Result Summary
 */
export const actionEvaluationSummarySchema = z.object({
  totalEvaluated: z.number().int().nonnegative(),
  createdCount: z.number().int().nonnegative(),
  updatedCount: z.number().int().nonnegative(),
  supersededCount: z.number().int().nonnegative(),
  unchangedCount: z.number().int().nonnegative(),
  evaluatedAt: z.string().datetime(),
});
export type ActionEvaluationSummary = z.infer<typeof actionEvaluationSummarySchema>;
