import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { requireOrganizationAuth } from '../middleware/auth.js';
import { processFinancialImport } from '../services/import.service.js';
import { ImportJobModel, ImportRowErrorModel } from '../infrastructure/database/models/index.js';
import { AppError } from '../middleware/error-handler.js';
import { FINANCIAL_LIMITS, ERROR_CODES, columnMappingSchema } from '@moneylens/shared';

export const importRouter = Router();

// Configure Multer with strict size bounds and memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: FINANCIAL_LIMITS.MAX_FILE_SIZE_BYTES, // 10MB
    files: 1,
  },
});

// All import routes strictly require organization authentication
importRouter.use(requireOrganizationAuth);

/**
 * POST /api/v1/imports
 * Ingests and processes a financial statement file (.csv or .xlsx).
 */
importRouter.post(
  '/',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        throw new AppError(
          400,
          ERROR_CODES.BAD_REQUEST,
          'No file uploaded. Please provide a "file" field with a .csv or .xlsx file.',
        );
      }

      const organizationId = req.organization!.id;
      const accountId = typeof req.body.accountId === 'string' ? req.body.accountId : undefined;

      let customMapping;
      if (req.body.columnMapping) {
        try {
          const rawMapping =
            typeof req.body.columnMapping === 'string'
              ? JSON.parse(req.body.columnMapping)
              : req.body.columnMapping;
          customMapping = columnMappingSchema.partial().parse(rawMapping);
        } catch (err) {
          throw new AppError(
            400,
            ERROR_CODES.VALIDATION_ERROR,
            `Invalid columnMapping parameter: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      const job = await processFinancialImport({
        organizationId,
        fileBuffer: req.file.buffer,
        fileName: req.file.originalname,
        accountId,
        customMapping,
      });

      res.status(201).json(job);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/imports
 * Lists import jobs for the authenticated organization with pagination.
 */
importRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organization!.id;
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(
      FINANCIAL_LIMITS.MAX_PAGE_SIZE,
      Math.max(1, parseInt(req.query.limit as string, 10) || FINANCIAL_LIMITS.DEFAULT_PAGE_SIZE),
    );
    const skip = (page - 1) * limit;

    const [totalItems, jobs] = await Promise.all([
      ImportJobModel.countDocuments({ organizationId }),
      ImportJobModel.find({ organizationId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const items = jobs.map((j) => ({
      id: j._id,
      organizationId: j.organizationId,
      accountId: j.accountId,
      fileName: j.fileName,
      fileHash: j.fileHash,
      status: j.status,
      totalRows: j.totalRows,
      acceptedRows: j.acceptedRows,
      rejectedRows: j.rejectedRows,
      duplicateRows: j.duplicateRows,
      errorMessage: j.errorMessage,
      createdAt: j.createdAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
    }));

    res.status(200).json({
      items,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/imports/:importId
 * Retrieves details for a specific import job.
 */
importRouter.get(
  '/:importId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organization!.id;
      const { importId } = req.params;

      const job = await ImportJobModel.findOne({
        _id: importId,
        organizationId,
      }).lean();

      if (!job) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, `Import job ${importId} was not found.`);
      }

      res.status(200).json({
        id: job._id,
        organizationId: job.organizationId,
        accountId: job.accountId,
        fileName: job.fileName,
        fileHash: job.fileHash,
        status: job.status,
        totalRows: job.totalRows,
        acceptedRows: job.acceptedRows,
        rejectedRows: job.rejectedRows,
        duplicateRows: job.duplicateRows,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/imports/:importId/errors
 * Retrieves paginated row-level errors for an import job.
 */
importRouter.get(
  '/:importId/errors',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organization!.id;
      const { importId } = req.params;

      // Confirm job exists and belongs to this organization
      const job = await ImportJobModel.findOne({ _id: importId, organizationId });
      if (!job) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, `Import job ${importId} was not found.`);
      }

      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(
        FINANCIAL_LIMITS.MAX_PAGE_SIZE,
        Math.max(1, parseInt(req.query.limit as string, 10) || FINANCIAL_LIMITS.DEFAULT_PAGE_SIZE),
      );
      const skip = (page - 1) * limit;

      const [totalItems, errors] = await Promise.all([
        ImportRowErrorModel.countDocuments({ importJobId: importId, organizationId }),
        ImportRowErrorModel.find({ importJobId: importId, organizationId })
          .sort({ rowNumber: 1 })
          .skip(skip)
          .limit(limit)
          .lean(),
      ]);

      const items = errors.map((e) => ({
        id: e._id,
        importJobId: e.importJobId,
        organizationId: e.organizationId,
        rowNumber: e.rowNumber,
        rawData: e.rawData,
        errorCode: e.errorCode,
        errorMessage: e.errorMessage,
        createdAt: e.createdAt.toISOString(),
      }));

      res.status(200).json({
        items,
        pagination: {
          page,
          limit,
          totalItems,
          totalPages: Math.ceil(totalItems / limit) || 1,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);
