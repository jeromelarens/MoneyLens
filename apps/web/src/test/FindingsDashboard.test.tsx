import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { FindingsDashboard } from '../components/FindingsDashboard';
import * as financialServiceModule from '../services/financial.service';
import type {
  FinancialFinding,
  FinancialExposureSummary,
  FindingListResponse,
  AiExplanation,
} from '@moneylens/shared';

describe('FindingsDashboard Component Suite', () => {
  let queryClient: QueryClient;

  const mockSummary: FinancialExposureSummary = {
    byCurrency: {
      USD: {
        currency: 'USD',
        potentialExposureMinor: 15000,
        confirmedExposureMinor: 5000,
        openFindingCount: 2,
        underReviewFindingCount: 1,
        confirmedFindingCount: 1,
        dismissedFindingCount: 0,
        resolvedFindingCount: 0,
      },
    },
    totalFindingsCount: 4,
    highSeverityCount: 2,
    mediumSeverityCount: 2,
    lowSeverityCount: 0,
    lastDetectionRunAt: '2026-03-15T12:00:00.000Z',
  };

  const mockFinding: FinancialFinding = {
    id: 'finding-101',
    organizationId: 'org-test',
    findingType: 'potential_duplicate_payment',
    status: 'open',
    severity: 'high',
    title: 'Potential Duplicate Payment (USD 75.00)',
    summary: 'Two debit transactions of USD 75.00 were posted within 1 day.',
    primaryTransactionIds: ['tx-1'],
    relatedTransactionIds: ['tx-2'],
    evidence: {
      ruleId: 'RULE_DUP_001',
      ruleVersion: 'v1.0.0',
      reason: 'Matching reference INV-7711 within 1 day',
      primaryTransactionIds: ['tx-1'],
      relatedTransactionIds: ['tx-2'],
      amountsMinor: [7500, 7500],
      currency: 'USD',
      dateDifferenceDays: 1,
      recommendedChecks: ['Check merchant receipt.'],
      dataQualityLimitations: ['May be separate legitimate orders.'],
    },
    estimatedAmountMinor: 7500,
    currency: 'USD',
    ruleId: 'RULE_DUP_001',
    ruleVersion: 'v1.0.0',
    detectedAt: '2026-03-15T10:00:00.000Z',
    lastEvaluatedAt: '2026-03-15T10:00:00.000Z',
    fingerprint: 'fp-101',
    createdAt: '2026-03-15T10:00:00.000Z',
    updatedAt: '2026-03-15T10:00:00.000Z',
  };

  const mockListResponse: FindingListResponse = {
    items: [mockFinding],
    pagination: {
      page: 1,
      limit: 20,
      totalItems: 1,
      totalPages: 1,
    },
  };

  const mockAiExplanation: AiExplanation = {
    findingId: 'finding-101',
    organizationId: 'org-test',
    summary: 'Two identical payments of USD 75.00 were processed for ACME WHOLESALE.',
    whyItWasFlagged: 'Invoice INV-7711 was billed twice within 24 hours.',
    evidenceSummary:
      'Primary tx-1 and secondary tx-2 share identical minor unit amounts and references.',
    recommendedChecks: ['Verify invoice with ACME accounts payable.'],
    limitations: ['Batch imports from multiple accounts can cause temporary apparent duplicates.'],
    generatedAt: '2026-03-15T10:05:00.000Z',
    provider: 'deterministic_rule_engine',
    model: 'rule-explainer-v1',
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

    vi.spyOn(financialServiceModule.financialService, 'getFindingsSummary').mockResolvedValue(
      mockSummary,
    );

    vi.spyOn(financialServiceModule.financialService, 'getFindings').mockResolvedValue(
      mockListResponse,
    );

    vi.spyOn(financialServiceModule.financialService, 'getFindingDetail').mockResolvedValue({
      finding: mockFinding,
      transactions: [
        {
          id: 'tx-1',
          organizationId: 'org-test',
          accountId: 'acc-1',
          importJobId: 'job-1',
          date: '2026-03-14T10:00:00.000Z',
          description: 'ACME WHOLESALE PRODUCTS',
          direction: 'debit',
          amountMinor: 7500,
          amountDecimal: '75.00',
          currency: 'USD',
          sourceReference: 'INV-7711',
          fingerprint: 'fp-tx-1',
          createdAt: '2026-03-14T10:00:00.000Z',
          updatedAt: '2026-03-14T10:00:00.000Z',
        },
      ],
      history: [
        {
          id: 'hist-1',
          findingId: 'finding-101',
          organizationId: 'org-test',
          action: 'created',
          newStatus: 'open',
          notes: 'Finding detected by rule RULE_DUP_001',
          createdAt: '2026-03-15T10:00:00.000Z',
        },
      ],
    });

    vi.spyOn(financialServiceModule.financialService, 'explainFinding').mockResolvedValue(
      mockAiExplanation,
    );

    vi.spyOn(financialServiceModule.financialService, 'triggerDetectionRun').mockResolvedValue({
      id: 'run-101',
      organizationId: 'org-test',
      ruleVersion: 'v1.0.0',
      status: 'completed',
      startedAt: '2026-03-15T12:00:00.000Z',
      completedAt: '2026-03-15T12:00:05.000Z',
      transactionsEvaluated: 150,
      findingsCreated: 2,
      findingsUpdated: 1,
      findingsUnchanged: 1,
      errors: [],
      createdAt: '2026-03-15T12:00:00.000Z',
      updatedAt: '2026-03-15T12:00:05.000Z',
    });
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <FindingsDashboard />
        </QueryClientProvider>
      </MemoryRouter>,
    );
  };

  it('renders dashboard header, scan button, and currency-segregated exposure cards', async () => {
    renderComponent();

    expect(screen.getByText(/Financial Findings & Exposure Radar/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run Leakage Scan/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Potential Exposure by Currency/i)).toBeInTheDocument();
      expect(screen.getByText('USD 150.00')).toBeInTheDocument();
      expect(screen.getByText('USD 50.00')).toBeInTheDocument();
    });
  });

  it('renders findings table with severity badge, title, and inspect button', async () => {
    renderComponent();

    const inspectBtns = await screen.findAllByRole('button', { name: /Inspect/i });
    expect(inspectBtns[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Potential Duplicate Payment/i).length).toBeGreaterThanOrEqual(1);
  });

  it('opens detail modal upon clicking Inspect, showing evidence and transactions', async () => {
    renderComponent();

    const inspectBtns = await screen.findAllByRole('button', { name: /Inspect/i });
    fireEvent.click(inspectBtns[0]!);

    await waitFor(() => {
      expect(screen.getByText(/Detection Evidence/i)).toBeInTheDocument();
      expect(screen.getByText(/Matching reference INV-7711 within 1 day/i)).toBeInTheDocument();
      expect(screen.getByText(/ACME WHOLESALE PRODUCTS/i)).toBeInTheDocument();
      expect(screen.getByText(/Audit & Decision History/i)).toBeInTheDocument();
    });
  });

  it('allows user to review finding and triggers reviewFinding mutation', async () => {
    const reviewSpy = vi
      .spyOn(financialServiceModule.financialService, 'reviewFinding')
      .mockResolvedValue({
        ...mockFinding,
        status: 'under_review',
      });

    renderComponent();

    const inspectBtns = await screen.findAllByRole('button', { name: /Inspect/i });
    fireEvent.click(inspectBtns[0]!);

    const startReviewBtn = await screen.findByRole('button', { name: /Start Review/i });
    fireEvent.click(startReviewBtn);

    const submitBtn = await screen.findByRole('button', { name: /Submit Decision/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(reviewSpy).toHaveBeenCalledWith('finding-101', 'open_review', undefined, undefined);
    });
  });

  it('requires a dismissal reason when dismissing a finding', async () => {
    renderComponent();

    const inspectBtns = await screen.findAllByRole('button', { name: /Inspect/i });
    fireEvent.click(inspectBtns[0]!);

    const dismissBtn = await screen.findByRole('button', { name: /Dismiss Finding/i });
    fireEvent.click(dismissBtn);

    const submitBtn = await screen.findByRole('button', { name: /Submit Decision/i });
    fireEvent.click(submitBtn);

    expect(screen.getByText(/A dismissal reason is required/i)).toBeInTheDocument();
  });

  it('triggers explainFinding mutation and displays AI summary and recommendations', async () => {
    renderComponent();

    const inspectBtns = await screen.findAllByRole('button', { name: /Inspect/i });
    fireEvent.click(inspectBtns[0]!);

    const explainBtn = await screen.findByRole('button', { name: /Explain Finding/i });
    fireEvent.click(explainBtn);

    await waitFor(() => {
      expect(screen.getByText(/Two identical payments of USD 75.00/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Invoice INV-7711 was billed twice within 24 hours/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/Verify invoice with ACME accounts payable/i)).toBeInTheDocument();
    });
  });

  it('allows opening scan modal and triggering bounded detection run', async () => {
    const triggerSpy = vi.spyOn(financialServiceModule.financialService, 'triggerDetectionRun');

    renderComponent();

    const scanBtn = screen.getByRole('button', { name: /Run Leakage Scan/i });
    fireEvent.click(scanBtn);

    expect(screen.getByText(/Run Financial Leakage Scan/i)).toBeInTheDocument();

    const startEvalBtn = screen.getByRole('button', { name: /Start Evaluation/i });
    fireEvent.click(startEvalBtn);

    await waitFor(() => {
      expect(triggerSpy).toHaveBeenCalled();
    });
  });

  it('handles empty findings and renders reset filters when filtered', async () => {
    vi.spyOn(financialServiceModule.financialService, 'getFindings').mockResolvedValue({
      items: [],
      pagination: {
        page: 1,
        limit: 20,
        totalItems: 0,
        totalPages: 0,
      },
    });

    renderComponent();

    // Select a status filter
    const underReviewTab = screen.getByRole('button', { name: /under review/i });
    fireEvent.click(underReviewTab);

    await waitFor(() => {
      expect(
        screen.getByText(/No findings match the current filter criteria/i),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Reset All Filters/i })).toBeInTheDocument();
    });

    // Reset filters
    const resetBtn = screen.getByRole('button', { name: /Reset All Filters/i });
    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Reset All Filters/i })).not.toBeInTheDocument();
    });
  });
});
