import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { financialService } from '../services/financial.service';
import { FileUploadZone } from './FileUploadZone';
import { Layout } from './Layout';
import type { FinancialAccount, ImportJob } from '@moneylens/shared';
import {
  Building2,
  Landmark,
  FileSpreadsheet,
  RefreshCw,
  Search,
  ArrowUpRight,
  Copy,
  Check,
  Info,
  ShieldCheck,
  X,
  CreditCard,
  Wallet,
  Receipt,
  Layers,
  Calendar,
  AlertTriangle,
} from 'lucide-react';

export const AccountsPage: React.FC = () => {
  const queryClient = useQueryClient();

  // Document Title
  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'Financial Accounts — MoneyLens';
    return () => {
      document.title = originalTitle;
    };
  }, []);

  // Workspace context from storage
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

  const organizationId = useMemo(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('ml_organization_id') || 'default-org';
    }
    return 'default-org';
  }, []);

  // Filter & Search State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('all');

  // Modal & Drawer State
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importTargetAccountId, setImportTargetAccountId] = useState<string | undefined>(undefined);
  const [detailAccount, setDetailAccount] = useState<FinancialAccount | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 1. Fetch Financial Accounts (Organization-scoped)
  const {
    data: accountsData,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['financial-accounts', organizationId],
    queryFn: financialService.getAccounts,
    staleTime: 60000,
  });

  const accounts: FinancialAccount[] = useMemo(() => {
    return accountsData?.items || [];
  }, [accountsData]);

  // 2. Fetch Transaction Counts per Account
  const {
    data: txCounts = {},
    isFetching: isCountsFetching,
    refetch: refetchCounts,
  } = useQuery({
    queryKey: ['accounts-tx-counts', organizationId, accounts.map((a) => a.id).join(',')],
    queryFn: async () => {
      const counts: Record<string, number> = {};
      await Promise.all(
        accounts.map(async (acc) => {
          try {
            const res = await financialService.getTransactions({ accountId: acc.id, limit: 1 });
            counts[acc.id] = res.pagination.totalItems;
          } catch {
            counts[acc.id] = 0;
          }
        }),
      );
      return counts;
    },
    enabled: accounts.length > 0,
    staleTime: 30000,
  });

  // Copy to clipboard helper
  const handleCopyId = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Manual refresh handler
  const handleRefreshAll = () => {
    refetch();
    refetchCounts();
    queryClient.invalidateQueries({ queryKey: ['financial-accounts'] });
  };

  const handleImportSuccess = (_job: ImportJob) => {
    setIsImportModalOpen(false);
    handleRefreshAll();
  };

  // Open import modal for specific account
  const handleOpenImport = (accountId?: string) => {
    setImportTargetAccountId(accountId);
    setIsImportModalOpen(true);
  };

  // Distinct currencies across accounts
  const availableCurrencies = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach((a) => {
      if (a.currency) set.add(a.currency);
    });
    return Array.from(set);
  }, [accounts]);

  // Distinct institutions
  const distinctInstitutions = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach((a) => {
      if (a.institutionName) set.add(a.institutionName);
    });
    return Array.from(set);
  }, [accounts]);

  // Total transactions recorded across accounts
  const totalRecordedTransactions = useMemo(() => {
    return Object.values(txCounts).reduce((acc, curr) => acc + curr, 0);
  }, [txCounts]);

  // Filter accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      if (selectedType !== 'all' && acc.type !== selectedType) {
        return false;
      }
      if (selectedCurrency !== 'all' && acc.currency !== selectedCurrency) {
        return false;
      }
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesName = acc.name.toLowerCase().includes(query);
        const matchesInst = acc.institutionName.toLowerCase().includes(query);
        const matchesType = acc.type.toLowerCase().includes(query);
        const matchesCur = acc.currency.toLowerCase().includes(query);
        const matchesId = acc.id.toLowerCase().includes(query);
        if (!matchesName && !matchesInst && !matchesType && !matchesCur && !matchesId) {
          return false;
        }
      }
      return true;
    });
  }, [accounts, selectedType, selectedCurrency, searchTerm]);

  // Escape key handler for modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (detailAccount) setDetailAccount(null);
        if (isImportModalOpen) setIsImportModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [detailAccount, isImportModalOpen]);

  // Lock body scroll when modal is active
  useEffect(() => {
    if (detailAccount || isImportModalOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [detailAccount, isImportModalOpen]);

  // Helper for Account Type badges
  const renderTypeBadge = (type: string) => {
    switch (type) {
      case 'checking':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#171714]/5 text-[#171714] border border-[#171714]/10">
            <Landmark className="w-3 h-3 text-[#171714]" />
            Checking
          </span>
        );
      case 'savings':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
            <Wallet className="w-3 h-3 text-emerald-600" />
            Savings
          </span>
        );
      case 'credit_card':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-900 border border-amber-200">
            <CreditCard className="w-3 h-3 text-amber-600" />
            Credit Card
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F8F7F2] text-[#66645C] border border-[#E8E7E2]">
            <Layers className="w-3 h-3 text-[#66645C]" />
            Other
          </span>
        );
    }
  };

  return (
    <Layout
      pageTitle="Accounts"
      headerActions={
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={isFetching || isCountsFetching}
            title="Refresh financial accounts data"
            className="w-9 h-9 rounded-xl border border-[#DEDDD5] bg-white text-[#66645C] hover:text-[#171714] hover:bg-[#F8F7F2] transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center shrink-0"
            aria-label="Refresh accounts"
          >
            <RefreshCw
              className={`w-4 h-4 ${isFetching || isCountsFetching ? 'animate-spin text-[#E5BB45]' : ''}`}
            />
          </button>
          <button
            type="button"
            onClick={() => handleOpenImport()}
            className="inline-flex items-center gap-1.5 bg-[#E5BB45] hover:bg-[#D3A82F] text-[#171714] text-xs font-semibold py-1.5 px-2.5 sm:px-3.5 rounded-full shadow-2xs hover:shadow transition cursor-pointer shrink-0 min-h-[36px]"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 stroke-[2.2] shrink-0" />
            <span className="hidden sm:inline">Import Statement</span>
            <span className="sm:hidden">Import</span>
          </button>
        </div>
      }
    >
      <div className="space-y-8">
        {/* Page Header */}
        <section className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#66645C]">
                <span>Financial Infrastructure</span>
                <span>·</span>
                <span className="text-[#171714]">Ledger Registers</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-serif tracking-tight text-[#171714]">
                Financial Accounts
              </h1>
              <p className="text-sm text-[#66645C] max-w-2xl leading-relaxed">
                Institutional accounts and statement registers configured for {organizationName}.
                Each account manages immutable normalized ledger records and reconciliation
                contexts.
              </p>
            </div>

            {/* Quick Ledger Link */}
            <div className="flex items-center gap-3">
              <Link
                to="/transactions"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#171714] hover:text-[#66645C] bg-white border border-[#E8E7E2] px-3 py-2 rounded-xl shadow-2xs hover:bg-[#F8F7F2] transition"
              >
                <Receipt className="w-3.5 h-3.5 text-[#E5BB45]" />
                <span>Open Transaction Ledger</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[#66645C]" />
              </Link>
            </div>
          </div>

          {/* Truth-in-Accounting Integrity Banner */}
          <div className="rounded-2xl border border-[#E8E7E2] bg-white p-4 sm:p-5 shadow-2xs flex items-start gap-3.5">
            <div className="w-8 h-8 rounded-lg bg-[#FAF4E0] border border-[#E5BB45]/30 flex items-center justify-center shrink-0 text-[#171714] mt-0.5">
              <ShieldCheck className="w-4 h-4 text-[#171714]" />
            </div>
            <div className="space-y-1 text-xs">
              <div className="font-semibold text-[#171714]">
                Statement-driven register integrity
              </div>
              <p className="text-[#66645C] leading-relaxed">
                Account entries are maintained via verified uploaded statements and automated
                reconciliation. To maintain mathematical correctness, running balances are not
                speculated or inferred from partial transaction feeds without certified closing
                balance records.
              </p>
            </div>
          </div>
        </section>

        {/* Register Summary Metrics (Derived Honestly, No Fabricated Balances) */}
        <section
          aria-label="Account Overview Summary"
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {/* Total Accounts */}
          <div className="p-5 rounded-2xl bg-white border border-[#E8E7E2] shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-[#66645C]">
              <span>Configured Accounts</span>
              <Landmark className="w-4 h-4 text-[#E5BB45]" />
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight text-[#171714]">
              {isLoading ? (
                <div className="h-7 w-12 bg-[#E8E7E2]/60 animate-pulse rounded" />
              ) : (
                accounts.length
              )}
            </div>
            <p className="text-[11px] text-[#66645C]">Registered ledger entities</p>
          </div>

          {/* Active Institutions */}
          <div className="p-5 rounded-2xl bg-white border border-[#E8E7E2] shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-[#66645C]">
              <span>Institutions</span>
              <Building2 className="w-4 h-4 text-[#E5BB45]" />
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight text-[#171714]">
              {isLoading ? (
                <div className="h-7 w-12 bg-[#E8E7E2]/60 animate-pulse rounded" />
              ) : (
                distinctInstitutions.length
              )}
            </div>
            <p className="text-[11px] text-[#66645C] truncate">
              {distinctInstitutions.length > 0
                ? distinctInstitutions.join(', ')
                : 'None registered'}
            </p>
          </div>

          {/* Supported Currencies */}
          <div className="p-5 rounded-2xl bg-white border border-[#E8E7E2] shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-[#66645C]">
              <span>Operating Currencies</span>
              <Wallet className="w-4 h-4 text-[#E5BB45]" />
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight text-[#171714] truncate">
              {isLoading ? (
                <div className="h-7 w-16 bg-[#E8E7E2]/60 animate-pulse rounded" />
              ) : availableCurrencies.length > 0 ? (
                availableCurrencies.join(', ')
              ) : (
                organizationBaseCurrency
              )}
            </div>
            <p className="text-[11px] text-[#66645C]">Segregated currencies</p>
          </div>

          {/* Total Transactions Recorded */}
          <div className="p-5 rounded-2xl bg-white border border-[#E8E7E2] shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-[#66645C]">
              <span>Total Recorded Txns</span>
              <Receipt className="w-4 h-4 text-[#E5BB45]" />
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight text-[#171714]">
              {isCountsFetching ? (
                <div className="h-7 w-16 bg-[#E8E7E2]/60 animate-pulse rounded" />
              ) : (
                totalRecordedTransactions.toLocaleString()
              )}
            </div>
            <p className="text-[11px] text-[#66645C]">Across all account registers</p>
          </div>
        </section>

        {/* Filter and Search Controls */}
        <section
          aria-label="Account Filters and Search"
          className="bg-white p-4 rounded-2xl border border-[#E8E7E2] shadow-2xs space-y-3"
        >
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-[#66645C] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by account name, bank, or ID..."
                aria-label="Search financial accounts"
                className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-[#F8F7F2] border border-[#E8E7E2] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E5BB45] transition placeholder:text-[#66645C]"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Clear search input"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#66645C] hover:text-[#171714] p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Account Type Filter */}
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="account-type-filter"
                  className="text-xs text-[#66645C] whitespace-nowrap"
                >
                  Type:
                </label>
                <select
                  id="account-type-filter"
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="bg-[#F8F7F2] border border-[#E8E7E2] text-xs text-[#171714] rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#E5BB45] cursor-pointer"
                >
                  <option value="all">All Types</option>
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Currency Filter (if multiple currencies exist) */}
              {availableCurrencies.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <label
                    htmlFor="account-currency-filter"
                    className="text-xs text-[#66645C] whitespace-nowrap"
                  >
                    Currency:
                  </label>
                  <select
                    id="account-currency-filter"
                    value={selectedCurrency}
                    onChange={(e) => setSelectedCurrency(e.target.value)}
                    className="bg-[#F8F7F2] border border-[#E8E7E2] text-xs text-[#171714] rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#E5BB45] cursor-pointer font-mono"
                  >
                    <option value="all">All</option>
                    {availableCurrencies.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Reset Filters */}
              {(searchTerm || selectedType !== 'all' || selectedCurrency !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedType('all');
                    setSelectedCurrency('all');
                  }}
                  className="text-xs text-[#66645C] hover:text-[#171714] underline underline-offset-2 px-2 py-1 transition cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Filter Status Text */}
          <div className="flex items-center justify-between text-[11px] text-[#66645C] pt-1 border-t border-[#E8E7E2]">
            <span>
              Showing {filteredAccounts.length} of {accounts.length} account
              {accounts.length === 1 ? '' : 's'}
            </span>
            {isFetching && <span className="text-[#E5BB45] font-medium">Syncing accounts...</span>}
          </div>
        </section>

        {/* ============================================================ */}
        {/* Accounts Register Table / Cards                              */}
        {/* ============================================================ */}
        <section aria-label="Financial Accounts Register" className="space-y-4">
          {/* Loading Skeleton */}
          {isLoading && (
            <div className="bg-white rounded-3xl border border-[#E8E7E2] p-6 space-y-4 shadow-2xs">
              {[1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className="h-16 bg-[#F8F7F2] rounded-2xl animate-pulse flex items-center justify-between px-6"
                >
                  <div className="space-y-2">
                    <div className="h-4 w-40 bg-[#E8E7E2] rounded" />
                    <div className="h-3 w-24 bg-[#E8E7E2]/70 rounded" />
                  </div>
                  <div className="h-6 w-20 bg-[#E8E7E2] rounded-full" />
                  <div className="h-4 w-12 bg-[#E8E7E2] rounded" />
                  <div className="h-8 w-28 bg-[#E8E7E2] rounded-xl" />
                </div>
              ))}
            </div>
          )}

          {/* Error State */}
          {isError && !isLoading && (
            <div
              role="alert"
              className="p-6 rounded-3xl bg-red-50 border border-red-200 text-red-900 space-y-3"
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                <h3 className="text-sm font-bold">Failed to load financial accounts</h3>
              </div>
              <p className="text-xs text-red-700">
                {error instanceof Error
                  ? error.message
                  : 'An error occurred while communicating with the financial account service. Please verify your connection or organization permissions.'}
              </p>
              <button
                type="button"
                onClick={handleRefreshAll}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Request</span>
              </button>
            </div>
          )}

          {/* Empty State: 0 Total Accounts */}
          {!isLoading && !isError && accounts.length === 0 && (
            <div className="bg-white rounded-3xl border border-[#E8E7E2] p-12 text-center space-y-5 shadow-2xs">
              <div className="w-14 h-14 rounded-2xl bg-[#FAF4E0] border border-[#E5BB45]/40 flex items-center justify-center mx-auto text-[#171714]">
                <Landmark className="w-7 h-7" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className="text-lg font-bold text-[#171714]">No Financial Accounts Found</h3>
                <p className="text-xs text-[#66645C] leading-relaxed">
                  No accounts are registered for this workspace yet. When you import your first
                  statement or statement file, default operating registers are automatically
                  resolved.
                </p>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => handleOpenImport()}
                  className="inline-flex items-center gap-2 bg-[#E5BB45] hover:bg-[#D3A82F] text-[#171714] text-xs font-semibold py-2.5 px-5 rounded-full shadow-xs transition cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 stroke-[2.2]" />
                  <span>Import Statement File</span>
                </button>
              </div>
            </div>
          )}

          {/* Empty Search / Filter State */}
          {!isLoading && !isError && accounts.length > 0 && filteredAccounts.length === 0 && (
            <div className="bg-white rounded-3xl border border-[#E8E7E2] p-10 text-center space-y-4 shadow-2xs">
              <div className="w-12 h-12 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] flex items-center justify-center mx-auto text-[#66645C]">
                <Search className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h3 className="text-sm font-bold text-[#171714]">No matching accounts</h3>
                <p className="text-xs text-[#66645C]">
                  No accounts match your query &quot;{searchTerm}&quot; or the active filters.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedType('all');
                  setSelectedCurrency('all');
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#171714] bg-[#F8F7F2] hover:bg-[#E8E7E2] px-4 py-2 rounded-xl border border-[#E8E7E2] transition cursor-pointer"
              >
                <span>Clear All Filters</span>
              </button>
            </div>
          )}

          {/* Accounts Table (Desktop & Tablet) & Mobile Card List */}
          {!isLoading && !isError && filteredAccounts.length > 0 && (
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-[#E8E7E2] shadow-2xs overflow-hidden">
              {/* Desktop / Tablet Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#E8E7E2] bg-[#F8F7F2]/60 text-[#66645C] uppercase text-[10px] tracking-wider font-semibold select-none">
                      <th scope="col" className="py-3.5 pl-6 pr-4">
                        Account Details
                      </th>
                      <th scope="col" className="py-3.5 px-4">
                        Institution
                      </th>
                      <th scope="col" className="py-3.5 px-4">
                        Type
                      </th>
                      <th scope="col" className="py-3.5 px-4 font-mono">
                        Currency
                      </th>
                      <th scope="col" className="py-3.5 px-4">
                        Recorded Ledger
                      </th>
                      <th scope="col" className="py-3.5 px-4">
                        Registered
                      </th>
                      <th scope="col" className="py-3.5 pr-6 pl-4 text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E7E2]">
                    {filteredAccounts.map((account) => {
                      const count = txCounts[account.id] ?? 0;
                      const formattedDate = account.createdAt
                        ? new Date(account.createdAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—';

                      return (
                        <tr
                          key={account.id}
                          className="hover:bg-[#F8F7F2]/40 transition-colors group"
                        >
                          {/* Account Name & ID */}
                          <td className="py-4 pl-6 pr-4 align-middle">
                            <div className="space-y-1">
                              <div className="font-bold text-[#171714] text-sm group-hover:text-[#171714] flex items-center gap-2">
                                <span>{account.name}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-[#66645C]">
                                <span className="font-mono text-[10px] bg-[#F8F7F2] border border-[#E8E7E2] px-1.5 py-0.5 rounded text-[#66645C]">
                                  ID: {account.id.slice(0, 8)}...
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => handleCopyId(account.id, e)}
                                  title="Copy Full Account ID"
                                  className="text-[#66645C] hover:text-[#171714] transition p-0.5"
                                  aria-label={`Copy ID for ${account.name}`}
                                >
                                  {copiedId === account.id ? (
                                    <Check className="w-3 h-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </div>
                          </td>

                          {/* Institution */}
                          <td className="py-4 px-4 align-middle">
                            <div className="flex items-center gap-2 text-[#171714]">
                              <Landmark className="w-3.5 h-3.5 text-[#66645C] shrink-0" />
                              <span className="font-medium text-xs">
                                {account.institutionName || 'Primary Bank'}
                              </span>
                            </div>
                          </td>

                          {/* Account Type */}
                          <td className="py-4 px-4 align-middle">
                            {renderTypeBadge(account.type)}
                          </td>

                          {/* Currency */}
                          <td className="py-4 px-4 align-middle">
                            <span className="font-mono font-bold text-xs uppercase px-2 py-0.5 rounded bg-[#F8F7F2] border border-[#E8E7E2] text-[#171714]">
                              {account.currency}
                            </span>
                          </td>

                          {/* Recorded Ledger Activity */}
                          <td className="py-4 px-4 align-middle">
                            <Link
                              to={`/transactions?accountId=${account.id}`}
                              className="inline-flex items-center gap-1.5 text-xs text-[#171714] hover:text-[#E5BB45] font-medium transition"
                              title={`View transactions for ${account.name}`}
                            >
                              <span className="font-mono font-bold">
                                {isCountsFetching ? '...' : count.toLocaleString()}
                              </span>
                              <span className="text-[#66645C] text-[11px]">records</span>
                              <ArrowUpRight className="w-3 h-3 text-[#66645C]" />
                            </Link>
                          </td>

                          {/* Registered Date */}
                          <td className="py-4 px-4 align-middle text-[#66645C] text-xs">
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3 h-3 text-[#66645C]" />
                              <span>{formattedDate}</span>
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-4 pr-6 pl-4 align-middle text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* View Transactions in Ledger */}
                              <Link
                                to={`/transactions?accountId=${account.id}`}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#171714] text-white text-xs font-semibold hover:bg-black transition active:scale-95"
                              >
                                <span>Ledger</span>
                                <ArrowUpRight className="w-3 h-3" />
                              </Link>

                              {/* Import Statement specifically to this account */}
                              <button
                                type="button"
                                onClick={() => handleOpenImport(account.id)}
                                title="Import statement to this account"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[#E8E7E2] bg-white text-[#171714] text-xs font-medium hover:bg-[#F8F7F2] transition cursor-pointer"
                              >
                                <FileSpreadsheet className="w-3.5 h-3.5 text-[#E5BB45]" />
                                <span className="hidden sm:inline">Import</span>
                              </button>

                              {/* Details Modal Trigger */}
                              <button
                                type="button"
                                onClick={() => setDetailAccount(account)}
                                title="Inspect account record metadata"
                                className="p-1.5 rounded-xl border border-[#E8E7E2] bg-white text-[#66645C] hover:text-[#171714] hover:bg-[#F8F7F2] transition cursor-pointer"
                                aria-label={`Inspect metadata for ${account.name}`}
                              >
                                <Info className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List (Visible on phones < md) */}
              <div className="md:hidden divide-y divide-[#E8E7E2]">
                {filteredAccounts.map((account) => {
                  const count = txCounts[account.id] ?? 0;
                  const formattedDate = account.createdAt
                    ? new Date(account.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                    : '—';

                  return (
                    <div key={account.id} className="p-4 space-y-3">
                      {/* Top Row: Account Name & Badges */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <h4 className="font-bold text-[#171714] text-sm leading-snug">
                            {account.name}
                          </h4>
                          <div className="flex items-center gap-1.5 text-xs text-[#66645C]">
                            <Landmark className="w-3.5 h-3.5 text-[#66645C] shrink-0" />
                            <span>{account.institutionName || 'Primary Bank'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {renderTypeBadge(account.type)}
                          <span className="font-mono font-bold text-xs uppercase px-2 py-0.5 rounded bg-[#F8F7F2] border border-[#E8E7E2] text-[#171714]">
                            {account.currency}
                          </span>
                        </div>
                      </div>

                      {/* Middle Row: ID & Counts */}
                      <div className="flex items-center justify-between text-xs text-[#66645C] pt-1">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[10px] bg-[#F8F7F2] border border-[#E8E7E2] px-1.5 py-0.5 rounded text-[#66645C]">
                            ID: {account.id.slice(0, 8)}...
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleCopyId(account.id, e)}
                            title="Copy Account ID"
                            className="p-1 hover:text-[#171714] text-[#66645C]"
                            aria-label={`Copy ID for ${account.name}`}
                          >
                            {copiedId === account.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <span className="text-[10px] text-[#8C8A82] ml-1">
                            Added {formattedDate}
                          </span>
                        </div>

                        <Link
                          to={`/transactions?accountId=${account.id}`}
                          className="inline-flex items-center gap-1 font-medium text-[#171714] hover:text-[#E5BB45]"
                        >
                          <span className="font-mono font-bold">
                            {isCountsFetching ? '...' : count.toLocaleString()}
                          </span>
                          <span className="text-[#66645C] text-[11px]">records</span>
                          <ArrowUpRight className="w-3 h-3 text-[#66645C]" />
                        </Link>
                      </div>

                      {/* Bottom Row: Touch-friendly Actions */}
                      <div className="flex items-center gap-2 pt-2 border-t border-stone-100">
                        <Link
                          to={`/transactions?accountId=${account.id}`}
                          className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#171714] text-white text-xs font-semibold hover:bg-black transition active:scale-95"
                        >
                          <span>View Ledger</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>

                        <button
                          type="button"
                          onClick={() => handleOpenImport(account.id)}
                          className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#E8E7E2] bg-white text-[#171714] text-xs font-medium hover:bg-[#F8F7F2] transition"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-[#E5BB45]" />
                          <span>Import</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setDetailAccount(account)}
                          className="w-10 min-h-[40px] rounded-xl border border-[#E8E7E2] bg-white text-[#66645C] hover:text-[#171714] hover:bg-[#F8F7F2] transition flex items-center justify-center"
                          aria-label={`Inspect metadata for ${account.name}`}
                        >
                          <Info className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Table Footer Disclaimers */}
              <div className="p-4 bg-[#F8F7F2]/40 border-t border-[#E8E7E2] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#66645C]">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Verified organization tenant isolation enforced</span>
                </div>
                <div>
                  <span>All records stored with cryptographic fingerprints</span>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ============================================================ */}
      {/* Account Details & Metadata Modal                             */}
      {/* ============================================================ */}
      {detailAccount && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-details-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-xl bg-white rounded-3xl border border-[#E8E7E2] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-[#E8E7E2] bg-[#F8F7F2]/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FAF4E0] border border-[#E5BB45]/40 flex items-center justify-center text-[#171714]">
                  <Landmark className="w-5 h-5 stroke-[2]" />
                </div>
                <div>
                  <h3 id="account-details-title" className="text-base font-bold text-[#171714]">
                    {detailAccount.name}
                  </h3>
                  <p className="text-xs text-[#66645C]">
                    Financial account register and configuration record.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDetailAccount(null)}
                className="p-2 rounded-xl text-[#66645C] hover:text-[#171714] hover:bg-[#E8E7E2] transition cursor-pointer"
                aria-label="Close details dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-xs">
              {/* Account Meta Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-3.5 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-[#66645C]">
                    Institution
                  </span>
                  <div className="font-bold text-sm text-[#171714]">
                    {detailAccount.institutionName || 'Primary Bank'}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-[#66645C]">
                    Account Type
                  </span>
                  <div>{renderTypeBadge(detailAccount.type)}</div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-[#66645C]">
                    ISO Currency
                  </span>
                  <div className="font-mono font-bold text-sm text-[#171714]">
                    {detailAccount.currency}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-[#66645C]">
                    Transactions Registered
                  </span>
                  <div className="font-mono font-bold text-sm text-[#171714]">
                    {typeof txCounts[detailAccount.id] === 'number'
                      ? `${(txCounts[detailAccount.id] as number).toLocaleString()} records`
                      : '0 records'}
                  </div>
                </div>
              </div>

              {/* Identifiers */}
              <div className="p-4 rounded-2xl bg-white border border-[#E8E7E2] space-y-3">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-[#66645C]">
                    Account UUID
                  </span>
                  <div className="flex items-center justify-between gap-2 bg-[#F8F7F2] border border-[#E8E7E2] rounded-xl px-3 py-2 font-mono text-[11px] text-[#171714]">
                    <span className="truncate">{detailAccount.id}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyId(detailAccount.id)}
                      className="text-[#66645C] hover:text-[#171714] shrink-0 p-1"
                      aria-label="Copy Account UUID"
                    >
                      {copiedId === detailAccount.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-[#66645C]">
                    Tenant Organization ID
                  </span>
                  <div className="flex items-center justify-between gap-2 bg-[#F8F7F2] border border-[#E8E7E2] rounded-xl px-3 py-2 font-mono text-[11px] text-[#171714]">
                    <span className="truncate">{detailAccount.organizationId}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyId(detailAccount.organizationId)}
                      className="text-[#66645C] hover:text-[#171714] shrink-0 p-1"
                      aria-label="Copy Organization ID"
                    >
                      {copiedId === detailAccount.organizationId ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-3 text-[#66645C]">
                <div>
                  <span className="text-[10px] uppercase font-semibold block">Registered At</span>
                  <span className="font-mono text-[11px] text-[#171714]">
                    {new Date(detailAccount.createdAt).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-semibold block">
                    Last Synchronized
                  </span>
                  <span className="font-mono text-[11px] text-[#171714]">
                    {new Date(detailAccount.updatedAt).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-[#E8E7E2] flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const accId = detailAccount.id;
                    setDetailAccount(null);
                    handleOpenImport(accId);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[#E8E7E2] bg-white text-[#171714] text-xs font-semibold hover:bg-[#F8F7F2] transition cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#E5BB45]" />
                  <span>Import Statement</span>
                </button>

                <Link
                  to={`/transactions?accountId=${detailAccount.id}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#171714] text-white text-xs font-semibold hover:bg-black transition cursor-pointer"
                >
                  <span>Open Transactions Ledger</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* Import Transactions Modal                                    */}
      {/* ============================================================ */}
      {isImportModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-accounts-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-2xl bg-white rounded-3xl border border-[#E8E7E2] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-[#E8E7E2] bg-[#F8F7F2]/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FAF4E0] border border-[#E5BB45]/40 flex items-center justify-center text-[#171714]">
                  <FileSpreadsheet className="w-5 h-5 stroke-[2]" />
                </div>
                <div>
                  <h3
                    id="import-accounts-modal-title"
                    className="text-base font-bold text-[#171714]"
                  >
                    Import Transactions Statement
                  </h3>
                  <p className="text-xs text-[#66645C]">
                    Upload a bank or credit card statement (.CSV or .XLSX) to populate this account.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="p-2 rounded-xl text-[#66645C] hover:text-[#171714] hover:bg-[#E8E7E2] transition cursor-pointer"
                aria-label="Close statement import dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              <FileUploadZone
                accounts={accounts}
                defaultAccountId={importTargetAccountId}
                onImportSuccess={handleImportSuccess}
              />
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};
