import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { DEV_DEFAULT_API_KEY, getOrCreateDevOrganization } from '../src/middleware/auth.js';
import { createRateLimiter } from '../src/middleware/rate-limiter.js';
import { ERROR_CODES } from '@moneylens/shared';
import { connectDatabase, disconnectDatabase } from '../src/infrastructure/database/mongo.js';

describe('Production Security Gates & Deployment Readiness Suite', () => {
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/moneylens_test');
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Developer Mode Authentication Bypass Safeguards', () => {
    it('strictly forbids getOrCreateDevOrganization in production mode', async () => {
      process.env.NODE_ENV = 'production';

      await expect(getOrCreateDevOrganization()).rejects.toThrow(
        'Development organization provisioning is disabled in production mode.',
      );
    });

    it('rejects DEV_DEFAULT_API_KEY on protected endpoints in production mode', async () => {
      process.env.NODE_ENV = 'production';
      const app = createApp({ enableLogging: false });

      const response = await request(app)
        .get('/api/v1/transactions')
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe(ERROR_CODES.AUTHENTICATION_REQUIRED);
      expect(response.body.error.message).toContain(
        'Development credentials cannot be used in a production environment',
      );
    });

    it('rejects unauthenticated requests on protected endpoints', async () => {
      process.env.NODE_ENV = 'production';
      const app = createApp({ enableLogging: false });

      const response = await request(app).get('/api/v1/transactions');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe(ERROR_CODES.AUTHENTICATION_REQUIRED);
    });

    it('rejects invalid or forged API keys', async () => {
      process.env.NODE_ENV = 'production';
      const app = createApp({ enableLogging: false });

      const response = await request(app)
        .get('/api/v1/transactions')
        .set('x-api-key', 'forged_unauthorized_token_12345');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe(ERROR_CODES.AUTHENTICATION_REQUIRED);
    });
  });

  describe('CORS and Origin Boundary Enforcement', () => {
    it('blocks wildcard origin in production mode with credentials enabled', async () => {
      process.env.NODE_ENV = 'production';
      const app = createApp({
        frontendUrl: '*',
        enableLogging: false,
      });

      const response = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'https://malicious-site.com');

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(ERROR_CODES.ORGANIZATION_ACCESS_DENIED);
      expect(response.body.error.message).toContain(
        'Wildcard origin "*" is prohibited in production mode',
      );
    });

    it('allows explicitly whitelisted production origins', async () => {
      process.env.NODE_ENV = 'production';
      const app = createApp({
        frontendUrl: 'https://app.moneylens.com, https://admin.moneylens.com',
        enableLogging: false,
      });

      const response = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'https://app.moneylens.com');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('https://app.moneylens.com');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('blocks unlisted origins in production mode', async () => {
      process.env.NODE_ENV = 'production';
      const app = createApp({
        frontendUrl: 'https://app.moneylens.com',
        enableLogging: false,
      });

      const response = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'https://unauthorized-origin.com');

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(ERROR_CODES.ORGANIZATION_ACCESS_DENIED);
      expect(response.body.error.message).toContain(
        'CORS blocked for origin: https://unauthorized-origin.com',
      );
    });
  });

  describe('Rate Limiting & Request Boundaries', () => {
    it('enforces rate limiting when request threshold is exceeded', async () => {
      // Create a test rate limiter allowing only 2 requests per window
      const testLimiter = createRateLimiter({
        windowMs: 60 * 1000,
        max: 2,
      });

      const app = createApp({
        enableLogging: false,
        rateLimiter: testLimiter,
      });

      // Request 1: Allowed
      const res1 = await request(app).get('/api/v1/health');
      expect(res1.status).toBe(200);

      // Request 2: Allowed
      const res2 = await request(app).get('/api/v1/health');
      expect(res2.status).toBe(200);

      // Request 3: Blocked by rate limiter
      const res3 = await request(app).get('/api/v1/health');
      expect(res3.status).toBe(429);
      expect(res3.body.error.code).toBe(ERROR_CODES.TOO_MANY_REQUESTS);
      expect(res3.body.error.message).toContain('Too many requests');
    });
  });

  describe('Diagnostic & Secret Exposure Prevention', () => {
    it('verifies health endpoint returns operational metrics without exposing connection secrets', async () => {
      const app = createApp({ enableLogging: false });

      const response = await request(app).get('/api/v1/health');
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('environment');

      // Verify no sensitive keys or strings are leaked
      const bodyString = JSON.stringify(response.body);
      expect(bodyString).not.toContain('mongodb');
      expect(bodyString).not.toContain('password');
      expect(bodyString).not.toContain('secret');
      expect(bodyString).not.toContain('key');
    });

    it('verifies readiness endpoint accurately reports service status without connection strings', async () => {
      const app = createApp({ enableLogging: false });

      const response = await request(app).get('/api/v1/ready');
      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('services');
      expect(response.body.services).toHaveProperty('database');

      // Verify no URI or credentials leaked
      const bodyString = JSON.stringify(response.body);
      expect(bodyString).not.toContain('mongodb://');
      expect(bodyString).not.toContain('mongodb+srv://');
      expect(bodyString).not.toContain('@');
    });
  });
});
