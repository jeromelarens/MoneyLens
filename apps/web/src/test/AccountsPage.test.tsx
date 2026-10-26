import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AccountsPage } from '../components/AccountsPage';
import { financialService } from '../services/financial.service';
import type { FinancialAccount, TransactionListResponse } from '@moneylens/shared';

describe('MoneyLens Financial Accounts Page Component Suite', () => {
  let queryClient: QueryClient;

  const mockAccounts: FinancialAccount[] = [
    {
      id: 'acc-1111-2222',
      organizationId: 'org-test-retail',
      name: 'Primary Operating Checking',
      type: 'checking',
      currency: 'USD',
      institutionName: 'JPMorgan Chase',
      createdAt: '2026-09-01T08:00:00.000Z',
      updatedAt: '2026-10-20T10:00:00.000Z',
    },
    {
      id: 'acc-3333-4444',
      organizationId: 'org-test-retail',
      name: 'Corporate Rewards Platinum',
      type: 'credit_card',
      currency: 'USD',
      institutionName: 'American Express',
      createdAt: '2026-09-15T08:00:00.000Z',
      updatedAt: '2026-10-21T10:00:00.000Z',
    },
    {
      id: 'acc-5555-6666',
      organizationId: 'org-test-retail',
      name: 'European Treasury Reserve',
      type: 'savings',
      currency: 'EUR',
      institutionName: 'BNP Paribas',
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-22T10:00:00.000Z',
    },
  ];

  const mockTxResponse: TransactionListResponse = {
    items: [],
    pagination: {
      page: 1,
      limit: 1,
      totalItems: 42,
      totalPages: 42,
    },
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    vi.clearAllMocks();

    localStorage.setItem('ml_organization_name', 'Acme Wholesale Corp');
    localStorage.setItem('ml_organization_currency', 'USD');
    localStorage.setItem('ml_organization_id', 'org-test-retail');

    // Clipboard mock
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockImplementation(() => Promise.resolve()),
      },
    });
  });

  const renderAccountsPage = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/accounts']}>
          <AccountsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it('renders page header, brand identity, and truth-in-accounting banner', async () => {
    vi.spyOn(financialService, 'getAccounts').mockResolvedValue({ items: mockAccounts });
    vi.spyOn(financialService, 'getTransactions').mockResolvedValue(mockTxResponse);

    renderAccountsPage();

    // Check title and brand
    expect(await screen.findByText('Financial Accounts')).toBeInTheDocument();
    expect(screen.getByText('Acme Wholesale Corp')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();

    // Truth-in-accounting integrity banner
    expect(screen.getByText('Statement-driven register integrity')).toBeInTheDocument();
    expect(
      screen.getByText(/running balances are not speculated or inferred/i),
    ).toBeInTheDocument();

    // Header actions
    expect(screen.getByRole('button', { name: /import statement/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh accounts/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open transaction ledger/i })).toBeInTheDocument();
  });

  it('renders summary metrics derived accurately without fabricated balances', async () => {
    vi.spyOn(financialService, 'getAccounts').mockResolvedValue({ items: mockAccounts });
    vi.spyOn(financialService, 'getTransactions').mockResolvedValue(mockTxResponse);

    renderAccountsPage();

    // 3 Configured Accounts and 3 Institutions
    const threes = await screen.findAllByText('3');
    expect(threes.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Configured Accounts')).toBeInTheDocument();
    expect(screen.getByText('Institutions')).toBeInTheDocument();

    // Operating currencies: USD, EUR
    expect(screen.getByText('USD, EUR')).toBeInTheDocument();

    // Total recorded txns: 42 * 3 = 126
    await waitFor(() => {
      expect(screen.getByText('126')).toBeInTheDocument();
    });
  });

  it('renders account rows with supported fields, badges, and ledger navigation links', async () => {
    vi.spyOn(financialService, 'getAccounts').mockResolvedValue({ items: mockAccounts });
    vi.spyOn(financialService, 'getTransactions').mockResolvedValue(mockTxResponse);

    renderAccountsPage();

    // Account names
    const names = await screen.findAllByText('Primary Operating Checking');
    expect(names.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Corporate Rewards Platinum').length).toBeGreaterThan(0);
    expect(screen.getAllByText('European Treasury Reserve').length).toBeGreaterThan(0);

    // Institutions
    expect(screen.getAllByText('JPMorgan Chase').length).toBeGreaterThan(0);
    expect(screen.getAllByText('American Express').length).toBeGreaterThan(0);
    expect(screen.getAllByText('BNP Paribas').length).toBeGreaterThan(0);

    // Account Type Badges (also present in filter dropdown options)
    expect(screen.getAllByText('Checking').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Credit Card').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Savings').length).toBeGreaterThanOrEqual(2);

    // Transaction records count
    const recordPills = await screen.findAllByText('42');
    expect(recordPills.length).toBeGreaterThanOrEqual(1);

    // Ledger navigation link for the specific account
    const ledgerLink = screen.getByTitle(`View transactions for ${mockAccounts[0]!.name}`);
    expect(ledgerLink).toHaveAttribute('href', '/transactions?accountId=acc-1111-2222');
  });

  it('filters accounts by search query and account type', async () => {
    vi.spyOn(financialService, 'getAccounts').mockResolvedValue({ items: mockAccounts });
    vi.spyOn(financialService, 'getTransactions').mockResolvedValue(mockTxResponse);

    renderAccountsPage();

    const initialAccounts = await screen.findAllByText('Primary Operating Checking');
    expect(initialAccounts.length).toBeGreaterThan(0);

    // Search by institution
    const searchInput = screen.getByLabelText('Search financial accounts');
    fireEvent.change(searchInput, { target: { value: 'American Express' } });

    expect(screen.getAllByText('Corporate Rewards Platinum').length).toBeGreaterThan(0);
    expect(screen.queryByText('Primary Operating Checking')).not.toBeInTheDocument();
    expect(screen.queryByText('European Treasury Reserve')).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getAllByText('Primary Operating Checking').length).toBeGreaterThan(0);

    // Filter by type: savings
    const typeSelect = screen.getByLabelText('Type:');
    fireEvent.change(typeSelect, { target: { value: 'savings' } });

    expect(screen.getAllByText('European Treasury Reserve').length).toBeGreaterThan(0);
    expect(screen.queryByText('Primary Operating Checking')).not.toBeInTheDocument();
    expect(screen.queryByText('Corporate Rewards Platinum')).not.toBeInTheDocument();

    // Reset filters
    const resetBtn = screen.getByRole('button', { name: /reset/i });
    fireEvent.click(resetBtn);

    expect(screen.getAllByText('Primary Operating Checking').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Corporate Rewards Platinum').length).toBeGreaterThan(0);
  });

  it('opens account details metadata modal when info button is clicked', async () => {
    vi.spyOn(financialService, 'getAccounts').mockResolvedValue({ items: mockAccounts });
    vi.spyOn(financialService, 'getTransactions').mockResolvedValue(mockTxResponse);

    renderAccountsPage();

    const inspectButtons = await screen.findAllByLabelText(/inspect metadata/i);
    expect(inspectButtons[0]).toBeDefined();
    fireEvent.click(inspectButtons[0]!);

    // Modal opens
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('acc-1111-2222')).toBeInTheDocument();
    expect(screen.getByText('org-test-retail')).toBeInTheDocument();

    // Copy Account UUID
    const copyBtn = screen.getByLabelText('Copy Account UUID');
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('acc-1111-2222');

    // Close button
    const closeBtn = screen.getByLabelText('Close details dialog');
    fireEvent.click(closeBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens import statement modal targeting specific account', async () => {
    vi.spyOn(financialService, 'getAccounts').mockResolvedValue({ items: mockAccounts });
    vi.spyOn(financialService, 'getTransactions').mockResolvedValue(mockTxResponse);

    renderAccountsPage();

    const importButtons = await screen.findAllByTitle('Import statement to this account');
    expect(importButtons[0]).toBeDefined();
    fireEvent.click(importButtons[0]!);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Import Transactions Statement' }),
    ).toBeInTheDocument();

    // Target account select has acc-1111-2222 selected
    const accountSelect = screen.getByLabelText('Target Account:') as HTMLSelectElement;
    expect(accountSelect.value).toBe('acc-1111-2222');
  });

  it('displays empty state when organization has zero accounts', async () => {
    vi.spyOn(financialService, 'getAccounts').mockResolvedValue({ items: [] });

    renderAccountsPage();

    expect(await screen.findByText('No Financial Accounts Found')).toBeInTheDocument();
    expect(screen.getByText(/when you import your first statement/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import statement file/i })).toBeInTheDocument();
  });

  it('handles error state gracefully with retry button', async () => {
    const errorSpy = vi
      .spyOn(financialService, 'getAccounts')
      .mockRejectedValue(new Error('Network connectivity lost'));

    renderAccountsPage();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Failed to load financial accounts')).toBeInTheDocument();
    expect(screen.getByText('Network connectivity lost')).toBeInTheDocument();

    // Click retry
    const retryBtn = screen.getByRole('button', { name: /retry request/i });
    errorSpy.mockResolvedValueOnce({ items: mockAccounts });
    fireEvent.click(retryBtn);

    const retriedAccounts = await screen.findAllByText('Primary Operating Checking');
    expect(retriedAccounts.length).toBeGreaterThan(0);
  });
});
