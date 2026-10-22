import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { logger } from '../infrastructure/observability/logger.js';
import { ERROR_CODES, FINANCIAL_LIMITS } from '@moneylens/shared';

/**
 * Lightweight operational application error class.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;

    // Capture clean stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 Not Found middleware for unmatched routes.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: ERROR_CODES.NOT_FOUND,
      message: `Cannot ${req.method} ${req.originalUrl || req.url}`,
      requestId: req.id,
    },
  });
}

/**
 * Centralized error handler middleware.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  // 1. Handled operational AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        requestId: req.id,
        ...(err.details ? { details: err.details } : {}),
      },
    });
    return;
  }

  // 2. Multer upload errors (e.g. file size exceeded)
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        error: {
          code: ERROR_CODES.FILE_TOO_LARGE,
          message: `File size exceeds maximum allowed limit of ${FINANCIAL_LIMITS.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`,
          requestId: req.id,
        },
      });
      return;
    }

    res.status(400).json({
      error: {
        code: ERROR_CODES.BAD_REQUEST,
        message: `Upload error: ${err.message}`,
        requestId: req.id,
      },
    });
    return;
  }

  // 3. Request validation errors (Zod)
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Request validation failed',
        requestId: req.id,
        details: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      },
    });
    return;
  }

  // 4. Body parser syntax error (e.g. malformed JSON)
  if (err instanceof SyntaxError && 'status' in err && (err as { status: number }).status === 400) {
    res.status(400).json({
      error: {
        code: ERROR_CODES.BAD_REQUEST,
        message: 'Malformed request payload',
        requestId: req.id,
      },
    });
    return;
  }

  // 4. Unexpected unhandled errors
  const errorObj = err instanceof Error ? err : new Error(String(err));
  logger.error(
    {
      err: errorObj,
      requestId: req.id,
      url: req.originalUrl || req.url,
      method: req.method,
    },
    'Unhandled server error occurred',
  );

  // Safe response to client without leaking internals or stack traces
  res.status(500).json({
    error: {
      code: ERROR_CODES.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred. Please try again later.',
      requestId: req.id,
    },
  });
}
