import { Router, Request, Response, NextFunction } from 'express';
import { requireOrganizationAuth } from '../middleware/auth.js';
import { findingService } from '../services/findings/finding.service.js';
import {
  createDetectionRunRequestSchema,
  findingsFilterQuerySchema,
  reviewFindingRequestSchema,
  requestAiExplanationRequestSchema,
} from '@moneylens/shared';

export const findingRouter = Router();

// Strict tenant-isolation authentication on all findings endpoints
findingRouter.use(requireOrganizationAuth);

/**
 * POST /api/v1/findings/detection-runs
 * Starts a bounded detection run for the authenticated organization.
 */
findingRouter.post('/detection-runs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsedBody = createDetectionRunRequestSchema.parse(req.body);
    const organizationId = req.organization!.id;

    const run = await findingService.runDetection(organizationId, parsedBody);
    res.status(201).json(run);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/findings/detection-runs/:runId
 * Retrieves status and statistics of a detection run.
 */
findingRouter.get(
  '/detection-runs/:runId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organization!.id;
      const runId = req.params.runId as string;
      const run = await findingService.getDetectionRun(organizationId, runId);
      res.status(200).json(run);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/findings/summary
 * Retrieves financial exposure and leakage summaries segregated by currency.
 */
findingRouter.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organization!.id;
    const summary = await findingService.getExposureSummary(organizationId);
    res.status(200).json(summary);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/findings
 * Lists findings with pagination and filtering.
 */
findingRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = findingsFilterQuerySchema.parse(req.query);
    const organizationId = req.organization!.id;

    const result = await findingService.listFindings(organizationId, query);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/findings/:findingId
 * Retrieves single finding details, relevant transactions, and history.
 */
findingRouter.get('/:findingId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const organizationId = req.organization!.id;
    const findingId = req.params.findingId as string;

    const result = await findingService.getFindingById(organizationId, findingId);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/findings/:findingId/review
 * Executes a review decision (confirm, dismiss, resolve, open_review).
 */
findingRouter.post(
  '/:findingId/review',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organization!.id;
      const findingId = req.params.findingId as string;
      const parsedBody = reviewFindingRequestSchema.parse(req.body);

      const updated = await findingService.reviewFinding(
        organizationId,
        findingId,
        parsedBody,
        req.organization!.id,
      );
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/findings/:findingId/history
 * Retrieves append-only audit and decision history.
 */
findingRouter.get(
  '/:findingId/history',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organization!.id;
      const findingId = req.params.findingId as string;

      const history = await findingService.getFindingHistory(organizationId, findingId);
      res.status(200).json(history);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/findings/:findingId/explanation
 * Requests explainable intelligence analysis.
 */
findingRouter.post(
  '/:findingId/explanation',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.organization!.id;
      const findingId = req.params.findingId as string;
      requestAiExplanationRequestSchema.parse(req.body || {});

      const explanation = await findingService.explainFinding(organizationId, findingId);
      res.status(200).json(explanation);
    } catch (err) {
      next(err);
    }
  },
);
