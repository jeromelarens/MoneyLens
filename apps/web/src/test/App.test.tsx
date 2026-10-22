import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../app/App';
import { Layout } from '../components/Layout';
import * as healthServiceModule from '../services/health.service';
import * as financialServiceModule from '../services/financial.service';

describe('MoneyLens Frontend Application Shell', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    vi.spyOn(financialServiceModule.financialService, 'getAccounts').mockResolvedValue({
      items: [
        {
          id: 'acc-1',
          organizationId: 'org-1',
          name: 'Primary Checking',
          type: 'checking',
          currency: 'USD',
          institutionName: 'Primary Bank',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    vi.spyOn(financialServiceModule.financialService, 'getTransactions').mockResolvedValue({
      items: [],
      pagination: {
        page: 1,
        limit: 15,
        totalItems: 0,
        totalPages: 0,
      },
    });
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>,
    );
  };

  it('renders application branding, ingestion dropzone, and ledger by default', () => {
    renderWithProviders(
      <Layout>
        <App />
      </Layout>,
    );

    // Verify MoneyLens brand presence
    const brandElements = screen.getAllByText(/MoneyLens/i);
    expect(brandElements.length).toBeGreaterThan(0);

    // Verify Phase 2 heading
    expect(screen.getByText(/Data Ingestion/i)).toBeInTheDocument();
    expect(screen.getByText(/Statement Ingestion & Ledger/i)).toBeInTheDocument();

    // Verify Statement ingestion and Ledger sections
    expect(screen.getByRole('heading', { name: /Statement Ingestion/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Financial Ledger/i })).toBeInTheDocument();
  });

  it('switches to system diagnostics tab when clicked and displays architecture pillars', () => {
    vi.spyOn(healthServiceModule.healthService, 'getHealth').mockResolvedValue({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: 42,
      version: '0.1.0',
      environment: 'test',
    });

    vi.spyOn(healthServiceModule.healthService, 'getReadiness').mockResolvedValue({
      status: 'ready',
      timestamp: new Date().toISOString(),
      services: {
        database: { status: 'up' },
      },
    });

    renderWithProviders(
      <Layout>
        <App />
      </Layout>,
    );

    // Click on telemetry tab
    const telemetryTab = screen.getByRole('button', { name: /System Diagnostics & Architecture/i });
    fireEvent.click(telemetryTab);

    expect(screen.getByText(/API Service Process/i)).toBeInTheDocument();
    expect(screen.getByText(/Database Infrastructure/i)).toBeInTheDocument();
    expect(screen.getByText(/Clean Monorepo/i)).toBeInTheDocument();
    expect(screen.getByText(/Defense-in-Depth/i)).toBeInTheDocument();
  });
});
