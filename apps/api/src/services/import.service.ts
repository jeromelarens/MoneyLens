import path from 'node:path';
import {
  FINANCIAL_LIMITS,
  ERROR_CODES,
  type ColumnMapping,
  type ImportJob,
} from '@moneylens/shared';
import { AppError } from '../middleware/error-handler.js';
import {
  ImportJobModel,
  ImportRowErrorModel,
  TransactionModel,
  FinancialAccountModel,
  IFinancialAccount,
  IImportJob,
} from '../infrastructure/database/models/index.js';
import { parseCsvBuffer, type ParsedFileContent } from './parsers/csv-parser.js';
import { parseExcelBuffer } from './parsers/excel-parser.js';
import {
  computeFileHash,
  generateTransactionFingerprint,
  parseAmount,
  parseDate,
  sanitizeText,
} from './normalization.js';
import { logger } from '../infrastructure/observability/logger.js';
import crypto from 'node:crypto';

export interface ProcessImportParams {
  organizationId: string;
  fileBuffer: Buffer;
  fileName: string;
  accountId?: string;
  customMapping?: Partial<ColumnMapping>;
}

/**
 * Auto-detects columns from extracted header names.
 */
export function autoDetectMapping(
  headers: string[],
  customMapping?: Partial<ColumnMapping>,
): ColumnMapping {
  const normalizedHeaders = headers.map((h) => ({
    original: h,
    lower: h
      .toLowerCase()
      .trim()
      .replace(/[\s_-]+/g, ''),
  }));

  const findHeader = (patterns: RegExp[]): string | undefined => {
    for (const pattern of patterns) {
      const match = normalizedHeaders.find((h) => pattern.test(h.lower));
      if (match) return match.original;
    }
    return undefined;
  };

  const detected: ColumnMapping = {
    date:
      customMapping?.date ||
      findHeader([/^date$/, /trans.*date/, /post.*date/, /booking.*date/]) ||
      '',
    description:
      customMapping?.description ||
      findHeader([/^desc/, /^description$/, /^narrative$/, /^details$/, /^memo$/, /^payee$/]) ||
      '',
    amount: customMapping?.amount || findHeader([/^amount$/, /^total$/, /^sum$/]) || undefined,
    debit:
      customMapping?.debit ||
      findHeader([/^debit$/, /^dr$/, /^withdrawal$/, /^spent$/, /^outflow$/]) ||
      undefined,
    credit:
      customMapping?.credit ||
      findHeader([/^credit$/, /^cr$/, /^deposit$/, /^received$/, /^inflow$/]) ||
      undefined,
    direction:
      customMapping?.direction ||
      findHeader([/^type$/, /^direction$/, /^trans.*type$/]) ||
      undefined,
    reference:
      customMapping?.reference ||
      findHeader([/^ref/, /^reference$/, /^check/, /^chq/, /^transactionid$/, /^txnid$/]) ||
      undefined,
    currency: customMapping?.currency || findHeader([/^currency$/, /^curr$/]) || undefined,
    dateFormat: customMapping?.dateFormat || 'auto',
  };

  // Validation: Must have date, description, and at least one amount source
  const hasAmountSource = Boolean(
    detected.amount || (detected.debit && detected.credit) || detected.debit || detected.credit,
  );

  if (!detected.date || !detected.description || !hasAmountSource) {
    throw new AppError(
      400,
      ERROR_CODES.MISSING_REQUIRED_COLUMNS,
      `Could not detect required columns. Ensure your file contains headers for Date, Description, and Amount (or Debit/Credit). Detected: ${JSON.stringify(detected)}`,
      { detected, availableHeaders: headers },
    );
  }

  return detected;
}

/**
 * Resolves or creates a default financial account for an organization.
 */
export async function resolveAccount(
  organizationId: string,
  accountId?: string,
): Promise<IFinancialAccount> {
  if (accountId) {
    const account = await FinancialAccountModel.findOne({
      _id: accountId,
      organizationId,
    });
    if (!account) {
      throw new AppError(
        404,
        ERROR_CODES.ACCOUNT_NOT_FOUND,
        `Financial account ${accountId} not found in this organization.`,
      );
    }
    return account;
  }

  // Find or create default operating account safely under concurrent requests
  let defaultAccount = await FinancialAccountModel.findOne({
    organizationId,
    name: 'Primary Operating Account',
  });

  if (!defaultAccount) {
    try {
      defaultAccount = await FinancialAccountModel.create({
        organizationId,
        name: 'Primary Operating Account',
        type: 'checking',
        currency: 'USD',
        institutionName: 'Primary Bank',
      });
    } catch {
      defaultAccount = await FinancialAccountModel.findOne({
        organizationId,
        name: 'Primary Operating Account',
      });
    }
  }

  if (!defaultAccount) {
    throw new AppError(
      500,
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      'Failed to resolve financial account for organization.',
    );
  }

  return defaultAccount;
}

/**
 * Ingestion orchestrator for CSV and XLSX files.
 */
export async function processFinancialImport(params: ProcessImportParams): Promise<ImportJob> {
  const { organizationId, fileBuffer, fileName, accountId, customMapping } = params;

  // 1. File size check
  if (fileBuffer.length > FINANCIAL_LIMITS.MAX_FILE_SIZE_BYTES) {
    throw new AppError(
      400,
      ERROR_CODES.FILE_TOO_LARGE,
      `File size exceeds maximum allowed limit of ${FINANCIAL_LIMITS.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
    );
  }

  // 2. Extension check
  const ext = path.extname(fileName).toLowerCase();
  if (ext !== '.csv' && ext !== '.xlsx') {
    throw new AppError(
      400,
      ERROR_CODES.INVALID_FILE_FORMAT,
      'Unsupported file format. Only .csv and .xlsx files are supported.',
    );
  }

  // 3. Duplicate and concurrent file upload check via SHA-256 hash (organization-scoped)
  const fileHash = computeFileHash(fileBuffer);
  const account = await resolveAccount(organizationId, accountId);

  const existingFileJob = await ImportJobModel.findOne({
    organizationId,
    fileHash,
    status: { $in: ['completed', 'processing'] },
  });

  if (existingFileJob) {
    if (existingFileJob.status === 'processing') {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        `An import for this file is currently in progress (Job ID: ${existingFileJob._id}). Please wait for it to finish.`,
        { existingJobId: existingFileJob._id },
      );
    }

    throw new AppError(
      409,
      ERROR_CODES.DUPLICATE_IMPORT_FILE,
      `This file has already been imported into ${account.name} (Job ID: ${existingFileJob._id}). Re-importing duplicate files is prevented.`,
      { existingJobId: existingFileJob._id },
    );
  }

  // 4. Parse file content into structured rows
  let parsedContent: ParsedFileContent;
  if (ext === '.csv') {
    parsedContent = await parseCsvBuffer(fileBuffer);
  } else {
    parsedContent = await parseExcelBuffer(fileBuffer);
  }

  // 5. Column mapping resolution
  const mapping = autoDetectMapping(parsedContent.headers, customMapping);

  // 6. Create Import Job record (enforced by partial unique index)
  let importJob: IImportJob;
  try {
    importJob = await ImportJobModel.create({
      organizationId,
      accountId: account._id,
      fileName,
      fileHash,
      status: 'processing',
      totalRows: parsedContent.totalRows,
      acceptedRows: 0,
      rejectedRows: 0,
      duplicateRows: 0,
    });
  } catch (err: unknown) {
    const isDuplicateKey =
      err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000;

    if (isDuplicateKey) {
      const existingJob = await ImportJobModel.findOne({
        organizationId,
        fileHash,
        status: { $in: ['completed', 'processing'] },
      });

      if (existingJob?.status === 'processing') {
        throw new AppError(
          409,
          ERROR_CODES.CONFLICT,
          `An import for this file is currently in progress (Job ID: ${existingJob._id}). Please wait for it to finish.`,
          { existingJobId: existingJob._id },
        );
      }

      throw new AppError(
        409,
        ERROR_CODES.DUPLICATE_IMPORT_FILE,
        `This file has already been imported into ${account.name} (Job ID: ${existingJob?._id}). Re-importing duplicate files is prevented.`,
        { existingJobId: existingJob?._id },
      );
    }
    throw err;
  }

  // Guard entire normalization, persistence, and state transitions
  try {
    const transactionsToInsert: Array<{
      _id: string;
      organizationId: string;
      accountId: string;
      importJobId: string;
      date: Date;
      description: string;
      direction: 'debit' | 'credit';
      amountMinor: number;
      amountDecimal: string;
      currency: string;
      sourceReference: string | null;
      fingerprint: string;
      rawSourceData: Record<string, string>;
    }> = [];

    const rowErrorsToInsert: Array<{
      _id: string;
      importJobId: string;
      organizationId: string;
      rowNumber: number;
      rawData: Record<string, string>;
      errorCode: string;
      errorMessage: string;
    }> = [];

    const seenFingerprintsInBatch = new Set<string>();
    let duplicateCount = 0;

    // 7. Normalize each row
    for (const { rowNumber, data } of parsedContent.rows) {
      const rawDateVal = data[mapping.date];
      const rawDescVal = data[mapping.description];
      const rawAmountVal = mapping.amount ? data[mapping.amount] : undefined;
      const rawDebitVal = mapping.debit ? data[mapping.debit] : undefined;
      const rawCreditVal = mapping.credit ? data[mapping.credit] : undefined;
      const rawDirectionVal = mapping.direction ? data[mapping.direction] : undefined;
      const rawRefVal = mapping.reference ? data[mapping.reference] : undefined;
      const rawCurrencyVal = mapping.currency ? data[mapping.currency] : undefined;

      const targetCurrency = (rawCurrencyVal || account.currency || 'USD').trim().toUpperCase();

      // A. Validate Date
      const parsedDate = parseDate(rawDateVal, mapping.dateFormat);
      if (!parsedDate) {
        rowErrorsToInsert.push({
          _id: crypto.randomUUID(),
          importJobId: importJob._id,
          organizationId,
          rowNumber,
          rawData: data,
          errorCode: 'INVALID_DATE',
          errorMessage: `Unparseable transaction date: "${rawDateVal || ''}"`,
        });
        continue;
      }

      // B. Validate Amount using exact decimal parsing and currency precision
      const parsedAmt = parseAmount(
        rawAmountVal,
        rawDebitVal,
        rawCreditVal,
        rawDirectionVal,
        targetCurrency,
      );

      if (!parsedAmt) {
        rowErrorsToInsert.push({
          _id: crypto.randomUUID(),
          importJobId: importJob._id,
          organizationId,
          rowNumber,
          rawData: data,
          errorCode: 'INVALID_AMOUNT',
          errorMessage: `Invalid, ambiguous, or malformed financial amount in row for currency ${targetCurrency}.`,
        });
        continue;
      }

      // C. Validate & sanitize description
      const sanitizedDesc = sanitizeText(rawDescVal);
      if (!sanitizedDesc) {
        rowErrorsToInsert.push({
          _id: crypto.randomUUID(),
          importJobId: importJob._id,
          organizationId,
          rowNumber,
          rawData: data,
          errorCode: 'MISSING_DESCRIPTION',
          errorMessage: 'Transaction description is empty.',
        });
        continue;
      }

      const sanitizedRef = rawRefVal ? sanitizeText(rawRefVal) : null;

      // D. Compute Fingerprint for duplicate detection
      const fingerprint = generateTransactionFingerprint({
        organizationId,
        accountId: account._id,
        date: parsedDate,
        amountMinor: parsedAmt.amountMinor,
        direction: parsedAmt.direction,
        currency: targetCurrency,
        description: sanitizedDesc,
        sourceReference: sanitizedRef,
      });

      // Check duplicate within the same uploaded file
      if (seenFingerprintsInBatch.has(fingerprint)) {
        duplicateCount++;
        continue;
      }

      // Check duplicate in the database for this organization/account
      const existsInDb = await TransactionModel.exists({
        organizationId,
        accountId: account._id,
        fingerprint,
      });

      if (existsInDb) {
        duplicateCount++;
        continue;
      }

      seenFingerprintsInBatch.add(fingerprint);

      transactionsToInsert.push({
        _id: crypto.randomUUID(),
        organizationId,
        accountId: account._id,
        importJobId: importJob._id,
        date: parsedDate,
        description: sanitizedDesc,
        direction: parsedAmt.direction,
        amountMinor: parsedAmt.amountMinor,
        amountDecimal: parsedAmt.amountDecimal,
        currency: targetCurrency,
        sourceReference: sanitizedRef,
        fingerprint,
        rawSourceData: data,
      });
    }

    // 8. Bulk persist transactions and errors with concurrency collision handling
    let actuallyInsertedCount = 0;

    if (transactionsToInsert.length > 0) {
      try {
        const insertedDocs = await TransactionModel.insertMany(transactionsToInsert, {
          ordered: false,
        });
        actuallyInsertedCount = insertedDocs.length;
      } catch (insertErr: unknown) {
        // Handle MongoDB E11000 duplicate key error gracefully under concurrent import requests
        const isBulkError =
          insertErr &&
          typeof insertErr === 'object' &&
          ('code' in insertErr || 'writeErrors' in insertErr);

        if (isBulkError) {
          const writeErrors =
            (insertErr as { writeErrors?: Array<{ code: number; index: number }> }).writeErrors ||
            [];
          const duplicateErrors = writeErrors.filter((e) => e.code === 11000);

          if (duplicateErrors.length > 0) {
            const conflictCount = duplicateErrors.length;
            duplicateCount += conflictCount;
            actuallyInsertedCount = transactionsToInsert.length - conflictCount;
          } else {
            throw insertErr;
          }
        } else {
          throw insertErr;
        }
      }
    }

    if (rowErrorsToInsert.length > 0) {
      await ImportRowErrorModel.insertMany(rowErrorsToInsert, { ordered: false });
    }

    // 9. Update job status consistently with actual persisted data
    importJob.status = 'completed';
    importJob.acceptedRows = actuallyInsertedCount;
    importJob.rejectedRows = rowErrorsToInsert.length;
    importJob.duplicateRows = duplicateCount;
    await importJob.save();

    logger.info(
      {
        importJobId: importJob._id,
        organizationId,
        acceptedRows: importJob.acceptedRows,
        rejectedRows: importJob.rejectedRows,
        duplicateRows: importJob.duplicateRows,
      },
      'Import job completed successfully',
    );

    return {
      id: importJob._id,
      organizationId: importJob.organizationId,
      accountId: importJob.accountId,
      fileName: importJob.fileName,
      fileHash: importJob.fileHash,
      status: importJob.status,
      totalRows: importJob.totalRows,
      acceptedRows: importJob.acceptedRows,
      rejectedRows: importJob.rejectedRows,
      duplicateRows: importJob.duplicateRows,
      errorMessage: importJob.errorMessage,
      createdAt: importJob.createdAt.toISOString(),
      updatedAt: importJob.updatedAt.toISOString(),
    };
  } catch (err) {
    importJob.status = 'failed';
    importJob.errorMessage = err instanceof Error ? err.message : String(err);
    await importJob.save();
    throw err;
  }
}
