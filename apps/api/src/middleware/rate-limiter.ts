import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { ERROR_CODES } from '@moneylens/shared';

export interface RateLimiterOptions {
  windowMs?: number;
  max?: number;
}

/**
 * Creates an Express rate limiter middleware with configurable bounds.
 */
export function createRateLimiter(options?: RateLimiterOptions) {
  const windowMs =
    options?.windowMs ??
    (process.env.RATE_LIMIT_WINDOW_MS
      ? parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10)
      : 15 * 60 * 1000);
  const max =
    options?.max ??
    (process.env.RATE_LIMIT_MAX_REQUESTS ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) : 100);

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true, // Return standard RateLimit-* headers
    legacyHeaders: false, // Disable X-RateLimit-* headers
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        error: {
          code: ERROR_CODES.TOO_MANY_REQUESTS,
          message: 'Too many requests, please try again later.',
          requestId: req.id,
        },
      });
    },
  });
}

/**
 * Baseline API rate limiter.
 * Limits requests per client IP to mitigate denial-of-service and brute force abuse.
 */
export const apiRateLimiter = createRateLimiter();
