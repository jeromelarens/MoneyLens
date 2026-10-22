import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { healthResponseSchema } from '@moneylens/shared';

describe('GET /api/v1/health', () => {
  const app = createApp({ enableLogging: false });

  it('returns HTTP 200 with valid health status payload', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);
    expect(response.headers['x-request-id']).toBeDefined();

    // Verify response conforms to contract schema
    const parsed = healthResponseSchema.safeParse(response.body);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data.status).toBe('ok');
      expect(parsed.data.uptime).toBeGreaterThanOrEqual(0);
      expect(typeof parsed.data.version).toBe('string');
      expect(typeof parsed.data.environment).toBe('string');
    }
  });

  it('does not leak internal infrastructure credentials or sensitive details', async () => {
    const response = await request(app).get('/api/v1/health');

    const bodyString = JSON.stringify(response.body);
    expect(bodyString).not.toContain('mongodb');
    expect(bodyString).not.toContain('password');
    expect(bodyString).not.toContain('secret');
  });
});
