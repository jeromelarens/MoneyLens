import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ReconciliationRunDetailsPage } from '../components/ReconciliationRunDetailsPage';
import { financialService } from '../services/financial.service';
import type {
  FinancialAccount,
  ReconciliationRun,
  ReconciliationMatch,
  ReconciliationAuditEventListResponse,
  ReconciliationMatchListResponse,
  ReconciliationRunListResponse,
} from '@moneylens/shared';

describe('MoneyLens Reconciliation Run Details & Audit History Page Component Suite', () => {
  let queryClient: QueryClient;

  const mockAccounts: FinancialAccount[] = [
    {
      id: 'acc-checking-001',
      organizationId: 'org-test-enterprise',
      name: 'Primary Operating Checking',
      type: 'checking',
      currency: 'USD',
      institutionName: 'JPMorgan Chase',
      createdAt: '2026-09-01T08:00:00.000Z',
      updatedAt: '2026-10-20T10:00:00.000Z',
    },
    {
      id: 'acc-savings-002',
      organizationId: 'org-test-enterprise',
      name: 'Treasury Reserve Savings',
      type: 'savings',
      currency: 'USD',
      institutionName: 'Bank of America',
      createdAt: '2026-09-05T08:00:00.000Z',
      updatedAt: '2026-10-20T10:00:00.000Z',
    },
  ];

  const mockRun: ReconciliationRun = {
    id: 'run-alpha-12345678',
    organizationId: 'org-test-enterprise',
    accountId: 'acc-checking-001',
    targetAccountId: 'acc-savings-002',
    status: 'completed',
    rulesVersion: 'v1.0.0',
    startDate: '2026-09-01T00:00:00.000Z',
    endDate: '2026-10-01T00:00:00.000Z',
    dateToleranceDays: 3,
    totalSourceTransactions: 120,
    matchedCount: 85,
    reviewCount: 15,
    unmatchedCount: 20,
    errorCount: 0,
    summary: {},
    startedAt: '2026-10-20T10:00:00.000Z',
    completedAt: '2026-10-20T10:00:05.000Z',
    errorMessage: null,
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:05.000Z',
  };

  const mockAuditTrailResponse: ReconciliationAuditEventListResponse = {
    items: [
      {
        id: 'evt-001',
        organizationId: 'org-test-enterprise',
        reconciliationRunId: 'run-alpha-12345678',
        action: 'run_started',
        details: {
          accountId: 'acc-checking-001',
          targetAccountId: 'acc-savings-002',
          dateToleranceDays: 3,
          rulesVersion: 'v1.0.0',
        },
        timestamp: '2026-10-20T10:00:00.000Z',
      },
      {
        id: 'evt-002',
        organizationId: 'org-test-enterprise',
        reconciliationRunId: 'run-alpha-12345678',
        action: 'matches_generated',
        details: {
          matchedCount: 85,
          reviewCount: 15,
          unmatchedCount: 20,
          totalEvaluated: 120,
        },
        timestamp: '2026-10-20T10:00:02.000Z',
      },
      {
        id: 'evt-003',
        organizationId: 'org-test-enterprise',
        reconciliationRunId: 'run-alpha-12345678',
        matchId: 'match-sugg-101',
        action: 'match_confirmed',
        details: {
          matchId: 'match-sugg-101',
          sourceTransactionId: 'tx-src-001',
          candidateTransactionId: 'tx-cand-001',
          notes: 'Verified wire transfer with controller',
          confirmedAt: '2026-10-20T10:05:00.000Z',
        },
        timestamp: '2026-10-20T10:05:00.000Z',
      },
      {
        id: 'evt-004',
        organizationId: 'org-test-enterprise',
        reconciliationRunId: 'run-alpha-12345678',
        action: 'run_completed',
        details: {
          matchedCount: 85,
          reviewCount: 15,
          unmatchedCount: 20,
          executionDurationMs: 4850,
          completedAt: '2026-10-20T10:00:05.000Z',
        },
        timestamp: '2026-10-20T10:00:05.000Z',
      },
    ],
    pagination: {
      page: 1,
      limit: 10,
      totalItems: 4,
      totalPages: 1,
    },
  };

  const mockMatches: ReconciliationMatch[] = [
    {
      id: 'match-sugg-101',
      organizationId: 'org-test-enterprise',
      reconciliationRunId: 'run-alpha-12345678',
      sourceTransactionId: 'tx-src-001',
      candidateTransactionId: 'tx-cand-001',
      status: 'suggested',
      matchMethod: 'transfer_match',
      matchScore: 95,
      evidence: {
        amountMatch: true,
        currencyMatch: true,
        dateDifferenceDays: 0,
        directionCompatible: true,
        externalReferenceMatch: true,
      },
      amountDifferenceMinor: 0,
      dateDifferenceDays: 0,
      decisionSource: 'rule_engine',
      createdAt: '2026-10-20T10:00:01.000Z',
      updatedAt: '2026-10-20T10:00:01.000Z',
      sourceTransaction: {
        id: 'tx-src-001',
        organizationId: 'org-test-enterprise',
        accountId: 'acc-checking-001',
        importJobId: 'import-job-01',
        date: '2026-09-15T12:00:00.000Z',
        description: 'Wire Transfer Out to Treasury',
        direction: 'debit',
        amountMinor: 25000000,
        amountDecimal: '250000.00',
        currency: 'USD',
        sourceReference: 'WIRE-982110',
        fingerprint: 'fp-src-001',
        createdAt: '2026-09-15T12:00:00.000Z',
        updatedAt: '2026-09-15T12:00:00.000Z',
      },
      candidateTransaction: {
        id: 'tx-cand-001',
        organizationId: 'org-test-enterprise',
        accountId: 'acc-savings-002',
        importJobId: 'import-job-02',
        date: '2026-09-15T14:30:00.000Z',
        description: 'Wire Transfer In from Operating',
        direction: 'credit',
        amountMinor: 25000000,
        amountDecimal: '250000.00',
        currency: 'USD',
        sourceReference: 'WIRE-982110',
        fingerprint: 'fp-cand-001',
        createdAt: '2026-09-15T14:30:00.000Z',
        updatedAt: '2026-09-15T14:30:00.000Z',
      },
    },
  ];

  const mockMatchesResponse: ReconciliationMatchListResponse = {
    items: mockMatches,
    pagination: {
      page: 1,
      limit: 15,
      totalItems: 1,
      totalPages: 1,
    },
  };

  const mockRunsListResponse: ReconciliationRunListResponse = {
    items: [mockRun],
    pagination: {
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1,
    },
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    vi.clearAllMocks();

    vi.spyOn(financialService, 'getReconciliationRun').mockResolvedValue(mockRun);
    vi.spyOn(financialService, 'getReconciliationAuditTrail').mockResolvedValue(
      mockAuditTrailResponse,
    );
    vi.spyOn(financialService, 'getReconciliationMatches').mockResolvedValue(mockMatchesResponse);
    vi.spyOn(financialService, 'getAccounts').mockResolvedValue({ items: mockAccounts });
    vi.spyOn(financialService, 'getReconciliationRuns').mockResolvedValue(mockRunsListResponse);
    vi.spyOn(financialService, 'confirmMatch').mockResolvedValue({
      ...(mockMatches[0] as ReconciliationMatch),
      status: 'confirmed',
    });
    vi.spyOn(financialService, 'rejectMatch').mockResolvedValue({
      ...(mockMatches[0] as ReconciliationMatch),
      status: 'rejected',
    });
  });

  const renderComponent = (initialEntries = ['/reconciliation/runs/run-alpha-12345678']) =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/reconciliation/runs/:runId" element={<ReconciliationRunDetailsPage />} />
            <Route path="/reconciliation/runs" element={<ReconciliationRunDetailsPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

  it('renders page header, brand identity, and run details title', async () => {
    renderComponent();

    expect(await screen.findByText('MoneyLens')).toBeInTheDocument();
    expect(
      await screen.findByText('Reconciliation Run Details & Audit History'),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Deterministic Run Audit/i)).toBeInTheDocument();
    expect(await screen.findByText('Back to Workspace')).toBeInTheDocument();
  });

  it('renders run overview metadata: run ID, status badge, rules version, tolerance, and accounts', async () => {
    renderComponent();

    expect(await screen.findByText('run-alpha-12345678')).toBeInTheDocument();
    expect(await screen.findByText('Completed')).toBeInTheDocument();
    expect((await screen.findAllByText('v1.0.0')).length).toBeGreaterThan(0);
    expect(await screen.findByText('±3 calendar days')).toBeInTheDocument();
    expect(await screen.findByText('Primary Operating Checking')).toBeInTheDocument();
    expect(await screen.findByText('Treasury Reserve Savings')).toBeInTheDocument();
  });

  it('renders summary metrics strip with integer counts', async () => {
    renderComponent();

    expect(await screen.findByText('120')).toBeInTheDocument(); // Analyzed
    expect(await screen.findByText('85')).toBeInTheDocument(); // Suggested
    expect(await screen.findByText('15')).toBeInTheDocument(); // Needs Review
    expect(await screen.findByText('20')).toBeInTheDocument(); // Unmatched
  });

  it('renders chronological audit trail timeline with event actions and summaries', async () => {
    renderComponent();

    // Default tab is 'timeline'
    expect(await screen.findByText('run_started')).toBeInTheDocument();
    expect(await screen.findByText('matches_generated')).toBeInTheDocument();
    expect(await screen.findByText('match_confirmed')).toBeInTheDocument();
    expect(await screen.findByText('run_completed')).toBeInTheDocument();

    expect(
      await screen.findByText(/Reconciliation run started with rules version/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Engine evaluated transactions and produced/i),
    ).toBeInTheDocument();
  });

  it('filters audit trail events by category buttons', async () => {
    renderComponent();

    expect(await screen.findByText('run_started')).toBeInTheDocument();

    // Click 'Match Decisions' category filter
    const decisionsBtn = screen.getByRole('button', { name: 'Match Decisions' });
    fireEvent.click(decisionsBtn);

    // match_confirmed should be visible, run_started should not be visible
    expect(screen.getByText('match_confirmed')).toBeInTheDocument();
    expect(screen.queryByText('run_started')).not.toBeInTheDocument();
  });

  it('opens audit event payload inspector modal when Inspect Payload is clicked', async () => {
    renderComponent();

    const inspectButtons = await screen.findAllByRole('button', { name: /Inspect Payload/i });
    expect(inspectButtons.length).toBeGreaterThan(0);

    fireEvent.click(inspectButtons[0]!);

    expect(await screen.findByText('Audit Event Payload')).toBeInTheDocument();
    expect(await screen.findByText('Structured Event Details:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close Inspector' })).toBeInTheDocument();
  });

  it('switches to Reconciliation Match Records tab and renders candidate table', async () => {
    renderComponent();

    const matchesTab = await screen.findByRole('button', { name: /Reconciliation Match Records/i });
    fireEvent.click(matchesTab);

    expect(await screen.findByText('Wire Transfer Out to Treasury')).toBeInTheDocument();
    expect(await screen.findByText('Wire Transfer In from Operating')).toBeInTheDocument();
    expect(await screen.findByText('Score: 95% • transfer_match')).toBeInTheDocument();
  });

  it('confirms a suggested match candidate with optional audit notes', async () => {
    renderComponent();

    const matchesTab = await screen.findByRole('button', { name: /Reconciliation Match Records/i });
    fireEvent.click(matchesTab);

    const confirmBtn = await screen.findByRole('button', { name: 'Confirm' });
    fireEvent.click(confirmBtn);

    expect(await screen.findByText('Confirm Reconciliation Match')).toBeInTheDocument();

    const notesInput = screen.getByLabelText(/Audit Notes/i);
    fireEvent.change(notesInput, { target: { value: 'Confirmed by Lead Auditor' } });

    const submitConfirm = screen.getByRole('button', { name: 'Confirm Match' });
    fireEvent.click(submitConfirm);

    await waitFor(() => {
      expect(financialService.confirmMatch).toHaveBeenCalledWith(
        'match-sugg-101',
        'Confirmed by Lead Auditor',
      );
    });
  });

  it('rejects a match candidate and enforces mandatory rejection reason', async () => {
    renderComponent();

    const matchesTab = await screen.findByRole('button', { name: /Reconciliation Match Records/i });
    fireEvent.click(matchesTab);

    const rejectBtn = await screen.findByRole('button', { name: 'Reject' });
    fireEvent.click(rejectBtn);

    expect(await screen.findByText('Reject Match Candidate')).toBeInTheDocument();

    const submitReject = screen.getByRole('button', { name: 'Reject Candidate' });
    fireEvent.click(submitReject);

    // Rejection reason required
    expect(
      await screen.findByText(/An explicit auditable reason is required/i),
    ).toBeInTheDocument();

    const reasonInput = screen.getByLabelText(/Rejection Reason/i);
    fireEvent.change(reasonInput, { target: { value: 'Unrelated vendor invoice' } });

    fireEvent.click(submitReject);

    await waitFor(() => {
      expect(financialService.rejectMatch).toHaveBeenCalledWith(
        'match-sugg-101',
        'Unrelated vendor invoice',
      );
    });
  });

  it('switches to Engine Rules & Parameters tab and displays deterministic rules', async () => {
    renderComponent();

    const paramsTab = await screen.findByRole('button', { name: /Engine Rules & Parameters/i });
    fireEvent.click(paramsTab);

    expect(await screen.findByText('Deterministic Engine Rules Specification')).toBeInTheDocument();
    expect(await screen.findByText(/Strict Integer Arithmetic/i)).toBeInTheDocument();
    expect(await screen.findByText(/Cross-Account Direction Inversion/i)).toBeInTheDocument();
  });
});
