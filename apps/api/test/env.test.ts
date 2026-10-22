import { describe, it, expect } from 'vitest';
import { validateEnv } from '../src/config/env.js';

describe('Environment Configuration Validation', () => {
  const validBaseEnv = {
    NODE_ENV: 'test',
    PORT: '4000',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/moneylens_test',
    FRONTEND_URL: 'http://localhost:5173',
    LOG_LEVEL: 'silent',
  };

  it('successfully validates a complete, valid environment', () => {
    const config = validateEnv(validBaseEnv);

    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(4000);
    expect(config.MONGODB_URI).toBe('mongodb://127.0.0.1:27017/moneylens_test');
    expect(config.FRONTEND_URL).toBe('http://localhost:5173');
    expect(config.LOG_LEVEL).toBe('silent');
  });

  it('fails validation when MONGODB_URI is missing', () => {
    const envWithoutDb = { ...validBaseEnv };
    delete (envWithoutDb as Record<string, unknown>).MONGODB_URI;

    expect(() => validateEnv(envWithoutDb)).toThrow(
      /Environment validation failed: MONGODB_URI: MONGODB_URI is required/,
    );
  });

  it('fails validation when MONGODB_URI has an invalid scheme', () => {
    const envWithBadDb = {
      ...validBaseEnv,
      MONGODB_URI: 'postgresql://localhost:5432/mydb',
    };

    expect(() => validateEnv(envWithBadDb)).toThrow(
      /MONGODB_URI must start with "mongodb:\/\/" or "mongodb\+srv:\/\/"/,
    );
  });

  it('fails validation when PORT is out of valid range', () => {
    const envWithBadPort = {
      ...validBaseEnv,
      PORT: '70000',
    };

    expect(() => validateEnv(envWithBadPort)).toThrow(/PORT/);
  });

  it('fails validation when LOG_LEVEL is not an allowed enum value', () => {
    const envWithBadLogLevel = {
      ...validBaseEnv,
      LOG_LEVEL: 'verbose_invalid',
    };

    expect(() => validateEnv(envWithBadLogLevel)).toThrow(/LOG_LEVEL/);
  });

  it('applies default values for optional variables', () => {
    const minimalEnv = {
      MONGODB_URI: 'mongodb://localhost:27017/moneylens',
    };

    const config = validateEnv(minimalEnv);
    expect(config.PORT).toBe(4000);
    expect(config.NODE_ENV).toBe('development');
    expect(config.FRONTEND_URL).toBe('http://localhost:5173');
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.RATE_LIMIT_WINDOW_MS).toBe(900000);
    expect(config.RATE_LIMIT_MAX_REQUESTS).toBe(100);
    expect(config.GEMINI_API_KEY).toBeUndefined();
    expect(config.CORS_ORIGIN).toBeUndefined();
  });
});
