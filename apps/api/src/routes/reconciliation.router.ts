import { Router, Request, Response, NextFunction } from 'express';
import { requireOrganizationAuth } from '../middleware/auth.js';
import { reconciliationService } from '../services/reconciliation/reconciliation.service.js';
import {
  createReconciliationRunRequestSchema,
  queryRunsRequestSchema,
  queryMatchesRequestSchema,
  confirmMatchRequestSchema,
  rejectMatchRequestSchema,
} from '@moneylens/shared';

export const reconciliationRouter = Router();

// Enforce strict multi-tenant authentication on all reconciliation endpoints
reconciliationRouter.use(requireOrganizationAuth);

/**
 * POST /api/v1/reconciliation/runs
 * Initiates and executes a deterministic reconciliation run.
 */
reconciliationRouter.post('/runs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedBody = createReconciliationRunRequestSchema.parse(req.body);
    const organizationId = req.organization!.id;

    const run = await reconciliationService.createAndExecuteRun(organizationId, parsedBody);
    res.status(201).json(run);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/reconciliation/runs
 * Lists reconciliation runs for the authenticated organization.
 */
reconciliationRouter.get('/runs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = queryRunsRequestSchema.parse(req.query);
    const organizationId = req.organization!.id;

    const result = await reconciliationService.listRuns(organizationId, query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/reconciliation/runs/:runId
 * Retrieves details and counters for a specific reconciliation run.
 */
reconciliationRouter.get(
  '/runs/:runId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organization!.id;
      const runId = req.params.runId as string;
      const run = await reconciliationService.getRunById(organizationId, runId);
      res.status(200).json(run);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/reconciliation/runs/:runId/audit-trail
 * Retrieves audit trail events for a reconciliation run.
 */
reconciliationRouter.get(
  '/runs/:runId/audit-trail',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organization!.id;
      const runId = req.params.runId as string;
      const result = await reconciliationService.listAuditEvents(organizationId, runId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/reconciliation/matches
 * Lists matches with pagination, filtering by runId, status, or accountId.
 */
reconciliationRouter.get('/matches', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = queryMatchesRequestSchema.parse(req.query);
    const organizationId = req.organization!.id;

    const result = await reconciliationService.listMatches(organizationId, query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/reconciliation/matches/:matchId
 * Retrieves detailed match record including populated transaction details.
 */
reconciliationRouter.get(
  '/matches/:matchId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organization!.id;
      const matchId = req.params.matchId as string;
      const match = await reconciliationService.getMatchById(organizationId, matchId);
      res.status(200).json(match);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/reconciliation/matches/:matchId/confirm
 * Confirms a suggested or needs_review match.
 */
reconciliationRouter.post(
  '/matches/:matchId/confirm',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = confirmMatchRequestSchema.parse(req.body);
      const organizationId = req.organization!.id;
      const matchId = req.params.matchId as string;

      const match = await reconciliationService.confirmMatch(organizationId, matchId, body);
      res.status(200).json(match);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/reconciliation/matches/:matchId/reject
 * Rejects a suggested or needs_review match with a mandatory reason.
 */
reconciliationRouter.post(
  '/matches/:matchId/reject',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = rejectMatchRequestSchema.parse(req.body);
      const organizationId = req.organization!.id;
      const matchId = req.params.matchId as string;

      const match = await reconciliationService.rejectMatch(organizationId, matchId, body);
      res.status(200).json(match);
    } catch (err) {
      next(err);
    }
  },
);
