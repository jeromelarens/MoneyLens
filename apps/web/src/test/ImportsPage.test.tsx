import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ImportsPage } from '../components/ImportsPage';
import { financialService } from '../services/financial.service';
import { ApiClientError } from '../lib/api-client';
import type {
  FinancialAccount,
  ImportJob,
  ImportJobListResponse,
  ImportRowErrorListResponse,
} from '@moneylens/shared';

describe('MoneyLens Imports & Import History Page Component Suite', () => {
  let queryClient: QueryClient;

  const mockAccounts: FinancialAccount[] = [
    {
      id: 'acc-ops-101',
      organizationId: 'org-test-enterprise',
      name: 'Primary Operating Checking',
      type: 'checking',
      currency: 'USD',
      institutionName: 'JPMorgan Chase',
      createdAt: '2026-09-01T08:00:00.000Z',
      updatedAt: '2026-10-20T10:00:00.000Z',
    },
    {
      id: 'acc-card-202',
      organizationId: 'org-test-enterprise',
      name: 'Corporate Rewards Platinum',
      type: 'credit_card',
      currency: 'USD',
      institutionName: 'American Express',
      createdAt: '2026-09-15T08:00:00.000Z',
      updatedAt: '2026-10-21T10:00:00.000Z',
    },
  ];

  const mockImportJobs: ImportJob[] = [
    {
      id: 'job-aaa-111',
      organizationId: 'org-test-enterprise',
      accountId: 'acc-ops-101',
      fileName: 'chase_operating_sep2026.csv',
      fileHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      status: 'completed',
      totalRows: 150,
      acceptedRows: 150,
      rejectedRows: 0,
      duplicateRows: 0,
      errorMessage: null,
      createdAt: '2026-10-01T10:30:00.000Z',
      updatedAt: '2026-10-01T10:30:05.000Z',
    },
    {
      id: 'job-bbb-222',
      organizationId: 'org-test-enterprise',
      accountId: 'acc-card-202',
      fileName: 'amex_rewards_oct2026.xlsx',
      fileHash: '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
      status: 'completed',
      totalRows: 85,
      acceptedRows: 83,
      rejectedRows: 2,
      duplicateRows: 0,
      errorMessage: null,
      createdAt: '2026-10-15T14:15:00.000Z',
      updatedAt: '2026-10-15T14:15:08.000Z',
    },
    {
      id: 'job-ccc-333',
      organizationId: 'org-test-enterprise',
      accountId: 'acc-ops-101',
      fileName: 'corrupt_statement_oct2026.csv',
      fileHash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      status: 'failed',
      totalRows: 0,
      acceptedRows: 0,
      rejectedRows: 0,
      duplicateRows: 0,
      errorMessage: 'Unparseable CSV header: missing required amount column.',
      createdAt: '2026-10-20T09:00:00.000Z',
      updatedAt: '2026-10-20T09:00:02.000Z',
    },
  ];

  const mockImportsResponse: ImportJobListResponse = {
    items: mockImportJobs,
    pagination: {
      page: 1,
      limit: 10,
      totalItems: 3,
      totalPages: 1,
    },
  };

  const mockRowErrorsResponse: ImportRowErrorListResponse = {
    items: [
      {
        id: 'err-1',
        importJobId: 'job-bbb-222',
        organizationId: 'org-test-enterprise',
        rowNumber: 14,
        rawData: { date: '2026-13-45', desc: 'Invalid date row', amt: '100.00' },
        errorCode: 'INVALID_DATE',
        errorMessage: 'Date value "2026-13-45" is not a valid ISO calendar date.',
        createdAt: '2026-10-15T14:15:08.000Z',
      },
      {
        id: 'err-2',
        importJobId: 'job-bbb-222',
        organizationId: 'org-test-enterprise',
        rowNumber: 42,
        rawData: { date: '2026-10-12', desc: 'Negative transaction', amt: '-500.00' },
        errorCode: 'INVALID_AMOUNT',
        errorMessage: 'Negative minor unit amount is not permitted.',
        createdAt: '2026-10-15T14:15:08.000Z',
      },
    ],
    pagination: {
      page: 1,
      limit: 25,
      totalItems: 2,
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

    localStorage.setItem('ml_organization_name', 'Global Retail Enterprises');
    localStorage.setItem('ml_organization_currency', 'USD');
    localStorage.setItem('ml_organization_id', 'org-test-enterprise');

    // Clipboard mock
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockImplementation(() => Promise.resolve()),
      },
    });
  });

  const renderImportsPage = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/imports']}>
          <ImportsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it('renders page header, brand identity, and cryptographic safeguard banner', async () => {
    vi.spyOn(financialService, 'getAccounts').mockResolvedValue({ items: mockAccounts });
    vi.spyOn(financialService, 'getImports').mockResolvedValue(mockImportsResponse);

    renderImportsPage();

    // Check title and brand
    expect(await screen.findByText('Imports & Import History')).toBeInTheDocument();
    expect(screen.getByText('Global Retail Enterprises')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();

    // Pipeline Safeguard banner
    expect(
      screen.getByText(/deterministic statement ingestion & double-counting protection/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/cryptographic hashing \(SHA-256\)/i)).toBeInTheDocument();

    // Header actions
    expect(screen.getByRole('button', { name: /upload statement/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh imports/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open transaction ledger/i })).toBeInTheDocument();
  });

  it('renders pipeline metrics strip with accurate row and job counts', async () => {
    vi.spyOn(financialService, 'getAccounts').mockResolvedValue({ items: mockAccounts });
    vi.spyOn(financialService, 'getImports').mockResolvedValue(mockImportsResponse);

    renderImportsPage();

    // Ingested Statements
    expect(await screen.findByText('Ingested Statements')).toBeInTheDocument();

    // Accepted Records: 150 + 83 = 233
    expect(await screen.findByText('233')).toBeInTheDocument();
    expect(screen.getByText('Accepted Records')).toBeInTheDocument();

    // Rejected Rows: 2
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Rejected Rows')).toBeInTheDocument();
  });

  it('renders import history table with filename, SHA-256 hash, account, and status badges', async () => {
    vi.spyOn(financialService, 'getAccounts').mockResolvedValue({ items: mockAccounts });
    vi.spyOn(financialService, 'getImports').mockResolvedValue(mockImportsResponse);

    renderImportsPage();

    // File names
    const chaseFiles = await screen.findAllByText('chase_operating_sep2026.csv');
    expect(chaseFiles.length).toBeGreaterThan(0);
    expect(screen.getAllByText('amex_rewards_oct2026.xlsx').length).toBeGreaterThan(0);
    expect(screen.getAllByText('corrupt_statement_oct2026.csv').length).toBeGreaterThan(0);

    // Mapped Target Accounts
    expect(screen.getAllByText('Primary Operating Checking').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Corporate Rewards Platinum').length).toBeGreaterThanOrEqual(1);

    // Status Badges (also in status select options)
    expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Completed \(2 errors\)/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Failed').length).toBeGreaterThanOrEqual(2);

    // SHA-256 Hash snippet
    expect(screen.getAllByText(/SHA: e3b0c442\.\.\./i).length).toBeGreaterThanOrEqual(1);
  });

  it('filters import jobs by search term and status filter', async () => {
    vi.spyOn(financialService, 'getAccounts').mockResolvedValue({ items: mockAccounts });
    vi.spyOn(financialService, 'getImports').mockResolvedValue(mockImportsResponse);

    renderImportsPage();

    const initialFiles = await screen.findAllByText('chase_operating_sep2026.csv');
    expect(initialFiles.length).toBeGreaterThan(0);

    // Search by file name
    const searchInput = screen.getByLabelText('Search import history');
    fireEvent.change(searchInput, { target: { value: 'amex' } });

    expect(screen.getAllByText('amex_rewards_oct2026.xlsx').length).toBeGreaterThan(0);
    expect(screen.queryByText('chase_operating_sep2026.csv')).not.toBeInTheDocument();
    expect(screen.queryByText('corrupt_statement_oct2026.csv')).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(screen.getAllByText('chase_operating_sep2026.csv').length).toBeGreaterThan(0);

    // Filter by status: failed
    const statusSelect = screen.getByLabelText('Status:');
    fireEvent.change(statusSelect, { target: { value: 'failed' } });

    expect(screen.getAllByText('corrupt_statement_oct2026.csv').length).toBeGreaterThan(0);
    expect(screen.queryByText('chase_operating_sep2026.csv')).not.toBeInTheDocument();
    expect(screen.queryByText('amex_rewards_oct2026.xlsx')).not.toBeInTheDocument();

    // Reset filters
    const resetBtn = screen.getByRole('button', { name: /reset/i });
    fireEvent.click(resetBtn);

    expect(screen.getAllByText('chase_operating_sep2026.csv').length).toBeGreaterThan(0);
    expect(screen.getAllByText('amex_rewards_oct2026.xlsx').length).toBeGreaterThan(0);
  });

  it('opens import details modal and renders row-level validation errors for partially failed jobs', async () => {
    vi.spyOn(financialService, 'getAccounts').mockResolvedValue({ items: mockAccounts });
    vi.spyOn(financialService, 'getImports').mockResolvedValue(mockImportsResponse);
    vi.spyOn(financialService, 'getImportRowErrors').mockResolvedValue(mockRowErrorsResponse);

    renderImportsPage();

    const amexFiles = await screen.findAllByText('amex_rewards_oct2026.xlsx');
    expect(amexFiles.length).toBeGreaterThan(0);

    // Click Inspect on amex_rewards_oct2026.xlsx (the second job)
    const inspectButtons = screen.getAllByRole('button', { name: /inspect/i });
    expect(inspectButtons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(inspectButtons[1]!);

    // Modal opens
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('job-bbb-222')).toBeInTheDocument();

    // Check row errors diagnostics
    expect(await screen.findByText('INVALID_DATE')).toBeInTheDocument();
    expect(
      screen.getByText('Date value "2026-13-45" is not a valid ISO calendar date.'),
    ).toBeInTheDocument();
    expect(screen.getByText('INVALID_AMOUNT')).toBeInTheDocument();
    expect(screen.getByText('Negative minor unit amount is not permitted.')).toBeInTheDocument();

    // Copy Hash in modal
    const copyHashBtn = screen.getByLabelText('Copy SHA-256 Hash');
    fireEvent.click(copyHashBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
    );

    // Close modal
    const closeBtn = screen.getByLabelText('Close import details dialog');
    fireEvent.click(closeBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('handles duplicate file detection and displays duplicate warning with inspect action', async () => {
    vi.spyOn(financialService, 'getAccounts').mockResolvedValue({ items: mockAccounts });
    vi.spyOn(financialService, 'getImports').mockResolvedValue(mockImportsResponse);

    // Mock uploadStatement to throw 409 DUPLICATE_IMPORT_FILE
    vi.spyOn(financialService, 'uploadStatement').mockRejectedValue(
      new ApiClientError(
        409,
        'DUPLICATE_IMPORT_FILE',
        'This file has already been imported into Primary Operating Checking (Job ID: job-aaa-111). Re-importing duplicate files is prevented.',
        { existingJobId: 'job-aaa-111' },
      ),
    );

    renderImportsPage();

    // Select file in FileUploadZone
    const input = screen.getByTestId('file-upload-input');
    const duplicateFile = new File(['dummy data'], 'chase_operating_sep2026.csv', {
      type: 'text/csv',
    });
    fireEvent.change(input, { target: { files: [duplicateFile] } });

    // Click upload
    const uploadBtn = screen.getByRole('button', { name: /upload & ingest records/i });
    fireEvent.click(uploadBtn);

    // Duplicate statement feedback appears
    expect(await screen.findByText('Duplicate Statement File Detected')).toBeInTheDocument();
    expect(
      screen.getByText(/this file has already been imported into primary operating checking/i),
    ).toBeInTheDocument();

    // Inspect existing job button is rendered
    expect(
      screen.getByRole('button', { name: /inspect existing job \(job-aaa-\.\.\.\)/i }),
    ).toBeInTheDocument();
  });

  it('displays empty state when organization has zero historical imports', async () => {
    vi.spyOn(financialService, 'getAccounts').mockResolvedValue({ items: mockAccounts });
    vi.spyOn(financialService, 'getImports').mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 10, totalItems: 0, totalPages: 0 },
    });

    renderImportsPage();

    expect(await screen.findByText('No Statement Imports Yet')).toBeInTheDocument();
    expect(screen.getByText(/your organization hasn't ingested any bank/i)).toBeInTheDocument();
  });

  it('handles history error state with retry button', async () => {
    const errorSpy = vi
      .spyOn(financialService, 'getImports')
      .mockRejectedValue(new Error('Gateway timeout'));
    vi.spyOn(financialService, 'getAccounts').mockResolvedValue({ items: mockAccounts });

    renderImportsPage();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Failed to load statement import history')).toBeInTheDocument();
    expect(screen.getByText('Gateway timeout')).toBeInTheDocument();

    // Click retry
    const retryBtn = screen.getByRole('button', { name: /retry request/i });
    errorSpy.mockResolvedValueOnce(mockImportsResponse);
    fireEvent.click(retryBtn);

    const retriedFiles = await screen.findAllByText('chase_operating_sep2026.csv');
    expect(retriedFiles.length).toBeGreaterThan(0);
  });
});
