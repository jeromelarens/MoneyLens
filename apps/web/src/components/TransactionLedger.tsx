import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { financialService } from '../services/financial.service';
import { formatCurrencyAmount } from '@moneylens/shared';
import type { Transaction, FinancialAccount } from '@moneylens/shared';
import {
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Receipt,
  RotateCcw,
  X,
  FileSpreadsheet,
  ChevronDown,
  ChevronUp,
  Hash,
  Copy,
  Check,
  AlertCircle,
} from 'lucide-react';

export interface TransactionLedgerProps {
  refreshTrigger?: number;
  initialAccountId?: string;
  initialDirection?: 'all' | 'debit' | 'credit';
  onImportClick?: () => void;
  showSummaryStrip?: boolean;
}

type DatePreset = 'all' | '30d' | '90d' | 'ytd' | 'custom';

export const TransactionLedger: React.FC<TransactionLedgerProps> = ({
  refreshTrigger,
  initialAccountId,
  initialDirection = 'all',
  onImportClick,
  showSummaryStrip = true,
}) => {
  // ---------------------------------------------------------------------------
  // State: Search & Filters
  // ---------------------------------------------------------------------------
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>(initialAccountId || 'all');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'debit' | 'credit'>(
    initialDirection,
  );
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [copiedFingerprint, setCopiedFingerprint] = useState<string | null>(null);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Sync initialAccountId if passed or updated
  useEffect(() => {
    if (initialAccountId !== undefined) {
      setSelectedAccountId(initialAccountId || 'all');
      setPage(1);
    }
  }, [initialAccountId]);

  // Compute ISO dates based on preset or custom range
  const { computedStartDate, computedEndDate } = useMemo(() => {
    if (datePreset === 'all') {
      return { computedStartDate: undefined, computedEndDate: undefined };
    }
    const now = new Date();
    if (datePreset === '30d') {
      const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { computedStartDate: d.toISOString(), computedEndDate: now.toISOString() };
    }
    if (datePreset === '90d') {
      const d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { computedStartDate: d.toISOString(), computedEndDate: now.toISOString() };
    }
    if (datePreset === 'ytd') {
      const d = new Date(now.getFullYear(), 0, 1);
      return { computedStartDate: d.toISOString(), computedEndDate: now.toISOString() };
    }
    if (datePreset === 'custom') {
      const startIso = customStartDate
        ? new Date(`${customStartDate}T00:00:00`).toISOString()
        : undefined;
      const endIso = customEndDate
        ? new Date(`${customEndDate}T23:59:59`).toISOString()
        : undefined;
      return { computedStartDate: startIso, computedEndDate: endIso };
    }
    return { computedStartDate: undefined, computedEndDate: undefined };
  }, [datePreset, customStartDate, customEndDate]);

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  // 1. Financial Accounts for mapping and selector
  const { data: accountsData } = useQuery({
    queryKey: ['financial-accounts'],
    queryFn: financialService.getAccounts,
    staleTime: 60000,
  });

  const accountsMap = useMemo(() => {
    const map = new Map<string, FinancialAccount>();
    if (accountsData?.items) {
      for (const acc of accountsData.items) {
        map.set(acc.id, acc);
      }
    }
    return map;
  }, [accountsData]);

  // 2. Normalized Transactions Query
  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: [
      'transactions',
      page,
      pageSize,
      selectedAccountId,
      directionFilter,
      computedStartDate,
      computedEndDate,
      debouncedSearch,
      refreshTrigger,
    ],
    queryFn: () =>
      financialService.getTransactions({
        page,
        limit: pageSize,
        accountId: selectedAccountId === 'all' ? undefined : selectedAccountId,
        direction: directionFilter === 'all' ? undefined : directionFilter,
        startDate: computedStartDate,
        endDate: computedEndDate,
        search: debouncedSearch.trim() || undefined,
      }),
    staleTime: 15000,
  });

  const transactions: Transaction[] = data?.items || [];
  const pagination = data?.pagination;

  // ---------------------------------------------------------------------------
  // Metric Summaries (Strictly for the current query result, segregated by currency)
  // Zero floating-point arithmetic. Minor units integer summation.
  // ---------------------------------------------------------------------------
  const summaryByCurrency = useMemo(() => {
    const curMap = new Map<
      string,
      { creditMinor: number; debitMinor: number; creditCount: number; debitCount: number }
    >();

    for (const tx of transactions) {
      const cur = tx.currency || 'USD';
      let entry = curMap.get(cur);
      if (!entry) {
        entry = { creditMinor: 0, debitMinor: 0, creditCount: 0, debitCount: 0 };
        curMap.set(cur, entry);
      }
      if (tx.direction === 'credit') {
        entry.creditMinor += tx.amountMinor;
        entry.creditCount += 1;
      } else {
        entry.debitMinor += tx.amountMinor;
        entry.debitCount += 1;
      }
    }

    return Array.from(curMap.entries()).map(([currency, stats]) => ({
      currency,
      creditMinor: stats.creditMinor,
      debitMinor: stats.debitMinor,
      netMovementMinor: stats.creditMinor - stats.debitMinor,
      creditCount: stats.creditCount,
      debitCount: stats.debitCount,
      totalCount: stats.creditCount + stats.debitCount,
    }));
  }, [transactions]);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      debouncedSearch.trim() !== '' ||
      selectedAccountId !== 'all' ||
      directionFilter !== 'all' ||
      datePreset !== 'all' ||
      customStartDate !== '' ||
      customEndDate !== ''
    );
  }, [
    debouncedSearch,
    selectedAccountId,
    directionFilter,
    datePreset,
    customStartDate,
    customEndDate,
  ]);

  const handleResetFilters = () => {
    setSearchTerm('');
    setDebouncedSearch('');
    setSelectedAccountId('all');
    setDirectionFilter('all');
    setDatePreset('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setPage(1);
  };

  const handleCopyFingerprint = (fingerprint: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(fingerprint);
      setCopiedFingerprint(fingerprint);
      setTimeout(() => setCopiedFingerprint(null), 2000);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-[#171714] tracking-tight">Financial Ledger</h2>
          <p className="text-xs text-[#66645C]">
            Normalized ledger transactions with integer minor unit precision.
          </p>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* Summary Metrics Strip (Honest, strictly current-view, segregated)     */}
      {/* ===================================================================== */}
      {showSummaryStrip && (
        <section
          aria-label="Filtered transaction summary"
          className="rounded-2xl border border-[#E8E7E2] bg-white p-5 shadow-xs space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E8E7E2]">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#66645C]">
                  Current View Register Summary
                </span>
                {isFetching && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#E5BB45]/15 text-[#171714]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E5BB45] animate-pulse" />
                    Updating
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#66645C]">
                Calculated strictly across the current filtered transactions. Preserves integer
                minor units without floating-point conversion.
              </p>
            </div>

            <div className="text-right">
              <span className="text-xs text-[#66645C]">Total Matching:</span>{' '}
              <span className="font-mono font-bold text-sm text-[#171714]">
                {pagination ? pagination.totalItems.toLocaleString() : transactions.length}
              </span>{' '}
              <span className="text-xs text-[#66645C]">records</span>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 rounded-xl bg-[#F8F7F2] animate-pulse h-20" />
              ))}
            </div>
          ) : summaryByCurrency.length === 0 ? (
            <div className="p-4 rounded-xl bg-[#F8F7F2] text-xs text-[#66645C] text-center">
              No transactions to summarize for the current view.
            </div>
          ) : (
            <div className="space-y-3">
              {summaryByCurrency.map((currSummary) => (
                <div key={currSummary.currency} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Credits / Inflows */}
                  <div className="p-3.5 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] space-y-1">
                    <div className="flex items-center justify-between text-xs text-[#66645C]">
                      <span className="flex items-center gap-1 font-medium text-emerald-800">
                        <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                        Page Inflows (Credits)
                      </span>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white border border-[#E8E7E2]">
                        {currSummary.currency}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono font-bold text-base sm:text-lg text-[#171714]">
                        +
                        {formatCurrencyAmount(
                          currSummary.creditMinor,
                          currSummary.currency,
                          true,
                          true,
                        )}
                      </span>
                      <span className="text-[11px] text-[#66645C] font-mono">
                        {currSummary.creditCount} {currSummary.creditCount === 1 ? 'item' : 'items'}
                      </span>
                    </div>
                  </div>

                  {/* Debits / Outflows */}
                  <div className="p-3.5 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] space-y-1">
                    <div className="flex items-center justify-between text-xs text-[#66645C]">
                      <span className="flex items-center gap-1 font-medium text-rose-800">
                        <ArrowDownLeft className="w-3.5 h-3.5 text-rose-600" />
                        Page Outflows (Debits)
                      </span>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white border border-[#E8E7E2]">
                        {currSummary.currency}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="font-mono font-bold text-base sm:text-lg text-[#171714]">
                        -
                        {formatCurrencyAmount(
                          currSummary.debitMinor,
                          currSummary.currency,
                          true,
                          true,
                        )}
                      </span>
                      <span className="text-[11px] text-[#66645C] font-mono">
                        {currSummary.debitCount} {currSummary.debitCount === 1 ? 'item' : 'items'}
                      </span>
                    </div>
                  </div>

                  {/* Net Movement */}
                  <div className="p-3.5 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] space-y-1">
                    <div className="flex items-center justify-between text-xs text-[#66645C]">
                      <span className="font-medium text-[#171714]">Page Net Cash Movement</span>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white border border-[#E8E7E2]">
                        {currSummary.currency}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span
                        className={`font-mono font-bold text-base sm:text-lg ${
                          currSummary.netMovementMinor >= 0 ? 'text-emerald-800' : 'text-rose-800'
                        }`}
                      >
                        {currSummary.netMovementMinor >= 0 ? '+' : '-'}
                        {formatCurrencyAmount(
                          Math.abs(currSummary.netMovementMinor),
                          currSummary.currency,
                          true,
                          true,
                        )}
                      </span>
                      <span className="text-[11px] text-[#66645C]">
                        {currSummary.totalCount} on page
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ===================================================================== */}
      {/* Search & Filter Toolbar                                               */}
      {/* ===================================================================== */}
      <section
        aria-label="Ledger filters and search"
        className="rounded-2xl border border-[#E8E7E2] bg-white p-4 shadow-xs space-y-4"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Left: Search input */}
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#66645C] pointer-events-none" />
            <input
              type="text"
              id="transaction-search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search description or reference..."
              className="w-full pl-9 pr-9 py-2 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] text-xs sm:text-sm text-[#171714] placeholder:text-[#66645C] focus:outline-none focus:ring-2 focus:ring-[#E5BB45] focus:border-transparent transition-all"
              aria-label="Search transaction description"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-[#66645C] hover:text-[#171714] transition-colors"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Right: Quick filter controls */}
          <div className="flex flex-wrap items-center gap-2 text-xs w-full sm:w-auto">
            {/* Account Selector */}
            <div className="relative w-full sm:w-auto">
              <label htmlFor="account-filter" className="sr-only">
                Filter by Financial Account
              </label>
              <select
                id="account-filter"
                value={selectedAccountId}
                onChange={(e) => {
                  setSelectedAccountId(e.target.value);
                  setPage(1);
                }}
                className="w-full sm:w-auto py-2 pl-3 pr-8 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] text-xs font-medium text-[#171714] focus:outline-none focus:ring-2 focus:ring-[#E5BB45] appearance-none cursor-pointer truncate"
              >
                <option value="all">All Accounts</option>
                {accountsData?.items?.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.institutionName} · {acc.currency})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-[#66645C] pointer-events-none" />
            </div>

            {/* Direction Filter Segmented Control */}
            <div className="inline-flex rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] p-0.5 font-medium">
              <button
                type="button"
                onClick={() => {
                  setDirectionFilter('all');
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  directionFilter === 'all'
                    ? 'bg-white text-[#171714] shadow-xs font-semibold'
                    : 'text-[#66645C] hover:text-[#171714]'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => {
                  setDirectionFilter('debit');
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  directionFilter === 'debit'
                    ? 'bg-rose-50 text-rose-900 border border-rose-200 shadow-xs font-semibold'
                    : 'text-[#66645C] hover:text-[#171714]'
                }`}
              >
                <ArrowDownLeft className="w-3 h-3 text-rose-600" />
                <span>Outflows</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setDirectionFilter('credit');
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                  directionFilter === 'credit'
                    ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 shadow-xs font-semibold'
                    : 'text-[#66645C] hover:text-[#171714]'
                }`}
              >
                <ArrowUpRight className="w-3 h-3 text-emerald-600" />
                <span>Inflows</span>
              </button>
            </div>

            {/* Date Preset Selector */}
            <div className="relative">
              <label htmlFor="date-preset" className="sr-only">
                Filter by Date Range
              </label>
              <select
                id="date-preset"
                value={datePreset}
                onChange={(e) => {
                  setDatePreset(e.target.value as DatePreset);
                  setPage(1);
                }}
                className="py-2 pl-3 pr-8 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] text-xs font-medium text-[#171714] focus:outline-none focus:ring-2 focus:ring-[#E5BB45] appearance-none cursor-pointer"
              >
                <option value="all">All Dates</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
                <option value="ytd">Year to Date (YTD)</option>
                <option value="custom">Custom Date Range...</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-[#66645C] pointer-events-none" />
            </div>

            {/* Toggle advanced / custom filters drawer */}
            {datePreset === 'custom' && (
              <div className="flex items-center gap-2 bg-[#F8F7F2] p-1.5 rounded-xl border border-[#E8E7E2]">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => {
                    setCustomStartDate(e.target.value);
                    setPage(1);
                  }}
                  className="px-2 py-1 bg-white border border-[#E8E7E2] rounded-lg text-xs font-mono text-[#171714] focus:outline-none focus:ring-1 focus:ring-[#E5BB45]"
                  aria-label="Start Date"
                />
                <span className="text-xs text-[#66645C]">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => {
                    setCustomEndDate(e.target.value);
                    setPage(1);
                  }}
                  className="px-2 py-1 bg-white border border-[#E8E7E2] rounded-lg text-xs font-mono text-[#171714] focus:outline-none focus:ring-1 focus:ring-[#E5BB45]"
                  aria-label="End Date"
                />
              </div>
            )}

            {/* Import Transactions shortcut if handler provided */}
            {onImportClick && (
              <button
                type="button"
                onClick={onImportClick}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#E5BB45] hover:bg-[#D3A82F] text-[#171714] font-semibold text-xs transition shadow-2xs cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#171714]"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 stroke-[2.2]" />
                <span>Import Statement</span>
              </button>
            )}
          </div>
        </div>

        {/* Active Filters Bar */}
        {hasActiveFilters && (
          <div className="pt-3 border-t border-[#E8E7E2] flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[#66645C] font-medium mr-1">Active filters:</span>

              {debouncedSearch && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F8F7F2] border border-[#E8E7E2] text-[#171714] font-medium">
                  <span>Search: &ldquo;{debouncedSearch}&rdquo;</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setDebouncedSearch('');
                    }}
                    className="p-0.5 hover:text-rose-600 cursor-pointer"
                    aria-label="Remove search filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {selectedAccountId !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F8F7F2] border border-[#E8E7E2] text-[#171714] font-medium">
                  <span>
                    Account: {accountsMap.get(selectedAccountId)?.name || selectedAccountId}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedAccountId('all')}
                    className="p-0.5 hover:text-rose-600 cursor-pointer"
                    aria-label="Remove account filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {directionFilter !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F8F7F2] border border-[#E8E7E2] text-[#171714] font-medium">
                  <span>
                    Direction:{' '}
                    {directionFilter === 'debit' ? 'Outflows (Debit)' : 'Inflows (Credit)'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDirectionFilter('all')}
                    className="p-0.5 hover:text-rose-600 cursor-pointer"
                    aria-label="Remove direction filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {datePreset !== 'all' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F8F7F2] border border-[#E8E7E2] text-[#171714] font-medium">
                  <span>
                    Period:{' '}
                    {datePreset === '30d'
                      ? 'Last 30 Days'
                      : datePreset === '90d'
                        ? 'Last 90 Days'
                        : datePreset === 'ytd'
                          ? 'Year to Date'
                          : `${customStartDate || '...'} to ${customEndDate || '...'}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDatePreset('all');
                      setCustomStartDate('');
                      setCustomEndDate('');
                    }}
                    className="p-0.5 hover:text-rose-600 cursor-pointer"
                    aria-label="Remove period filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 text-[#66645C] hover:text-[#171714] font-semibold underline underline-offset-2 transition cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset all filters</span>
            </button>
          </div>
        )}
      </section>

      {/* ===================================================================== */}
      {/* Transaction Table & Mobile Card List                                 */}
      {/* ===================================================================== */}
      <div className="rounded-2xl border border-[#E8E7E2] bg-white overflow-hidden shadow-xs">
        {/* State: Initial Loading Skeleton */}
        {isLoading ? (
          <div className="p-8 space-y-4">
            <div className="h-6 w-48 bg-[#F8F7F2] rounded-md animate-pulse" />
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-12 bg-[#F8F7F2] rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
        ) : isError ? (
          /* State: API Error with Retry */
          <div className="p-12 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6 stroke-[2]" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h3 className="text-base font-bold text-[#171714]">Unable to load transactions</h3>
              <p className="text-xs text-[#66645C]">
                {error instanceof Error ? error.message : 'A network or server error occurred.'}{' '}
                Your active filter settings have been preserved.
              </p>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#171714] text-white text-xs font-semibold hover:bg-black transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry Request</span>
            </button>
          </div>
        ) : transactions.length === 0 ? (
          /* State: Empty Dataset or Empty Filter Match */
          <div className="p-16 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#F8F7F2] border border-[#E8E7E2] mx-auto flex items-center justify-center text-[#66645C]">
              <Receipt className="w-7 h-7 stroke-[1.5]" />
            </div>

            {hasActiveFilters ? (
              <div className="space-y-2 max-w-md mx-auto">
                <h3 className="text-base font-bold text-[#171714]">
                  No transactions match current filters
                </h3>
                <p className="text-xs text-[#66645C]">
                  Try widening your search terms, clearing the account selector, or expanding your
                  date range.
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#F8F7F2] hover:bg-[#E8E7E2] border border-[#E8E7E2] text-[#171714] text-xs font-semibold transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear all filters</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 max-w-md mx-auto">
                <h3 className="text-base font-bold text-[#171714]">No transactions recorded yet</h3>
                <p className="text-xs text-[#66645C]">
                  Import your first bank or credit card statement (.CSV or .XLSX) to populate this
                  verified financial ledger.
                </p>
                {onImportClick && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={onImportClick}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#E5BB45] hover:bg-[#D3A82F] text-[#171714] text-xs font-semibold transition shadow-2xs cursor-pointer"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>Import First Statement</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* State: Transactions Populated */
          <div>
            {/* Desktop / Tablet Table View (hidden on mobile) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8F7F2] border-b border-[#E8E7E2] text-[#66645C] font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th scope="col" className="py-3 px-4">
                      Date
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Description
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Account &amp; Institution
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Direction
                    </th>
                    <th scope="col" className="py-3 px-4 text-right">
                      Amount
                    </th>
                    <th scope="col" className="py-3 px-4 text-right">
                      Reference &amp; Audit
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8E7E2]">
                  {transactions.map((tx) => {
                    const isDebit = tx.direction === 'debit';
                    const isExpanded = expandedTxId === tx.id;
                    const account = accountsMap.get(tx.accountId);
                    const formattedDate = new Date(tx.date).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    });

                    return (
                      <React.Fragment key={tx.id}>
                        <tr
                          className={`hover:bg-[#F8F7F2]/60 transition-colors ${
                            isExpanded ? 'bg-[#F8F7F2]/80' : ''
                          }`}
                        >
                          {/* Date */}
                          <td className="py-3.5 px-4 font-mono text-[#171714] whitespace-nowrap">
                            {formattedDate}
                          </td>

                          {/* Description */}
                          <td className="py-3.5 px-4 max-w-sm lg:max-w-md">
                            <div
                              className="font-semibold text-[#171714] truncate"
                              title={tx.description}
                            >
                              {tx.description}
                            </div>
                            {tx.sourceReference && (
                              <div className="text-[10px] text-[#66645C] font-mono truncate">
                                Ref: {tx.sourceReference}
                              </div>
                            )}
                          </td>

                          {/* Account & Institution */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <div className="font-medium text-[#171714]">
                              {account ? account.name : 'Unknown Account'}
                            </div>
                            <div className="text-[10px] text-[#66645C] flex items-center gap-1.5">
                              <span>{account?.institutionName || 'Synced Statement'}</span>
                              {account?.type && (
                                <span className="uppercase text-[9px] px-1 py-0.2 rounded bg-[#F8F7F2] border border-[#E8E7E2]">
                                  {account.type}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Direction Badge */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {isDebit ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                                <ArrowDownLeft className="w-3 h-3 text-rose-600" />
                                <span>Debit (Outflow)</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <ArrowUpRight className="w-3 h-3 text-emerald-600" />
                                <span>Credit (Inflow)</span>
                              </span>
                            )}
                          </td>

                          {/* Signed Monetary Value */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <div
                              className={`font-mono font-bold text-sm ${
                                isDebit ? 'text-rose-900' : 'text-emerald-900'
                              }`}
                            >
                              {isDebit ? '-' : '+'}
                              {formatCurrencyAmount(tx.amountMinor, tx.currency, true, true)}
                            </div>
                            <div className="text-[10px] font-mono text-[#66645C]">
                              {tx.currency} · {tx.amountMinor} minor
                            </div>
                          </td>

                          {/* Row Details Trigger */}
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setExpandedTxId(isExpanded ? null : tx.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-[#66645C] hover:text-[#171714] hover:bg-white border border-transparent hover:border-[#E8E7E2] transition cursor-pointer"
                              aria-expanded={isExpanded}
                              aria-label={`Toggle audit details for transaction ${tx.description}`}
                            >
                              <span>{isExpanded ? 'Hide' : 'Details'}</span>
                              {isExpanded ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                            </button>
                          </td>
                        </tr>

                        {/* Expandable Audit Details Row */}
                        {isExpanded && (
                          <tr className="bg-[#F8F7F2]/90 border-b border-[#E8E7E2]">
                            <td colSpan={6} className="p-4">
                              <div className="rounded-xl bg-white border border-[#E8E7E2] p-4 space-y-3">
                                <div className="flex items-center justify-between pb-2 border-b border-[#E8E7E2] text-xs">
                                  <div className="flex items-center gap-2">
                                    <Hash className="w-3.5 h-3.5 text-[#E5BB45]" />
                                    <span className="font-bold text-[#171714]">
                                      Verified Audit Record
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono text-[#66645C]">
                                    ID: {tx.id}
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                                  <div className="space-y-1">
                                    <span className="text-[#66645C] block text-[11px]">
                                      Deterministic Fingerprint
                                    </span>
                                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#171714] bg-[#F8F7F2] p-1.5 rounded border border-[#E8E7E2]">
                                      <span className="truncate">{tx.fingerprint}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleCopyFingerprint(tx.fingerprint)}
                                        className="shrink-0 p-1 hover:text-[#171714] text-[#66645C]"
                                        title="Copy fingerprint"
                                      >
                                        {copiedFingerprint === tx.fingerprint ? (
                                          <Check className="w-3 h-3 text-emerald-600" />
                                        ) : (
                                          <Copy className="w-3 h-3" />
                                        )}
                                      </button>
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <span className="text-[#66645C] block text-[11px]">
                                      Account Relationship
                                    </span>
                                    <p className="font-medium text-[#171714]">
                                      {account?.name || 'Unassigned'} ({tx.accountId})
                                    </p>
                                    <p className="text-[10px] text-[#66645C]">
                                      Institution: {account?.institutionName || 'N/A'}
                                    </p>
                                  </div>

                                  <div className="space-y-1">
                                    <span className="text-[#66645C] block text-[11px]">
                                      Ingestion Origin
                                    </span>
                                    <p className="font-mono text-[11px] text-[#171714]">
                                      Job: {tx.importJobId}
                                    </p>
                                    <p className="text-[10px] text-[#66645C]">
                                      Recorded: {new Date(tx.createdAt).toLocaleString()}
                                    </p>
                                  </div>
                                </div>

                                {tx.rawSourceData && Object.keys(tx.rawSourceData).length > 0 && (
                                  <div className="pt-2 border-t border-[#E8E7E2] space-y-1.5">
                                    <span className="text-[11px] font-semibold text-[#66645C]">
                                      Original Statement Row Fields:
                                    </span>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
                                      {Object.entries(tx.rawSourceData).map(([key, val]) => (
                                        <div
                                          key={key}
                                          className="p-1.5 rounded bg-[#F8F7F2] border border-[#E8E7E2] truncate"
                                        >
                                          <span className="text-[#66645C] block truncate">
                                            {key}:
                                          </span>
                                          <span className="text-[#171714] font-semibold truncate block">
                                            {String(val)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View (visible on < md screens) */}
            <div className="md:hidden divide-y divide-[#E8E7E2]">
              {transactions.map((tx) => {
                const isDebit = tx.direction === 'debit';
                const account = accountsMap.get(tx.accountId);
                const isExpanded = expandedTxId === tx.id;
                const formattedDate = new Date(tx.date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                });

                return (
                  <div key={tx.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <span className="text-[11px] font-mono text-[#66645C]">
                          {formattedDate}
                        </span>
                        <h4 className="text-xs font-bold text-[#171714] leading-snug">
                          {tx.description}
                        </h4>
                        <div className="text-[10px] text-[#66645C]">
                          {account ? account.name : 'Unknown Account'}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div
                          className={`font-mono font-bold text-sm ${
                            isDebit ? 'text-rose-900' : 'text-emerald-900'
                          }`}
                        >
                          {isDebit ? '-' : '+'}
                          {formatCurrencyAmount(tx.amountMinor, tx.currency, true, true)}
                        </div>
                        <span
                          className={`inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase px-1.5 py-0.2 rounded-full ${
                            isDebit ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'
                          }`}
                        >
                          {isDebit ? 'Debit' : 'Credit'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="font-mono text-[10px] text-[#66645C] truncate max-w-[180px]">
                        {tx.sourceReference
                          ? `Ref: ${tx.sourceReference}`
                          : `FP: ${tx.fingerprint.slice(0, 10)}...`}
                      </span>

                      <button
                        type="button"
                        onClick={() => setExpandedTxId(isExpanded ? null : tx.id)}
                        className="text-xs font-semibold text-[#171714] underline underline-offset-2"
                      >
                        {isExpanded ? 'Hide Details' : 'View Audit Details'}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="rounded-xl bg-[#F8F7F2] p-3 text-xs space-y-2 border border-[#E8E7E2]">
                        <div className="space-y-1">
                          <span className="text-[10px] text-[#66645C] block">Fingerprint:</span>
                          <span className="font-mono text-[10px] text-[#171714] break-all">
                            {tx.fingerprint}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] text-[#66645C] block">Import Job:</span>
                          <span className="font-mono text-[10px] text-[#171714] break-all">
                            {tx.importJobId}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[10px] text-[#66645C] block">
                            Integer Minor Units:
                          </span>
                          <span className="font-mono text-[10px] text-[#171714]">
                            {tx.amountMinor} ({tx.currency})
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* Pagination & Rows-Per-Page Controls                                  */}
        {/* ===================================================================== */}
        {pagination && pagination.totalPages > 0 && (
          <div className="p-4 border-t border-[#E8E7E2] bg-[#F8F7F2] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#66645C]">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 w-full sm:w-auto">
              <span>
                Showing page <strong className="text-[#171714]">{pagination.page}</strong> of{' '}
                <strong className="text-[#171714]">{pagination.totalPages}</strong> (
                <strong className="text-[#171714]">{pagination.totalItems.toLocaleString()}</strong>{' '}
                total transactions)
              </span>

              {/* Rows per page selector */}
              <div className="flex items-center gap-1.5">
                <label htmlFor="page-size-select" className="text-[11px] text-[#66645C]">
                  Show:
                </label>
                <select
                  id="page-size-select"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="px-2 py-1.5 bg-white border border-[#E8E7E2] rounded-lg text-xs font-medium text-[#171714] cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#E5BB45]"
                >
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-end">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isFetching}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-[#E8E7E2] text-xs font-semibold text-[#171714] hover:bg-[#F8F7F2] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shadow-2xs"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages || isFetching}
                className="min-h-[40px] inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-[#E8E7E2] text-xs font-semibold text-[#171714] hover:bg-[#F8F7F2] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer shadow-2xs"
                aria-label="Next page"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
