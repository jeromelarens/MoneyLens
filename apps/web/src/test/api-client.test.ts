import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiRequest, ApiClientError } from '../lib/api-client';

describe('Frontend API Client (apiRequest)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('successfully returns parsed JSON on 200 response', async () => {
    const mockData = { status: 'ok', uptime: 100 };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => mockData,
    } as unknown as Response);

    const result = await apiRequest<typeof mockData>('/health');
    expect(result).toEqual(mockData);
  });

  it('throws ApiClientError on HTTP error status with structured error body', async () => {
    const errorPayload = {
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint does not exist',
        requestId: 'req-12345',
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => errorPayload,
    } as unknown as Response);

    await expect(apiRequest('/non-existent')).rejects.toThrow(ApiClientError);

    try {
      await apiRequest('/non-existent');
    } catch (err) {
      const apiErr = err as ApiClientError;
      expect(apiErr.status).toBe(404);
      expect(apiErr.code).toBe('NOT_FOUND');
      expect(apiErr.message).toBe('Endpoint does not exist');
      expect(apiErr.requestId).toBe('req-12345');
    }
  });

  it('handles network failure properly', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    await expect(apiRequest('/health')).rejects.toThrow(ApiClientError);
    try {
      await apiRequest('/health');
    } catch (err) {
      const apiErr = err as ApiClientError;
      expect(apiErr.code).toBe('NETWORK_ERROR');
      expect(apiErr.message).toContain('Failed to fetch');
    }
  });
});
