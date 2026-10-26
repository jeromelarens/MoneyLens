import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SignInPage } from '../components/auth/SignInPage';
import { healthService } from '../services/health.service';

vi.mock('../services/health.service', () => ({
  healthService: {
    getHealth: vi.fn(),
    getReadiness: vi.fn(),
  },
}));

describe('MoneyLens Sign In Page Component Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderSignInPage = (initialEntries = ['/signin']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/app" element={<div data-testid="workspace-app">Workspace Dashboard</div>} />
        </Routes>
      </MemoryRouter>,
    );
  };

  it('renders MoneyLens wordmark, welcome back headline, accessible inputs, and buttons', () => {
    renderSignInPage();

    // Wordmark & Home Link
    expect(screen.getByRole('link', { name: /MoneyLens Home/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to website/i })).toHaveAttribute('href', '/');

    // Editorial Heading
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /Welcome back/i,
      }),
    ).toBeInTheDocument();

    // Accessible form controls
    expect(screen.getByLabelText(/Work Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument();

    // Submit button
    expect(screen.getByRole('button', { name: /Sign in to workspace/i })).toBeInTheDocument();

    // Security & isolation footer notes
    expect(screen.getByText(/Multi-tenant cryptographic isolation/i)).toBeInTheDocument();
  });

  it('validates empty inputs and displays inline error messages', async () => {
    renderSignInPage();

    const submitButton = screen.getByRole('button', { name: /Sign in to workspace/i });
    fireEvent.click(submitButton);

    // Validation error alerts appear inline
    expect(await screen.findByText(/Email address is required\./i)).toBeInTheDocument();
    expect(screen.getByText(/Password is required\./i)).toBeInTheDocument();

    // Check accessibility attributes
    const emailInput = screen.getByLabelText(/Work Email/i);
    expect(emailInput).toHaveAttribute('aria-invalid', 'true');
    expect(emailInput).toHaveAttribute('aria-describedby', 'email-error');
  });

  it('validates email format and password length requirements', async () => {
    renderSignInPage();

    const emailInput = screen.getByLabelText(/Work Email/i);
    const passwordInput = screen.getByLabelText(/^Password$/i);
    const submitButton = screen.getByRole('button', { name: /Sign in to workspace/i });

    // Invalid email & short password
    fireEvent.change(emailInput, { target: { value: 'not-an-email' } });
    fireEvent.change(passwordInput, { target: { value: 'short' } });
    fireEvent.click(submitButton);

    expect(await screen.findByText(/Please enter a valid email address\./i)).toBeInTheDocument();
    expect(screen.getByText(/Password must be at least 8 characters long\./i)).toBeInTheDocument();
  });

  it('toggles password visibility with accessible button state', () => {
    renderSignInPage();

    const passwordInput = screen.getByLabelText(/^Password$/i);
    const toggleButton = screen.getByRole('button', { name: /Show password/i });

    expect(passwordInput).toHaveAttribute('type', 'password');

    // Click to show password
    fireEvent.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /Hide password/i })).toBeInTheDocument();

    // Click to hide password again
    fireEvent.click(screen.getByRole('button', { name: /Hide password/i }));
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('submits valid credentials and navigates to the workspace dashboard', async () => {
    vi.mocked(healthService.getHealth).mockResolvedValueOnce({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: 120,
      version: '0.1.0',
      environment: 'test',
    });

    renderSignInPage();

    const emailInput = screen.getByLabelText(/Work Email/i);
    const passwordInput = screen.getByLabelText(/^Password$/i);
    const submitButton = screen.getByRole('button', { name: /Sign in to workspace/i });

    fireEvent.change(emailInput, { target: { value: 'boutique.owner@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'SecurePass123!' } });
    fireEvent.click(submitButton);

    // Verifies transition to workspace
    await waitFor(() => {
      expect(screen.getByTestId('workspace-app')).toBeInTheDocument();
    });
  });

  it('handles backend network failures gracefully and displays clear alert', async () => {
    vi.mocked(healthService.getHealth).mockRejectedValueOnce(new Error('Network error'));

    renderSignInPage();

    const emailInput = screen.getByLabelText(/Work Email/i);
    const passwordInput = screen.getByLabelText(/^Password$/i);
    const submitButton = screen.getByRole('button', { name: /Sign in to workspace/i });

    fireEvent.change(emailInput, { target: { value: 'boutique.owner@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'SecurePass123!' } });
    fireEvent.click(submitButton);

    expect(
      await screen.findByText(/Unable to connect to the MoneyLens workspace service/i),
    ).toBeInTheDocument();
  });
});
