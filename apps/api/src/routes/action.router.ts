import { Router, Request, Response, NextFunction } from 'express';
import { actionListQuerySchema, actionTransitionRequestSchema } from '@moneylens/shared';
import { ActionService } from '../services/actions/action.service.js';
import { requireOrganizationAuth } from '../middleware/auth.js';

export const actionService = new ActionService();
export const actionRouter = Router();

// Strict tenant-isolation authentication on all action endpoints
actionRouter.use(requireOrganizationAuth);

/**
 * POST /api/v1/actions/evaluate
 * Evaluates current supported findings and forecast projections to generate or update actions.
 */
actionRouter.post(
  '/evaluate',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organization!.id;
      const result = await actionService.evaluateActions(organizationId);
      res.status(200).json({
        data: result,
        meta: { requestId: req.id },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/actions/summary
 * Retrieves executive action counts and currency-segregated financial exposure.
 */
actionRouter.get(
  '/summary',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organization!.id;
      const summary = await actionService.getSummary(organizationId);
      res.status(200).json({
        data: summary,
        meta: { requestId: req.id },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/actions
 * Retrieves paginated actions matching validated filter criteria.
 */
actionRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const organizationId = req.organization!.id;
    const query = actionListQuerySchema.parse(req.query);
    const result = await actionService.getActions(organizationId, query);
    res.status(200).json({
      items: result.items,
      pagination: result.pagination,
      meta: { requestId: req.id },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/actions/:actionId
 * Retrieves a single action with source evidence.
 */
actionRouter.get(
  '/:actionId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organization!.id;
      const actionId = req.params.actionId as string;
      const action = await actionService.getActionById(organizationId, actionId);
      res.status(200).json({
        data: action,
        meta: { requestId: req.id },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/actions/:actionId/transition
 * Executes a validated lifecycle state transition (start, complete, dismiss, snooze, reopen).
 */
actionRouter.post(
  '/:actionId/transition',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organization!.id;
      const actionId = req.params.actionId as string;
      const body = actionTransitionRequestSchema.parse(req.body);

      const updated = await actionService.transitionAction(
        organizationId,
        actionId,
        body,
        req.organization!.id, // actorId
      );

      res.status(200).json({
        data: updated,
        meta: { requestId: req.id },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/actions/:actionId/history
 * Retrieves the chronological audit history for an action.
 */
actionRouter.get(
  '/:actionId/history',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const organizationId = req.organization!.id;
      const actionId = req.params.actionId as string;
      const history = await actionService.getActionHistory(organizationId, actionId);
      res.status(200).json({
        data: history,
        meta: { requestId: req.id },
      });
    } catch (err) {
      next(err);
    }
  },
);
