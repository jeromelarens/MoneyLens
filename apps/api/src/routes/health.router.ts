import { Router, Request, Response } from 'express';
import { isDatabaseConnected } from '../infrastructure/database/mongo.js';
import type { HealthResponse, ReadinessResponse } from '@moneylens/shared';

export const healthRouter = Router();

/**
 * GET /api/v1/health
 * Basic process liveness probe.
 */
healthRouter.get('/health', (_req: Request, res: Response) => {
  const healthData: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Number(process.uptime().toFixed(2)),
    version: process.env.npm_package_version || '0.1.0',
    environment: process.env.NODE_ENV || 'development',
  };

  res.status(200).json(healthData);
});

/**
 * GET /api/v1/ready
 * Dependency readiness probe verifying required infrastructure (MongoDB).
 */
healthRouter.get('/ready', (_req: Request, res: Response) => {
  const dbConnected = isDatabaseConnected();
  const timestamp = new Date().toISOString();

  if (dbConnected) {
    const readyData: ReadinessResponse = {
      status: 'ready',
      timestamp,
      services: {
        database: {
          status: 'up',
        },
      },
    };
    res.status(200).json(readyData);
  } else {
    const notReadyData: ReadinessResponse = {
      status: 'not_ready',
      timestamp,
      services: {
        database: {
          status: 'down',
        },
      },
    };
    res.status(503).json(notReadyData);
  }
});
