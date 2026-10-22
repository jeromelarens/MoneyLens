import { z } from 'zod';
import { currencySchema, paginatedResponseSchema } from './financial.contract.js';

/**
 * Forecast Horizon Options
 */
export const forecastHorizonSchema = z.enum(['7d', '30d', '60d', '90d']);
export type ForecastHorizon = z.infer<typeof forecastHorizonSchema>;

export const FORECAST_HORIZON_DAYS: Record<ForecastHorizon, number> = {
  '7d': 7,
  '30d': 30,
  '60d': 60,
  '90d': 90,
};

/**
 * Cash Shortage & Burn Risk Levels
 */
export const cashFlowRiskLevelSchema = z.enum([
  'insufficient_data',
  'no_balance_data',
  'low_risk',
  'moderate_risk',
  'high_risk',
]);
export type CashFlowRiskLevel = z.infer<typeof cashFlowRiskLevelSchema>;

/**
 * Historical Data Quality Indicator
 */
export const forecastDataQualitySchema = z.enum([
  'high',
  'adequate',
  'sparse_history',
  'insufficient_history',
]);
export type ForecastDataQuality = z.infer<typeof forecastDataQualitySchema>;

/**
 * Forecast Execution Status
 */
export const forecastRunStatusSchema = z.enum([
  'pending',
  'completed',
  'completed_with_warnings',
  'failed',
]);
export type ForecastRunStatus = z.infer<typeof forecastRunStatusSchema>;

/**
 * Breakdown item for scheduled recurring obligations due on a forecast date
 */
export const recurringProjectionItemSchema = z.object({
  findingId: z.string(),
  merchant: z.string(),
  amountMinor: z.number().int().nonnegative(),
});
export type RecurringProjectionItem = z.infer<typeof recurringProjectionItemSchema>;

/**
 * Daily projection point along the forecast horizon
 */
export const cashFlowProjectionPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date format must be YYYY-MM-DD'),
  projectedInflowMinor: z.number().int().nonnegative(),
  projectedOutflowMinor: z.number().int().nonnegative(),
  projectedNetMinor: z.number().int(),
  estimatedBalanceMinor: z.number().int().nullable(),
  recurringExpenseBreakdown: z.array(recurringProjectionItemSchema).default([]),
  isHistorical: z.boolean().default(false),
});
export type CashFlowProjectionPoint = z.infer<typeof cashFlowProjectionPointSchema>;

/**
 * Currency-Specific Cash Flow Forecast Model Contract
 */
export const cashFlowForecastSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  forecastRunId: z.string(),
  currency: currencySchema,
  horizonDays: z.number().int().positive(),
  startDate: z.string(),
  endDate: z.string(),
  hasReliableOpeningBalance: z.boolean(),
  openingBalanceMinor: z.number().int().nullable(),
  openingBalanceEffectiveDate: z.string().nullable().optional(),
  projectedInflowsMinor: z.number().int().nonnegative(),
  projectedOutflowsMinor: z.number().int().nonnegative(),
  expectedNetMovementMinor: z.number().int(),
  projectedClosingBalanceMinor: z.number().int().nullable(),
  lowestProjectedBalanceMinor: z.number().int().nullable(),
  lowestBalanceDate: z.string().nullable().optional(),
  riskLevel: cashFlowRiskLevelSchema,
  riskReason: z.string(),
  dataQuality: forecastDataQualitySchema,
  historicalDailyAvgInflowMinor: z.number().int().nonnegative(),
  historicalDailyAvgOutflowMinor: z.number().int().nonnegative(),
  recurringOutflowsCount: z.number().int().nonnegative(),
  recurringOutflowsTotalMinor: z.number().int().nonnegative(),
  points: z.array(cashFlowProjectionPointSchema),
  assumptions: z.array(z.string()),
  limitations: z.array(z.string()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CashFlowForecast = z.infer<typeof cashFlowForecastSchema>;

/**
 * Forecast Run Execution Record Contract
 */
export const forecastRunSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  status: forecastRunStatusSchema,
  horizonDays: z.number().int().positive(),
  methodology: z.string(),
  methodologyVersion: z.string(),
  historyWindowDays: z.number().int().positive(),
  transactionsEvaluated: z.number().int().nonnegative(),
  currencies: z.array(currencySchema),
  warnings: z.array(z.string()),
  errorMessages: z.array(z.string()).optional(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ForecastRun = z.infer<typeof forecastRunSchema>;

/**
 * Scenario Assumptions
 */
export const oneTimeEventSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date format must be YYYY-MM-DD'),
  amountMinor: z.number().int().positive(),
  direction: z.enum(['inflow', 'outflow']),
});
export type OneTimeEvent = z.infer<typeof oneTimeEventSchema>;

export const recurringAdjustmentSchema = z.object({
  findingId: z.string(),
  merchant: z.string(),
  amountAdjustmentMinor: z.number().int(),
  action: z.enum(['cancel', 'modify']),
});
export type RecurringAdjustment = z.infer<typeof recurringAdjustmentSchema>;

export const scenarioAssumptionsSchema = z.object({
  revenueChangePercent: z.number().min(-100).max(500).default(0),
  expenseChangePercent: z.number().min(-100).max(500).default(0),
  recurringAdjustments: z.array(recurringAdjustmentSchema).default([]),
  oneTimeEvents: z.array(oneTimeEventSchema).default([]),
});
export type ScenarioAssumptions = z.infer<typeof scenarioAssumptionsSchema>;

/**
 * Saved Cash Flow Scenario Model Contract
 */
export const cashFlowScenarioSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string().min(1).max(100),
  currency: currencySchema,
  horizonDays: z.number().int().positive(),
  assumptions: scenarioAssumptionsSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CashFlowScenario = z.infer<typeof cashFlowScenarioSchema>;

/**
 * Scenario Comparison Point
 */
export const scenarioComparisonPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  baselineInflowMinor: z.number().int().nonnegative(),
  baselineOutflowMinor: z.number().int().nonnegative(),
  baselineNetMinor: z.number().int(),
  scenarioInflowMinor: z.number().int().nonnegative(),
  scenarioOutflowMinor: z.number().int().nonnegative(),
  scenarioNetMinor: z.number().int(),
  baselineBalanceMinor: z.number().int().nullable(),
  scenarioBalanceMinor: z.number().int().nullable(),
  netDifferenceMinor: z.number().int(),
});
export type ScenarioComparisonPoint = z.infer<typeof scenarioComparisonPointSchema>;

/**
 * Scenario Simulation Result Contract
 */
export const scenarioCalculationResultSchema = z.object({
  scenarioId: z.string(),
  scenarioName: z.string(),
  currency: currencySchema,
  horizonDays: z.number().int().positive(),
  baselineSummary: z.object({
    projectedInflowsMinor: z.number().int().nonnegative(),
    projectedOutflowsMinor: z.number().int().nonnegative(),
    expectedNetMovementMinor: z.number().int(),
    projectedClosingBalanceMinor: z.number().int().nullable(),
    riskLevel: cashFlowRiskLevelSchema,
  }),
  scenarioSummary: z.object({
    projectedInflowsMinor: z.number().int().nonnegative(),
    projectedOutflowsMinor: z.number().int().nonnegative(),
    expectedNetMovementMinor: z.number().int(),
    projectedClosingBalanceMinor: z.number().int().nullable(),
    inflowVarianceMinor: z.number().int(),
    outflowVarianceMinor: z.number().int(),
    netVarianceMinor: z.number().int(),
    riskLevel: cashFlowRiskLevelSchema,
    riskReason: z.string(),
  }),
  points: z.array(scenarioComparisonPointSchema),
  adjustmentsApplied: z.array(z.string()),
});
export type ScenarioCalculationResult = z.infer<typeof scenarioCalculationResultSchema>;

/**
 * Executive Currency Cash Flow Summary
 */
export const currencyCashFlowSummarySchema = z.object({
  currency: currencySchema,
  latestForecastRunId: z.string().nullable(),
  horizonDays: z.number().int().positive(),
  projectedInflowsMinor: z.number().int().nonnegative(),
  projectedOutflowsMinor: z.number().int().nonnegative(),
  expectedNetMovementMinor: z.number().int(),
  hasReliableOpeningBalance: z.boolean(),
  openingBalanceMinor: z.number().int().nullable(),
  projectedClosingBalanceMinor: z.number().int().nullable(),
  riskLevel: cashFlowRiskLevelSchema,
  riskReason: z.string(),
  dataQuality: forecastDataQualitySchema,
  lastCalculatedAt: z.string().datetime().nullable(),
});
export type CurrencyCashFlowSummary = z.infer<typeof currencyCashFlowSummarySchema>;

export const cashFlowDashboardSummarySchema = z.object({
  byCurrency: z.record(currencyCashFlowSummarySchema),
  lastRunAt: z.string().datetime().nullable(),
  totalForecastRuns: z.number().int().nonnegative(),
});
export type CashFlowDashboardSummary = z.infer<typeof cashFlowDashboardSummarySchema>;

/**
 * Request Contracts
 */
export const openingBalanceInputSchema = z.object({
  currency: currencySchema,
  amountMinor: z.number().int(),
  effectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type OpeningBalanceInput = z.infer<typeof openingBalanceInputSchema>;

export const createForecastRunRequestSchema = z.object({
  horizon: forecastHorizonSchema.default('30d'),
  currencies: z.array(currencySchema).optional(),
  openingBalances: z.array(openingBalanceInputSchema).optional(),
  historyWindowDays: z.number().int().min(14).max(365).default(90),
});
export type CreateForecastRunRequest = z.infer<typeof createForecastRunRequestSchema>;

export const forecastsFilterQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: forecastRunStatusSchema.optional(),
});
export type ForecastsFilterQuery = z.infer<typeof forecastsFilterQuerySchema>;

export const createScenarioRequestSchema = z.object({
  name: z.string().min(1).max(100),
  currency: currencySchema,
  horizon: forecastHorizonSchema.default('30d'),
  assumptions: scenarioAssumptionsSchema,
});
export type CreateScenarioRequest = z.infer<typeof createScenarioRequestSchema>;

export const updateScenarioRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  assumptions: scenarioAssumptionsSchema.optional(),
});
export type UpdateScenarioRequest = z.infer<typeof updateScenarioRequestSchema>;

export const simulateScenarioRequestSchema = z.object({
  currency: currencySchema,
  horizon: forecastHorizonSchema.default('30d'),
  assumptions: scenarioAssumptionsSchema,
  openingBalanceMinor: z.number().int().optional(),
});
export type SimulateScenarioRequest = z.infer<typeof simulateScenarioRequestSchema>;

/**
 * Paginated Responses
 */
export const forecastRunListResponseSchema = paginatedResponseSchema(forecastRunSchema);
export type ForecastRunListResponse = z.infer<typeof forecastRunListResponseSchema>;

export const cashFlowScenarioListResponseSchema = paginatedResponseSchema(cashFlowScenarioSchema);
export type CashFlowScenarioListResponse = z.infer<typeof cashFlowScenarioListResponseSchema>;
