import { describe, it, expect } from 'vitest';
import { validateClientEnv } from '../lib/env';

describe('Frontend Environment Configuration Validation', () => {
  it('validates a valid VITE_API_URL successfully', () => {
    const validConfig = validateClientEnv({
      VITE_API_URL: 'http://localhost:4000/api/v1',
    });

    expect(validConfig.VITE_API_URL).toBe('http://localhost:4000/api/v1');
  });

  it('fails validation when VITE_API_URL is not a valid URL', () => {
    expect(() =>
      validateClientEnv({
        VITE_API_URL: 'not-a-valid-url',
      }),
    ).toThrow(
      /Client environment validation failed: VITE_API_URL: VITE_API_URL must be a valid URL/,
    );
  });

  it('applies default URL if VITE_API_URL is omitted', () => {
    const config = validateClientEnv({});
    expect(config.VITE_API_URL).toBe('http://localhost:4000/api/v1');
  });
});
