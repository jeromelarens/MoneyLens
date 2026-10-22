import { Router, Request, Response, NextFunction } from 'express';
import { requireOrganizationAuth } from '../middleware/auth.js';
import { FinancialAccountModel } from '../infrastructure/database/models/index.js';
import { resolveAccount } from '../services/import.service.js';

export const accountRouter = Router();

accountRouter.use(requireOrganizationAuth);

/**
 * GET /api/v1/accounts
 * Lists financial accounts for the authenticated organization.
 */
accountRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organization!.id;

    // Ensure default account exists if none registered yet
    await resolveAccount(organizationId);

    const accounts = await FinancialAccountModel.find({ organizationId })
      .sort({ createdAt: 1 })
      .lean();

    const items = accounts.map((a) => ({
      id: a._id,
      organizationId: a.organizationId,
      name: a.name,
      type: a.type,
      currency: a.currency,
      institutionName: a.institutionName,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }));

    res.status(200).json({ items });
  } catch (err) {
    next(err);
  }
});
