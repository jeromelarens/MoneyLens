import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { logger } from './infrastructure/observability/logger.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { apiRateLimiter } from './middleware/rate-limiter.js';
import { notFoundHandler, errorHandler, AppError } from './middleware/error-handler.js';
import { ERROR_CODES } from '@moneylens/shared';
import { healthRouter } from './routes/health.router.js';
import { importRouter } from './routes/import.router.js';
import { transactionRouter } from './routes/transaction.router.js';
import { accountRouter } from './routes/account.router.js';
import { reconciliationRouter } from './routes/reconciliation.router.js';
import { findingRouter } from './routes/finding.router.js';
import { forecastRouter } from './routes/forecast.router.js';
import { actionRouter } from './routes/action.router.js';

export interface AppOptions {
  frontendUrl?: string;
  enableLogging?: boolean;
  rateLimiter?: express.RequestHandler;
}

/**
 * Creates and configures the Express application.
 * Kept separate from server startup to allow fast and isolated automated testing.
 */
export function createApp(options: AppOptions = {}): Express {
  const app = express();

  // 1. Request identification (correlation ID)
  app.use(requestIdMiddleware);

  // 2. Security HTTP headers
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false,
    }),
  );

  // 3. CORS configuration
  const rawOrigins =
    options.frontendUrl ||
    process.env.CORS_ORIGIN ||
    process.env.FRONTEND_URL ||
    'http://localhost:5173';
  const allowedOrigins = rawOrigins
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);

        // In production, reject wildcard origin with credentialed access
        if (allowedOrigins.includes('*')) {
          if (isProduction) {
            return callback(
              new AppError(
                403,
                ERROR_CODES.ORGANIZATION_ACCESS_DENIED,
                'CORS blocked: Wildcard origin "*" is prohibited in production mode with credentials enabled.',
              ),
            );
          }
          return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(
          new AppError(
            403,
            ERROR_CODES.ORGANIZATION_ACCESS_DENIED,
            `CORS blocked for origin: ${origin}`,
          ),
        );
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'x-api-key'],
    }),
  );

  // 4. Request size limits
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 5. Structured HTTP logging with Pino
  if (options.enableLogging ?? process.env.NODE_ENV !== 'test') {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => (req as express.Request).id || 'unknown',
        autoLogging: {
          ignore: (req) => req.url?.includes('/health') ?? false,
        },
      }),
    );
  }

  // 6. Rate limiting on API routes
  app.use('/api', options.rateLimiter || apiRateLimiter);

  // 7. Mount API routes
  app.use('/api/v1', healthRouter);
  app.use('/api/v1/imports', importRouter);
  app.use('/api/v1/transactions', transactionRouter);
  app.use('/api/v1/accounts', accountRouter);
  app.use('/api/v1/reconciliation', reconciliationRouter);
  app.use('/api/v1/findings', findingRouter);
  app.use('/api/v1/cash-flow', forecastRouter);
  app.use('/api/v1/actions', actionRouter);

  // 8. 404 handler for unmatched routes
  app.use(notFoundHandler);

  // 9. Centralized error handler
  app.use(errorHandler);

  return app;
}
