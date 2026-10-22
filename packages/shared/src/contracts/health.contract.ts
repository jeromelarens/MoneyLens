import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string().datetime(),
  uptime: z.number().nonnegative(),
  version: z.string(),
  environment: z.string(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const readinessServiceSchema = z.object({
  status: z.enum(['up', 'down']),
});

export const readinessResponseSchema = z.object({
  status: z.enum(['ready', 'not_ready']),
  timestamp: z.string().datetime(),
  services: z.object({
    database: readinessServiceSchema,
  }),
});

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
