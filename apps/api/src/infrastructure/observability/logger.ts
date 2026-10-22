import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info');

export const logger = pino({
  level: logLevel,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'req.headers.x-api-key',
      'password',
      'token',
      'secret',
      'apiKey',
      'apiKeyHash',
      'mongodbUri',
      'uri',
    ],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  transport:
    !isProduction && process.env.NODE_ENV !== 'test'
      ? undefined // Standard JSON output for production and clean dev logging
      : undefined,
});

export type Logger = typeof logger;
