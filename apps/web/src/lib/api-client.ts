import { env } from './env';
import type { ApiErrorResponse } from '@moneylens/shared';

// In production builds, development keys are never hardcoded.
// In development/test mode, defaults to the local sandbox key unless overridden by VITE_API_KEY.
export const DEV_API_KEY =
  (import.meta.env.VITE_API_KEY as string | undefined) ||
  (import.meta.env.DEV ? 'ml_dev_org_test_key_phase2' : '');

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly requestId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

/**
 * Standardized API client fetching against backend services.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { timeoutMs = 15000, ...fetchOptions } = options;
  const baseUrl = env.VITE_API_URL.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${baseUrl}${cleanPath}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const authHeaders: Record<string, string> = {};
  if (DEV_API_KEY) {
    authHeaders['x-api-key'] = DEV_API_KEY;
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...fetchOptions.headers,
      },
    });

    clearTimeout(timeoutId);

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await response.json() : null;

    if (!response.ok) {
      const errorData = data as ApiErrorResponse | null;
      throw new ApiClientError(
        response.status,
        errorData?.error?.code || 'HTTP_ERROR',
        errorData?.error?.message || `Request failed with status ${response.status}`,
        errorData?.error?.details,
        errorData?.error?.requestId || response.headers.get('x-request-id') || undefined,
      );
    }

    return data as T;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof ApiClientError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiClientError(408, 'TIMEOUT', 'Request timed out after waiting for response');
    }

    throw new ApiClientError(
      0,
      'NETWORK_ERROR',
      error instanceof Error ? error.message : 'Network connection failed',
    );
  }
}

/**
 * Uploads multipart/form-data payloads to the backend API.
 */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
  timeoutMs = 30000,
): Promise<T> {
  const baseUrl = env.VITE_API_URL.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${baseUrl}${cleanPath}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const authHeaders: Record<string, string> = {};
  if (DEV_API_KEY) {
    authHeaders['x-api-key'] = DEV_API_KEY;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
      headers: {
        ...authHeaders,
        // Content-Type is omitted so the browser automatically sets multipart/form-data with boundary
      },
    });

    clearTimeout(timeoutId);

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await response.json() : null;

    if (!response.ok) {
      const errorData = data as ApiErrorResponse | null;
      throw new ApiClientError(
        response.status,
        errorData?.error?.code || 'HTTP_ERROR',
        errorData?.error?.message || `Upload failed with status ${response.status}`,
        errorData?.error?.details,
        errorData?.error?.requestId || response.headers.get('x-request-id') || undefined,
      );
    }

    return data as T;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof ApiClientError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiClientError(408, 'TIMEOUT', 'Upload timed out after waiting for response');
    }

    throw new ApiClientError(
      0,
      'NETWORK_ERROR',
      error instanceof Error ? error.message : 'Network upload failed',
    );
  }
}
