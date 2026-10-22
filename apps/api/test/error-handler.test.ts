import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { z } from 'zod';
import { AppError, errorHandler, notFoundHandler } from '../src/middleware/error-handler.js';
import { requestIdMiddleware } from '../src/middleware/request-id.js';
import { createApp } from '../src/app.js';
import { ERROR_CODES } from '@moneylens/shared';

describe('Centralized Error Handling & Routing', () => {
  const mainApp = createApp({ enableLogging: false });

  it('handles unknown routes with a structured 404 response', async () => {
    const response = await request(mainApp).get('/api/v1/non-existent-endpoint');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error.code).toBe(ERROR_CODES.NOT_FOUND);
    expect(response.body.error.message).toContain('Cannot GET /api/v1/non-existent-endpoint');
    expect(response.body.error.requestId).toBeDefined();
  });

  describe('Isolated error behavior', () => {
    function createTestAppWithRoute(path: string, handler: express.RequestHandler): Express {
      const app = express();
      app.use(requestIdMiddleware);
      app.use(express.json());
      app.get(path, handler);
      app.use(notFoundHandler);
      app.use(errorHandler);
      return app;
    }

    it('returns custom status and code for operational AppError', async () => {
      const app = createTestAppWithRoute('/test-app-error', () => {
        throw new AppError(400, ERROR_CODES.BAD_REQUEST, 'Custom operational error message', {
          field: 'amount',
        });
      });

      const response = await request(app).get('/test-app-error');

      expect(response.status).toBe(400);
      expect(response.body.error).toEqual({
        code: ERROR_CODES.BAD_REQUEST,
        message: 'Custom operational error message',
        requestId: expect.any(String),
        details: { field: 'amount' },
      });
    });

    it('formats Zod validation errors as 400 with field details', async () => {
      const schema = z.object({
        amount: z.number().positive(),
      });

      const app = createTestAppWithRoute('/test-validation-error', () => {
        schema.parse({ amount: -50 });
      });

      const response = await request(app).get('/test-validation-error');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(response.body.error.message).toBe('Request validation failed');
      expect(response.body.error.details).toBeInstanceOf(Array);
      expect(response.body.error.details[0].path).toBe('amount');
    });

    it('safely handles unexpected 500 errors without leaking stack traces', async () => {
      const app = createTestAppWithRoute('/test-crash', () => {
        throw new Error('Database password was supersecret123');
      });

      const response = await request(app).get('/test-crash');

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe(ERROR_CODES.INTERNAL_SERVER_ERROR);
      expect(response.body.error.message).toBe(
        'An unexpected error occurred. Please try again later.',
      );
      expect(response.body.error.requestId).toBeDefined();

      // Ensure internal error message and stack trace are NEVER sent to the client
      const rawBody = JSON.stringify(response.body);
      expect(rawBody).not.toContain('supersecret123');
      expect(rawBody).not.toContain('stack');
      expect(rawBody).not.toContain('at createTestAppWithRoute');
    });
  });
});
