import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { CashFlowDashboard } from '../components/CashFlowDashboard';
import * as financialServiceModule from '../services/financial.service';
import type {
  CashFlowDashboardSummary,
  CashFlowForecast,
  ForecastRun,
  ScenarioCalculationResult,
  CashFlowScenario,
} from '@moneylens/shared';

describe('CashFlowDashboard Component Suite', () => {
  let queryClient: QueryClient;

  const mockForecastWithoutBalance: CashFlowForecast = {
    id: 'fc-101',
    organizationId: 'org-test',
    forecastRunId: 'run-101',
    currency: 'USD',
    horizonDays: 30,
    startDate: '2026-03-21',
    endDate: '2026-04-19',
    hasReliableOpeningBalance: false,
    openingBalanceMinor: null,
    projectedInflowsMinor: 1500000,
    projectedOutflowsMinor: 1000000,
    expectedNetMovementMinor: 500000,
    projectedClosingBalanceMinor: null,
    lowestProjectedBalanceMinor: null,
    riskLevel: 'no_balance_data',
    riskReason: 'Net cash movement tracked. Opening balance not provided.',
    dataQuality: 'high',
    historicalDailyAvgInflowMinor: 50000,
    historicalDailyAvgOutflowMinor: 33333,
    recurringOutflowsCount: 2,
    recurringOutflowsTotalMinor: 200000,
    points: [
      {
        date: '2026-03-21',
        projectedInflowMinor: 50000,
        projectedOutflowMinor: 30000,
        projectedNetMinor: 20000,
        estimatedBalanceMinor: null,
        recurringExpenseBreakdown: [],
        isHistorical: false,
      },
      {
        date: '2026-03-22',
        projectedInflowMinor: 50000,
        projectedOutflowMinor: 30000,
        projectedNetMinor: 20000,
        estimatedBalanceMinor: null,
        recurringExpenseBreakdown: [],
        isHistorical: false,
      },
    ],
    assumptions: ['Moving average run rate used.', 'Phase 4 recurring charges included.'],
    limitations: ['Net cash movement only without opening bank balance.'],
    createdAt: '2026-03-20T10:00:00.000Z',
    updatedAt: '2026-03-20T10:00:00.000Z',
  };

  const mockRun: ForecastRun = {
    id: 'run-101',
    organizationId: 'org-test',
    status: 'completed',
    horizonDays: 30,
    methodology: 'deterministic-runrate',
    methodologyVersion: 'v1.0.0-deterministic',
    historyWindowDays: 90,
    transactionsEvaluated: 120,
    currencies: ['USD'],
    warnings: [],
    startedAt: '2026-03-20T10:00:00.000Z',
    completedAt: '2026-03-20T10:00:02.000Z',
    createdAt: '2026-03-20T10:00:00.000Z',
    updatedAt: '2026-03-20T10:00:02.000Z',
  };

  const mockSummary: CashFlowDashboardSummary = {
    byCurrency: {
      USD: {
        currency: 'USD',
        latestForecastRunId: 'run-101',
        horizonDays: 30,
        projectedInflowsMinor: 1500000,
        projectedOutflowsMinor: 1000000,
        expectedNetMovementMinor: 500000,
        hasReliableOpeningBalance: false,
        openingBalanceMinor: null,
        projectedClosingBalanceMinor: null,
        riskLevel: 'no_balance_data',
        riskReason: 'Net cash movement tracked. Opening balance not provided.',
        dataQuality: 'high',
        lastCalculatedAt: '2026-03-20T10:00:02.000Z',
      },
    },
    lastRunAt: '2026-03-20T10:00:02.000Z',
    totalForecastRuns: 1,
  };

  const mockSimulationResult: ScenarioCalculationResult = {
    scenarioId: 'scen-adhoc',
    scenarioName: 'Ad-hoc Stress Test',
    currency: 'USD',
    horizonDays: 30,
    baselineSummary: {
      projectedInflowsMinor: 1500000,
      projectedOutflowsMinor: 1000000,
      expectedNetMovementMinor: 500000,
      projectedClosingBalanceMinor: null,
      riskLevel: 'no_balance_data',
    },
    scenarioSummary: {
      projectedInflowsMinor: 1275000,
      projectedOutflowsMinor: 1100000,
      expectedNetMovementMinor: 175000,
      projectedClosingBalanceMinor: null,
      inflowVarianceMinor: -225000,
      outflowVarianceMinor: 100000,
      netVarianceMinor: -325000,
      riskLevel: 'moderate_risk',
      riskReason: 'Net cash movement decreased by 65.0% under simulated stress.',
    },
    points: [
      {
        date: '2026-03-21',
        baselineInflowMinor: 50000,
        scenarioInflowMinor: 42500,
        baselineOutflowMinor: 30000,
        scenarioOutflowMinor: 33000,
        baselineNetMinor: 20000,
        scenarioNetMinor: 9500,
        baselineBalanceMinor: null,
        scenarioBalanceMinor: null,
        netDifferenceMinor: -10500,
      },
    ],
    adjustmentsApplied: ['Applied -15% adjustment to non-recurring revenues.'],
  };

  const mockSavedScenario: CashFlowScenario = {
    id: 'scen-saved-1',
    organizationId: 'org-test',
    name: 'Q3 Worst-Case Revenue Slump',
    currency: 'USD',
    horizonDays: 30,
    assumptions: {
      revenueChangePercent: -25,
      expenseChangePercent: 10,
      recurringAdjustments: [],
      oneTimeEvents: [],
    },
    createdAt: '2026-03-20T11:00:00.000Z',
    updatedAt: '2026-03-20T11:00:00.000Z',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    vi.spyOn(financialServiceModule.financialService, 'getCashFlowSummary').mockResolvedValue(
      mockSummary,
    );

    vi.spyOn(financialServiceModule.financialService, 'getForecastRun').mockResolvedValue({
      run: mockRun,
      forecasts: [mockForecastWithoutBalance],
    });

    vi.spyOn(financialServiceModule.financialService, 'createForecastRun').mockResolvedValue({
      run: mockRun,
      forecasts: [mockForecastWithoutBalance],
    });

    vi.spyOn(financialServiceModule.financialService, 'simulateScenario').mockResolvedValue(
      mockSimulationResult,
    );

    vi.spyOn(financialServiceModule.financialService, 'listScenarios').mockResolvedValue({
      items: [mockSavedScenario],
      pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
    });

    vi.spyOn(financialServiceModule.financialService, 'createScenario').mockResolvedValue(
      mockSavedScenario,
    );

    vi.spyOn(financialServiceModule.financialService, 'deleteScenario').mockResolvedValue({
      message: 'Scenario deleted successfully',
    });
  });

  const renderDashboard = () =>
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <CashFlowDashboard />
        </QueryClientProvider>
      </MemoryRouter>,
    );

  it('renders executive summary cards and net movement without fabricating opening balance', async () => {
    renderDashboard();

    expect(screen.getByText(/Cash Flow Forecasting & Scenario Planning/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/\+USD 15000.00/i)).toBeInTheDocument();
      expect(screen.getByText(/-USD 10000.00/i)).toBeInTheDocument();
      expect(screen.getByText(/\+USD 5000.00/i)).toBeInTheDocument();
      expect(screen.getByText(/Net Movement Only/i)).toBeInTheDocument();
      expect(screen.getByText(/Net Movement Tracked/i)).toBeInTheDocument();
    });
  });

  it('renders closing balance position when reliable opening balance is provided', async () => {
    const forecastWithBalance: CashFlowForecast = {
      ...mockForecastWithoutBalance,
      hasReliableOpeningBalance: true,
      openingBalanceMinor: 2000000,
      projectedClosingBalanceMinor: 2500000,
      lowestProjectedBalanceMinor: 1950000,
      riskLevel: 'low_risk',
      riskReason: 'Opening cash buffer maintains positive closing liquidity.',
    };

    vi.spyOn(financialServiceModule.financialService, 'getForecastRun').mockResolvedValue({
      run: mockRun,
      forecasts: [forecastWithBalance],
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/USD 25000.00/i)).toBeInTheDocument();
      expect(screen.getByText(/Low Risk \/ Positive Net/i)).toBeInTheDocument();
    });
  });

  it('allows switching forecast horizons and currencies', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Cash Trajectory Visualization/i)).toBeInTheDocument();
    });

    const horizon7d = screen.getByRole('button', { name: '7d' });
    fireEvent.click(horizon7d);
    expect(horizon7d).toHaveClass('bg-sky-500');

    const horizon60d = screen.getByRole('button', { name: '60d' });
    fireEvent.click(horizon60d);
    expect(horizon60d).toHaveClass('bg-sky-500');
  });

  it('opens and submits Run Forecast modal', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Run Forecast/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Run Forecast/i }));

    expect(screen.getByText(/Execute Cash Flow Forecast/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Opening Bank Balance \(Optional\)/i)).toBeInTheDocument();

    const balanceInput = screen.getByLabelText(/Opening Bank Balance \(Optional\)/i);
    fireEvent.change(balanceInput, { target: { value: '25000.50' } });

    const submitBtn = screen.getByRole('button', { name: /Start Projection/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(financialServiceModule.financialService.createForecastRun).toHaveBeenCalledWith(
        expect.objectContaining({
          currencies: ['USD'],
          openingBalances: [
            {
              currency: 'USD',
              amountMinor: 2500050,
            },
          ],
        }),
      );
    });
  });

  it('interacts with scenario simulator, adds one-time event, and displays simulated deltas', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/What-If Scenario Simulator & Stress Testing/i)).toBeInTheDocument();
    });

    // Add One-Time Cash Event
    const nameInput = screen.getByPlaceholderText(/e\.g\. Tax Payout, Grant/i);
    fireEvent.change(nameInput, { target: { value: 'Annual Equipment Purchase' } });

    const amtInput = screen.getByPlaceholderText(/Amount \(USD\)/i);
    fireEvent.change(amtInput, { target: { value: '3500' } });

    const addBtn = screen.getByRole('button', { name: /Add/i });
    fireEvent.click(addBtn);

    expect(screen.getByText(/Annual Equipment Purchase/i)).toBeInTheDocument();

    // Trigger Simulation
    const simulateBtn = screen.getByRole('button', { name: /Simulate Scenario Impact/i });
    fireEvent.click(simulateBtn);

    await waitFor(() => {
      expect(financialServiceModule.financialService.simulateScenario).toHaveBeenCalled();
      expect(screen.getByText(/Inflow Delta/i)).toBeInTheDocument();
      expect(screen.getByText(/-USD 2250.00/i)).toBeInTheDocument();
      expect(screen.getByText(/\+USD 1000.00/i)).toBeInTheDocument();
      expect(screen.getByText(/-USD 3250.00/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Applied -15% adjustment to non-recurring revenues/i),
      ).toBeInTheDocument();
    });

    // Reset Scenario
    const resetBtn = screen.getByRole('button', { name: /Reset to Baseline/i });
    fireEvent.click(resetBtn);

    expect(
      screen.getByText(/Adjust variables on the left and click "Simulate Scenario Impact"/i),
    ).toBeInTheDocument();
  });

  it('renders explainability panel with explicit assumptions and limitations', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(
        screen.getByText(/Forecast Assumptions & Methodology Limitations/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/Moving average run rate used\./i)).toBeInTheDocument();
      expect(
        screen.getByText(/Net cash movement only without opening bank balance\./i),
      ).toBeInTheDocument();
    });
  });

  it('toggles between Chart View and Projection Table view and renders tabular ledger', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Projection Table/i })).toBeInTheDocument();
    });

    // Switch to Projection Table View
    fireEvent.click(screen.getByRole('button', { name: /Projection Table/i }));

    // Verify Table Headers & Rows
    expect(
      screen.getByRole('columnheader', { name: /Scheduled Obligations/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('2026-03-21')).toBeInTheDocument();
    expect(screen.getByText('2026-03-22')).toBeInTheDocument();

    // Switch back to Chart View
    fireEvent.click(screen.getByRole('button', { name: /Chart View/i }));
    expect(screen.getByLabelText(/Cash Flow Forecast Chart/i)).toBeInTheDocument();
  });

  it('saves a hypothetical scenario through the Save Scenario modal', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/What-If Scenario Simulator & Stress Testing/i)).toBeInTheDocument();
    });

    // Run simulation to display scenario results and Save Scenario action
    const simulateBtn = screen.getByRole('button', { name: /Simulate Scenario Impact/i });
    fireEvent.click(simulateBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save Scenario/i })).toBeInTheDocument();
    });

    // Click Save Scenario
    fireEvent.click(screen.getByRole('button', { name: /Save Scenario/i }));

    expect(screen.getByText(/Save Hypothetical Scenario/i)).toBeInTheDocument();
    const nameInput = screen.getByLabelText(/Scenario Name/i);
    fireEvent.change(nameInput, { target: { value: 'Q3 Worst-Case Revenue Slump' } });

    // Submit save
    const modalSaveBtn = screen.getAllByRole('button', { name: /Save Scenario/i })[1]!;
    fireEvent.click(modalSaveBtn);

    await waitFor(() => {
      expect(financialServiceModule.financialService.createScenario).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Q3 Worst-Case Revenue Slump',
          currency: 'USD',
          horizon: '30d',
        }),
      );
    });
  });

  it('displays saved scenarios list and allows loading a saved scenario into the simulator', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Saved Hypothetical Scenarios/i)).toBeInTheDocument();
      expect(screen.getByText('Q3 Worst-Case Revenue Slump')).toBeInTheDocument();
    });

    const loadBtn = screen.getByRole('button', { name: /Load in Simulator/i });
    fireEvent.click(loadBtn);

    await waitFor(() => {
      expect(financialServiceModule.financialService.simulateScenario).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'USD',
          assumptions: expect.objectContaining({
            revenueChangePercent: -25,
            expenseChangePercent: 10,
          }),
        }),
      );
    });
  });

  it('renders an honest empty state when no forecast run exists on file', async () => {
    vi.spyOn(financialServiceModule.financialService, 'getCashFlowSummary').mockResolvedValue({
      byCurrency: {},
      lastRunAt: null,
      totalForecastRuns: 0,
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/No Forecast Run on File/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /Initialize First Forecast Run/i }),
      ).toBeInTheDocument();
    });
  });
});
