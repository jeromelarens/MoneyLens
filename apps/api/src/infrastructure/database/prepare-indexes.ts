import { validateEnv } from '../../config/env.js';
import { connectDatabase, disconnectDatabase } from './mongo.js';
import { logger } from '../observability/logger.js';
import {
  OrganizationModel,
  FinancialAccountModel,
  ImportJobModel,
  TransactionModel,
  ReconciliationMatchModel,
  FinancialFindingModel,
  BusinessActionModel,
  ReconciliationRunModel,
  ReconciliationAuditEventModel,
  ImportRowErrorModel,
  FindingHistoryModel,
  DetectionRunModel,
  ForecastRunModel,
  CashFlowForecastModel,
  CashFlowScenarioModel,
  ActionHistoryModel,
} from './models/index.js';

interface ConflictCheckResult {
  collection: string;
  fieldDescription: string;
  conflictsFound: number;
  sampleConflicts?: unknown[];
}

/**
 * Checks for duplicate data that would conflict with unique indexes.
 * Pure read-only aggregation; never mutates or drops data.
 */
async function auditUniqueIndexConflicts(): Promise<ConflictCheckResult[]> {
  const results: ConflictCheckResult[] = [];

  // 1. Organization: unique apiKey
  const orgConflicts = await OrganizationModel.aggregate([
    { $group: { _id: '$apiKey', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 5 },
  ]);
  if (orgConflicts.length > 0) {
    results.push({
      collection: 'organizations',
      fieldDescription: 'apiKey',
      conflictsFound: orgConflicts.length,
      sampleConflicts: orgConflicts,
    });
  }

  // 2. FinancialAccount: unique { organizationId, name }
  const accountConflicts = await FinancialAccountModel.aggregate([
    { $group: { _id: { org: '$organizationId', name: '$name' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 5 },
  ]);
  if (accountConflicts.length > 0) {
    results.push({
      collection: 'financialaccounts',
      fieldDescription: 'organizationId + name',
      conflictsFound: accountConflicts.length,
      sampleConflicts: accountConflicts,
    });
  }

  // 3. ImportJob: unique { organizationId, fileHash } for active/completed
  const importConflicts = await ImportJobModel.aggregate([
    { $match: { status: { $in: ['completed', 'processing'] } } },
    { $group: { _id: { org: '$organizationId', hash: '$fileHash' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 5 },
  ]);
  if (importConflicts.length > 0) {
    results.push({
      collection: 'importjobs',
      fieldDescription: 'organizationId + fileHash (status: completed/processing)',
      conflictsFound: importConflicts.length,
      sampleConflicts: importConflicts,
    });
  }

  // 4. Transaction: unique { organizationId, accountId, fingerprint }
  const txConflicts = await TransactionModel.aggregate([
    {
      $group: {
        _id: { org: '$organizationId', acc: '$accountId', fp: '$fingerprint' },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $limit: 5 },
  ]);
  if (txConflicts.length > 0) {
    results.push({
      collection: 'transactions',
      fieldDescription: 'organizationId + accountId + fingerprint',
      conflictsFound: txConflicts.length,
      sampleConflicts: txConflicts,
    });
  }

  // 5. ReconciliationMatch: unique sourceTransactionId for confirmed status
  const matchSourceConflicts = await ReconciliationMatchModel.aggregate([
    { $match: { status: 'confirmed' } },
    {
      $group: { _id: { org: '$organizationId', src: '$sourceTransactionId' }, count: { $sum: 1 } },
    },
    { $match: { count: { $gt: 1 } } },
    { $limit: 5 },
  ]);
  if (matchSourceConflicts.length > 0) {
    results.push({
      collection: 'reconciliationmatches',
      fieldDescription: 'organizationId + sourceTransactionId (status: confirmed)',
      conflictsFound: matchSourceConflicts.length,
      sampleConflicts: matchSourceConflicts,
    });
  }

  // 6. FinancialFinding: unique { organizationId, fingerprint }
  const findingConflicts = await FinancialFindingModel.aggregate([
    { $group: { _id: { org: '$organizationId', fp: '$fingerprint' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 5 },
  ]);
  if (findingConflicts.length > 0) {
    results.push({
      collection: 'financialfindings',
      fieldDescription: 'organizationId + fingerprint',
      conflictsFound: findingConflicts.length,
      sampleConflicts: findingConflicts,
    });
  }

  // 7. BusinessAction: unique { organizationId, fingerprint }
  const actionConflicts = await BusinessActionModel.aggregate([
    { $group: { _id: { org: '$organizationId', fp: '$fingerprint' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 5 },
  ]);
  if (actionConflicts.length > 0) {
    results.push({
      collection: 'businessactions',
      fieldDescription: 'organizationId + fingerprint',
      conflictsFound: actionConflicts.length,
      sampleConflicts: actionConflicts,
    });
  }

  return results;
}

/**
 * Executes safe index preparation across all MoneyLens models.
 */
export async function prepareIndexes(): Promise<void> {
  const config = validateEnv(process.env);
  await connectDatabase(config.MONGODB_URI);

  logger.info('Starting non-destructive pre-index duplicate conflict audit...');
  const conflicts = await auditUniqueIndexConflicts();

  if (conflicts.length > 0) {
    logger.error(
      { conflicts },
      'Index preparation aborted: duplicate data exists that violates unique index constraints.',
    );
    throw new Error(
      `Index preparation aborted due to ${conflicts.length} unique constraint conflict(s). Resolve data anomalies before applying unique indexes.`,
    );
  }

  logger.info('Pre-index conflict audit passed. Building and syncing production indexes...');

  const models = [
    OrganizationModel,
    FinancialAccountModel,
    ImportJobModel,
    ImportRowErrorModel,
    TransactionModel,
    ReconciliationRunModel,
    ReconciliationMatchModel,
    ReconciliationAuditEventModel,
    FinancialFindingModel,
    FindingHistoryModel,
    DetectionRunModel,
    ForecastRunModel,
    CashFlowForecastModel,
    CashFlowScenarioModel,
    BusinessActionModel,
    ActionHistoryModel,
  ];

  for (const model of models) {
    await model.createIndexes();
    logger.info({ model: model.modelName }, 'Indexes synced successfully');
  }

  logger.info('All MoneyLens collection indexes verified and synced cleanly.');
}

// Allow direct CLI invocation
if (
  process.argv[1]?.endsWith('prepare-indexes.ts') ||
  process.argv[1]?.endsWith('prepare-indexes.js')
) {
  prepareIndexes()
    .then(async () => {
      await disconnectDatabase();
      process.exit(0);
    })
    .catch(async (err) => {
      logger.fatal({ err }, 'Failed to prepare indexes');
      await disconnectDatabase();
      process.exit(1);
    });
}
