import mongoose, { Schema, Document, Model } from 'mongoose';
import crypto from 'node:crypto';
import type {
  AccountType,
  ImportStatus,
  TransactionDirection,
  ReconciliationRunStatus,
  ReconciliationMatchStatus,
  ReconciliationMatchMethod,
  ReconciliationAuditAction,
  FindingType,
  FindingStatus,
  FindingSeverity,
  FindingHistoryAction,
  DetectionRunStatus,
  FindingEvidence,
  PerRuleRunResult,
  ForecastRunStatus,
  CashFlowRiskLevel,
  ForecastDataQuality,
  CashFlowProjectionPoint,
  ScenarioAssumptions,
  ActionType,
  ActionCategory,
  ActionPriority,
  ActionSeverity,
  ActionStatus,
  ActionEvidenceQuality,
  ActionFinancialImpact,
  ActionRecommendedStep,
  ActionHistoryEventType,
} from '@moneylens/shared';

// ==============================================================================
// 1. Business Profile / Organization Model
// ==============================================================================
export interface IOrganization extends Document<string> {
  _id: string;
  name: string;
  currency: string;
  apiKey: string;
  apiKeyHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

const organizationSchema = new Schema<IOrganization>(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    name: { type: String, required: true, trim: true },
    currency: { type: String, required: true, default: 'USD', uppercase: true, trim: true },
    apiKey: { type: String, required: true, unique: true, index: true },
    apiKeyHash: { type: String, sparse: true, index: true },
  },
  {
    timestamps: true,
    _id: false,
  },
);

export const OrganizationModel: Model<IOrganization> =
  mongoose.models.Organization || mongoose.model<IOrganization>('Organization', organizationSchema);

// ==============================================================================
// 2. Financial Account Model
// ==============================================================================
export interface IFinancialAccount extends Document<string> {
  _id: string;
  organizationId: string;
  name: string;
  type: AccountType;
  currency: string;
  institutionName: string;
  createdAt: Date;
  updatedAt: Date;
}

const financialAccountSchema = new Schema<IFinancialAccount>(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    organizationId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      required: true,
      enum: ['checking', 'savings', 'credit_card', 'other'],
      default: 'checking',
    },
    currency: { type: String, required: true, default: 'USD', uppercase: true, trim: true },
    institutionName: { type: String, required: true, trim: true },
  },
  {
    timestamps: true,
    _id: false,
  },
);

financialAccountSchema.index({ organizationId: 1, name: 1 }, { unique: true });

export const FinancialAccountModel: Model<IFinancialAccount> =
  mongoose.models.FinancialAccount ||
  mongoose.model<IFinancialAccount>('FinancialAccount', financialAccountSchema);

// ==============================================================================
// 3. Import Job Model
// ==============================================================================
export interface IImportJob extends Document<string> {
  _id: string;
  organizationId: string;
  accountId: string;
  fileName: string;
  fileHash: string;
  status: ImportStatus;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  duplicateRows: number;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const importJobSchema = new Schema<IImportJob>(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    organizationId: { type: String, required: true, index: true },
    accountId: { type: String, required: true, index: true },
    fileName: { type: String, required: true },
    fileHash: { type: String, required: true, index: true },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    totalRows: { type: Number, required: true, default: 0, min: 0 },
    acceptedRows: { type: Number, required: true, default: 0, min: 0 },
    rejectedRows: { type: Number, required: true, default: 0, min: 0 },
    duplicateRows: { type: Number, required: true, default: 0, min: 0 },
    errorMessage: { type: String, default: null },
  },
  {
    timestamps: true,
    _id: false,
  },
);

// File hashes are scoped to the authenticated organization (Audit B requirement 1 & 3)
importJobSchema.index(
  { organizationId: 1, fileHash: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['completed', 'processing'] } },
  },
);
importJobSchema.index({ organizationId: 1, createdAt: -1 });

export const ImportJobModel: Model<IImportJob> =
  mongoose.models.ImportJob || mongoose.model<IImportJob>('ImportJob', importJobSchema);

// ==============================================================================
// 4. Import Row Error Model
// ==============================================================================
export interface IImportRowError extends Document<string> {
  _id: string;
  importJobId: string;
  organizationId: string;
  rowNumber: number;
  rawData: Record<string, string>;
  errorCode: string;
  errorMessage: string;
  createdAt: Date;
}

const importRowErrorSchema = new Schema<IImportRowError>(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    importJobId: { type: String, required: true, index: true },
    organizationId: { type: String, required: true, index: true },
    rowNumber: { type: Number, required: true },
    rawData: { type: Schema.Types.Mixed, required: true },
    errorCode: { type: String, required: true },
    errorMessage: { type: String, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    _id: false,
  },
);

importRowErrorSchema.index({ organizationId: 1, importJobId: 1, rowNumber: 1 });

export const ImportRowErrorModel: Model<IImportRowError> =
  mongoose.models.ImportRowError ||
  mongoose.model<IImportRowError>('ImportRowError', importRowErrorSchema);

// ==============================================================================
// 5. Normalized Transaction Model
// ==============================================================================
export interface ITransaction extends Document<string> {
  _id: string;
  organizationId: string;
  accountId: string;
  importJobId: string;
  date: Date;
  description: string;
  direction: TransactionDirection;
  amountMinor: number;
  amountDecimal: string;
  currency: string;
  sourceReference?: string | null;
  fingerprint: string;
  rawSourceData?: Record<string, string> | null;
  reconciliationStatus?: 'unreconciled' | 'reconciled';
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<ITransaction>(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    organizationId: { type: String, required: true, index: true },
    accountId: { type: String, required: true, index: true },
    importJobId: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },
    description: { type: String, required: true, trim: true },
    direction: { type: String, required: true, enum: ['debit', 'credit'] },
    amountMinor: { type: Number, required: true, min: 0 },
    amountDecimal: { type: String, required: true },
    currency: { type: String, required: true, uppercase: true, trim: true },
    sourceReference: { type: String, default: null, trim: true },
    fingerprint: { type: String, required: true, index: true },
    rawSourceData: { type: Schema.Types.Mixed, default: null },
    reconciliationStatus: {
      type: String,
      enum: ['unreconciled', 'reconciled'],
      default: 'unreconciled',
      index: true,
    },
  },
  {
    timestamps: true,
    _id: false,
  },
);

// Idempotency: prevent identical transactions for the same account in an organization
transactionSchema.index({ organizationId: 1, accountId: 1, fingerprint: 1 }, { unique: true });

// Range and query performance indexes
transactionSchema.index({ organizationId: 1, date: -1, _id: 1 });
transactionSchema.index({ organizationId: 1, accountId: 1, date: -1, _id: 1 });
transactionSchema.index({ organizationId: 1, reconciliationStatus: 1, date: -1 });

export const TransactionModel: Model<ITransaction> =
  mongoose.models.Transaction || mongoose.model<ITransaction>('Transaction', transactionSchema);

// ==============================================================================
// 6. Reconciliation Run Model
// ==============================================================================
export interface IReconciliationRun extends Document<string> {
  _id: string;
  organizationId: string;
  accountId?: string | null;
  targetAccountId?: string | null;
  status: ReconciliationRunStatus;
  rulesVersion: string;
  startDate?: Date | null;
  endDate?: Date | null;
  dateToleranceDays: number;
  totalSourceTransactions: number;
  matchedCount: number;
  reviewCount: number;
  unmatchedCount: number;
  errorCount: number;
  summary?: Record<string, unknown> | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const reconciliationRunSchema = new Schema<IReconciliationRun>(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    organizationId: { type: String, required: true, index: true },
    accountId: { type: String, default: null, index: true },
    targetAccountId: { type: String, default: null, index: true },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'processing', 'completed', 'completed_with_errors', 'failed'],
      default: 'pending',
      index: true,
    },
    rulesVersion: { type: String, required: true, default: 'v1.0.0' },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    dateToleranceDays: { type: Number, required: true, default: 3, min: 0, max: 30 },
    totalSourceTransactions: { type: Number, required: true, default: 0, min: 0 },
    matchedCount: { type: Number, required: true, default: 0, min: 0 },
    reviewCount: { type: Number, required: true, default: 0, min: 0 },
    unmatchedCount: { type: Number, required: true, default: 0, min: 0 },
    errorCount: { type: Number, required: true, default: 0, min: 0 },
    summary: { type: Schema.Types.Mixed, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    errorMessage: { type: String, default: null },
  },
  {
    timestamps: true,
    _id: false,
  },
);

reconciliationRunSchema.index({ organizationId: 1, createdAt: -1 });
reconciliationRunSchema.index({ organizationId: 1, status: 1 });

export const ReconciliationRunModel: Model<IReconciliationRun> =
  mongoose.models.ReconciliationRun ||
  mongoose.model<IReconciliationRun>('ReconciliationRun', reconciliationRunSchema);

// ==============================================================================
// 7. Reconciliation Match Model
// ==============================================================================
export interface IReconciliationMatch extends Document<string> {
  _id: string;
  organizationId: string;
  reconciliationRunId: string;
  sourceTransactionId: string;
  candidateTransactionId?: string | null;
  participatingTransactionIds: string[];
  status: ReconciliationMatchStatus;
  matchMethod: ReconciliationMatchMethod;
  matchScore: number;
  evidence: Record<string, unknown>;
  amountDifferenceMinor: number;
  dateDifferenceDays: number;
  reviewReason?: string | null;
  rejectionReason?: string | null;
  decisionSource: 'rule_engine' | 'manual_review';
  confirmedAt?: Date | null;
  rejectedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const reconciliationMatchSchema = new Schema<IReconciliationMatch>(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    organizationId: { type: String, required: true, index: true },
    reconciliationRunId: { type: String, required: true, index: true },
    sourceTransactionId: { type: String, required: true, index: true },
    candidateTransactionId: { type: String, default: null, index: true },
    participatingTransactionIds: { type: [String], default: [] },
    status: {
      type: String,
      required: true,
      enum: ['suggested', 'confirmed', 'rejected', 'needs_review'],
      default: 'suggested',
      index: true,
    },
    matchMethod: {
      type: String,
      required: true,
      enum: [
        'exact_reference',
        'transfer_match',
        'amount_date_reference',
        'amount_date_description',
        'manual',
      ],
    },
    matchScore: { type: Number, required: true, min: 0, max: 100 },
    evidence: { type: Schema.Types.Mixed, required: true },
    amountDifferenceMinor: { type: Number, required: true, default: 0 },
    dateDifferenceDays: { type: Number, required: true, default: 0 },
    reviewReason: { type: String, default: null },
    rejectionReason: { type: String, default: null },
    decisionSource: {
      type: String,
      required: true,
      enum: ['rule_engine', 'manual_review'],
      default: 'rule_engine',
    },
    confirmedAt: { type: Date, default: null },
    rejectedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    _id: false,
  },
);

reconciliationMatchSchema.index({ organizationId: 1, reconciliationRunId: 1 });
reconciliationMatchSchema.index({ organizationId: 1, status: 1 });

// Ensure a source transaction cannot be confirmed in multiple conflicting relationships
reconciliationMatchSchema.index(
  { organizationId: 1, sourceTransactionId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'confirmed' },
    name: 'org_source_tx_confirmed_unique',
  },
);

// Ensure a candidate transaction cannot be confirmed more than once
reconciliationMatchSchema.index(
  { organizationId: 1, candidateTransactionId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'confirmed', candidateTransactionId: { $type: 'string' } },
    name: 'org_candidate_tx_confirmed_unique',
  },
);

// Multikey partial unique index: strictly prevents ANY transaction from appearing in more than one confirmed match (reciprocal or cross-role)
reconciliationMatchSchema.index(
  { organizationId: 1, participatingTransactionIds: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'confirmed' },
    name: 'org_participating_tx_confirmed_unique',
  },
);

export const ReconciliationMatchModel: Model<IReconciliationMatch> =
  mongoose.models.ReconciliationMatch ||
  mongoose.model<IReconciliationMatch>('ReconciliationMatch', reconciliationMatchSchema);

// ==============================================================================
// 8. Reconciliation Audit Event Model
// ==============================================================================
export interface IReconciliationAuditEvent extends Document<string> {
  _id: string;
  organizationId: string;
  reconciliationRunId?: string | null;
  matchId?: string | null;
  action: ReconciliationAuditAction;
  details: Record<string, unknown>;
  timestamp: Date;
}

const reconciliationAuditEventSchema = new Schema<IReconciliationAuditEvent>(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    organizationId: { type: String, required: true, index: true },
    reconciliationRunId: { type: String, default: null, index: true },
    matchId: { type: String, default: null, index: true },
    action: {
      type: String,
      required: true,
      enum: [
        'run_started',
        'matches_generated',
        'match_confirmed',
        'match_rejected',
        'match_reversed',
        'run_completed',
        'run_failed',
      ],
    },
    details: { type: Schema.Types.Mixed, required: true, default: () => ({}) },
    timestamp: { type: Date, required: true, default: () => new Date() },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    _id: false,
  },
);

reconciliationAuditEventSchema.index({ organizationId: 1, reconciliationRunId: 1, createdAt: -1 });
reconciliationAuditEventSchema.index({ organizationId: 1, matchId: 1, createdAt: -1 });

export const ReconciliationAuditEventModel: Model<IReconciliationAuditEvent> =
  mongoose.models.ReconciliationAuditEvent ||
  mongoose.model<IReconciliationAuditEvent>(
    'ReconciliationAuditEvent',
    reconciliationAuditEventSchema,
  );

// ==============================================================================
// 9. Financial Finding Model
// ==============================================================================
export interface IFinancialFinding extends Document<string> {
  _id: string;
  organizationId: string;
  findingType: FindingType;
  status: FindingStatus;
  severity: FindingSeverity;
  title: string;
  summary: string;
  primaryTransactionIds: string[];
  relatedTransactionIds: string[];
  evidence: FindingEvidence;
  estimatedAmountMinor: number;
  currency: string;
  ruleId: string;
  ruleVersion: string;
  detectedAt: Date;
  lastEvaluatedAt: Date;
  reviewedAt?: Date | null;
  dismissalReason?: string | null;
  resolutionNotes?: string | null;
  fingerprint: string;
  createdAt: Date;
  updatedAt: Date;
}

const financialFindingSchema = new Schema<IFinancialFinding>(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    organizationId: { type: String, required: true, index: true },
    findingType: {
      type: String,
      required: true,
      enum: [
        'potential_duplicate_payment',
        'unusual_expense',
        'recurring_expense',
        'recurring_cost_increase',
        'supplier_price_variance',
        'reconciliation_inconsistency',
      ],
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['open', 'under_review', 'confirmed_issue', 'dismissed', 'resolved'],
      default: 'open',
      index: true,
    },
    severity: {
      type: String,
      required: true,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    summary: { type: String, required: true, trim: true, maxlength: 2000 },
    primaryTransactionIds: { type: [String], required: true },
    relatedTransactionIds: { type: [String], default: [] },
    evidence: { type: Schema.Types.Mixed, required: true },
    estimatedAmountMinor: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, trim: true },
    ruleId: { type: String, required: true, trim: true },
    ruleVersion: { type: String, required: true, trim: true },
    detectedAt: { type: Date, required: true, default: () => new Date() },
    lastEvaluatedAt: { type: Date, required: true, default: () => new Date() },
    reviewedAt: { type: Date, default: null },
    dismissalReason: { type: String, default: null, trim: true, maxlength: 500 },
    resolutionNotes: { type: String, default: null, trim: true, maxlength: 2000 },
    fingerprint: { type: String, required: true },
  },
  {
    timestamps: true,
    _id: false,
  },
);

// Indexes
financialFindingSchema.index(
  { organizationId: 1, fingerprint: 1 },
  { unique: true, name: 'org_finding_fingerprint_unique' },
);
financialFindingSchema.index({ organizationId: 1, createdAt: -1 });
financialFindingSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
financialFindingSchema.index({ organizationId: 1, findingType: 1, createdAt: -1 });
financialFindingSchema.index({ organizationId: 1, severity: 1, createdAt: -1 });
financialFindingSchema.index({ organizationId: 1, currency: 1 });
financialFindingSchema.index({ organizationId: 1, primaryTransactionIds: 1 });

export const FinancialFindingModel: Model<IFinancialFinding> =
  mongoose.models.FinancialFinding ||
  mongoose.model<IFinancialFinding>('FinancialFinding', financialFindingSchema);

// ==============================================================================
// 10. Finding Review & Audit History Model
// ==============================================================================
export interface IFindingHistory extends Document<string> {
  _id: string;
  findingId: string;
  organizationId: string;
  action: FindingHistoryAction;
  actorId?: string;
  previousStatus?: FindingStatus;
  newStatus?: FindingStatus;
  reason?: string | null;
  notes?: string | null;
  createdAt: Date;
}

const findingHistorySchema = new Schema<IFindingHistory>(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    findingId: { type: String, required: true, index: true },
    organizationId: { type: String, required: true, index: true },
    action: {
      type: String,
      required: true,
      enum: [
        'created',
        're_evaluated',
        'opened_for_review',
        'confirmed',
        'dismissed',
        'resolved',
        'explanation_generated',
      ],
    },
    actorId: { type: String, default: 'system' },
    previousStatus: {
      type: String,
      enum: ['open', 'under_review', 'confirmed_issue', 'dismissed', 'resolved'],
    },
    newStatus: {
      type: String,
      enum: ['open', 'under_review', 'confirmed_issue', 'dismissed', 'resolved'],
    },
    reason: { type: String, default: null, trim: true, maxlength: 500 },
    notes: { type: String, default: null, trim: true, maxlength: 2000 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    _id: false,
  },
);

findingHistorySchema.index({ organizationId: 1, findingId: 1, createdAt: -1 });

export const FindingHistoryModel: Model<IFindingHistory> =
  mongoose.models.FindingHistory ||
  mongoose.model<IFindingHistory>('FindingHistory', findingHistorySchema);

// ==============================================================================
// 11. Detection Run Model
// ==============================================================================
export interface IDetectionRun extends Document<string> {
  _id: string;
  organizationId: string;
  ruleVersion: string;
  status: DetectionRunStatus;
  observationScope?: {
    startDate?: string;
    endDate?: string;
    currencies?: string[];
  };
  startedAt: Date;
  completedAt?: Date | null;
  transactionsEvaluated: number;
  findingsCreated: number;
  findingsUpdated: number;
  findingsUnchanged: number;
  errorMessages: string[];
  perRuleResults?: Record<string, PerRuleRunResult>;
  createdAt: Date;
  updatedAt: Date;
}

const detectionRunSchema = new Schema<IDetectionRun>(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    organizationId: { type: String, required: true, index: true },
    ruleVersion: { type: String, required: true, trim: true },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'processing', 'completed', 'completed_with_errors', 'failed'],
      default: 'pending',
      index: true,
    },
    observationScope: {
      type: {
        startDate: { type: String },
        endDate: { type: String },
        currencies: { type: [String] },
      },
      default: undefined,
    },
    startedAt: { type: Date, required: true, default: () => new Date() },
    completedAt: { type: Date, default: null },
    transactionsEvaluated: { type: Number, required: true, default: 0, min: 0 },
    findingsCreated: { type: Number, required: true, default: 0, min: 0 },
    findingsUpdated: { type: Number, required: true, default: 0, min: 0 },
    findingsUnchanged: { type: Number, required: true, default: 0, min: 0 },
    errorMessages: { type: [String], default: [] },
    perRuleResults: { type: Schema.Types.Mixed, default: () => ({}) },
  },
  {
    timestamps: true,
    _id: false,
  },
);

detectionRunSchema.index({ organizationId: 1, createdAt: -1 });
detectionRunSchema.index({ organizationId: 1, status: 1 });

export const DetectionRunModel: Model<IDetectionRun> =
  mongoose.models.DetectionRun || mongoose.model<IDetectionRun>('DetectionRun', detectionRunSchema);

// ==============================================================================
// 10. Forecast Run Model
// ==============================================================================
export interface IForecastRun extends Document<string> {
  _id: string;
  organizationId: string;
  status: ForecastRunStatus;
  horizonDays: number;
  methodology: string;
  methodologyVersion: string;
  historyWindowDays: number;
  transactionsEvaluated: number;
  currencies: string[];
  warnings: string[];
  errorMessages: string[];
  startedAt: Date;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const forecastRunSchema = new Schema<IForecastRun>(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    organizationId: { type: String, required: true, index: true },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'completed', 'completed_with_warnings', 'failed'],
      default: 'pending',
      index: true,
    },
    horizonDays: { type: Number, required: true },
    methodology: { type: String, required: true, default: 'deterministic_moving_average_v1' },
    methodologyVersion: { type: String, required: true, default: '1.0.0' },
    historyWindowDays: { type: Number, required: true, default: 90 },
    transactionsEvaluated: { type: Number, required: true, default: 0, min: 0 },
    currencies: { type: [String], required: true },
    warnings: { type: [String], default: [] },
    errorMessages: { type: [String], default: [] },
    startedAt: { type: Date, required: true, default: () => new Date() },
    completedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    _id: false,
  },
);

forecastRunSchema.index({ organizationId: 1, createdAt: -1 });
forecastRunSchema.index({ organizationId: 1, status: 1 });

export const ForecastRunModel: Model<IForecastRun> =
  mongoose.models.ForecastRun || mongoose.model<IForecastRun>('ForecastRun', forecastRunSchema);

// ==============================================================================
// 11. Cash Flow Forecast Model (Currency-Specific)
// ==============================================================================
export interface ICashFlowForecast extends Document<string> {
  _id: string;
  organizationId: string;
  forecastRunId: string;
  currency: string;
  horizonDays: number;
  startDate: string;
  endDate: string;
  hasReliableOpeningBalance: boolean;
  openingBalanceMinor?: number | null;
  openingBalanceEffectiveDate?: string | null;
  projectedInflowsMinor: number;
  projectedOutflowsMinor: number;
  expectedNetMovementMinor: number;
  projectedClosingBalanceMinor?: number | null;
  lowestProjectedBalanceMinor?: number | null;
  lowestBalanceDate?: string | null;
  riskLevel: CashFlowRiskLevel;
  riskReason: string;
  dataQuality: ForecastDataQuality;
  historicalDailyAvgInflowMinor: number;
  historicalDailyAvgOutflowMinor: number;
  recurringOutflowsCount: number;
  recurringOutflowsTotalMinor: number;
  points: CashFlowProjectionPoint[];
  assumptions: string[];
  limitations: string[];
  createdAt: Date;
  updatedAt: Date;
}

const cashFlowForecastSchema = new Schema<ICashFlowForecast>(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    organizationId: { type: String, required: true, index: true },
    forecastRunId: { type: String, required: true, index: true },
    currency: { type: String, required: true, uppercase: true, trim: true },
    horizonDays: { type: Number, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    hasReliableOpeningBalance: { type: Boolean, required: true, default: false },
    openingBalanceMinor: { type: Number, default: null },
    openingBalanceEffectiveDate: { type: String, default: null },
    projectedInflowsMinor: { type: Number, required: true, default: 0 },
    projectedOutflowsMinor: { type: Number, required: true, default: 0 },
    expectedNetMovementMinor: { type: Number, required: true, default: 0 },
    projectedClosingBalanceMinor: { type: Number, default: null },
    lowestProjectedBalanceMinor: { type: Number, default: null },
    lowestBalanceDate: { type: String, default: null },
    riskLevel: {
      type: String,
      required: true,
      enum: ['insufficient_data', 'no_balance_data', 'low_risk', 'moderate_risk', 'high_risk'],
      default: 'no_balance_data',
    },
    riskReason: { type: String, required: true },
    dataQuality: {
      type: String,
      required: true,
      enum: ['high', 'adequate', 'sparse_history', 'insufficient_history'],
      default: 'adequate',
    },
    historicalDailyAvgInflowMinor: { type: Number, required: true, default: 0 },
    historicalDailyAvgOutflowMinor: { type: Number, required: true, default: 0 },
    recurringOutflowsCount: { type: Number, required: true, default: 0 },
    recurringOutflowsTotalMinor: { type: Number, required: true, default: 0 },
    points: { type: Schema.Types.Mixed, required: true, default: [] },
    assumptions: { type: [String], default: [] },
    limitations: { type: [String], default: [] },
  },
  {
    timestamps: true,
    _id: false,
  },
);

cashFlowForecastSchema.index({ organizationId: 1, forecastRunId: 1 });
cashFlowForecastSchema.index({ organizationId: 1, currency: 1, createdAt: -1 });

export const CashFlowForecastModel: Model<ICashFlowForecast> =
  mongoose.models.CashFlowForecast ||
  mongoose.model<ICashFlowForecast>('CashFlowForecast', cashFlowForecastSchema);

// ==============================================================================
// 12. Cash Flow Scenario Model
// ==============================================================================
export interface ICashFlowScenario extends Document<string> {
  _id: string;
  organizationId: string;
  name: string;
  currency: string;
  horizonDays: number;
  assumptions: ScenarioAssumptions;
  createdAt: Date;
  updatedAt: Date;
}

const cashFlowScenarioSchema = new Schema<ICashFlowScenario>(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    organizationId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    currency: { type: String, required: true, uppercase: true, trim: true },
    horizonDays: { type: Number, required: true, default: 30 },
    assumptions: {
      type: Schema.Types.Mixed,
      required: true,
      default: () => ({
        revenueChangePercent: 0,
        expenseChangePercent: 0,
        recurringAdjustments: [],
        oneTimeEvents: [],
      }),
    },
  },
  {
    timestamps: true,
    _id: false,
  },
);

cashFlowScenarioSchema.index({ organizationId: 1, createdAt: -1 });

export const CashFlowScenarioModel: Model<ICashFlowScenario> =
  mongoose.models.CashFlowScenario ||
  mongoose.model<ICashFlowScenario>('CashFlowScenario', cashFlowScenarioSchema);

// ==============================================================================
// 13. Business Action Model
// ==============================================================================
export interface IBusinessAction extends Document<string> {
  _id: string;
  organizationId: string;
  actionType: ActionType;
  category: ActionCategory;
  title: string;
  explanation: string;
  priority: ActionPriority;
  priorityScore: number;
  severity: ActionSeverity;
  status: ActionStatus;
  evidence: Record<string, unknown>;
  sourceFindingIds: string[];
  sourceForecastRunId?: string | null;
  currency?: string | null;
  financialImpact: ActionFinancialImpact;
  evidenceQuality: ActionEvidenceQuality;
  recommendedSteps: ActionRecommendedStep[];
  ruleId: string;
  ruleVersion: string;
  fingerprint: string;
  snoozedUntil?: Date | null;
  completedAt?: Date | null;
  completionNotes?: string | null;
  dismissedAt?: Date | null;
  dismissalReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastEvaluatedAt: Date;
}

const businessActionSchema = new Schema<IBusinessAction>(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    organizationId: { type: String, required: true, index: true },
    actionType: { type: String, required: true },
    category: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    explanation: { type: String, required: true },
    priority: {
      type: String,
      required: true,
      enum: ['critical', 'high', 'medium', 'low'],
      default: 'medium',
    },
    priorityScore: { type: Number, required: true, default: 50 },
    severity: {
      type: String,
      required: true,
      enum: ['critical', 'high', 'medium', 'low'],
      default: 'medium',
    },
    status: {
      type: String,
      required: true,
      enum: ['open', 'in_progress', 'completed', 'dismissed', 'snoozed', 'superseded'],
      default: 'open',
    },
    evidence: { type: Schema.Types.Mixed, required: true, default: {} },
    sourceFindingIds: { type: [String], default: [] },
    sourceForecastRunId: { type: String, default: null },
    currency: { type: String, uppercase: true, trim: true, default: null },
    financialImpact: {
      type: Schema.Types.Mixed,
      required: true,
      default: () => ({
        currency: null,
        potentialExposureMinor: 0,
        estimatedAvoidableCostMinor: 0,
        confirmedIssueMinor: 0,
        projectedCashFlowEffectMinor: 0,
        realizedSavingsMinor: 0,
      }),
    },
    evidenceQuality: {
      type: String,
      required: true,
      enum: ['high', 'adequate', 'preliminary'],
      default: 'adequate',
    },
    recommendedSteps: { type: Schema.Types.Mixed, required: true, default: [] },
    ruleId: { type: String, required: true },
    ruleVersion: { type: String, required: true },
    fingerprint: { type: String, required: true },
    snoozedUntil: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    completionNotes: { type: String, default: null },
    dismissedAt: { type: Date, default: null },
    dismissalReason: { type: String, default: null },
    lastEvaluatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    _id: false,
  },
);

// Unique compound index preventing duplicate active/historical actions per fingerprint
businessActionSchema.index({ organizationId: 1, fingerprint: 1 }, { unique: true });
businessActionSchema.index({ organizationId: 1, status: 1, priorityScore: -1 });
businessActionSchema.index({ organizationId: 1, category: 1 });
businessActionSchema.index({ organizationId: 1, createdAt: -1 });

export const BusinessActionModel: Model<IBusinessAction> =
  mongoose.models.BusinessAction ||
  mongoose.model<IBusinessAction>('BusinessAction', businessActionSchema);

// ==============================================================================
// 14. Action History Event Model (Append-Only Audit Trail)
// ==============================================================================
export interface IActionHistory extends Document<string> {
  _id: string;
  organizationId: string;
  actionId: string;
  previousStatus?: ActionStatus | null;
  nextStatus: ActionStatus;
  eventType: ActionHistoryEventType;
  actorId: string;
  reason?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date;
}

const actionHistorySchema = new Schema<IActionHistory>(
  {
    _id: { type: String, default: () => crypto.randomUUID() },
    organizationId: { type: String, required: true, index: true },
    actionId: { type: String, required: true, index: true },
    previousStatus: { type: String, default: null },
    nextStatus: { type: String, required: true },
    eventType: { type: String, required: true },
    actorId: { type: String, required: true, default: 'system' },
    reason: { type: String, default: null },
    notes: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    _id: false,
  },
);

actionHistorySchema.index({ organizationId: 1, actionId: 1, createdAt: -1 });
actionHistorySchema.index({ organizationId: 1, createdAt: -1 });

export const ActionHistoryModel: Model<IActionHistory> =
  mongoose.models.ActionHistory ||
  mongoose.model<IActionHistory>('ActionHistory', actionHistorySchema);
