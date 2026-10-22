import { apiRequest } from '../lib/api-client';
import type { HealthResponse, ReadinessResponse } from '@moneylens/shared';

export const healthService = {
  getHealth: async (): Promise<HealthResponse> => {
    return apiRequest<HealthResponse>('/health');
  },

  getReadiness: async (): Promise<ReadinessResponse> => {
    return apiRequest<ReadinessResponse>('/ready');
  },
};
