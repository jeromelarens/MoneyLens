import { Router, Request, Response, NextFunction } from 'express';
import { requireOrganizationAuth } from '../middleware/auth.js';
import { TransactionModel } from '../infrastructure/database/models/index.js';
import { AppError } from '../middleware/error-handler.js';
import { FINANCIAL_LIMITS, ERROR_CODES, type Transaction } from '@moneylens/shared';

export const transactionRouter = Router();

// Strictly require organization authentication
transactionRouter.use(requireOrganizationAuth);

/**
 * GET /api/v1/transactions
 * Queries normalized transactions with pagination and filters.
 * Scoped strictly to the authenticated organization.
 */
transactionRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organization!.id;

      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(
        FINANCIAL_LIMITS.MAX_PAGE_SIZE,
        Math.max(1, parseInt(req.query.limit as string, 10) || FINANCIAL_LIMITS.DEFAULT_PAGE_SIZE),
      );
      const skip = (page - 1) * limit;

      // Build query filter
      const filter: Record<string, unknown> = { organizationId };

      if (typeof req.query.accountId === 'string' && req.query.accountId) {
        filter.accountId = req.query.accountId;
      }

      if (
        typeof req.query.direction === 'string' &&
        (req.query.direction === 'debit' || req.query.direction === 'credit')
      ) {
        filter.direction = req.query.direction;
      }

      if (typeof req.query.startDate === 'string' || typeof req.query.endDate === 'string') {
        const dateFilter: Record<string, Date> = {};
        if (req.query.startDate) {
          const d = new Date(req.query.startDate as string);
          if (isNaN(d.getTime())) {
            throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Invalid startDate parameter.');
          }
          dateFilter.$gte = d;
        }
        if (req.query.endDate) {
          const d = new Date(req.query.endDate as string);
          if (isNaN(d.getTime())) {
            throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Invalid endDate parameter.');
          }
          dateFilter.$lte = d;
        }
        if (dateFilter.$gte && dateFilter.$lte && dateFilter.$gte > dateFilter.$lte) {
          throw new AppError(
            400,
            ERROR_CODES.VALIDATION_ERROR,
            'startDate cannot be later than endDate.',
          );
        }
        if (Object.keys(dateFilter).length > 0) {
          filter.date = dateFilter;
        }
      }

      if (typeof req.query.search === 'string' && req.query.search.trim()) {
        const rawSearch = req.query.search.trim().slice(0, 100);
        // Escape special regex characters to prevent ReDoS and regex syntax errors
        const escapedSearch = rawSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.description = { $regex: escapedSearch, $options: 'i' };
      }

      const [totalItems, transactions] = await Promise.all([
        TransactionModel.countDocuments(filter),
        TransactionModel.find(filter)
          .sort({ date: -1, createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
      ]);

      const items: Transaction[] = transactions.map((t) => ({
        id: t._id,
        organizationId: t.organizationId,
        accountId: t.accountId,
        importJobId: t.importJobId,
        date: t.date.toISOString(),
        description: t.description,
        direction: t.direction,
        amountMinor: t.amountMinor,
        amountDecimal: t.amountDecimal,
        currency: t.currency,
        sourceReference: t.sourceReference || null,
        fingerprint: t.fingerprint,
        rawSourceData: t.rawSourceData as Record<string, string> | null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
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
