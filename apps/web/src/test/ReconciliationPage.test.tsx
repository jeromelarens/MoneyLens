import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ReconciliationPage } from '../components/ReconciliationPage';
import { financialService } from '../services/financial.service';
import type {
  FinancialAccount,
  ReconciliationRun,
  ReconciliationMatch,
  ReconciliationRunListResponse,
  ReconciliationMatchListResponse,
  ReconciliationAuditEventListResponse,
} from '@moneylens/shared';

describe('MoneyLens Reconciliation Workspace Page Component Suite', () => {
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

  const mockRunsResponse: ReconciliationRunListResponse = {
    items: [mockRun],
    pagination: {
      page: 1,
      limit: 20,
      totalItems: 1,
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
        descriptionSimilarity: 0.88,
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
        importJobId: 'job-001',
        date: '2026-09-15T12:00:00.000Z',
        description: 'Internal Transfer Out to Reserve',
        direction: 'debit',
        amountMinor: 500000,
        amountDecimal: '5000.00',
        currency: 'USD',
        sourceReference: 'TRF-5000',
        fingerprint: 'fp-src-001',
        createdAt: '2026-09-15T12:00:00.000Z',
        updatedAt: '2026-09-15T12:00:00.000Z',
      },
      candidateTransaction: {
        id: 'tx-cand-001',
        organizationId: 'org-test-enterprise',
        accountId: 'acc-savings-002',
        importJobId: 'job-002',
        date: '2026-09-15T12:00:00.000Z',
        description: 'Internal Transfer In from Checking',
        direction: 'credit',
        amountMinor: 500000,
        amountDecimal: '5000.00',
        currency: 'USD',
        sourceReference: 'TRF-5000',
        fingerprint: 'fp-cand-001',
        createdAt: '2026-09-15T12:00:00.000Z',
        updatedAt: '2026-09-15T12:00:00.000Z',
      },
    },
    {
      id: 'match-review-202',
      organizationId: 'org-test-enterprise',
      reconciliationRunId: 'run-alpha-12345678',
      sourceTransactionId: 'tx-src-002',
      candidateTransactionId: 'tx-cand-002',
      status: 'needs_review',
      matchMethod: 'amount_date_description',
      matchScore: 65,
      evidence: {
        amountMatch: true,
        currencyMatch: true,
        dateDifferenceDays: 2,
        directionCompatible: true,
        descriptionSimilarity: 0.55,
        competingCandidatesCount: 2,
      },
      amountDifferenceMinor: 0,
      dateDifferenceDays: 2,
      reviewReason: '2 competing candidate credits identified within ±3 day window',
      decisionSource: 'rule_engine',
      createdAt: '2026-10-20T10:00:02.000Z',
      updatedAt: '2026-10-20T10:00:02.000Z',
      sourceTransaction: {
        id: 'tx-src-002',
        organizationId: 'org-test-enterprise',
        accountId: 'acc-checking-001',
        importJobId: 'job-001',
        date: '2026-09-18T10:00:00.000Z',
        description: 'Acme Vendor Wire Debit',
        direction: 'debit',
        amountMinor: 125000,
        amountDecimal: '1250.00',
        currency: 'USD',
        sourceReference: null,
        fingerprint: 'fp-src-002',
        createdAt: '2026-09-18T10:00:00.000Z',
        updatedAt: '2026-09-18T10:00:00.000Z',
      },
      candidateTransaction: {
        id: 'tx-cand-002',
        organizationId: 'org-test-enterprise',
        accountId: 'acc-savings-002',
        importJobId: 'job-002',
        date: '2026-09-20T14:00:00.000Z',
        description: 'Acme Settlement Credit Candidate',
        direction: 'credit',
        amountMinor: 125000,
        amountDecimal: '1250.00',
        currency: 'USD',
        sourceReference: null,
        fingerprint: 'fp-cand-002',
        createdAt: '2026-09-20T14:00:00.000Z',
        updatedAt: '2026-09-20T14:00:00.000Z',
      },
    },
    {
      id: 'match-conf-303',
      organizationId: 'org-test-enterprise',
      reconciliationRunId: 'run-alpha-12345678',
      sourceTransactionId: 'tx-src-003',
      candidateTransactionId: 'tx-cand-003',
      status: 'confirmed',
      matchMethod: 'exact_reference',
      matchScore: 100,
      evidence: {
        amountMatch: true,
        currencyMatch: true,
        dateDifferenceDays: 0,
        directionCompatible: true,
        externalReferenceMatch: true,
      },
      amountDifferenceMinor: 0,
      dateDifferenceDays: 0,
      decisionSource: 'manual_review',
      confirmedAt: '2026-10-20T10:15:00.000Z',
      createdAt: '2026-10-20T10:00:03.000Z',
      updatedAt: '2026-10-20T10:15:00.000Z',
      sourceTransaction: {
        id: 'tx-src-003',
        organizationId: 'org-test-enterprise',
        accountId: 'acc-checking-001',
        importJobId: 'job-001',
        date: '2026-09-25T08:00:00.000Z',
        description: 'Payroll Direct Deposit Settlement',
        direction: 'debit',
        amountMinor: 850000,
        amountDecimal: '8500.00',
        currency: 'USD',
        sourceReference: 'PAYROLL-2026-09',
        fingerprint: 'fp-src-003',
        createdAt: '2026-09-25T08:00:00.000Z',
        updatedAt: '2026-10-20T10:15:00.000Z',
      },
      candidateTransaction: {
        id: 'tx-cand-003',
        organizationId: 'org-test-enterprise',
        accountId: 'acc-savings-002',
        importJobId: 'job-002',
        date: '2026-09-25T08:00:00.000Z',
        description: 'Payroll Funding Credit',
        direction: 'credit',
        amountMinor: 850000,
        amountDecimal: '8500.00',
        currency: 'USD',
        sourceReference: 'PAYROLL-2026-09',
        fingerprint: 'fp-cand-003',
        createdAt: '2026-09-25T08:00:00.000Z',
        updatedAt: '2026-10-20T10:15:00.000Z',
      },
    },
  ];

  const mockMatchesResponse: ReconciliationMatchListResponse = {
    items: mockMatches,
    pagination: {
      page: 1,
      limit: 25,
      totalItems: 3,
      totalPages: 1,
    },
  };

  const mockAuditEvents: ReconciliationAuditEventListResponse = {
    items: [
      {
        id: 'audit-1',
        organizationId: 'org-test-enterprise',
        reconciliationRunId: 'run-alpha-12345678',
        action: 'run_started',
        details: { totalSource: 120, tolerance: 3 },
        timestamp: '2026-10-20T10:00:00.000Z',
      },
      {
        id: 'audit-2',
        organizationId: 'org-test-enterprise',
        reconciliationRunId: 'run-alpha-12345678',
        action: 'matches_generated',
        details: { generated: 85, review: 15 },
        timestamp: '2026-10-20T10:00:03.000Z',
      },
      {
        id: 'audit-3',
        organizationId: 'org-test-enterprise',
        reconciliationRunId: 'run-alpha-12345678',
        action: 'run_completed',
        details: { matchedCount: 85 },
        timestamp: '2026-10-20T10:00:05.000Z',
      },
    ],
    pagination: {
      page: 1,
      limit: 50,
      totalItems: 3,
      totalPages: 1,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('ml_organization_name', 'Global Retail Enterprises');
    localStorage.setItem('ml_organization_currency', 'USD');
    localStorage.setItem('ml_organization_id', 'org-test-enterprise');

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

    vi.spyOn(financialService, 'getAccounts').mockResolvedValue({ items: mockAccounts });
    vi.spyOn(financialService, 'getReconciliationRuns').mockResolvedValue(mockRunsResponse);
    vi.spyOn(financialService, 'getReconciliationMatches').mockResolvedValue(mockMatchesResponse);
    vi.spyOn(financialService, 'getReconciliationAuditTrail').mockResolvedValue(mockAuditEvents);
    vi.spyOn(financialService, 'createReconciliationRun').mockResolvedValue(mockRun);
    vi.spyOn(financialService, 'confirmMatch').mockResolvedValue({
      ...(mockMatches[0] as ReconciliationMatch),
      status: 'confirmed',
      confirmedAt: '2026-10-22T10:00:00.000Z',
    });
    vi.spyOn(financialService, 'rejectMatch').mockResolvedValue({
      ...(mockMatches[1] as ReconciliationMatch),
      status: 'rejected',
      rejectionReason: 'Invalid transfer pair',
      rejectedAt: '2026-10-22T10:00:00.000Z',
    });
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/reconciliation']}>
          <ReconciliationPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

  it('renders page header, brand identity, and dual-entry operational safeguard banner', async () => {
    renderComponent();

    expect(screen.getByRole('heading', { name: /Reconciliation Workspace/i })).toBeInTheDocument();
    expect(screen.getByText(/Transaction Matching/i)).toBeInTheDocument();
    expect(screen.getByText(/Dual-Entry Verification/i)).toBeInTheDocument();
    expect(screen.getByText(/Global Retail Enterprises/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Deterministic matching engine with auditable resolution/i),
    ).toBeInTheDocument();
  });

  it('renders run context bar with run selector dropdown and active run metadata', async () => {
    renderComponent();

    expect(await screen.findByLabelText(/Reconciliation Run:/i)).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText(/Tolerance:/i)).toBeInTheDocument();
    expect(screen.getByText('±3d')).toBeInTheDocument();
  });

  it('renders reconciliation summary metrics strip with accurate integer counts', async () => {
    renderComponent();

    expect(await screen.findByText('120')).toBeInTheDocument(); // Analyzed
    expect(screen.getByText('85')).toBeInTheDocument(); // Suggested Matches
    expect(screen.getByText('15')).toBeInTheDocument(); // Needs Review
    expect(screen.getByText('20')).toBeInTheDocument(); // Unmatched Records
  });

  it('renders candidate ledger with source transaction, direction indicator, and candidate', async () => {
    renderComponent();

    expect(await screen.findByText('Internal Transfer Out to Reserve')).toBeInTheDocument();
    expect(screen.getByText('Internal Transfer In from Checking')).toBeInTheDocument();
    expect(screen.getAllByText('$ 5,000.00').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Score: 95%')).toBeInTheDocument();
    expect(screen.getAllByText('Transfer Match').length).toBeGreaterThanOrEqual(1);
  });

  it('filters candidate matches by status tabs (Needs Review, Suggested, Confirmed)', async () => {
    renderComponent();

    expect(await screen.findByText('Internal Transfer Out to Reserve')).toBeInTheDocument();

    const needsReviewTab = screen.getByRole('button', { name: /Needs Review/i });
    fireEvent.click(needsReviewTab);

    expect(financialService.getReconciliationMatches).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'needs_review',
      }),
    );
  });

  it('opens match inspection modal and renders detailed evidence breakdown', async () => {
    renderComponent();

    const inspectButtons = await screen.findAllByRole('button', { name: /Inspect Match/i });
    fireEvent.click(inspectButtons[0]!);

    expect(await screen.findByText(/Dual-Entry Pair Verification/i)).toBeInTheDocument();
    expect(screen.getByText(/Matching Evidence Breakdown/i)).toBeInTheDocument();
    expect(screen.getByText('✓ Exact Match')).toBeInTheDocument();
    expect(screen.getByText('✓ Dual Entry')).toBeInTheDocument();
  });

  it('confirms a suggested match, submits optional notes, and triggers mutation', async () => {
    renderComponent();

    const confirmButtons = await screen.findAllByRole('button', { name: /^Confirm$/i });
    fireEvent.click(confirmButtons[0]!);

    expect(await screen.findByText(/Confirm Reconciliation Match/i)).toBeInTheDocument();
    const notesInput = screen.getByPlaceholderText(/Verified wire reference/i);
    fireEvent.change(notesInput, { target: { value: 'Confirmed via statement' } });

    const submitConfirmBtn = screen.getByRole('button', { name: /Confirm Match/i });
    fireEvent.click(submitConfirmBtn);

    await waitFor(() => {
      expect(financialService.confirmMatch).toHaveBeenCalledWith(
        'match-sugg-101',
        'Confirmed via statement',
      );
    });
  });

  it('rejects a match requiring an explicit auditable reason', async () => {
    renderComponent();

    const rejectButtons = await screen.findAllByRole('button', { name: /^Reject$/i });
    fireEvent.click(rejectButtons[0]!);

    expect(await screen.findByText(/Reject Candidate Match/i)).toBeInTheDocument();
    const reasonTextarea = screen.getByPlaceholderText(/Unrelated vendor invoice/i);
    const submitRejectBtn = screen.getByRole('button', { name: /Confirm Rejection/i });

    // Disabled when empty
    expect(submitRejectBtn).toBeDisabled();

    fireEvent.change(reasonTextarea, { target: { value: 'Incompatible counterparty' } });
    expect(submitRejectBtn).not.toBeDisabled();

    fireEvent.click(submitRejectBtn);

    await waitFor(() => {
      expect(financialService.rejectMatch).toHaveBeenCalledWith(
        'match-sugg-101',
        'Incompatible counterparty',
      );
    });
  });

  it('opens Run Reconciliation modal and handles submission', async () => {
    renderComponent();

    const runButtons = await screen.findAllByRole('button', { name: /Run Reconciliation/i });
    fireEvent.click(runButtons[0]!);

    expect(await screen.findByText(/Run Reconciliation Engine/i)).toBeInTheDocument();
    const startRunBtn = screen.getByRole('button', { name: /Start Run/i });
    fireEvent.click(startRunBtn);

    await waitFor(() => {
      expect(financialService.createReconciliationRun).toHaveBeenCalledWith(
        expect.objectContaining({
          dateToleranceDays: 3,
        }),
        expect.anything(),
      );
    });
  });

  it('opens and renders Reconciliation Audit Trail drawer', async () => {
    renderComponent();

    // Wait for active run to load first so button is enabled
    expect(await screen.findByLabelText(/Reconciliation Run:/i)).toBeInTheDocument();

    const auditBtn = screen.getByRole('button', { name: /Audit Trail/i });
    expect(auditBtn).not.toBeDisabled();
    fireEvent.click(auditBtn);

    expect(await screen.findByText(/Reconciliation Audit Trail/i)).toBeInTheDocument();
    expect(await screen.findByText(/RUN STARTED/i)).toBeInTheDocument();
    expect(screen.getByText(/MATCHES GENERATED/i)).toBeInTheDocument();
  });
});
