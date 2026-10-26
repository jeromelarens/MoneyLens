import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { FindingDetailsPage } from '../components/FindingDetailsPage';
import * as financialServiceModule from '../services/financial.service';
import type { FinancialFinding, AiExplanation, FinancialAccount } from '@moneylens/shared';

describe('MoneyLens Finding Details & Evidence Page Component Suite', () => {
  let queryClient: QueryClient;

  const mockFinding: FinancialFinding = {
    id: 'finding-corp-202',
    organizationId: 'org-test-enterprise',
    findingType: 'potential_duplicate_payment',
    status: 'open',
    severity: 'high',
    title: 'Duplicate Payment Detected — Acme Cloud Services (USD 120.00)',
    summary: 'Two identical debit transactions of USD 120.00 were posted within 24 hours.',
    primaryTransactionIds: ['tx-alpha-1'],
    relatedTransactionIds: ['tx-alpha-2'],
    evidence: {
      ruleId: 'RULE_DUP_001',
      ruleVersion: 'v1.2.0',
      reason: 'Matching reference INV-9921 within 1 day',
      primaryTransactionIds: ['tx-alpha-1'],
      relatedTransactionIds: ['tx-alpha-2'],
      amountsMinor: [12000, 12000],
      currency: 'USD',
      dateDifferenceDays: 1,
      percentageChange: 0,
      historicalComparisonPeriod: {
        startDate: '2026-01-01',
        endDate: '2026-03-01',
        observationCount: 8,
        baselineAmountMinor: 12000,
        cadenceDays: 30,
      },
      recommendedChecks: ['Review merchant invoice INV-9921.', 'Verify bank clearance status.'],
      dataQualityLimitations: ['Different payment rails may cause apparent double entries.'],
    },
    estimatedAmountMinor: 12000,
    currency: 'USD',
    ruleId: 'RULE_DUP_001',
    ruleVersion: 'v1.2.0',
    detectedAt: '2026-03-15T09:30:00.000Z',
    lastEvaluatedAt: '2026-03-15T09:30:00.000Z',
    fingerprint: 'fp-dup-corp-202',
    createdAt: '2026-03-15T09:30:00.000Z',
    updatedAt: '2026-03-15T09:30:00.000Z',
  };

  const mockTransactions = [
    {
      id: 'tx-alpha-1',
      organizationId: 'org-test-enterprise',
      accountId: 'acc-chase-101',
      importJobId: 'job-stmt-501',
      date: '2026-03-14T10:00:00.000Z',
      description: 'ACME CLOUD CORP SUBSCRIPTION',
      direction: 'debit' as const,
      amountMinor: 12000,
      amountDecimal: '120.00',
      currency: 'USD',
      sourceReference: 'INV-9921',
      fingerprint: 'fp-tx-1',
      createdAt: '2026-03-14T10:00:00.000Z',
      updatedAt: '2026-03-14T10:00:00.000Z',
    },
    {
      id: 'tx-alpha-2',
      organizationId: 'org-test-enterprise',
      accountId: 'acc-chase-101',
      importJobId: 'job-stmt-502',
      date: '2026-03-15T08:15:00.000Z',
      description: 'ACME CLOUD CORP SUBSCRIPTION',
      direction: 'debit' as const,
      amountMinor: 12000,
      amountDecimal: '120.00',
      currency: 'USD',
      sourceReference: 'INV-9921',
      fingerprint: 'fp-tx-2',
      createdAt: '2026-03-15T08:15:00.000Z',
      updatedAt: '2026-03-15T08:15:00.000Z',
    },
  ];

  const mockHistory = [
    {
      id: 'hist-corp-1',
      findingId: 'finding-corp-202',
      organizationId: 'org-test-enterprise',
      action: 'created' as const,
      newStatus: 'open' as const,
      notes: 'Initial detection run generated finding',
      createdAt: '2026-03-15T09:30:00.000Z',
      actorId: 'detection_engine',
    },
  ];

  const mockAccounts: FinancialAccount[] = [
    {
      id: 'acc-chase-101',
      organizationId: 'org-test-enterprise',
      name: 'Primary Operating Checking',
      type: 'checking',
      currency: 'USD',
      institutionName: 'JPMorgan Chase',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ];

  const mockAiExplanation: AiExplanation = {
    findingId: 'finding-corp-202',
    organizationId: 'org-test-enterprise',
    summary: 'Duplicate billing of USD 120.00 identified for ACME Cloud Corp.',
    whyItWasFlagged:
      'Invoice INV-9921 was billed twice within a 24-hour window from the same account.',
    evidenceSummary: 'Two debits of identical amounts and references occurred on consecutive days.',
    recommendedChecks: [
      'Confirm with vendor whether double charge was automatic.',
      'Request refund or credit note if confirmed.',
    ],
    limitations: ['May be separate billing cycles if monthly transition occurred.'],
    generatedAt: '2026-03-15T09:35:00.000Z',
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

    vi.spyOn(financialServiceModule.financialService, 'getFindingDetail').mockResolvedValue({
      finding: mockFinding,
      transactions: mockTransactions,
      history: mockHistory,
    });

    vi.spyOn(financialServiceModule.financialService, 'getAccounts').mockResolvedValue({
      items: mockAccounts,
    });

    vi.spyOn(financialServiceModule.financialService, 'explainFinding').mockResolvedValue(
      mockAiExplanation,
    );
  });

  const renderComponent = (initialFindingId = 'finding-corp-202') => {
    return render(
      <MemoryRouter initialEntries={[`/findings/${initialFindingId}`]}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route path="/findings/:findingId" element={<FindingDetailsPage />} />
            <Route path="/findings" element={<div>Findings Dashboard Mock</div>} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );
  };

  it('renders page header, brand identity, rule badge, and finding title', async () => {
    renderComponent();

    expect(
      await screen.findByText(/Duplicate Payment Detected — Acme Cloud Services/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Rule RULE_DUP_001 \(v1.2.0\)/i)).toBeInTheDocument();
    expect(screen.getByText(/HIGH Severity/i)).toBeInTheDocument();
    expect(screen.getByText(/Status: open/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Evidence Verification & Explainability Separation/i),
    ).toBeInTheDocument();
  });

  it('renders participating ledger transactions table with primary vs related badges', async () => {
    renderComponent();

    expect(await screen.findByText(/Participating Ledger Transactions/i)).toBeInTheDocument();
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('Related')).toBeInTheDocument();
    expect(screen.getAllByText('ACME CLOUD CORP SUBSCRIPTION').length).toBe(2);
    expect(screen.getAllByText('USD 120.00').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Primary Operating Checking').length).toBe(2);
  });

  it('renders deterministic detection criteria, date difference, and historical baseline', async () => {
    renderComponent();

    expect(await screen.findByText(/Deterministic Detection Criteria/i)).toBeInTheDocument();
    expect(screen.getByText(/Matching reference INV-9921 within 1 day/i)).toBeInTheDocument();
    expect(screen.getByText(/1 day\(s\)/i)).toBeInTheDocument();
    expect(screen.getByText(/8 entries/i)).toBeInTheDocument();
    expect(screen.getByText(/Review merchant invoice INV-9921/i)).toBeInTheDocument();
  });

  it('renders documented financial impact card with integer minor units', async () => {
    renderComponent();

    expect(await screen.findByText(/Documented Exposure/i)).toBeInTheDocument();
    expect(screen.getByText(/Potential Exposure \(Unconfirmed Risk\)/i)).toBeInTheDocument();
    expect(screen.getByText(/12000 minor units/i)).toBeInTheDocument();
  });

  it('generates and displays explainable AI analysis upon button click', async () => {
    const explainSpy = vi.spyOn(financialServiceModule.financialService, 'explainFinding');

    renderComponent();

    const explainBtn = await screen.findByRole('button', { name: /Explain Finding/i });
    fireEvent.click(explainBtn);

    await waitFor(() => {
      expect(explainSpy).toHaveBeenCalledWith('finding-corp-202', true);
      expect(
        screen.getByText(/Duplicate billing of USD 120.00 identified for ACME Cloud Corp/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Confirm with vendor whether double charge was automatic/i),
      ).toBeInTheDocument();
    });
  });

  it('executes Start Review lifecycle transition workflow', async () => {
    const reviewSpy = vi
      .spyOn(financialServiceModule.financialService, 'reviewFinding')
      .mockResolvedValue({
        ...mockFinding,
        status: 'under_review',
      });

    renderComponent();

    const startReviewBtn = await screen.findByRole('button', { name: /Start Review/i });
    fireEvent.click(startReviewBtn);

    expect(screen.getByText(/Confirming: open review/i)).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Submit Decision/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(reviewSpy).toHaveBeenCalledWith(
        'finding-corp-202',
        'open_review',
        undefined,
        undefined,
      );
    });
  });

  it('requires a dismissal reason when dismissing a finding', async () => {
    renderComponent();

    // Finding is open, click Dismiss Finding
    const dismissBtn = await screen.findByRole('button', { name: /Dismiss Finding/i });
    fireEvent.click(dismissBtn);

    expect(screen.getByText(/Confirming: dismiss/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Legitimate authorized bulk order/i)).toBeInTheDocument();

    // Click submit without entering a reason
    const submitBtn = screen.getByRole('button', { name: /Submit Decision/i });
    fireEvent.click(submitBtn);

    expect(
      screen.getByText(/A dismissal reason is required when dismissing a finding/i),
    ).toBeInTheDocument();

    // Enter a valid reason
    const input = screen.getByPlaceholderText(/Legitimate authorized bulk order/i);
    fireEvent.change(input, { target: { value: 'Authorized dual seat renewal' } });

    const reviewSpy = vi
      .spyOn(financialServiceModule.financialService, 'reviewFinding')
      .mockResolvedValue({
        ...mockFinding,
        status: 'dismissed',
        dismissalReason: 'Authorized dual seat renewal',
      });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(reviewSpy).toHaveBeenCalledWith(
        'finding-corp-202',
        'dismiss',
        'Authorized dual seat renewal',
        undefined,
      );
    });
  });

  it('renders append-only audit trail timeline with past events', async () => {
    renderComponent();

    expect(await screen.findByText(/Audit & Decision History/i)).toBeInTheDocument();
    expect(screen.getByText(/Initial detection run generated finding/i)).toBeInTheDocument();
    expect(screen.getByText(/Actor: detection_engine/i)).toBeInTheDocument();
  });

  it('handles finding not found error state gracefully with retry control', async () => {
    vi.spyOn(financialServiceModule.financialService, 'getFindingDetail').mockRejectedValue(
      new Error('Financial finding not found'),
    );

    renderComponent('non-existent-finding-id');

    expect(await screen.findByText(/Financial Finding Record Unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/Financial finding not found/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry Request/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Return to Findings Dashboard/i })).toBeInTheDocument();
  });

  it('handles copying finding ID to clipboard', async () => {
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextSpy,
      },
    });

    renderComponent();

    const copyBtn = await screen.findByRole('button', { name: /Copy ID/i });
    fireEvent.click(copyBtn);

    expect(writeTextSpy).toHaveBeenCalledWith('finding-corp-202');
  });
});
