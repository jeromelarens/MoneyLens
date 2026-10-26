import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LandingPage } from '../components/landing/LandingPage';

describe('MoneyLens Editorial Brand Landing Page Suite', () => {
  const renderLandingPage = () => {
    return render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
  };

  it('renders navigation bar with editorial branding, links, and Get Started CTAs', () => {
    renderLandingPage();

    // Verify Brand Logo presence
    expect(screen.getByRole('link', { name: /MoneyLens Home/i })).toBeInTheDocument();

    // Verify Navigation Links (Header)
    const productLinks = screen.getAllByRole('link', { name: /^Product$/i });
    expect(productLinks[0]).toHaveAttribute('href', '#product');

    const capabilitiesLinks = screen.getAllByRole('link', { name: /^Capabilities$/i });
    expect(capabilitiesLinks[0]).toHaveAttribute('href', '#capabilities');

    const howItWorksLinks = screen.getAllByRole('link', { name: /^How it works$/i });
    expect(howItWorksLinks[0]).toHaveAttribute('href', '#how-it-works');

    // Verify Sign In link pointing to signin route
    const signInLinks = screen.getAllByRole('link', { name: /Sign in/i });
    expect(signInLinks.length).toBeGreaterThan(0);
    expect(signInLinks[0]).toHaveAttribute('href', '/signin');

    // Verify Get started button pointing to app
    const getStartedLinks = screen.getAllByRole('link', { name: /Get started/i });
    expect(getStartedLinks.length).toBeGreaterThan(0);
    expect(getStartedLinks[0]).toHaveAttribute('href', '/app');
  });

  it('renders distinctive editorial hero headline, supporting copy, and CTAs', () => {
    renderLandingPage();

    // Hero Headline
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /Know where your money goes[\s\S]*Decide what comes next/i,
      }),
    ).toBeInTheDocument();

    // Supporting copy
    expect(
      screen.getByText(
        /Understand where money moves, uncover unusual patterns, and make your next business decision with greater clarity\./i,
      ),
    ).toBeInTheDocument();

    // Hero CTAs
    const getStarted = screen.getAllByRole('link', { name: /Get started/i });
    expect(getStarted[0]).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Explore features/i })).toHaveAttribute(
      'href',
      '#capabilities',
    );

    // Hero Photography
    expect(
      screen.getByAltText(
        /Independent retail business owner reviewing accounts on a laptop in a sunlit boutique workspace/i,
      ),
    ).toBeInTheDocument();
  });

  it('renders asymmetric product story section with narrative and retail imagery', () => {
    renderLandingPage();

    expect(screen.getByText(/See the story behind your numbers\./i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Most retail bookkeeping tools show past transactions, but leave owners guessing/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Normalized Statement Ledger/i)).toBeInTheDocument();
    expect(screen.getByText(/Proactive Leakage Detection/i)).toBeInTheDocument();
    expect(
      screen.getByAltText(
        /Modern independent retail shop merchandise with clean natural lighting/i,
      ),
    ).toBeInTheDocument();
  });

  it('renders all 5 core platform capabilities with varied editorial layouts and photography', () => {
    renderLandingPage();

    // Section A — Financial clarity
    expect(screen.getByText(/Financial clarity beyond the ledger\./i)).toBeInTheDocument();
    expect(
      screen.getByAltText(
        /Business desk with financial statement paperwork, calculator, notebook, and laptop/i,
      ),
    ).toBeInTheDocument();

    // Section B — Reconciliation
    expect(screen.getByText(/Know which transactions need a closer look\./i)).toBeInTheDocument();
    expect(
      screen.getByAltText(/Detailed financial ledger documents being audited and reconciled/i),
    ).toBeInTheDocument();

    // Section C — Financial findings (High-end Display)
    expect(screen.getByText(/Spot patterns worth investigating\./i)).toBeInTheDocument();
    expect(
      screen.getByAltText(
        /High-end financial intelligence display analyzing transaction patterns and variance metrics/i,
      ),
    ).toBeInTheDocument();

    // Section D — Cash-flow planning
    expect(screen.getByText(/Plan for what comes next\./i)).toBeInTheDocument();
    expect(
      screen.getByAltText(
        /Cash-flow planning notebook with currency calculations and business projections/i,
      ),
    ).toBeInTheDocument();

    // Section E — Business actions
    expect(screen.getByText(/Turn insight into your next decision\./i)).toBeInTheDocument();
    expect(
      screen.getByAltText(/Independent retail storefront owner reviewing operational priorities/i),
    ).toBeInTheDocument();
  });

  it('renders 3-step minimal workflow in how it works section', () => {
    renderLandingPage();

    expect(screen.getByText(/How MoneyLens works\./i)).toBeInTheDocument();
    expect(screen.getByText(/Bring in your financial data\./i)).toBeInTheDocument();
    expect(screen.getByText(/Review evidence-backed insights\./i)).toBeInTheDocument();
    expect(screen.getByText(/Prioritize your next actions\./i)).toBeInTheDocument();
  });

  it('renders final CTA and multi-column quiet professional footer with working links', () => {
    renderLandingPage();

    // Final CTA
    expect(
      screen.getByRole('heading', {
        name: /Make your next business decision with clarity\./i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Understand your financial activity and move forward with a clearer picture\./i,
      ),
    ).toBeInTheDocument();

    // Professional Footer
    expect(screen.getByText(/MoneyLens Platform\. All rights reserved\./i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Financial intelligence and cash-flow decision support built specifically for independent retail businesses and storefront operators\./i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Multi-Tenant Cryptographic Isolation/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Statement Normalization/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Launch Application/i)).toBeInTheDocument();
  });

  it('toggles mobile menu when hamburger button is clicked', () => {
    renderLandingPage();

    const menuButton = screen.getByRole('button', {
      name: /Open navigation menu|Toggle navigation menu/i,
    });
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    // Click to open
    fireEvent.click(menuButton);
    expect(screen.getAllByText(/Sign in to workspace/i).length).toBeGreaterThan(0);

    // Click to close
    const closeButton = screen.getByRole('button', { name: /Close navigation menu/i });
    fireEvent.click(closeButton);
    expect(screen.queryByRole('dialog', { name: /Mobile Navigation Menu/i })).not.toBeInTheDocument();
  });
});
