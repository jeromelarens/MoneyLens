import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AppRouteEntry } from '../app/router';
import { Layout } from '../components/Layout';
import { SignInPage } from '../components/auth/SignInPage';
import { healthService } from '../services/health.service';
import { financialService } from '../services/financial.service';

vi.mock('../services/health.service', () => ({
  healthService: {
    getHealth: vi.fn(),
    getReadiness: vi.fn(),
  },
}));

vi.mock('../services/financial.service', () => ({
  financialService: {
    getAccounts: vi.fn(),
    getTransactions: vi.fn(),
    getReconciliationRuns: vi.fn(),
    getFindingsSummary: vi.fn(),
    getFindings: vi.fn(),
    getCashFlowSummary: vi.fn(),
    listForecastRuns: vi.fn(),
    getActionSummary: vi.fn(),
    getActions: vi.fn(),
  },
}));

import type {
  FinancialAccount,
  TransactionListResponse,
  ReconciliationRunListResponse,
  FinancialExposureSummary,
  FindingListResponse,
  CashFlowDashboardSummary,
  ForecastRunListResponse,
  ActionDashboardSummary,
  ActionListResponse,
} from '@moneylens/shared';

describe('MoneyLens Post-Login Dashboard & Workspace Routing Suite', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('ml_organization_name', 'Acme Wholesale Corp');
    localStorage.setItem('ml_organization_currency', 'USD');

    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    vi.mocked(healthService.getHealth).mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: 500,
      version: '0.1.0',
      environment: 'test',
    });

    vi.mocked(healthService.getReadiness).mockResolvedValue({
      status: 'ready',
      timestamp: new Date().toISOString(),
      services: {
        database: { status: 'up' },
      },
    });

    vi.mocked(financialService.getAccounts).mockResolvedValue({
      items: [
        {
          id: 'acc-1',
          organizationId: 'org-1',
          name: 'Primary Checking',
          type: 'checking',
          currency: 'USD',
          institutionName: 'Chase Bank',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    } as unknown as { items: FinancialAccount[] });

    vi.mocked(financialService.getTransactions).mockResolvedValue({
      items: [
        {
          id: 'tx-1',
          organizationId: 'org-1',
          accountId: 'acc-1',
          importJobId: 'job-1',
          date: '2026-10-15T12:00:00Z',
          description: 'Customer invoice payment #4410',
          direction: 'credit',
          amountMinor: 250000,
          amountDecimal: '2500.00',
          currency: 'USD',
          sourceReference: 'REF-001',
          fingerprint: 'fp-1',
          rawSourceData: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, limit: 100, totalItems: 1, totalPages: 1 },
    } as unknown as TransactionListResponse);

    vi.mocked(financialService.getReconciliationRuns).mockResolvedValue({
      items: [
        {
          id: 'run-1',
          organizationId: 'org-1',
          status: 'completed',
          rulesVersion: '1.0.0',
          matchedCount: 10,
          unmatchedCount: 1,
          reviewCount: 2,
          totalSourceTransactions: 13,
          totalTargetTransactions: 13,
          amountToleranceMinor: 0,
          dateToleranceDays: 3,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, limit: 5, totalItems: 1, totalPages: 1 },
    } as unknown as ReconciliationRunListResponse);

    vi.mocked(financialService.getFindingsSummary).mockResolvedValue({
      byCurrency: {
        USD: {
          potentialExposureMinor: 45000,
          currency: 'USD',
        },
      },
      totalFindingsCount: 1,
      highSeverityCount: 1,
      mediumSeverityCount: 0,
      lowSeverityCount: 0,
      lastDetectionRunAt: new Date().toISOString(),
    } as unknown as FinancialExposureSummary);

    vi.mocked(financialService.getFindings).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 4, totalItems: 0, totalPages: 0 },
    } as unknown as FindingListResponse);

    vi.mocked(financialService.getCashFlowSummary).mockResolvedValue({
      byCurrency: {
        USD: {
          currency: 'USD',
          projectedInflowsMinor: 500000,
          projectedOutflowsMinor: 200000,
          expectedNetMovementMinor: 300000,
          riskLevel: 'low_risk',
        },
      },
      lastRunAt: new Date().toISOString(),
      totalForecastRuns: 1,
    } as unknown as CashFlowDashboardSummary);

    vi.mocked(financialService.listForecastRuns).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 1, totalItems: 0, totalPages: 0 },
    } as unknown as ForecastRunListResponse);

    vi.mocked(financialService.getActionSummary).mockResolvedValue({
      data: {
        totalOpen: 1,
        totalInProgress: 0,
        totalSnoozed: 0,
        totalCompleted: 0,
        totalDismissed: 0,
        criticalPriorityCount: 0,
        highPriorityCount: 1,
        mediumPriorityCount: 0,
        lowPriorityCount: 0,
        byCurrency: { USD: { potentialExposureMinor: 45000, currency: 'USD' } },
        lastEvaluatedAt: new Date().toISOString(),
      },
    } as unknown as { data: ActionDashboardSummary });

    vi.mocked(financialService.getActions).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 4, totalItems: 0, totalPages: 0 },
    } as unknown as ActionListResponse);
  });

  const renderWithApp = (initialEntries = ['/app']) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/app" element={<AppRouteEntry />} />
            <Route path="/dashboard" element={<AppRouteEntry />} />
            <Route
              path="/transactions"
              element={<div data-testid="page-transactions">Transactions Page</div>}
            />
            <Route
              path="/accounts"
              element={<div data-testid="page-accounts">Accounts Page</div>}
            />
            <Route path="/imports" element={<div data-testid="page-imports">Imports Page</div>} />
            <Route
              path="/reconciliation"
              element={<div data-testid="page-reconciliation">Reconciliation Page</div>}
            />
            <Route
              path="/findings"
              element={<div data-testid="page-findings">Findings Page</div>}
            />
            <Route
              path="/cash-flow"
              element={<div data-testid="page-cash-flow">Cash Flow Page</div>}
            />
            <Route
              path="/actions"
              element={<div data-testid="page-actions">Action Center Page</div>}
            />
            <Route
              path="/diagnostics"
              element={<div data-testid="page-diagnostics">Diagnostics Page</div>}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it('1 & 2: Direct access to /app opens the business-owner Executive Overview dashboard', async () => {
    renderWithApp(['/app']);

    // Verifies Executive Overview headline and brand presence
    expect(
      await screen.findByRole('heading', { name: /Executive Financial Overview/i }),
    ).toBeInTheDocument();

    // Verifies 4 core financial hierarchy questions
    expect(
      screen.getByRole('heading', { name: /What is happening financially\?/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /What needs attention\?/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /What could happen next\?/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /What action should be taken\?/i }),
    ).toBeInTheDocument();

    // Verifies verified income metric from authenticated API after queries resolve
    await waitFor(() => {
      expect(screen.getAllByText('$ 2,500.00').length).toBeGreaterThan(0);
    });

    // Verifies that internal developer badges ("Production Monorepo", "Live Diagnostics") are NOT exposed in customer header
    expect(screen.queryByText(/Workspace: Production Monorepo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Status: Live Diagnostics/i)).not.toBeInTheDocument();
  });

  it('3: Successful sign-in redirects to /app and displays the Executive Overview', async () => {
    renderWithApp(['/signin']);

    // Fill in valid credentials
    const emailInput = screen.getByLabelText(/Work Email/i);
    const passwordInput = screen.getByLabelText(/^Password$/i);
    const submitButton = screen.getByRole('button', { name: /Sign in to workspace/i });

    fireEvent.change(emailInput, { target: { value: 'owner@retailboutique.com' } });
    fireEvent.change(passwordInput, { target: { value: 'SecurePass123!' } });
    fireEvent.click(submitButton);

    // Transitions to /app and renders Executive Overview
    expect(
      await screen.findByRole('heading', { name: /Executive Financial Overview/i }),
    ).toBeInTheDocument();
  });

  it('4: Preserves tabbed workspace access for ?tab=ingestion and ?tab=telemetry', async () => {
    // When ?tab=telemetry is requested, AppRouteEntry renders the tabbed container
    renderWithApp(['/app?tab=telemetry']);

    expect(await screen.findByText(/API Service Process/i)).toBeInTheDocument();
    expect(screen.getByText(/Database Infrastructure/i)).toBeInTheDocument();
  });

  it('5: Renders deliberate empty state explaining statement upload when no transactions exist', async () => {
    vi.mocked(financialService.getTransactions).mockResolvedValueOnce({
      items: [],
      pagination: { page: 1, limit: 100, totalItems: 0, totalPages: 0 },
    } as unknown as TransactionListResponse);

    renderWithApp(['/app']);

    // Intentional first-use empty state callout
    expect(
      await screen.findByText(
        /Welcome to MoneyLens\. Ingest your first statement to activate intelligence\./i,
      ),
    ).toBeInTheDocument();

    // Link to existing imports workflow
    const uploadBtn = screen.getByRole('link', { name: /Upload Statement \(CSV\/XLSX\)/i });
    expect(uploadBtn).toHaveAttribute('href', '/imports');

    // Financial indicators remain honest without fabricated numbers
    await waitFor(() => {
      expect(screen.getAllByText('$ 0.00').length).toBeGreaterThan(0);
    });
  });

  it('6: Handles server failure with accessible alert and retry control', async () => {
    vi.mocked(financialService.getTransactions).mockRejectedValueOnce(
      new Error('500 Service Unavailable'),
    );

    renderWithApp(['/app']);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Unable to synchronize ledger/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('7: Provides accessible mobile navigation toggle that reveals menu on small viewports', async () => {
    renderWithApp(['/app']);

    const mobileToggle = await screen.findByRole('button', { name: /Toggle navigation menu/i });
    expect(mobileToggle).toHaveAttribute('aria-expanded', 'false');

    // Click toggle button to open mobile menu
    fireEvent.click(mobileToggle);
    expect(mobileToggle).toHaveAttribute('aria-expanded', 'true');

    // Verify all primary business navigation links are accessible in drawer
    const links = screen.getAllByRole('link', { name: /Transactions & Ledger/i });
    expect(links.length).toBeGreaterThan(0);
  });

  it('8: Layout component provides clean business navigation and accessible diagnostics link', () => {
    render(
      <MemoryRouter initialEntries={['/transactions']}>
        <Layout>
          <div data-testid="child-content">Content</div>
        </Layout>
      </MemoryRouter>,
    );

    // Business identity
    expect(screen.getByText('MoneyLens')).toBeInTheDocument();
    expect(screen.getByText('Acme Wholesale Corp')).toBeInTheDocument();

    // Customer navigation items
    expect(screen.getByRole('link', { name: /^Executive Overview$/i })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(screen.getByRole('link', { name: /^Transactions$/i })).toHaveAttribute(
      'href',
      '/transactions',
    );
    expect(screen.getByRole('link', { name: /^Accounts$/i })).toHaveAttribute('href', '/accounts');
    expect(screen.getByRole('link', { name: /^Imports$/i })).toHaveAttribute('href', '/imports');
    expect(screen.getByRole('link', { name: /^Reconciliation$/i })).toHaveAttribute(
      'href',
      '/reconciliation',
    );
    expect(screen.getByRole('link', { name: /^Leakage & Findings$/i })).toHaveAttribute(
      'href',
      '/findings',
    );
    expect(screen.getByRole('link', { name: /^Cash Flow$/i })).toHaveAttribute(
      'href',
      '/cash-flow',
    );
    expect(screen.getByRole('link', { name: /^Action Center$/i })).toHaveAttribute(
      'href',
      '/actions',
    );

    // Quick action import
    expect(screen.getByRole('link', { name: /Import Statement/i })).toHaveAttribute(
      'href',
      '/imports',
    );

    // Developer diagnostics moved out of customer header into footer
    expect(screen.queryByText(/Workspace: Production Monorepo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Status: Live Diagnostics/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /System Diagnostics/i })).toHaveAttribute(
      'href',
      '/diagnostics',
    );
  });
});
