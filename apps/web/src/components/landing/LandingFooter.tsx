import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ArrowUpRight } from 'lucide-react';

export const LandingFooter: React.FC = () => {
  return (
    <footer className="bg-ml-black text-white border-t border-ml-border-dark pt-14 sm:pt-20 pb-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top 5-Column Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 sm:gap-12 pb-14 border-b border-stone-800/80">
          {/* Brand & Editorial Mission (5 Cols) */}
          <div className="md:col-span-5 max-w-sm">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center transition-transform group-hover:scale-105">
                <div className="relative w-4 h-4 flex items-center justify-center">
                  <span className="absolute w-3.5 h-3.5 rounded-full border-[1.5px] border-white/90" />
                  <span className="w-1.5 h-1.5 rounded-full bg-ml-mustard" />
                </div>
              </div>
              <span className="font-sans font-bold text-xl tracking-tight text-white">
                MoneyLens
              </span>
            </Link>

            <p className="font-sans text-sm text-ml-dark-secondary mt-4 leading-relaxed font-normal">
              Financial intelligence and cash-flow decision support built specifically for
              independent retail businesses and storefront operators.
            </p>

            {/* Platform Status Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-stone-900 border border-stone-800 text-xs font-medium text-stone-300 mt-6 shadow-inner">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Deterministic Minor-Unit Ledger &bull; Isolated Tenancy</span>
            </div>
          </div>

          {/* Navigation Column 1: Capabilities (2.5 Cols) */}
          <div className="md:col-span-2 space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-400 block">
              Capabilities
            </span>
            <ul className="space-y-2.5 text-sm font-sans">
              <li>
                <a
                  href="#capabilities"
                  className="text-ml-dark-secondary hover:text-white transition-colors"
                >
                  Statement Normalization
                </a>
              </li>
              <li>
                <a
                  href="#capabilities"
                  className="text-ml-dark-secondary hover:text-white transition-colors"
                >
                  Evidence Reconciliation
                </a>
              </li>
              <li>
                <a
                  href="#capabilities"
                  className="text-ml-dark-secondary hover:text-white transition-colors"
                >
                  Leakage Detection
                </a>
              </li>
              <li>
                <a
                  href="#capabilities"
                  className="text-ml-dark-secondary hover:text-white transition-colors"
                >
                  Cash Forecast Simulator
                </a>
              </li>
              <li>
                <a
                  href="#capabilities"
                  className="text-ml-dark-secondary hover:text-white transition-colors"
                >
                  Action Center
                </a>
              </li>
            </ul>
          </div>

          {/* Navigation Column 2: Workflow (2.5 Cols) */}
          <div className="md:col-span-2 space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-400 block">
              Workflow
            </span>
            <ul className="space-y-2.5 text-sm font-sans">
              <li>
                <a
                  href="#how-it-works"
                  className="text-ml-dark-secondary hover:text-white transition-colors"
                >
                  Three-Step Flow
                </a>
              </li>
              <li>
                <Link
                  to="/transactions"
                  className="text-ml-dark-secondary hover:text-white transition-colors"
                >
                  Integer Arithmetic
                </Link>
              </li>
              <li>
                <Link
                  to="/imports"
                  className="text-ml-dark-secondary hover:text-white transition-colors"
                >
                  Content-Hash Deduplication
                </Link>
              </li>
              <li>
                <Link
                  to="/reconciliation"
                  className="text-ml-dark-secondary hover:text-white transition-colors"
                >
                  Audit History
                </Link>
              </li>
            </ul>
          </div>

          {/* Navigation Column 3: Workspace (2.5 Cols) */}
          <div className="md:col-span-3 space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-400 block">
              Workspace
            </span>
            <ul className="space-y-2.5 text-sm font-sans">
              <li>
                <Link
                  to="/app"
                  className="text-ml-mustard hover:text-ml-mustard-hover transition-colors font-medium flex items-center gap-1"
                >
                  <span>Launch Application</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </li>
              <li>
                <Link
                  to="/signin"
                  className="text-ml-dark-secondary hover:text-white transition-colors"
                >
                  Organization Sign In
                </Link>
              </li>
              <li>
                <Link
                  to="/imports"
                  className="text-ml-dark-secondary hover:text-white transition-colors"
                >
                  Statement Dropzone
                </Link>
              </li>
              <li>
                <Link
                  to="/diagnostics"
                  className="text-ml-dark-secondary hover:text-white transition-colors"
                >
                  System Diagnostics
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Platform Invariants */}
        <div className="pt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs text-stone-400 font-normal font-sans">
          <p>&copy; {new Date().getFullYear()} MoneyLens Platform. All rights reserved.</p>
          <div className="flex items-center gap-4 text-stone-500">
            <span className="flex items-center gap-1.5 text-stone-400">
              <ShieldCheck className="w-3.5 h-3.5 text-ml-mustard" />
              <span>Multi-Tenant Cryptographic Isolation</span>
            </span>
            <span>&bull;</span>
            <span>Zero Rounding Drift Guarantee</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
