import { Router, Request, Response, NextFunction } from 'express';
import {
  createForecastRunRequestSchema,
  forecastsFilterQuerySchema,
  createScenarioRequestSchema,
  updateScenarioRequestSchema,
  simulateScenarioRequestSchema,
} from '@moneylens/shared';
import { forecastService } from '../services/forecast/forecast.service.js';
import { requireOrganizationAuth } from '../middleware/auth.js';

export const forecastRouter = Router();

// Enforce mandatory tenant API key authentication across all cash flow endpoints
forecastRouter.use(requireOrganizationAuth);

/**
 * POST /api/v1/cash-flow/forecasts
 * Triggers a deterministic cash flow forecast run for the authenticated organization.
 */
forecastRouter.post(
  '/forecasts',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsedBody = createForecastRunRequestSchema.parse(req.body);
      const result = await forecastService.createForecastRun(req.organization!.id, parsedBody);
      res.status(201).json({
        data: result,
        meta: { requestId: req.id },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/cash-flow/forecasts/:runId
 * Retrieves a forecast run and its currency-specific projection results.
 */
forecastRouter.get(
  '/forecasts/:runId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await forecastService.getForecastRun(
        req.organization!.id,
        req.params.runId as string,
      );
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
 * GET /api/v1/cash-flow/forecasts
 * Lists paginated forecast runs for the organization.
 */
forecastRouter.get(
  '/forecasts',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsedQuery = forecastsFilterQuerySchema.parse(req.query);
      const result = await forecastService.listForecastRuns(req.organization!.id, parsedQuery);
      res.status(200).json({
        data: result.items,
        pagination: result.pagination,
        meta: { requestId: req.id },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/cash-flow/summary
 * Retrieves latest currency-segregated cash flow summary and risk levels.
 */
forecastRouter.get(
  '/summary',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const summary = await forecastService.getLatestSummary(req.organization!.id);
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
 * POST /api/v1/cash-flow/scenarios/simulate
 * Simulates an ad-hoc scenario without persisting.
 */
forecastRouter.post(
  '/scenarios/simulate',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsedBody = simulateScenarioRequestSchema.parse(req.body);
      const simulation = await forecastService.simulateAdHocScenario(
        req.organization!.id,
        parsedBody,
      );
      res.status(200).json({
        data: simulation,
        meta: { requestId: req.id },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/v1/cash-flow/scenarios
 * Creates and saves a hypothetical cash flow scenario.
 */
forecastRouter.post(
  '/scenarios',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsedBody = createScenarioRequestSchema.parse(req.body);
      const scenario = await forecastService.createScenario(req.organization!.id, parsedBody);
      res.status(201).json({
        data: scenario,
        meta: { requestId: req.id },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/cash-flow/scenarios
 * Lists saved scenarios for the organization.
 */
forecastRouter.get(
  '/scenarios',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
      const result = await forecastService.listScenarios(req.organization!.id, page, limit);
      res.status(200).json({
        data: result.items,
        pagination: result.pagination,
        meta: { requestId: req.id },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/cash-flow/scenarios/:scenarioId
 * Retrieves a scenario and its live simulated comparison against the baseline forecast.
 */
forecastRouter.get(
  '/scenarios/:scenarioId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await forecastService.getScenario(
        req.organization!.id,
        req.params.scenarioId as string,
      );
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
 * PATCH /api/v1/cash-flow/scenarios/:scenarioId
 * Updates allowed scenario metadata and assumptions.
 */
forecastRouter.patch(
  '/scenarios/:scenarioId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsedBody = updateScenarioRequestSchema.parse(req.body);
      const updated = await forecastService.updateScenario(
        req.organization!.id,
        req.params.scenarioId as string,
        parsedBody,
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
 * DELETE /api/v1/cash-flow/scenarios/:scenarioId
 * Deletes a scenario.
 */
forecastRouter.delete(
  '/scenarios/:scenarioId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await forecastService.deleteScenario(req.organization!.id, req.params.scenarioId as string);
      res.status(200).json({
        data: { message: 'Scenario deleted successfully' },
        meta: { requestId: req.id },
      });
    } catch (err) {
      next(err);
    }
  },
);
