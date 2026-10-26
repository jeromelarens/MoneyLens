import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { financialService } from '../services/financial.service';
import { healthService } from '../services/health.service';
import { ExecutiveActivityChart } from './ExecutiveActivityChart';
import { Layout } from './Layout';
import { formatCurrencyAmount } from '@moneylens/shared';
import type { Transaction, FinancialFinding, BusinessAction } from '@moneylens/shared';
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  ShieldAlert,
  CheckCircle2,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  FileSpreadsheet,
  Zap,
  RefreshCw,
  Coins,
  ArrowLeftRight,
  AlertCircle,
  HelpCircle,
  UploadCloud,
} from 'lucide-react';

export interface ExecutiveDashboardProps {
  onNavigateTab?: (
    tab: 'ingestion' | 'reconciliation' | 'findings' | 'cash-flow' | 'actions' | 'telemetry',
  ) => void;
}

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({ onNavigateTab }) => {
  const navigate = useNavigate();

  // Page title
  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'Executive Financial Overview — MoneyLens';
    return () => {
      document.title = originalTitle;
    };
  }, []);

  const organizationBaseCurrency = useMemo(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('ml_organization_currency') || 'USD';
    }
    return 'USD';
  }, []);

  // Filter State
  const [period, setPeriod] = useState<'30d' | '90d' | 'ytd' | 'all'>('30d');
  const [activeCurrency, setActiveCurrency] = useState<string>(organizationBaseCurrency);

  // Compute ISO Dates for API parameters based on selected period
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    if (period === 'all') {
      return { startDate: undefined, endDate: undefined };
    }
    const end = now.toISOString();
    let start: string;
    if (period === '30d') {
      const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      start = d.toISOString();
    } else if (period === '90d') {
      const d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      start = d.toISOString();
    } else {
      // 'ytd'
      const d = new Date(now.getFullYear(), 0, 1);
      start = d.toISOString();
    }
    return { startDate: start, endDate: end };
  }, [period]);

  // =========================================================================
  // API Queries (Real authenticated data layer)
  // =========================================================================

  // 1. Financial Accounts
  const { data: accountsData } = useQuery({
    queryKey: ['executive-accounts'],
    queryFn: financialService.getAccounts,
    staleTime: 30000,
  });

  // 2. Normalized Transactions (Filtered by date range)
  const {
    data: transactionsData,
    isLoading: isTransactionsLoading,
    isError: isTransactionsError,
    refetch: refetchTransactions,
    isFetching: isTransactionsFetching,
  } = useQuery({
    queryKey: ['executive-transactions', startDate, endDate],
    queryFn: () => financialService.getTransactions({ startDate, endDate, limit: 100 }),
    staleTime: 30000,
  });

  // 3. Reconciliation Runs
  const { data: reconciliationRunsData } = useQuery({
    queryKey: ['executive-reconciliation-runs'],
    queryFn: () => financialService.getReconciliationRuns(1, 5),
    staleTime: 30000,
  });

  // 4. Financial Findings & Exposure Summary
  const { data: findingsSummaryData } = useQuery({
    queryKey: ['executive-findings-summary'],
    queryFn: financialService.getFindingsSummary,
    staleTime: 30000,
  });

  // 5. Recent Financial Findings
  const { data: findingsListData } = useQuery({
    queryKey: ['executive-findings-list'],
    queryFn: () => financialService.getFindings({ page: 1, limit: 4 }),
    staleTime: 30000,
  });

  // 6. Cash Flow Summary
  const { data: cashFlowSummaryData } = useQuery({
    queryKey: ['executive-cashflow-summary'],
    queryFn: financialService.getCashFlowSummary,
    staleTime: 30000,
  });

  // 7. Recent Forecast Runs
  useQuery({
    queryKey: ['executive-forecast-runs'],
    queryFn: () => financialService.listForecastRuns({ page: 1, limit: 1 }),
    staleTime: 30000,
  });

  // 8. Business Actions Summary
  const { data: actionSummaryData } = useQuery({
    queryKey: ['executive-action-summary'],
    queryFn: financialService.getActionSummary,
    staleTime: 30000,
  });

  // 9. Open Business Actions
  const { data: actionsListData } = useQuery({
    queryKey: ['executive-actions-list'],
    queryFn: () => financialService.getActions({ page: 1, limit: 4, status: 'open' }),
    staleTime: 30000,
  });

  // Telemetry check
  const { data: healthData } = useQuery({
    queryKey: ['executive-health'],
    queryFn: healthService.getHealth,
    staleTime: 30000,
  });

  // =========================================================================
  // Currency-Segregated Financial Calculations
  // Strictly integer minor units with ZERO floating-point operations
  // =========================================================================
  const allTransactions: Transaction[] = transactionsData?.items || [];

  // Available currencies discovered across accounts and transactions
  const availableCurrencies = useMemo(() => {
    const set = new Set<string>();
    if (organizationBaseCurrency) set.add(organizationBaseCurrency);
    for (const t of allTransactions) {
      if (t.currency) set.add(t.currency);
    }
    if (accountsData?.items) {
      for (const a of accountsData.items) {
        if (a.currency) set.add(a.currency);
      }
    }
    return Array.from(set);
  }, [allTransactions, accountsData, organizationBaseCurrency]);

  // Adjust activeCurrency if not in list
  useEffect(() => {
    if (availableCurrencies.length > 0 && !availableCurrencies.includes(activeCurrency)) {
      setActiveCurrency(availableCurrencies[0]!);
    }
  }, [availableCurrencies, activeCurrency]);

  // Transactions partitioned strictly for the active reporting currency
  const currencyTransactions = useMemo(() => {
    return allTransactions.filter((t) => t.currency === activeCurrency);
  }, [allTransactions, activeCurrency]);

  const { totalIncomeMinor, totalExpenseMinor, netMovementMinor } = useMemo(() => {
    let income = 0;
    let expense = 0;

    for (const t of currencyTransactions) {
      if (t.direction === 'credit') {
        income += t.amountMinor;
      } else {
        expense += t.amountMinor;
      }
    }

    return {
      totalIncomeMinor: income,
      totalExpenseMinor: expense,
      netMovementMinor: income - expense,
    };
  }, [currencyTransactions]);

  // Latest reconciliation run metrics
  const latestReconciliationRun = reconciliationRunsData?.items?.[0] || null;

  // Findings exposure for active currency
  const currencyFindingsExposureMinor = useMemo(() => {
    const curSummary = findingsSummaryData?.byCurrency?.[activeCurrency];
    return curSummary?.potentialExposureMinor ?? 0;
  }, [findingsSummaryData, activeCurrency]);

  // Cash flow outlook for active currency
  const currencyCashFlow = useMemo(() => {
    return cashFlowSummaryData?.byCurrency?.[activeCurrency] || null;
  }, [cashFlowSummaryData, activeCurrency]);

  // Open Actions count
  const openActionsCount = actionSummaryData?.data?.totalOpen ?? 0;
  const criticalActionsCount = actionSummaryData?.data?.criticalPriorityCount ?? 0;
  const highActionsCount = actionSummaryData?.data?.highPriorityCount ?? 0;

  const handleTabNavigation = (
    tab: 'ingestion' | 'reconciliation' | 'findings' | 'cash-flow' | 'actions' | 'telemetry',
  ) => {
    if (onNavigateTab) {
      onNavigateTab(tab);
    } else if (tab === 'findings') {
      navigate('/findings');
    } else if (tab === 'reconciliation') {
      navigate('/reconciliation');
    } else if (tab === 'ingestion') {
      navigate('/imports');
    } else if (tab === 'cash-flow') {
      navigate('/cash-flow');
    } else if (tab === 'actions') {
      navigate('/actions');
    } else if (tab === 'telemetry') {
      navigate('/diagnostics');
    } else {
      navigate(`/app?tab=${tab}`);
    }
  };

  return (
    <Layout pageTitle="Executive Overview" pageSubtitle="Financial Intelligence">
      <div className="space-y-10">
        {/* Page Header & Filtering Controls */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-[#E8E7E2]">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#E8E7E2] shadow-2xs text-xs font-semibold text-[#66645C]">
              <span className="w-2 h-2 rounded-full bg-[#E5BB45]" />
              <span>Real-Time Financial Intelligence</span>
              {healthData?.status === 'ok' && (
                <span className="text-emerald-700 font-medium">&bull; API Online</span>
              )}
            </div>

            <h1 className="font-serif text-3xl sm:text-4xl text-[#171714] font-normal tracking-tight">
              Executive Financial Overview<span className="text-[#E5BB45]">.</span>
            </h1>
            <p className="font-sans text-sm sm:text-base text-[#66645C] leading-relaxed">
              Consolidated cash movements, automated reconciliation progress, detected leakage, and
              prioritized operational actions.
            </p>
          </div>

          {/* Controls: Reporting Currency & Date Range */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Currency Selector (strictly segregated) */}
            {availableCurrencies.length > 1 && (
              <div className="flex items-center bg-white border border-[#E8E7E2] rounded-xl p-1 shadow-2xs">
                <span className="text-xs font-semibold text-[#66645C] px-2 flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5 text-[#E5BB45]" />
                  <span className="hidden xs:inline">Currency:</span>
                </span>
                <div className="flex items-center gap-1">
                  {availableCurrencies.map((cur) => (
                    <button
                      key={cur}
                      type="button"
                      onClick={() => setActiveCurrency(cur)}
                      className={`px-2.5 py-1.5 min-h-[36px] text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center ${
                        activeCurrency === cur
                          ? 'bg-[#171714] text-white shadow-2xs'
                          : 'text-[#66645C] hover:text-[#171714] hover:bg-[#F8F7F2]'
                      }`}
                    >
                      {cur}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Date Range Selector */}
            <div className="flex items-center bg-white border border-[#E8E7E2] rounded-xl p-1 shadow-2xs">
              <span className="text-xs font-semibold text-[#66645C] px-2 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#E5BB45]" />
                <span className="hidden sm:inline">Period:</span>
              </span>
              <div className="flex items-center gap-1">
                {(['30d', '90d', 'ytd', 'all'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={`px-2.5 py-1.5 min-h-[36px] text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center ${
                      period === p
                        ? 'bg-[#171714] text-white shadow-2xs'
                        : 'text-[#66645C] hover:text-[#171714] hover:bg-[#F8F7F2]'
                    }`}
                  >
                    {p === '30d' ? '30D' : p === '90d' ? '90D' : p === 'ytd' ? 'YTD' : 'All'}
                  </button>
                ))}
              </div>
            </div>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => refetchTransactions()}
              disabled={isTransactionsFetching}
              title="Refresh ledger data"
              className="p-2 rounded-xl bg-white border border-[#E8E7E2] hover:bg-[#F8F7F2] text-[#66645C] hover:text-[#171714] transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
              aria-label="Refresh financial data"
            >
              <RefreshCw
                className={`w-4 h-4 ${isTransactionsFetching ? 'animate-spin text-[#E5BB45]' : ''}`}
              />
            </button>
          </div>
        </div>

        {/* Global Error Banner if API Network Fails */}
        {isTransactionsError && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-900">Unable to synchronize ledger</p>
                <p className="mt-0.5 text-rose-700">
                  Failed to fetch transaction activity from the server. Your network or
                  authentication may be interrupted.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => refetchTransactions()}
              className="px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-900 text-xs font-semibold transition-colors shrink-0 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Intentional First-Use Empty State Callout when no statements have been ingested */}
        {allTransactions.length === 0 && !isTransactionsLoading && !isTransactionsError && (
          <div
            data-testid="first-use-onboarding"
            className="rounded-2xl border border-[#DEDDD5] bg-white p-6 sm:p-8 shadow-2xs"
          >
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#F8F7F2] border border-[#DEDDD5] text-xs font-semibold text-[#66645C]">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#E5BB45]" />
                  <span>First-Use Setup &bull; Statement Ingestion</span>
                </div>
                <h2 className="font-serif text-xl sm:text-2xl text-[#171714] font-normal tracking-tight">
                  Welcome to MoneyLens. Ingest your first statement to activate intelligence.
                </h2>
                <p className="font-sans text-xs sm:text-sm text-[#66645C] leading-relaxed">
                  Your workspace has no financial transactions recorded yet. Upload a bank or credit
                  card statement in CSV or XLSX format to generate verified cash-flow analytics,
                  reconcile account payments, and detect financial leakage.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0 w-full sm:w-auto">
                <Link
                  to="/imports"
                  className="inline-flex items-center justify-center gap-2 bg-[#E5BB45] hover:bg-[#D3A82F] text-[#171714] text-xs sm:text-sm font-semibold py-2.5 px-5 rounded-full shadow-2xs hover:shadow transition-all duration-150 active:scale-95 text-center"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>Upload Statement (CSV/XLSX)</span>
                </Link>
                <Link
                  to="/accounts"
                  className="inline-flex items-center justify-center gap-2 bg-white hover:bg-[#F8F7F2] border border-[#DEDDD5] text-[#171714] text-xs sm:text-sm font-semibold py-2.5 px-4 rounded-full transition-colors text-center"
                >
                  <span>Manage Accounts</span>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* 1. What is happening financially?                             */}
        {/* Supported Financial Metrics: Income, Expenses, Net Movement, */}
        {/* and Reconciliation Progress.                                 */}
        {/* ============================================================ */}
        <section aria-labelledby="section-financial-summary" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#66645C]">
                <span>Question 1</span>
                <span>&bull;</span>
                <span className="text-[#171714]">Financial Position</span>
              </div>
              <h2
                id="section-financial-summary"
                className="font-serif text-2xl text-[#171714] font-normal tracking-tight mt-0.5"
              >
                What is happening financially?
              </h2>
            </div>

            <Link
              to="/transactions"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#66645C] hover:text-[#171714] transition-colors"
            >
              <span>View full ledger</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* 4 Primary Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {/* Card 1: Total Income (Credits) */}
            <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#E8E7E2] shadow-2xs hover:border-stone-400/60 transition-colors">
              <div className="flex items-center justify-between text-xs font-semibold text-[#66645C] mb-2.5">
                <span className="uppercase tracking-wider">Total Income (Credits)</span>
                <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ArrowDownRight className="w-3.5 h-3.5" />
                </div>
              </div>

              {isTransactionsLoading ? (
                <div className="h-8 w-28 bg-stone-100 rounded animate-pulse my-1" />
              ) : (
                <div className="font-mono text-xl sm:text-2xl lg:text-3xl font-semibold text-[#171714] tracking-tight break-words">
                  {formatCurrencyAmount(totalIncomeMinor, activeCurrency, true, true)}
                </div>
              )}

              <p className="text-[11px] text-[#66645C] mt-2 flex items-center gap-1">
                <span>Verified statement receipts ({activeCurrency})</span>
              </p>
            </div>

            {/* Card 2: Total Expenses (Debits) */}
            <div className="bg-white rounded-2xl p-4 sm:p-6 border border-[#E8E7E2] shadow-2xs hover:border-stone-400/60 transition-colors">
              <div className="flex items-center justify-between text-xs font-semibold text-[#66645C] mb-2.5">
                <span className="uppercase tracking-wider">Total Expenses (Debits)</span>
                <div className="p-1.5 rounded-lg bg-stone-100 text-[#171714] border border-[#E8E7E2]">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </div>
              </div>

              {isTransactionsLoading ? (
                <div className="h-8 w-28 bg-stone-100 rounded animate-pulse my-1" />
              ) : (
                <div className="font-mono text-xl sm:text-2xl lg:text-3xl font-semibold text-[#171714] tracking-tight break-words">
                  {formatCurrencyAmount(totalExpenseMinor, activeCurrency, true, true)}
                </div>
              )}

              <p className="text-[11px] text-[#66645C] mt-2 flex items-center gap-1">
                <span>Outflows across bank &amp; card accounts</span>
              </p>
            </div>

            {/* Card 3: Net Movement */}
            <div className="bg-white rounded-2xl p-4 sm:p-6 border border-[#E8E7E2] shadow-2xs hover:border-stone-400/60 transition-colors">
              <div className="flex items-center justify-between text-xs font-semibold text-[#66645C] mb-2.5">
                <span className="uppercase tracking-wider">Net Movement</span>
                <div
                  className={`p-1.5 rounded-lg border ${
                    netMovementMinor >= 0
                      ? 'bg-[#E5BB45]/15 text-[#171714] border-[#E5BB45]/40'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}
                >
                  {netMovementMinor >= 0 ? (
                    <TrendingUp className="w-3.5 h-3.5" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5" />
                  )}
                </div>
              </div>

              {isTransactionsLoading ? (
                <div className="h-8 w-28 bg-stone-100 rounded animate-pulse my-1" />
              ) : (
                <div
                  className={`font-mono text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight break-words ${
                    netMovementMinor >= 0 ? 'text-[#171714]' : 'text-rose-700'
                  }`}
                >
                  {formatCurrencyAmount(netMovementMinor, activeCurrency, true, true)}
                </div>
              )}

              <p className="text-[11px] text-[#66645C] mt-2 leading-tight">
                Net statement flow. Does not represent total bank balance.
              </p>
            </div>

            {/* Card 4: Reconciliation Progress */}
            <div className="bg-white rounded-2xl p-4 sm:p-6 border border-[#E8E7E2] shadow-2xs hover:border-stone-400/60 transition-colors">
              <div className="flex items-center justify-between text-xs font-semibold text-[#66645C] mb-2.5">
                <span className="uppercase tracking-wider">Reconciliation Health</span>
                <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                </div>
              </div>

              {latestReconciliationRun ? (
                <div>
                  <div className="font-mono text-xl sm:text-2xl lg:text-3xl font-semibold text-[#171714] tracking-tight break-words">
                    {latestReconciliationRun.totalSourceTransactions > 0
                      ? `${Math.round(
                          (latestReconciliationRun.matchedCount /
                            latestReconciliationRun.totalSourceTransactions) *
                            100,
                        )}%`
                      : '100%'}
                  </div>
                  <p className="text-[11px] text-[#66645C] mt-2 flex items-center justify-between">
                    <span>{latestReconciliationRun.matchedCount} matched</span>
                    {latestReconciliationRun.reviewCount > 0 && (
                      <span className="text-amber-700 font-semibold">
                        {latestReconciliationRun.reviewCount} need review
                      </span>
                    )}
                  </p>
                </div>
              ) : (
                <div>
                  <div className="font-mono text-lg text-stone-400 font-medium py-1">
                    No active run
                  </div>
                  <p className="text-[11px] text-[#66645C] mt-2">
                    Run reconciliation to verify match rate
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Activity Chart Container */}
          <div className="bg-white rounded-2xl p-6 border border-[#E8E7E2] shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-serif text-lg text-[#171714] font-normal">
                  Historical Financial Activity
                </h3>
                <p className="text-xs text-[#66645C]">
                  Income versus expenses normalized in {activeCurrency} across verified
                  transactions.
                </p>
              </div>

              <div className="text-xs text-[#66645C] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
                <span>Integer minor unit math</span>
              </div>
            </div>

            <ExecutiveActivityChart
              transactions={currencyTransactions}
              currency={activeCurrency}
              period={period}
            />
          </div>
        </section>

        {/* ============================================================ */}
        {/* 2. What needs attention?                                      */}
        {/* Financial Findings & Leakage Detection                       */}
        {/* ============================================================ */}
        <section aria-labelledby="section-findings" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#66645C]">
                <span>Question 2</span>
                <span>&bull;</span>
                <span className="text-[#171714]">Leakage &amp; Inconsistencies</span>
              </div>
              <h2
                id="section-findings"
                className="font-serif text-2xl text-[#171714] font-normal tracking-tight mt-0.5"
              >
                What needs attention?
              </h2>
            </div>

            <button
              type="button"
              onClick={() => handleTabNavigation('findings')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#66645C] hover:text-[#171714] transition-colors"
            >
              <span>Inspect all findings</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Findings Exposure Summary Card (Left 4 cols) */}
            <div className="lg:col-span-4 bg-white rounded-2xl p-6 border border-[#E8E7E2] shadow-2xs flex flex-col justify-between space-y-5">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-800 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200 mb-3">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                  <span>Potential Leakage Exposure</span>
                </div>

                <div className="font-mono text-3xl font-semibold text-[#171714] tracking-tight">
                  {formatCurrencyAmount(currencyFindingsExposureMinor, activeCurrency, true, true)}
                </div>

                <p className="text-xs text-[#66645C] mt-2 leading-relaxed">
                  Identified by deterministic rules (duplicate charges, price spikes, recurring
                  variances).
                </p>
              </div>

              {/* Severity Breakdown */}
              <div className="pt-4 border-t border-[#E8E7E2] space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#66645C] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-600" />
                    <span>High Severity</span>
                  </span>
                  <span className="font-mono font-semibold text-[#171714]">
                    {findingsSummaryData?.highSeverityCount ?? 0}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#66645C] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>Medium Severity</span>
                  </span>
                  <span className="font-mono font-semibold text-[#171714]">
                    {findingsSummaryData?.mediumSeverityCount ?? 0}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[#66645C] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span>Low Severity</span>
                  </span>
                  <span className="font-mono font-semibold text-[#171714]">
                    {findingsSummaryData?.lowSeverityCount ?? 0}
                  </span>
                </div>
              </div>

              {/* Editorial Disclaimer */}
              <div className="p-3 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] text-[11px] text-[#66645C] leading-normal flex items-start gap-2">
                <HelpCircle className="w-3.5 h-3.5 text-stone-400 shrink-0 mt-0.5" />
                <span>
                  Potential exposure represents unreviewed variance, not confirmed fraud or loss.
                </span>
              </div>
            </div>

            {/* Findings List (Right 8 cols) */}
            <div className="lg:col-span-8 bg-white rounded-2xl p-6 border border-[#E8E7E2] shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-lg text-[#171714] font-normal">
                  Recent Anomalies Requiring Human Review
                </h3>
                <span className="text-xs text-[#66645C]">
                  {findingsListData?.pagination?.totalItems ?? 0} total findings
                </span>
              </div>

              {findingsListData?.items && findingsListData.items.length > 0 ? (
                <div className="divide-y divide-[#E8E7E2]">
                  {findingsListData.items.map((finding: FinancialFinding) => {
                    const isHigh = finding.severity === 'high';
                    const isMed = finding.severity === 'medium';

                    return (
                      <div
                        key={finding.id}
                        className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                isHigh
                                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                                  : isMed
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-blue-50 text-blue-800 border-blue-200'
                              }`}
                            >
                              {finding.severity}
                            </span>
                            <span className="text-xs font-semibold text-[#171714]">
                              {finding.title}
                            </span>
                          </div>
                          <p className="text-xs text-[#66645C] line-clamp-1">{finding.summary}</p>
                        </div>

                        <div className="flex items-center gap-4 shrink-0 sm:text-right">
                          <div>
                            <span className="text-xs font-mono font-semibold text-[#171714]">
                              {formatCurrencyAmount(
                                finding.estimatedAmountMinor,
                                finding.currency,
                                true,
                                true,
                              )}
                            </span>
                            <span className="block text-[10px] text-[#66645C]">
                              {new Date(finding.createdAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleTabNavigation('findings')}
                            className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold text-[#171714] hover:text-[#D3A82F] hover:bg-[#F8F7F2] transition-colors"
                            title="Inspect finding"
                            aria-label={`Inspect finding ${finding.title}`}
                          >
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-44 rounded-xl border border-dashed border-[#E8E7E2] bg-[#F8F7F2] flex flex-col items-center justify-center p-6 text-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 mb-2" />
                  <p className="font-serif text-base text-[#171714]">
                    No Leakage or Discrepancies Found
                  </p>
                  <p className="text-xs text-[#66645C] mt-1 max-w-sm">
                    Deterministic checks did not detect any duplicate payments or unauthorized price
                    variances across current statements.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* 3. What could happen next?                                    */}
        {/* Cash-Flow Outlook & Probabilistic Forecasting                */}
        {/* ============================================================ */}
        <section aria-labelledby="section-cash-flow" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#66645C]">
                <span>Question 3</span>
                <span>&bull;</span>
                <span className="text-[#171714]">Cash Flow Outlook</span>
              </div>
              <h2
                id="section-cash-flow"
                className="font-serif text-2xl text-[#171714] font-normal tracking-tight mt-0.5"
              >
                What could happen next?
              </h2>
            </div>

            <button
              type="button"
              onClick={() => handleTabNavigation('cash-flow')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#66645C] hover:text-[#171714] transition-colors"
            >
              <span>Explore forecast scenarios</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-[#E8E7E2] shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-serif text-lg text-[#171714] font-normal">
                    30-Day Probabilistic Projection ({activeCurrency})
                  </h3>
                  <span className="text-[10px] font-semibold uppercase tracking-wider bg-[#F8F7F2] text-[#66645C] border border-[#E8E7E2] px-2 py-0.5 rounded-full">
                    Estimated Outlook
                  </span>
                </div>
                <p className="text-xs text-[#66645C] mt-0.5">
                  Projections are mathematical simulations derived from statement frequency, not
                  guaranteed balances.
                </p>
              </div>

              {currencyCashFlow && (
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                      currencyCashFlow.riskLevel === 'low_risk'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : currencyCashFlow.riskLevel === 'high_risk'
                          ? 'bg-rose-50 text-rose-800 border-rose-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {currencyCashFlow.riskLevel.replace('_', ' ')}
                  </span>
                </div>
              )}
            </div>

            {currencyCashFlow ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2]">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#66645C]">
                    Projected Inflow
                  </span>
                  <div className="font-mono text-xl sm:text-2xl font-semibold text-emerald-700 mt-1">
                    {formatCurrencyAmount(
                      currencyCashFlow.projectedInflowsMinor,
                      activeCurrency,
                      true,
                      true,
                    )}
                  </div>
                  <p className="text-[11px] text-[#66645C] mt-1">
                    Expected customer receipts &amp; credits
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2]">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#66645C]">
                    Projected Outflow
                  </span>
                  <div className="font-mono text-xl sm:text-2xl font-semibold text-[#171714] mt-1">
                    {formatCurrencyAmount(
                      currencyCashFlow.projectedOutflowsMinor,
                      activeCurrency,
                      true,
                      true,
                    )}
                  </div>
                  <p className="text-[11px] text-[#66645C] mt-1">
                    Recurring commitments &amp; operational costs
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2]">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#66645C]">
                    Projected Net Flow
                  </span>
                  <div
                    className={`font-mono text-xl sm:text-2xl font-semibold mt-1 ${
                      currencyCashFlow.expectedNetMovementMinor >= 0
                        ? 'text-emerald-700'
                        : 'text-rose-700'
                    }`}
                  >
                    {formatCurrencyAmount(
                      currencyCashFlow.expectedNetMovementMinor,
                      activeCurrency,
                      true,
                      true,
                    )}
                  </div>
                  <p className="text-[11px] text-[#66645C] mt-1">
                    Net cash position change across 30 days
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-xl border border-dashed border-[#E8E7E2] bg-[#F8F7F2] flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-1 text-center sm:text-left">
                  <p className="font-serif text-base text-[#171714]">
                    No Forecast Projection Available for {activeCurrency}
                  </p>
                  <p className="text-xs text-[#66645C]">
                    Run a 30-day forecast to simulate upcoming cash obligations and identify
                    potential liquidity pinches.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleTabNavigation('cash-flow')}
                  className="px-4 py-2 rounded-full bg-[#171714] hover:bg-stone-800 text-white text-xs font-semibold transition-colors shrink-0 cursor-pointer"
                >
                  Run 30-Day Simulation
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ============================================================ */}
        {/* 4. What action should be taken?                              */}
        {/* Business Action Center Prioritized Operations               */}
        {/* ============================================================ */}
        <section aria-labelledby="section-actions" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#66645C]">
                <span>Question 4</span>
                <span>&bull;</span>
                <span className="text-[#171714]">Actionable Intelligence</span>
              </div>
              <h2
                id="section-actions"
                className="font-serif text-2xl text-[#171714] font-normal tracking-tight mt-0.5"
              >
                What action should be taken?
              </h2>
            </div>

            <button
              type="button"
              onClick={() => handleTabNavigation('actions')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#66645C] hover:text-[#171714] transition-colors"
            >
              <span>Go to Action Center</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-[#E8E7E2] shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#E8E7E2]">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#E5BB45]" />
                <h3 className="font-serif text-lg text-[#171714] font-normal">
                  Prioritized Operational Recommendations
                </h3>
              </div>
              <div className="flex items-center gap-3 text-xs text-[#66645C]">
                <span>{openActionsCount} open actions</span>
                {(criticalActionsCount > 0 || highActionsCount > 0) && (
                  <span className="text-rose-700 font-semibold">
                    {criticalActionsCount + highActionsCount} urgent
                  </span>
                )}
              </div>
            </div>

            {actionsListData?.items && actionsListData.items.length > 0 ? (
              <div className="divide-y divide-[#E8E7E2]">
                {actionsListData.items.map((act: BusinessAction) => {
                  const isCritical = act.priority === 'critical';
                  const isHigh = act.priority === 'high';

                  return (
                    <div
                      key={act.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                              isCritical
                                ? 'bg-rose-100 text-rose-900 border-rose-300'
                                : isHigh
                                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                                  : 'bg-stone-100 text-stone-800 border-stone-200'
                            }`}
                          >
                            {act.priority}
                          </span>
                          <span className="text-xs font-semibold text-[#171714]">{act.title}</span>
                          <span className="text-[10px] text-[#66645C] bg-[#F8F7F2] border border-[#E8E7E2] px-2 py-0.5 rounded">
                            {act.category.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-xs text-[#66645C] line-clamp-1">{act.explanation}</p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {act.financialImpact?.potentialExposureMinor ? (
                          <span className="text-xs font-mono font-semibold text-[#171714]">
                            {formatCurrencyAmount(
                              act.financialImpact.potentialExposureMinor,
                              act.currency || activeCurrency,
                              true,
                              true,
                            )}
                          </span>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => handleTabNavigation('actions')}
                          className="px-3 py-1.5 rounded-lg bg-[#171714] hover:bg-stone-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                        >
                          Execute
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-36 rounded-xl border border-dashed border-[#E8E7E2] bg-[#F8F7F2] flex flex-col items-center justify-center p-6 text-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 mb-1.5" />
                <p className="font-serif text-base text-[#171714]">No Pending Actions</p>
                <p className="text-xs text-[#66645C] mt-0.5">
                  All detected leakage and cash flow opportunities have been reviewed and acted
                  upon.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
};
