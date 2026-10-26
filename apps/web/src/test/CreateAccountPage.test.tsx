import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { CreateAccountPage } from '../components/auth/CreateAccountPage';
import { healthService } from '../services/health.service';

vi.mock('../services/health.service', () => ({
  healthService: {
    getHealth: vi.fn(),
    getReadiness: vi.fn(),
  },
}));

describe('MoneyLens Create Account Page Component Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderCreateAccountPage = (initialEntries = ['/signup']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/signup" element={<CreateAccountPage />} />
          <Route path="/signin" element={<div data-testid="signin-page">Sign In Page</div>} />
          <Route path="/app" element={<div data-testid="workspace-app">Workspace Dashboard</div>} />
        </Routes>
      </MemoryRouter>,
    );
  };

  it('renders MoneyLens wordmark, create account headline, form controls, and sign in link', () => {
    renderCreateAccountPage();

    // Wordmark & Home Link
    expect(screen.getByRole('link', { name: /MoneyLens Home/i })).toBeInTheDocument();

    // Link to Sign In
    const signInLinks = screen.getAllByRole('link', { name: /Sign in/i });
    expect(signInLinks.length).toBeGreaterThan(0);
    expect(signInLinks[0]).toHaveAttribute('href', '/signin');

    // Editorial Heading
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /Create your account/i,
      }),
    ).toBeInTheDocument();

    // Accessible form controls
    expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Work Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Confirm Password$/i)).toBeInTheDocument();

    // Submit button
    expect(screen.getByRole('button', { name: /Create account/i })).toBeInTheDocument();

    // Security & isolation note
    expect(screen.getByText(/Multi-tenant cryptographic isolation/i)).toBeInTheDocument();
  });

  it('validates empty inputs and displays inline error messages', async () => {
    renderCreateAccountPage();

    const submitButton = screen.getByRole('button', { name: /Create account/i });
    fireEvent.click(submitButton);

    // Inline errors appear for all required fields
    expect(await screen.findByText(/Full name is required\./i)).toBeInTheDocument();
    expect(screen.getByText(/Work email is required\./i)).toBeInTheDocument();
    expect(screen.getByText(/Password is required\./i)).toBeInTheDocument();
    expect(screen.getByText(/Please confirm your password\./i)).toBeInTheDocument();

    // Accessibility validation attributes
    const nameInput = screen.getByLabelText(/Full Name/i);
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput).toHaveAttribute('aria-describedby', 'name-error');
  });

  it('validates email format, password complexity, and confirmation match', async () => {
    renderCreateAccountPage();

    const nameInput = screen.getByLabelText(/Full Name/i);
    const emailInput = screen.getByLabelText(/Work Email/i);
    const passwordInput = screen.getByLabelText(/^Password$/i);
    const confirmPasswordInput = screen.getByLabelText(/^Confirm Password$/i);
    const submitButton = screen.getByRole('button', { name: /Create account/i });

    // Fill invalid values: invalid email, password without numbers, mismatched confirm
    fireEvent.change(nameInput, { target: { value: 'Jane Doe' } });
    fireEvent.change(emailInput, { target: { value: 'not-valid-email' } });
    fireEvent.change(passwordInput, { target: { value: 'onlyletters' } });
    fireEvent.change(confirmPasswordInput, { target: { value: 'different123' } });
    fireEvent.click(submitButton);

    expect(
      await screen.findByText(/Please enter a valid work email address\./i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Password must contain at least one letter and one number\./i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Passwords do not match\./i)).toBeInTheDocument();
  });

  it('toggles password and confirm password visibility with accessible controls', () => {
    renderCreateAccountPage();

    const passwordInput = screen.getByLabelText(/^Password$/i);
    const confirmPasswordInput = screen.getByLabelText(/^Confirm Password$/i);

    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(confirmPasswordInput).toHaveAttribute('type', 'password');

    // Toggle main password
    const togglePasswordBtn = screen.getByRole('button', { name: /^Show password$/i });
    fireEvent.click(togglePasswordBtn);
    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /^Hide password$/i })).toBeInTheDocument();

    // Toggle confirm password
    const toggleConfirmBtn = screen.getByRole('button', { name: /^Show confirm password$/i });
    fireEvent.click(toggleConfirmBtn);
    expect(confirmPasswordInput).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /^Hide confirm password$/i })).toBeInTheDocument();
  });

  it('successfully creates an account and navigates to the workspace dashboard', async () => {
    vi.mocked(healthService.getHealth).mockResolvedValueOnce({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: 120,
      version: '0.1.0',
      environment: 'test',
    });

    renderCreateAccountPage();

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Sarah Jenkins' } });
    fireEvent.change(screen.getByLabelText(/Work Email/i), {
      target: { value: 'sarah@boutique.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Password$/i), {
      target: { value: 'SecurePass2026!' },
    });
    fireEvent.change(screen.getByLabelText(/^Confirm Password$/i), {
      target: { value: 'SecurePass2026!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));

    // Verifies navigation to workspace
    await waitFor(() => {
      expect(screen.getByTestId('workspace-app')).toBeInTheDocument();
    });
  });

  it('handles network failure gracefully and shows accessible error alert', async () => {
    vi.mocked(healthService.getHealth).mockRejectedValueOnce(new Error('Connection failure'));

    renderCreateAccountPage();

    fireEvent.change(screen.getByLabelText(/Full Name/i), { target: { value: 'Sarah Jenkins' } });
    fireEvent.change(screen.getByLabelText(/Work Email/i), {
      target: { value: 'sarah@boutique.com' },
    });
    fireEvent.change(screen.getByLabelText(/^Password$/i), {
      target: { value: 'SecurePass2026!' },
    });
    fireEvent.change(screen.getByLabelText(/^Confirm Password$/i), {
      target: { value: 'SecurePass2026!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));

    expect(
      await screen.findByText(/Unable to connect to the MoneyLens registration service/i),
    ).toBeInTheDocument();
  });
});
