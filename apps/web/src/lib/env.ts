import { z } from 'zod';

export const clientEnvSchema = z.object({
  VITE_API_URL: z
    .string()
    .url('VITE_API_URL must be a valid URL')
    .default('http://localhost:4000/api/v1'),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

/**
 * Validates frontend environment variables.
 * Prevents execution with invalid backend targets.
 */
export function validateClientEnv(rawEnv: Record<string, unknown> = import.meta.env): ClientEnv {
  const result = clientEnvSchema.safeParse(rawEnv);

  if (!result.success) {
    const messages = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`Client environment validation failed: ${messages}`);
  }

  return result.data;
}

export const env = validateClientEnv();
