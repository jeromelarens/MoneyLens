import { apiRequest, apiUpload } from '../lib/api-client';
import type {
  ImportJob,
  ImportJobListResponse,
  ImportRowErrorListResponse,
  TransactionListResponse,
  FinancialAccount,
  ColumnMapping,
} from '@moneylens/shared';

export interface GetTransactionsParams {
  page?: number;
  limit?: number;
  accountId?: string;
  direction?: 'debit' | 'credit';
  startDate?: string;
  endDate?: string;
  search?: string;
}

export const financialService = {
  /**
   * Uploads and parses a financial CSV/XLSX statement file.
   */
  uploadStatement: async (
    file: File,
    accountId?: string,
    columnMapping?: Partial<ColumnMapping>,
  ): Promise<ImportJob> => {
    const formData = new FormData();
    formData.append('file', file);
    if (accountId) formData.append('accountId', accountId);
    if (columnMapping) formData.append('columnMapping', JSON.stringify(columnMapping));

    return apiUpload<ImportJob>('/imports', formData);
  },

  /**
   * Retrieves paginated import jobs for the organization.
   */
  getImports: async (page = 1, limit = 10): Promise<ImportJobListResponse> => {
    return apiRequest<ImportJobListResponse>(`/imports?page=${page}&limit=${limit}`);
  },

  /**
   * Retrieves specific import job details.
   */
  getImportJob: async (importId: string): Promise<ImportJob> => {
    return apiRequest<ImportJob>(`/imports/${importId}`);
  },

  /**
   * Retrieves paginated row errors for an import job.
   */
  getImportRowErrors: async (
    importId: string,
    page = 1,
    limit = 25,
  ): Promise<ImportRowErrorListResponse> => {
    return apiRequest<ImportRowErrorListResponse>(
      `/imports/${importId}/errors?page=${page}&limit=${limit}`,
    );
  },

  /**
   * Retrieves paginated normalized transactions with optional filtering.
   */
  getTransactions: async (params: GetTransactionsParams = {}): Promise<TransactionListResponse> => {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', String(params.page));
    if (params.limit) searchParams.set('limit', String(params.limit));
    if (params.accountId) searchParams.set('accountId', params.accountId);
    if (params.direction) searchParams.set('direction', params.direction);
    if (params.startDate) searchParams.set('startDate', params.startDate);
    if (params.endDate) searchParams.set('endDate', params.endDate);
    if (params.search) searchParams.set('search', params.search);

    const qs = searchParams.toString();
    return apiRequest<TransactionListResponse>(`/transactions${qs ? `?${qs}` : ''}`);
  },

  /**
   * Retrieves financial accounts for the organization.
   */
  getAccounts: async (): Promise<{ items: FinancialAccount[] }> => {
    return apiRequest<{ items: FinancialAccount[] }>('/accounts');
  },

  /**
   * Creates and executes a reconciliation run.
   */
  createReconciliationRun: async (params: {
    accountId?: string;
    targetAccountId?: string;
    startDate?: string;
    endDate?: string;
    dateToleranceDays?: number;
  }) => {
    return apiRequest<import('@moneylens/shared').ReconciliationRun>('/reconciliation/runs', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  /**
   * Retrieves paginated reconciliation runs.
   */
  getReconciliationRuns: async (page = 1, pageSize = 20, accountId?: string) => {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (accountId) qs.set('accountId', accountId);
    return apiRequest<import('@moneylens/shared').ReconciliationRunListResponse>(
      `/reconciliation/runs?${qs.toString()}`,
    );
  },

  /**
   * Retrieves a single reconciliation run.
   */
  getReconciliationRun: async (runId: string) => {
    return apiRequest<import('@moneylens/shared').ReconciliationRun>(
      `/reconciliation/runs/${runId}`,
    );
  },

  /**
   * Retrieves matches for review.
   */
  getReconciliationMatches: async (params: {
    runId?: string;
    status?: string;
    accountId?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.runId) qs.set('runId', params.runId);
    if (params.status) qs.set('status', params.status);
    if (params.accountId) qs.set('accountId', params.accountId);

    return apiRequest<import('@moneylens/shared').ReconciliationMatchListResponse>(
      `/reconciliation/matches?${qs.toString()}`,
    );
  },

  /**
   * Confirms a suggested or needs_review match.
   */
  confirmMatch: async (matchId: string, notes?: string) => {
    return apiRequest<import('@moneylens/shared').ReconciliationMatch>(
      `/reconciliation/matches/${matchId}/confirm`,
      {
        method: 'POST',
        body: JSON.stringify({ notes }),
      },
    );
  },

  /**
   * Rejects a match with a required reason.
   */
  rejectMatch: async (matchId: string, reason: string) => {
    return apiRequest<import('@moneylens/shared').ReconciliationMatch>(
      `/reconciliation/matches/${matchId}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      },
    );
  },

  /**
   * Retrieves audit events for a reconciliation run.
   */
  getReconciliationAuditTrail: async (runId: string) => {
    return apiRequest<import('@moneylens/shared').ReconciliationAuditEventListResponse>(
      `/reconciliation/runs/${runId}/audit-trail`,
    );
  },

  // ==============================================================================
  // Phase 4: Financial Finding & Detection Endpoints
  // ==============================================================================

  /**
   * Retrieves aggregated financial exposure summary partitioned strictly by currency.
   */
  getFindingsSummary: async () => {
    return apiRequest<import('@moneylens/shared').FinancialExposureSummary>('/findings/summary');
  },

  /**
   * Retrieves paginated findings matching optional filters.
   */
  getFindings: async (params: {
    page?: number;
    limit?: number;
    findingType?: string;
    status?: string;
    severity?: string;
    currency?: string;
    startDate?: string;
    endDate?: string;
    sortBy?: string;
    sortOrder?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.findingType) qs.set('findingType', params.findingType);
    if (params.status) qs.set('status', params.status);
    if (params.severity) qs.set('severity', params.severity);
    if (params.currency) qs.set('currency', params.currency);
    if (params.startDate) qs.set('startDate', params.startDate);
    if (params.endDate) qs.set('endDate', params.endDate);
    if (params.sortBy) qs.set('sortBy', params.sortBy);
    if (params.sortOrder) qs.set('sortOrder', params.sortOrder);

    return apiRequest<import('@moneylens/shared').FindingListResponse>(
      `/findings?${qs.toString()}`,
    );
  },

  /**
   * Retrieves single finding detail with associated transactions and review history.
   */
  getFindingDetail: async (findingId: string) => {
    return apiRequest<{
      finding: import('@moneylens/shared').FinancialFinding;
      transactions: import('@moneylens/shared').Transaction[];
      history: import('@moneylens/shared').FindingHistory[];
    }>(`/findings/${findingId}`);
  },

  /**
   * Submits a human review decision (confirm, dismiss, resolve, open_review).
   */
  reviewFinding: async (
    findingId: string,
    action: import('@moneylens/shared').ReviewFindingAction,
    reason?: string,
    notes?: string,
  ) => {
    return apiRequest<import('@moneylens/shared').FinancialFinding>(
      `/findings/${findingId}/review`,
      {
        method: 'POST',
        body: JSON.stringify({ action, reason, notes }),
      },
    );
  },

  /**
   * Requests explainable intelligence analysis for a finding.
   */
  explainFinding: async (findingId: string, forceFresh = false) => {
    return apiRequest<import('@moneylens/shared').AiExplanation>(
      `/findings/${findingId}/explanation`,
      {
        method: 'POST',
        body: JSON.stringify({ forceFresh }),
      },
    );
  },

  /**
   * Retrieves append-only audit history for a finding.
   */
  getFindingHistory: async (findingId: string) => {
    return apiRequest<import('@moneylens/shared').FindingHistory[]>(
      `/findings/${findingId}/history`,
    );
  },

  /**
   * Initiates a deterministic detection run.
   */
  triggerDetectionRun: async (scope?: {
    startDate?: string;
    endDate?: string;
    currencies?: import('@moneylens/shared').SupportedCurrency[];
  }) => {
    return apiRequest<import('@moneylens/shared').DetectionRun>('/findings/detection-runs', {
      method: 'POST',
      body: JSON.stringify(scope ? { observationScope: scope } : {}),
    });
  },

  /**
   * Retrieves detection run status.
   */
  getDetectionRun: async (runId: string) => {
    return apiRequest<import('@moneylens/shared').DetectionRun>(
      `/findings/detection-runs/${runId}`,
    );
  },

  /**
   * Phase 5: Cash Flow Forecasting & Scenario Planning
   */

  /**
   * Retrieves executive currency-segregated cash flow summary.
   */
  getCashFlowSummary: async () => {
    return apiRequest<import('@moneylens/shared').CashFlowDashboardSummary>('/cash-flow/summary');
  },

  /**
   * Triggers a new deterministic cash flow forecast run.
   */
  createForecastRun: async (request: import('@moneylens/shared').CreateForecastRunRequest) => {
    return apiRequest<{
      run: import('@moneylens/shared').ForecastRun;
      forecasts: import('@moneylens/shared').CashFlowForecast[];
    }>('/cash-flow/forecasts', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  /**
   * Retrieves a specific forecast run with all currency forecasts.
   */
  getForecastRun: async (runId: string) => {
    return apiRequest<{
      run: import('@moneylens/shared').ForecastRun;
      forecasts: import('@moneylens/shared').CashFlowForecast[];
    }>(`/cash-flow/forecasts/${runId}`);
  },

  /**
   * Lists past forecast runs (paginated).
   */
  listForecastRuns: async (params?: { page?: number; limit?: number; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.status) qs.set('status', params.status);
    return apiRequest<import('@moneylens/shared').ForecastRunListResponse>(
      `/cash-flow/forecasts?${qs.toString()}`,
    );
  },

  /**
   * Simulates an ad-hoc scenario against the baseline forecast.
   */
  simulateScenario: async (request: import('@moneylens/shared').SimulateScenarioRequest) => {
    return apiRequest<import('@moneylens/shared').ScenarioCalculationResult>(
      '/cash-flow/scenarios/simulate',
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
    );
  },

  /**
   * Creates and saves a hypothetical cash flow scenario.
   */
  createScenario: async (request: import('@moneylens/shared').CreateScenarioRequest) => {
    return apiRequest<import('@moneylens/shared').CashFlowScenario>('/cash-flow/scenarios', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  /**
   * Lists saved scenarios for tenant.
   */
  listScenarios: async (params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    return apiRequest<import('@moneylens/shared').CashFlowScenarioListResponse>(
      `/cash-flow/scenarios?${qs.toString()}`,
    );
  },

  /**
   * Retrieves a saved scenario and its simulation.
   */
  getScenario: async (scenarioId: string) => {
    return apiRequest<{
      scenario: import('@moneylens/shared').CashFlowScenario;
      simulation: import('@moneylens/shared').ScenarioCalculationResult;
    }>(`/cash-flow/scenarios/${scenarioId}`);
  },

  /**
   * Deletes a saved scenario.
   */
  deleteScenario: async (scenarioId: string) => {
    return apiRequest<{ message: string }>(`/cash-flow/scenarios/${scenarioId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Phase 6: Business Action Center & Decision Intelligence
   */

  /**
   * Evaluates current supported evidence and generates, updates, or supersedes actions.
   */
  evaluateActions: async () => {
    return apiRequest<{
      data: import('@moneylens/shared').ActionEvaluationSummary;
    }>('/actions/evaluate', {
      method: 'POST',
    });
  },

  /**
   * Retrieves executive action summary with segregated currency totals.
   */
  getActionSummary: async () => {
    return apiRequest<{
      data: import('@moneylens/shared').ActionDashboardSummary;
    }>('/actions/summary');
  },

  /**
   * Lists actions matching filters and pagination.
   */
  getActions: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
    priority?: string;
    category?: string;
    currency?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.status && params.status !== 'all') qs.set('status', params.status);
    if (params?.priority && params.priority !== 'all') qs.set('priority', params.priority);
    if (params?.category && params.category !== 'all') qs.set('category', params.category);
    if (params?.currency && params.currency !== 'all') qs.set('currency', params.currency);
    if (params?.search) qs.set('search', params.search);
    if (params?.sortBy) qs.set('sortBy', params.sortBy);
    if (params?.sortOrder) qs.set('sortOrder', params.sortOrder);

    return apiRequest<import('@moneylens/shared').ActionListResponse>(`/actions?${qs.toString()}`);
  },

  /**
   * Retrieves a single action with source evidence.
   */
  getActionById: async (actionId: string) => {
    return apiRequest<{
      data: import('@moneylens/shared').BusinessAction;
    }>(`/actions/${actionId}`);
  },

  /**
   * Transitions an action through its validated lifecycle.
   */
  transitionAction: async (
    actionId: string,
    request: import('@moneylens/shared').ActionTransitionRequest,
  ) => {
    return apiRequest<{
      data: import('@moneylens/shared').BusinessAction;
    }>(`/actions/${actionId}/transition`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  /**
   * Retrieves the chronological audit history for an action.
   */
  getActionHistory: async (actionId: string) => {
    return apiRequest<{
      data: import('@moneylens/shared').ActionHistory[];
    }>(`/actions/${actionId}/history`);
  },
};
