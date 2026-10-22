import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import * as mongoModule from '../src/infrastructure/database/mongo.js';
import { readinessResponseSchema } from '@moneylens/shared';

describe('GET /api/v1/ready', () => {
  const app = createApp({ enableLogging: false });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns HTTP 200 and status "ready" when MongoDB is connected', async () => {
    vi.spyOn(mongoModule, 'isDatabaseConnected').mockReturnValue(true);

    const response = await request(app).get('/api/v1/ready');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/json/);

    const parsed = readinessResponseSchema.safeParse(response.body);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data.status).toBe('ready');
      expect(parsed.data.services.database.status).toBe('up');
    }
  });

  it('returns HTTP 503 and status "not_ready" when MongoDB is disconnected', async () => {
    vi.spyOn(mongoModule, 'isDatabaseConnected').mockReturnValue(false);

    const response = await request(app).get('/api/v1/ready');

    expect(response.status).toBe(503);
    expect(response.headers['content-type']).toMatch(/json/);

    const parsed = readinessResponseSchema.safeParse(response.body);
    expect(parsed.success).toBe(true);

    if (parsed.success) {
      expect(parsed.data.status).toBe('not_ready');
      expect(parsed.data.services.database.status).toBe('down');
    }
  });

  it('does not expose connection URIs or database credentials', async () => {
    vi.spyOn(mongoModule, 'isDatabaseConnected').mockReturnValue(false);

    const response = await request(app).get('/api/v1/ready');
    const bodyString = JSON.stringify(response.body);

    expect(bodyString).not.toContain('mongodb');
    expect(bodyString).not.toContain('localhost');
    expect(bodyString).not.toContain('27017');
    expect(bodyString).not.toContain('password');
  });
});
