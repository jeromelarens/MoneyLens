import React, { useState, useMemo, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Landmark,
  UploadCloud,
  CheckCircle2,
  ShieldAlert,
  TrendingUp,
  Zap,
  Activity,
  Building2,
  Menu,
  X,
  FileSpreadsheet,
  LogOut,
} from 'lucide-react';

export interface LayoutProps {
  children: React.ReactNode;
  pageTitle?: string;
  pageSubtitle?: string;
  headerActions?: React.ReactNode;
}

interface NavItem {
  label: string;
  mobileLabel?: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: (pathname: string) => boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  pageTitle,
  pageSubtitle,
  headerActions,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile drawer on route transition
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  // Close mobile menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

  // Business Profile Context from client storage
  const organizationName = useMemo(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('ml_organization_name') || 'Primary Retail Workspace';
    }
    return 'Primary Retail Workspace';
  }, []);

  const organizationBaseCurrency = useMemo(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('ml_organization_currency') || 'USD';
    }
    return 'USD';
  }, []);

  const handleSignOut = () => {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem('ml_session_token');
      localStorage.removeItem('ml_auth_token');
    }
    navigate('/signin');
  };

  const navSections: NavSection[] = [
    {
      title: 'OVERVIEW',
      items: [
        {
          label: 'Executive Overview',
          mobileLabel: 'Overview',
          to: '/dashboard',
          icon: LayoutDashboard,
          isActive: (path) => path === '/dashboard' || path === '/app' || path === '/',
        },
      ],
    },
    {
      title: 'FINANCIAL DATA',
      items: [
        {
          label: 'Transactions',
          mobileLabel: 'Transactions & Ledger',
          to: '/transactions',
          icon: ArrowLeftRight,
          isActive: (path) => path.startsWith('/transactions') || path === '/ledger',
        },
        {
          label: 'Accounts',
          mobileLabel: 'Financial Accounts',
          to: '/accounts',
          icon: Landmark,
          isActive: (path) =>
            path.startsWith('/accounts') || path.startsWith('/financial-accounts'),
        },
        {
          label: 'Imports',
          mobileLabel: 'Statement Imports',
          to: '/imports',
          icon: UploadCloud,
          isActive: (path) => path.startsWith('/imports') || path.startsWith('/import-history'),
        },
      ],
    },
    {
      title: 'RECONCILIATION',
      items: [
        {
          label: 'Reconciliation',
          mobileLabel: 'Reconciliation Workspace',
          to: '/reconciliation',
          icon: CheckCircle2,
          isActive: (path) => path.startsWith('/reconciliation'),
        },
      ],
    },
    {
      title: 'INTELLIGENCE',
      items: [
        {
          label: 'Leakage & Findings',
          mobileLabel: 'Findings & Leakage',
          to: '/findings',
          icon: ShieldAlert,
          isActive: (path) =>
            path.startsWith('/findings') ||
            path.startsWith('/financial-findings') ||
            path.startsWith('/leakage-findings'),
        },
        {
          label: 'Cash Flow',
          mobileLabel: 'Cash Flow Forecast',
          to: '/cash-flow',
          icon: TrendingUp,
          isActive: (path) =>
            path.startsWith('/cash-flow') ||
            path.startsWith('/forecast') ||
            path.startsWith('/scenarios'),
        },
        {
          label: 'Action Center',
          mobileLabel: 'Action Center',
          to: '/actions',
          icon: Zap,
          isActive: (path) =>
            path.startsWith('/actions') ||
            path.startsWith('/action-center') ||
            path.startsWith('/business-actions'),
        },
      ],
    },
  ];

  // Derive contextual page title if not explicitly provided
  const resolvedPageTitle = useMemo(() => {
    if (pageTitle) return pageTitle;
    const path = location.pathname;
    if (path === '/dashboard' || path === '/app' || path === '/') return 'Executive Overview';
    if (path.startsWith('/transactions') || path === '/ledger') return 'Transactions';
    if (path.startsWith('/accounts')) return 'Accounts';
    if (path.startsWith('/imports')) return 'Imports';
    if (path.startsWith('/reconciliation/runs/')) return 'Run Details';
    if (path.startsWith('/reconciliation')) return 'Reconciliation';
    if (path.startsWith('/findings/')) return 'Finding Details';
    if (path.startsWith('/findings')) return 'Findings';
    if (path.startsWith('/cash-flow')) return 'Cash Flow';
    if (path.startsWith('/actions/')) return 'Action Details';
    if (path.startsWith('/actions')) return 'Action Center';
    if (path.startsWith('/diagnostics')) return 'System Diagnostics';
    return 'MoneyLens';
  }, [pageTitle, location.pathname]);

  // Bottom navigation items
  const bottomNavItems = [
    {
      label: 'Overview',
      to: '/dashboard',
      icon: LayoutDashboard,
      active:
        location.pathname === '/dashboard' ||
        location.pathname === '/app' ||
        location.pathname === '/',
    },
    {
      label: 'Ledger',
      to: '/transactions',
      icon: ArrowLeftRight,
      active: location.pathname.startsWith('/transactions') || location.pathname === '/ledger',
    },
    {
      label: 'Findings',
      to: '/findings',
      icon: ShieldAlert,
      active:
        location.pathname.startsWith('/findings') ||
        location.pathname.startsWith('/leakage-findings'),
    },
    {
      label: 'Actions',
      to: '/actions',
      icon: Zap,
      active:
        location.pathname.startsWith('/actions') || location.pathname.startsWith('/action-center'),
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8F7F2] text-[#171714] font-sans antialiased selection:bg-[#E5BB45] selection:text-[#171714]">
      {/* ============================================================ */}
      {/* 1. PERSISTENT DESKTOP SIDEBAR (lg:flex)                      */}
      {/* ============================================================ */}
      <aside
        aria-label="Application sidebar"
        className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-64 bg-[#0D0D0B] text-white border-r border-[#24231E] z-40 select-none"
      >
        {/* Brand & Organization Block */}
        <div className="p-5 border-b border-[#24231E]">
          <Link
            to="/dashboard"
            className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E5BB45] rounded-lg"
            aria-label="MoneyLens Home"
          >
            <div className="w-8 h-8 rounded-lg bg-[#1E1D19] border border-[#2E2D27] flex items-center justify-center transition-transform duration-200 group-hover:scale-105 shadow-inner">
              <div className="relative w-4 h-4 flex items-center justify-center">
                <span className="absolute w-3.5 h-3.5 rounded-full border-[1.5px] border-white/90" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#E5BB45]" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-sans font-bold text-lg tracking-tight text-white flex items-center">
                <span>MoneyLens</span>
                <span className="text-[#E5BB45]">.</span>
              </span>
              <span className="text-[10px] text-[#8C8A82] tracking-wider uppercase font-medium">
                Financial Intelligence
              </span>
            </div>
          </Link>

          {/* Active Business Workspace Indicator */}
          <div className="mt-4 px-3 py-2 rounded-xl bg-[#171714] border border-[#24231E] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="w-3.5 h-3.5 text-[#E5BB45] shrink-0" />
              <span className="text-xs font-semibold text-[#E6E4DD] truncate">
                {organizationName}
              </span>
            </div>
            <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[#24231E] text-[#E5BB45] border border-[#33312B] shrink-0">
              {organizationBaseCurrency}
            </span>
          </div>
        </div>

        {/* Grouped Navigation Links */}
        <nav
          aria-label="Sidebar navigation"
          className="flex-1 overflow-y-auto px-3 py-4 space-y-6 scrollbar-thin scrollbar-thumb-[#24231E]"
        >
          {navSections.map((section) => (
            <div key={section.title} className="space-y-1">
              <h2 className="px-3 text-[10px] font-bold text-[#66645C] tracking-wider uppercase">
                {section.title}
              </h2>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = item.isActive(location.pathname);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 ${
                        active
                          ? 'bg-[#1E1D19] text-[#E5BB45] border-l-2 border-[#E5BB45] shadow-inner'
                          : 'text-[#9E9C94] hover:text-white hover:bg-[#1E1D19]/60'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          active ? 'text-[#E5BB45]' : 'text-[#8C8A82] group-hover:text-white'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom Profile & Sign Out Block */}
        <div className="p-3 border-t border-[#24231E] bg-[#12120F]">
          <div className="flex items-center justify-between px-2 py-1.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-[#1E1D19] border border-[#33312B] flex items-center justify-center text-[11px] font-bold text-[#E5BB45] shrink-0">
                {organizationName.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-[#E6E4DD] truncate">
                  Business Owner
                </span>
                <span className="text-[10px] text-[#8C8A82] truncate">Authenticated Session</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              title="Sign out of workspace"
              className="p-1.5 text-[#8C8A82] hover:text-red-400 hover:bg-[#1E1D19] rounded-lg transition-colors cursor-pointer"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ============================================================ */}
      {/* 2. RESPONSIVE MOBILE DRAWER (lg:hidden)                      */}
      {/* ============================================================ */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation drawer"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity duration-200"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Body */}
          <div className="relative w-80 max-w-[85vw] bg-[#0D0D0B] text-white h-full flex flex-col p-4 shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-[#24231E]">
              <Link
                to="/dashboard"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-2.5"
              >
                <div className="w-7 h-7 rounded-lg bg-[#1E1D19] border border-[#2E2D27] flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E5BB45]" />
                </div>
                <span className="font-sans font-bold text-base text-white">MoneyLens</span>
              </Link>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 rounded-lg text-[#8C8A82] hover:text-white hover:bg-[#1E1D19] transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Workspace Context */}
            <div className="my-3 px-3 py-2.5 rounded-xl bg-[#171714] border border-[#24231E] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="w-3.5 h-3.5 text-[#E5BB45] shrink-0" />
                <span className="text-xs font-semibold text-[#E6E4DD] truncate">
                  {organizationName}
                </span>
              </div>
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[#24231E] text-[#E5BB45] border border-[#33312B] shrink-0">
                {organizationBaseCurrency}
              </span>
            </div>

            {/* Mobile Navigation List */}
            <nav className="flex-1 overflow-y-auto space-y-4 py-2 scrollbar-thin scrollbar-thumb-[#24231E]">
              {navSections.map((section) => (
                <div key={section.title} className="space-y-1">
                  <h3 className="px-2 text-[10px] font-bold text-[#66645C] tracking-wider uppercase">
                    {section.title}
                  </h3>
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const active = item.isActive(location.pathname);
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={() => setIsMobileMenuOpen(false)}
                          aria-current={active ? 'page' : undefined}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all min-h-[44px] ${
                            active
                              ? 'bg-[#1E1D19] text-[#E5BB45] border-l-2 border-[#E5BB45]'
                              : 'text-[#9E9C94] hover:text-white hover:bg-[#1E1D19]/60'
                          }`}
                        >
                          <Icon
                            className={`w-4 h-4 shrink-0 ${active ? 'text-[#E5BB45]' : 'text-[#8C8A82]'}`}
                          />
                          <span className="truncate">{item.mobileLabel || item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* System Diagnostics Route in Drawer */}
              <div className="pt-2 border-t border-[#24231E] space-y-1">
                <h3 className="px-2 text-[10px] font-bold text-[#66645C] tracking-wider uppercase">
                  SYSTEM
                </h3>
                <Link
                  to="/diagnostics"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all min-h-[44px] ${
                    location.pathname.startsWith('/diagnostics')
                      ? 'bg-[#1E1D19] text-[#E5BB45] border-l-2 border-[#E5BB45]'
                      : 'text-[#9E9C94] hover:text-white hover:bg-[#1E1D19]/60'
                  }`}
                >
                  <Activity className="w-4 h-4 text-[#8C8A82]" />
                  <span>System Diagnostics</span>
                </Link>
              </div>
            </nav>

            {/* Sign Out Mobile */}
            <div className="pt-3 border-t border-[#24231E]">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold text-[#8C8A82] hover:text-red-400 hover:bg-[#1E1D19] transition min-h-[44px] cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out of Workspace</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 3. MAIN WORKSPACE CONTAINER (Desktop Left-Padded)            */}
      {/* ============================================================ */}
      <div className="lg:pl-64 flex flex-col min-h-screen min-w-0">
        {/* Compact Responsive App Header */}
        <header className="sticky top-0 z-30 h-14 bg-white/95 backdrop-blur-md border-b border-[#DEDDD5] flex items-center justify-between px-3.5 sm:px-6 lg:px-8">
          {/* Left: Mobile Toggle & Page Context */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl border border-[#DEDDD5] bg-white text-[#171714] hover:bg-[#F8F7F2] transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E5BB45] w-10 h-10 shrink-0 flex items-center justify-center cursor-pointer"
              aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Toggle navigation menu'}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <span className="font-serif sm:font-sans font-bold text-sm sm:text-base text-[#171714] truncate max-w-[120px] xs:max-w-[200px] sm:max-w-none">
                {resolvedPageTitle}
              </span>
              {pageSubtitle && (
                <span className="hidden md:inline text-xs text-[#66645C] border-l border-[#DEDDD5] pl-2 truncate">
                  {pageSubtitle}
                </span>
              )}
            </div>
          </div>

          {/* Right: Quick Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {headerActions ? (
              headerActions
            ) : (
              <Link
                to="/imports"
                className="inline-flex items-center gap-1.5 bg-[#E5BB45] hover:bg-[#D3A82F] text-[#171714] text-xs font-semibold py-1.5 px-3 sm:px-3.5 rounded-full shadow-2xs hover:shadow transition-all duration-150 active:scale-95 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#171714] min-h-[36px]"
                aria-label="Import Statement"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 stroke-[2.2] shrink-0" />
                <span className="hidden sm:inline">Import Statement</span>
                <span className="sm:hidden">Import</span>
              </Link>
            )}
          </div>
        </header>

        {/* Primary Page Content: Mobile-First Responsive Gutters & Bottom Nav Clearance */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 pb-24 lg:pb-8 overflow-x-hidden">
          {children}
        </main>

        {/* Quiet Brand & Integrity Footer */}
        <footer className="border-t border-[#DEDDD5] bg-white py-4 px-3.5 sm:px-6 lg:px-8 text-xs text-[#66645C] pb-24 lg:pb-4">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <div>
              <span>
                &copy; {new Date().getFullYear()} MoneyLens Inc. All financial data securely
                segregated.
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                to="/diagnostics"
                className="hover:text-[#171714] transition-colors inline-flex items-center gap-1"
              >
                <Activity className="w-3 h-3 text-[#E5BB45]" />
                <span>System Diagnostics</span>
              </Link>
            </div>
          </div>
        </footer>

        {/* ============================================================ */}
        {/* 4. MOBILE BOTTOM NAVIGATION (lg:hidden)                      */}
        {/* ============================================================ */}
        <nav
          aria-label="Mobile bottom navigation"
          className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#DEDDD5] shadow-lg flex items-center justify-around h-16 px-1"
        >
          {bottomNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={item.active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-colors min-h-[48px] ${
                  item.active ? 'text-[#171714] font-bold' : 'text-[#66645C] hover:text-[#171714]'
                }`}
              >
                <div
                  className={`p-1 rounded-lg transition-colors ${
                    item.active ? 'bg-[#FAF4E0] text-[#B89020]' : 'text-[#66645C]'
                  }`}
                >
                  <Icon className="w-5 h-5 stroke-[2]" />
                </div>
                <span
                  className={`text-[10px] tracking-tight mt-0.5 truncate max-w-[64px] ${
                    item.active ? 'font-bold text-[#171714]' : 'font-medium text-[#66645C]'
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* More / Menu Drawer Trigger */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl text-[#66645C] hover:text-[#171714] transition-colors min-h-[48px] cursor-pointer"
            aria-label="More navigation options"
          >
            <div className="p-1 rounded-lg text-[#66645C]">
              <Menu className="w-5 h-5 stroke-[2]" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 font-medium text-[#66645C]">
              More
            </span>
          </button>
        </nav>
      </div>
    </div>
  );
};
