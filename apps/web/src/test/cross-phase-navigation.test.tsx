import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../app/App';
import { Layout } from '../components/Layout';
import { financialService } from '../services/financial.service';
import { healthService } from '../services/health.service';

describe('Cross-Phase Frontend Navigation & Resilience (Scenario 10)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    // Default mock setup for successful empty states
    vi.spyOn(financialService, 'getAccounts').mockResolvedValue({
      items: [
        {
          id: 'acc-1',
          organizationId: 'org-1',
          name: 'Primary Checking',
          type: 'checking',
          currency: 'USD',
          institutionName: 'Primary Bank',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    vi.spyOn(financialService, 'getTransactions').mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 15, totalItems: 0, totalPages: 0 },
    });

    vi.spyOn(financialService, 'getFindingsSummary').mockResolvedValue({
      byCurrency: {},
      totalFindingsCount: 0,
      highSeverityCount: 0,
      mediumSeverityCount: 0,
      lowSeverityCount: 0,
      lastDetectionRunAt: null,
    });

    vi.spyOn(financialService, 'getFindings').mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0 },
    });

    vi.spyOn(financialService, 'getActionSummary').mockResolvedValue({
      data: {
        totalOpen: 0,
        totalInProgress: 0,
        totalSnoozed: 0,
        totalCompleted: 0,
        totalDismissed: 0,
        criticalPriorityCount: 0,
        highPriorityCount: 0,
        mediumPriorityCount: 0,
        lowPriorityCount: 0,
        byCurrency: {},
        lastEvaluatedAt: null,
      },
    });

    vi.spyOn(financialService, 'getActions').mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0 },
    });

    vi.spyOn(financialService, 'getCashFlowSummary').mockResolvedValue({
      byCurrency: {},
      lastRunAt: null,
      totalForecastRuns: 0,
    });

    vi.spyOn(financialService, 'listForecastRuns').mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 10, totalItems: 0, totalPages: 0 },
    });

    vi.spyOn(healthService, 'getHealth').mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: 100,
      version: '1.0.0',
      environment: 'test',
    });

    vi.spyOn(healthService, 'getReadiness').mockResolvedValue({
      status: 'ready',
      timestamp: new Date().toISOString(),
      services: {
        database: { status: 'up' },
      },
    });
  });

  const renderApp = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Layout>
            <App />
          </Layout>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it('navigates seamlessly across all 6 dashboard sections and renders verified empty states', async () => {
    renderApp();

    // 1. Ingestion Tab (Default)
    expect(screen.getByRole('heading', { name: /Statement Ingestion/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Financial Ledger/i })).toBeInTheDocument();

    // 2. Reconciliation Engine Tab
    const recTab = screen.getByRole('button', { name: /Reconciliation Engine/i });
    fireEvent.click(recTab);
    expect(await screen.findByText(/Financial Reconciliation/i)).toBeInTheDocument();

    // 3. Financial Leakage Tab
    const findTab = screen.getByRole('button', { name: /Financial Leakage & Intelligence/i });
    fireEvent.click(findTab);
    expect(await screen.findByText(/Financial Leakage & Intelligence/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/No findings match the current filter criteria/i),
    ).toBeInTheDocument();

    // 4. Cash Flow & Scenarios Tab
    const cashTab = screen.getByRole('button', { name: /Cash Flow & Scenarios/i });
    fireEvent.click(cashTab);
    expect(
      await screen.findByText(/Cash Flow Forecasting & Scenario Planning/i),
    ).toBeInTheDocument();

    // 5. Action Center Tab
    const actTab = screen.getByRole('button', { name: /Action Center/i });
    fireEvent.click(actTab);
    expect(await screen.findByText(/Business Action Center/i)).toBeInTheDocument();
    expect(await screen.findByText(/No actions matching current filters/i)).toBeInTheDocument();

    // 6. Telemetry & Diagnostics Tab
    const telTab = screen.getByRole('button', { name: /System Diagnostics & Architecture/i });
    fireEvent.click(telTab);
    expect(await screen.findByText(/API Service Process/i)).toBeInTheDocument();
    expect(await screen.findByText(/Database Infrastructure/i)).toBeInTheDocument();
  }, 15000);

  it('gracefully handles API network failures without unhandled crashes', async () => {
    // Mock Action Center failure
    vi.spyOn(financialService, 'getActions').mockRejectedValue(
      new Error('Failed to reach backend API (500 Internal Server Error)'),
    );

    renderApp();

    // Switch to Action Center
    const actTab = screen.getByRole('button', { name: /Action Center/i });
    fireEvent.click(actTab);

    // Verify error state is rendered
    expect(await screen.findByText(/Failed to load action items/i)).toBeInTheDocument();
  });
});
