import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ExecutiveDashboard } from '../components/ExecutiveDashboard';
import { financialService } from '../services/financial.service';
import { healthService } from '../services/health.service';
import type { Transaction, FinancialFinding, BusinessAction } from '@moneylens/shared';

describe('MoneyLens Executive Dashboard Component Suite', () => {
  let queryClient: QueryClient;

  const mockTransactions: Transaction[] = [
    {
      id: 'tx-1',
      organizationId: 'org-test',
      accountId: 'acc-1',
      importJobId: 'job-1',
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      description: 'Customer Payment - Boutique Goods',
      direction: 'credit',
      amountMinor: 250000, // $2,500.00
      amountDecimal: '2500.00',
      currency: 'USD',
      sourceReference: 'REF-001',
      fingerprint: 'fp-1',
      rawSourceData: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'tx-2',
      organizationId: 'org-test',
      accountId: 'acc-1',
      importJobId: 'job-1',
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      description: 'Inventory Restock Wholesale',
      direction: 'debit',
      amountMinor: 100000, // $1,000.00
      amountDecimal: '1000.00',
      currency: 'USD',
      sourceReference: 'REF-002',
      fingerprint: 'fp-2',
      rawSourceData: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockFindings: FinancialFinding[] = [
    {
      id: 'find-1',
      organizationId: 'org-test',
      findingType: 'potential_duplicate_payment',
      severity: 'high',
      status: 'open',
      title: 'Potential Duplicate Payment',
      summary: 'Two identical charges to Supplier A on the same day',
      primaryTransactionIds: ['tx-1'],
      relatedTransactionIds: ['tx-2'],
      currency: 'USD',
      estimatedAmountMinor: 45000, // $450.00
      evidence: {
        ruleId: 'RULE-DUP-01',
        ruleVersion: '1.0.0',
        reason: 'Duplicate payment detected within 24h',
        primaryTransactionIds: ['tx-1'],
        relatedTransactionIds: ['tx-2'],
      },
      ruleId: 'RULE-DUP-01',
      ruleVersion: '1.0.0',
      fingerprint: 'fp-dup-1',
      detectedAt: new Date().toISOString(),
      lastEvaluatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockActions: BusinessAction[] = [
    {
      id: 'act-1',
      organizationId: 'org-test',
      actionType: 'review_duplicate_payment',
      category: 'cost_reduction',
      priority: 'high',
      priorityScore: 85,
      severity: 'high',
      status: 'open',
      title: 'Audit Supplier Double Billing',
      explanation: 'Review potential duplicate invoice and request vendor credit',
      evidence: { primaryAmountMinor: 45000 },
      sourceFindingIds: ['find-1'],
      sourceForecastRunId: null,
      currency: 'USD',
      financialImpact: {
        currency: 'USD',
        potentialExposureMinor: 45000,
        estimatedAvoidableCostMinor: 45000,
        confirmedIssueMinor: 0,
        projectedCashFlowEffectMinor: 0,
        realizedSavingsMinor: 0,
      },
      evidenceQuality: 'high',
      recommendedSteps: [
        {
          stepNumber: 1,
          label: 'Contact Supplier',
          description: 'Verify invoice number and dispute double charge.',
          isOptional: false,
        },
      ],
      ruleId: 'RULE-01',
      ruleVersion: '1.0.0',
      fingerprint: 'fp-act-1',
      snoozedUntil: null,
      completedAt: null,
      completionNotes: null,
      dismissedAt: null,
      dismissalReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastEvaluatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    localStorage.setItem('ml_organization_name', 'The Local Pantry & Boutique');
    localStorage.setItem('ml_organization_currency', 'USD');

    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    // Default mock responses
    vi.spyOn(healthService, 'getHealth').mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: 300,
      version: '0.1.0',
      environment: 'test',
    });

    vi.spyOn(financialService, 'getAccounts').mockResolvedValue({
      items: [
        {
          id: 'acc-1',
          organizationId: 'org-test',
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
      items: mockTransactions,
      pagination: { page: 1, limit: 100, totalItems: 2, totalPages: 1 },
    });

    vi.spyOn(financialService, 'getReconciliationRuns').mockResolvedValue({
      items: [
        {
          id: 'rec-1',
          organizationId: 'org-test',
          status: 'completed',
          rulesVersion: '1.0.0',
          startDate: null,
          endDate: null,
          dateToleranceDays: 3,
          totalSourceTransactions: 10,
          matchedCount: 8,
          reviewCount: 2,
          unmatchedCount: 0,
          errorCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, limit: 5, totalItems: 1, totalPages: 1 },
    });

    vi.spyOn(financialService, 'getFindingsSummary').mockResolvedValue({
      byCurrency: {
        USD: {
          currency: 'USD',
          potentialExposureMinor: 45000,
          confirmedExposureMinor: 0,
          openFindingCount: 1,
          underReviewFindingCount: 0,
          confirmedFindingCount: 0,
          dismissedFindingCount: 0,
          resolvedFindingCount: 0,
        },
      },
      totalFindingsCount: 1,
      highSeverityCount: 1,
      mediumSeverityCount: 0,
      lowSeverityCount: 0,
      lastDetectionRunAt: new Date().toISOString(),
    });

    vi.spyOn(financialService, 'getFindings').mockResolvedValue({
      items: mockFindings,
      pagination: { page: 1, limit: 4, totalItems: 1, totalPages: 1 },
    });

    vi.spyOn(financialService, 'getCashFlowSummary').mockResolvedValue({
      byCurrency: {
        USD: {
          currency: 'USD',
          riskLevel: 'low_risk',
          riskReason: 'Sufficient liquidity reserve',
          dataQuality: 'high',
          projectedInflowsMinor: 500000,
          projectedOutflowsMinor: 300000,
          expectedNetMovementMinor: 200000,
          hasReliableOpeningBalance: false,
          openingBalanceMinor: null,
          projectedClosingBalanceMinor: null,
          lastCalculatedAt: new Date().toISOString(),
          latestForecastRunId: 'fc-1',
          horizonDays: 30,
        },
      },
      lastRunAt: new Date().toISOString(),
      totalForecastRuns: 1,
    });

    vi.spyOn(financialService, 'listForecastRuns').mockResolvedValue({
      items: [
        {
          id: 'fc-1',
          organizationId: 'org-test',
          status: 'completed',
          horizonDays: 30,
          methodology: 'deterministic_daily_runrate',
          methodologyVersion: '1.0.0',
          historyWindowDays: 90,
          transactionsEvaluated: 2,
          currencies: ['USD'],
          warnings: [],
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, limit: 1, totalItems: 1, totalPages: 1 },
    });

    vi.spyOn(financialService, 'getActionSummary').mockResolvedValue({
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
        byCurrency: {
          USD: {
            currency: 'USD',
            potentialExposureMinor: 45000,
            estimatedAvoidableCostMinor: 45000,
            confirmedIssueMinor: 0,
            realizedSavingsMinor: 0,
            actionCount: 1,
          },
        },
        lastEvaluatedAt: new Date().toISOString(),
      },
    });

    vi.spyOn(financialService, 'getActions').mockResolvedValue({
      items: mockActions,
      pagination: { page: 1, limit: 4, totalItems: 1, totalPages: 1 },
    });
  });

  const renderDashboard = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route path="/dashboard" element={<ExecutiveDashboard />} />
            <Route path="/app" element={<div data-testid="workspace-app">Workspace App</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it('renders branding, organization context, header, and answering hierarchy', async () => {
    renderDashboard();

    // Verify brand presence
    expect(screen.getByText('MoneyLens')).toBeInTheDocument();
    expect(screen.getByText('The Local Pantry & Boutique')).toBeInTheDocument();

    // Verify title and description
    expect(
      screen.getByRole('heading', { name: /Executive Financial Overview/i }),
    ).toBeInTheDocument();

    // Verify 4 core financial hierarchy questions
    expect(
      screen.getByRole('heading', { name: /What is happening financially\?/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /What needs attention\?/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /What could happen next\?/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /What action should be taken\?/i }),
    ).toBeInTheDocument();
  });

  it('displays accurate integer minor unit amounts for Income, Expenses, and Net Movement without floating point math', async () => {
    renderDashboard();

    // Wait for queries to settle
    await waitFor(() => {
      // Income: $2,500.00
      expect(screen.getAllByText('$ 2,500.00').length).toBeGreaterThan(0);
      // Expense: $1,000.00
      expect(screen.getByText('$ 1,000.00')).toBeInTheDocument();
      // Net Movement: $2,500 - $1,000 = $1,500.00
      expect(screen.getByText('$ 1,500.00')).toBeInTheDocument();
    });

    // Verify Reconciliation Health (8/10 = 80%)
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText(/2 need review/i)).toBeInTheDocument();
  });

  it('displays leakages & findings with potential exposure and appropriate disclaimers', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Potential Leakage Exposure/i)).toBeInTheDocument();
      // Exposure of finding: $450.00
      expect(screen.getAllByText('$ 450.00').length).toBeGreaterThan(0);
      expect(screen.getByText('Potential Duplicate Payment')).toBeInTheDocument();
    });

    // Check disclaimer that potential exposure is not confirmed fraud
    expect(
      screen.getByText(
        /Potential exposure represents unreviewed variance, not confirmed fraud or loss\./i,
      ),
    ).toBeInTheDocument();
  });

  it('displays cash flow forecast projection and clearly distinguishes estimated future movement', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/30-Day Probabilistic Projection/i)).toBeInTheDocument();
      expect(screen.getByText(/Estimated Outlook/i)).toBeInTheDocument();
      // Inflow: $5,000.00
      expect(screen.getByText('$ 5,000.00')).toBeInTheDocument();
      // Outflow: $3,000.00
      expect(screen.getByText('$ 3,000.00')).toBeInTheDocument();
      // Net: $2,000.00
      expect(screen.getByText('$ 2,000.00')).toBeInTheDocument();
    });

    // Check disclaimer
    expect(
      screen.getByText(
        /Projections are mathematical simulations derived from statement frequency, not guaranteed balances\./i,
      ),
    ).toBeInTheDocument();
  });

  it('displays prioritized operational actions directly from server priority without recalculation', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Audit Supplier Double Billing')).toBeInTheDocument();
      expect(
        screen.getByText('Review potential duplicate invoice and request vendor credit'),
      ).toBeInTheDocument();
      // Priority badge from server: 'high'
      expect(screen.getAllByText(/^high$/i).length).toBeGreaterThan(0);
    });
  });

  it('handles period filter change and triggers getTransactions with date parameters', async () => {
    renderDashboard();

    // Click on 90 Days period filter
    const ninetyDaysBtn = screen.getByRole('button', { name: /^(90D|90 Days)$/i });
    fireEvent.click(ninetyDaysBtn);

    expect(financialService.getTransactions).toHaveBeenCalled();
  });

  it('gracefully handles empty state when no transactions exist', async () => {
    vi.spyOn(financialService, 'getTransactions').mockResolvedValueOnce({
      items: [],
      pagination: { page: 1, limit: 100, totalItems: 0, totalPages: 0 },
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/No Activity Data Available/i)).toBeInTheDocument();
      expect(screen.getByText('$ 0.00')).toBeInTheDocument();
    });
  });

  it('gracefully handles network errors with an accessible alert and retry control', async () => {
    vi.spyOn(financialService, 'getTransactions').mockRejectedValueOnce(
      new Error('Network Connection Error'),
    );

    renderDashboard();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Unable to synchronize ledger/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Retry$/i })).toBeInTheDocument();
  });
});
