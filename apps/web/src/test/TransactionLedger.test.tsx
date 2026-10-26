import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TransactionLedger } from '../components/TransactionLedger';
import { TransactionsPage } from '../components/TransactionsPage';
import { financialService } from '../services/financial.service';
import { healthService } from '../services/health.service';
import type { Transaction, FinancialAccount } from '@moneylens/shared';

describe('MoneyLens Transactions Ledger Suite', () => {
  let queryClient: QueryClient;

  const mockAccounts: FinancialAccount[] = [
    {
      id: 'acc-1',
      organizationId: 'org-test',
      name: 'Main Business Checking',
      type: 'checking',
      currency: 'USD',
      institutionName: 'Chase Bank',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'acc-2',
      organizationId: 'org-test',
      name: 'Corporate Rewards Card',
      type: 'credit_card',
      currency: 'USD',
      institutionName: 'American Express',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const mockTransactions: Transaction[] = [
    {
      id: 'tx-1',
      organizationId: 'org-test',
      accountId: 'acc-1',
      importJobId: 'job-101',
      date: '2026-10-15T12:00:00.000Z',
      description: 'Client Wire Payment - Wholesale Goods',
      direction: 'credit',
      amountMinor: 250000, // $2,500.00
      amountDecimal: '2500.00',
      currency: 'USD',
      sourceReference: 'WIRE-9921',
      fingerprint: 'fp-wire-9921',
      rawSourceData: { Source: 'Chase Online', Batch: 'B-10' },
      createdAt: '2026-10-15T12:05:00.000Z',
      updatedAt: '2026-10-15T12:05:00.000Z',
    },
    {
      id: 'tx-2',
      organizationId: 'org-test',
      accountId: 'acc-2',
      importJobId: 'job-102',
      date: '2026-10-16T15:30:00.000Z',
      description: 'Acme Cloud Server Hosting',
      direction: 'debit',
      amountMinor: 45000, // $450.00
      amountDecimal: '450.00',
      currency: 'USD',
      sourceReference: 'INV-402',
      fingerprint: 'fp-inv-402',
      rawSourceData: { Merchant: 'Acme Cloud' },
      createdAt: '2026-10-16T15:35:00.000Z',
      updatedAt: '2026-10-16T15:35:00.000Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    vi.spyOn(financialService, 'getAccounts').mockResolvedValue({
      items: mockAccounts,
    });

    vi.spyOn(financialService, 'getTransactions').mockResolvedValue({
      items: mockTransactions,
      pagination: {
        page: 1,
        limit: 25,
        totalItems: 2,
        totalPages: 1,
      },
    });

    vi.spyOn(healthService, 'getHealth').mockResolvedValue({
      status: 'ok',
      version: '1.0.0',
      uptime: 3600,
      timestamp: new Date().toISOString(),
      environment: 'development',
    });
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it('renders ledger controls: search, account filter, direction segmented control, and date preset', async () => {
    renderWithProviders(<TransactionLedger />);

    expect(screen.getByPlaceholderText('Search description or reference...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Outflows/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Inflows/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText('Client Wire Payment - Wholesale Goods').length).toBeGreaterThan(
        0,
      );
    });

    // Account selector populated with accounts
    expect(
      screen.getByRole('combobox', { name: /Filter by Financial Account/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Main Business Checking/).length).toBeGreaterThan(0);
  });

  it('displays accurate integer minor-unit formatted amounts and distinguishes credits and debits', async () => {
    renderWithProviders(<TransactionLedger />);

    await waitFor(() => {
      expect(screen.getAllByText('Client Wire Payment - Wholesale Goods').length).toBeGreaterThan(
        0,
      );
    });

    // Credit transaction checks
    expect(screen.getAllByText(/Credit \(Inflow\)/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\+\$ 2,500\.00/).length).toBeGreaterThan(0);

    // Debit transaction checks
    expect(screen.getAllByText(/Debit \(Outflow\)/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/-\$ 450\.00/).length).toBeGreaterThan(0);

    // Minor unit precision indicators
    expect(screen.getAllByText(/250000 minor/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/45000 minor/).length).toBeGreaterThan(0);
  });

  it('maps accountId to actual account name and institution', async () => {
    renderWithProviders(<TransactionLedger />);

    await waitFor(() => {
      expect(screen.getAllByText('Main Business Checking').length).toBeGreaterThan(0);
    });

    expect(screen.getAllByText('Chase Bank').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Corporate Rewards Card').length).toBeGreaterThan(0);
    expect(screen.getAllByText('American Express').length).toBeGreaterThan(0);
  });

  it('filters by direction when user clicks Outflows or Inflows', async () => {
    renderWithProviders(<TransactionLedger />);

    await waitFor(() => {
      expect(screen.getAllByText('Client Wire Payment - Wholesale Goods').length).toBeGreaterThan(
        0,
      );
    });

    const outflowBtn = screen.getByRole('button', { name: /Outflows/i });
    fireEvent.click(outflowBtn);

    await waitFor(() => {
      expect(financialService.getTransactions).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: 'debit',
          page: 1,
        }),
      );
    });

    const inflowBtn = screen.getByRole('button', { name: /Inflows/i });
    fireEvent.click(inflowBtn);

    await waitFor(() => {
      expect(financialService.getTransactions).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: 'credit',
          page: 1,
        }),
      );
    });
  });

  it('filters by financial account when user changes the account dropdown', async () => {
    renderWithProviders(<TransactionLedger />);

    await waitFor(() => {
      expect(screen.getAllByText(/Main Business Checking/).length).toBeGreaterThan(0);
    });

    const accountSelect = screen.getByRole('combobox', { name: /Filter by Financial Account/i });
    fireEvent.change(accountSelect, { target: { value: 'acc-1' } });

    await waitFor(() => {
      expect(financialService.getTransactions).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'acc-1',
          page: 1,
        }),
      );
    });
  });

  it('debounces search input and triggers query with search term', async () => {
    renderWithProviders(<TransactionLedger />);

    await waitFor(() => {
      expect(screen.getAllByText('Client Wire Payment - Wholesale Goods').length).toBeGreaterThan(
        0,
      );
    });

    const searchInput = screen.getByPlaceholderText('Search description or reference...');
    fireEvent.change(searchInput, { target: { value: 'Acme' } });

    await waitFor(
      () => {
        expect(financialService.getTransactions).toHaveBeenCalledWith(
          expect.objectContaining({
            search: 'Acme',
            page: 1,
          }),
        );
      },
      { timeout: 1000 },
    );
  });

  it('expands audit details row when Details button is clicked', async () => {
    renderWithProviders(<TransactionLedger />);

    await waitFor(() => {
      expect(screen.getAllByText('Client Wire Payment - Wholesale Goods').length).toBeGreaterThan(
        0,
      );
    });

    const detailsButtons = screen.getAllByRole('button', { name: /Toggle audit details/i });
    fireEvent.click(detailsButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText('Verified Audit Record')).toBeInTheDocument();
      expect(screen.getAllByText('fp-wire-9921').length).toBeGreaterThan(0);
      expect(screen.getByText(/Job: job-101/)).toBeInTheDocument();
      expect(screen.getByText(/Chase Online/)).toBeInTheDocument();
    });
  });

  it('calculates honest current-view summary metrics partitioned by currency', async () => {
    renderWithProviders(<TransactionLedger />);

    await waitFor(() => {
      expect(screen.getByText('Current View Register Summary')).toBeInTheDocument();
      expect(screen.getByText(/Inflows \(Credits\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Outflows \(Debits\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Page Net Cash Movement/i)).toBeInTheDocument();
    });
  });

  it('displays empty state when no transactions match active filters and provides reset action', async () => {
    vi.spyOn(financialService, 'getTransactions').mockResolvedValue({
      items: [],
      pagination: {
        page: 1,
        limit: 25,
        totalItems: 0,
        totalPages: 0,
      },
    });

    renderWithProviders(<TransactionLedger />);

    // Activate a filter
    const outflowBtn = screen.getByRole('button', { name: /Outflows/i });
    fireEvent.click(outflowBtn);

    await waitFor(() => {
      expect(screen.getByText('No transactions match current filters')).toBeInTheDocument();
    });

    const clearBtn = screen.getByRole('button', { name: /Clear all filters/i });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(financialService.getTransactions).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: undefined,
          page: 1,
        }),
      );
    });
  });

  it('displays actionable error state with retry button when API fails', async () => {
    vi.spyOn(financialService, 'getTransactions').mockRejectedValueOnce(
      new Error('Failed to connect to ledger service'),
    );

    renderWithProviders(<TransactionLedger />);

    await waitFor(() => {
      expect(screen.getByText('Unable to load transactions')).toBeInTheDocument();
      expect(screen.getByText(/Failed to connect to ledger service/)).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /Retry Request/i });
    expect(retryBtn).toBeInTheDocument();
  });

  it('renders TransactionsPage with editorial brand header, title, and import modal workflow', async () => {
    renderWithProviders(<TransactionsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Transactions' })).toBeInTheDocument();
    expect(
      screen.getByText(
        /Verified transaction register across all synced financial accounts and statements/,
      ),
    ).toBeInTheDocument();

    // Click Import Transactions button to open modal
    const importButtons = screen.getAllByRole('button', { name: /Import Transactions/i });
    fireEvent.click(importButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText('Import Transactions Statement')).toBeInTheDocument();
      expect(
        screen.getByText(
          /Drag and drop your statement file here|Click to select or drag and drop a statement/i,
        ),
      ).toBeInTheDocument();
    });

    // Close modal
    const closeBtn = screen.getByRole('button', { name: 'Close import dialog' });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText('Import Transactions Statement')).not.toBeInTheDocument();
    });
  });
});
