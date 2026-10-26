import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { OrganizationSetupPage } from '../components/auth/OrganizationSetupPage';
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
  },
}));

describe('MoneyLens Organization Setup Page Component Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const renderSetupPage = (initialEntries = ['/setup']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/setup" element={<OrganizationSetupPage />} />
          <Route path="/app" element={<div data-testid="workspace-app">Workspace Dashboard</div>} />
        </Routes>
      </MemoryRouter>,
    );
  };

  it('renders branding, progress indicator, business setup headline, and form fields', () => {
    renderSetupPage();

    // Branding & Navigation
    expect(screen.getByRole('link', { name: /MoneyLens Home/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Skip to workspace/i })).toHaveAttribute(
      'href',
      '/app',
    );

    // Progress Indicator
    expect(screen.getByText(/1\. Account/i)).toBeInTheDocument();
    expect(screen.getByText(/2\. Business Setup/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. Workspace/i)).toBeInTheDocument();

    // Editorial Heading
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /Set up your business workspace/i,
      }),
    ).toBeInTheDocument();

    // Accessible Form Controls
    expect(screen.getByLabelText(/Business or Store Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Storefront Category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Base Currency/i)).toBeInTheDocument();

    // Submit button
    expect(
      screen.getByRole('button', { name: /Complete setup & launch workspace/i }),
    ).toBeInTheDocument();

    // Security Reassurance
    expect(screen.getByText(/Multi-tenant cryptographic isolation/i)).toBeInTheDocument();
  });

  it('validates empty business name input and displays inline error', async () => {
    renderSetupPage();

    const submitBtn = screen.getByRole('button', {
      name: /Complete setup & launch workspace/i,
    });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText(/Business or organization name is required\./i),
    ).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/Business or Store Name/i);
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput).toHaveAttribute('aria-describedby', 'name-error');
  });

  it('submits valid organization configuration, saves metadata, and navigates to workspace', async () => {
    vi.mocked(healthService.getHealth).mockResolvedValueOnce({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: 120,
      version: '0.1.0',
      environment: 'test',
    });

    vi.mocked(financialService.getAccounts).mockResolvedValueOnce({
      items: [
        {
          id: 'acc-001',
          organizationId: 'org-001',
          name: 'Primary Operating Account',
          type: 'checking',
          currency: 'INR',
          institutionName: 'Primary Bank',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    });

    renderSetupPage();

    const nameInput = screen.getByLabelText(/Business or Store Name/i);
    const categorySelect = screen.getByLabelText(/Storefront Category/i);
    const currencySelect = screen.getByLabelText(/Base Currency/i);

    fireEvent.change(nameInput, { target: { value: 'The Local Pantry & Boutique' } });
    fireEvent.change(categorySelect, { target: { value: 'artisanal_goods' } });
    fireEvent.change(currencySelect, { target: { value: 'INR' } });

    const submitBtn = screen.getByRole('button', {
      name: /Complete setup & launch workspace/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByTestId('workspace-app')).toBeInTheDocument();
    });

    // Verify metadata saved to client storage
    expect(localStorage.getItem('ml_organization_name')).toBe('The Local Pantry & Boutique');
    expect(localStorage.getItem('ml_organization_currency')).toBe('INR');
    expect(localStorage.getItem('ml_business_type')).toBe('artisanal_goods');
    expect(localStorage.getItem('ml_setup_completed')).toBe('true');
  });

  it('handles network failure gracefully without losing form input', async () => {
    vi.mocked(healthService.getHealth).mockRejectedValueOnce(new Error('Connection failure'));

    renderSetupPage();

    const nameInput = screen.getByLabelText(/Business or Store Name/i);
    fireEvent.change(nameInput, { target: { value: 'Greenleaf Artisanal Cafe' } });

    const submitBtn = screen.getByRole('button', {
      name: /Complete setup & launch workspace/i,
    });
    fireEvent.click(submitBtn);

    expect(
      await screen.findByText(/Unable to complete business workspace setup/i),
    ).toBeInTheDocument();

    // Input retains user value safely
    expect((screen.getByLabelText(/Business or Store Name/i) as HTMLInputElement).value).toBe(
      'Greenleaf Artisanal Cafe',
    );
  });
});
