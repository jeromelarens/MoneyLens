import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layout } from './Layout';
import { financialService } from '../services/financial.service';
import type {
  FinancialFinding,
  FindingStatus,
  FindingType,
  FindingSeverity,
  ReviewFindingAction,
  AiExplanation,
  SupportedCurrency,
} from '@moneylens/shared';
import { formatCurrencyAmount } from '@moneylens/shared';
import {
  ShieldAlert,
  ShieldCheck,
  Play,
  RefreshCw,
  CheckCircle2,
  Sparkles,
  X,
  FileText,
  DollarSign,
  History,
  Info,
  Filter,
  ArrowUpDown,
  RotateCcw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Layers,
} from 'lucide-react';

export const FindingsDashboard: React.FC<{ inShell?: boolean }> = ({ inShell = true }) => {
  const queryClient = useQueryClient();

  // Document Title
  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'Financial Findings — MoneyLens';
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

  // Filters State
  const [selectedType, setSelectedType] = useState<FindingType | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<FindingStatus | 'all'>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<FindingSeverity | 'all'>('all');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [sortBy, setSortBy] = useState<'detectedAt' | 'estimatedAmountMinor' | 'severity'>(
    'detectedAt',
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState<number>(1);

  // Scan Modal State
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scanStartDate, setScanStartDate] = useState<string>('');
  const [scanEndDate, setScanEndDate] = useState<string>('');
  const [scanCurrency, setScanCurrency] = useState<string>('all');

  // Detail Modal State
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [reviewAction, setReviewAction] = useState<ReviewFindingAction | null>(null);
  const [reviewReason, setReviewReason] = useState<string>('');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [actionSuccessBanner, setActionSuccessBanner] = useState<string | null>(null);

  // Escape key handler for modals
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedFindingId) setSelectedFindingId(null);
        if (isScanModalOpen) setIsScanModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFindingId, isScanModalOpen]);

  // Lock body scroll when modal is active
  React.useEffect(() => {
    if (selectedFindingId || isScanModalOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [selectedFindingId, isScanModalOpen]);

  // Summary Query
  const {
    data: summaryData,
    isLoading: isSummaryLoading,
    isFetching: isSummaryFetching,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['findings-summary'],
    queryFn: financialService.getFindingsSummary,
    staleTime: 30000,
  });

  // Findings List Query
  const {
    data: findingsData,
    isLoading: isFindingsLoading,
    isFetching: isFindingsFetching,
    refetch: refetchFindings,
  } = useQuery({
    queryKey: [
      'findings-list',
      page,
      selectedType,
      selectedStatus,
      selectedSeverity,
      selectedCurrency,
      startDate,
      endDate,
      sortBy,
      sortOrder,
    ],
    queryFn: () =>
      financialService.getFindings({
        page,
        limit: 20,
        findingType: selectedType === 'all' ? undefined : selectedType,
        status: selectedStatus === 'all' ? undefined : selectedStatus,
        severity: selectedSeverity === 'all' ? undefined : selectedSeverity,
        currency: selectedCurrency === 'all' ? undefined : selectedCurrency,
        startDate: startDate ? startDate : undefined,
        endDate: endDate ? endDate : undefined,
        sortBy,
        sortOrder,
      }),
    staleTime: 30000,
  });

  // Finding Detail Query
  const {
    data: findingDetailData,
    isLoading: isDetailLoading,
    refetch: refetchDetail,
  } = useQuery({
    queryKey: ['finding-detail', selectedFindingId],
    queryFn: () =>
      selectedFindingId ? financialService.getFindingDetail(selectedFindingId) : null,
    enabled: Boolean(selectedFindingId),
  });

  // Detection Run Mutation
  const detectionRunMutation = useMutation({
    mutationFn: (scope?: {
      startDate?: string;
      endDate?: string;
      currencies?: SupportedCurrency[];
    }) => financialService.triggerDetectionRun(scope),
    onSuccess: () => {
      setIsScanModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['findings-summary'] });
      queryClient.invalidateQueries({ queryKey: ['findings-list'] });
      setActionSuccessBanner('Ledger leakage evaluation completed successfully.');
      setTimeout(() => setActionSuccessBanner(null), 6000);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setReviewError(msg || 'Failed to execute detection run.');
    },
  });

  // Review Finding Mutation
  const reviewMutation = useMutation({
    mutationFn: async (params: {
      findingId: string;
      action: ReviewFindingAction;
      reason?: string;
      notes?: string;
    }) => {
      return financialService.reviewFinding(
        params.findingId,
        params.action,
        params.reason,
        params.notes,
      );
    },
    onSuccess: (_, variables) => {
      const actionName = variables.action.replace('_', ' ');
      setReviewAction(null);
      setReviewReason('');
      setReviewNotes('');
      setReviewError(null);
      setActionSuccessBanner(`Finding review status updated: ${actionName}`);
      setTimeout(() => setActionSuccessBanner(null), 5000);
      queryClient.invalidateQueries({ queryKey: ['findings-summary'] });
      queryClient.invalidateQueries({ queryKey: ['findings-list'] });
      if (selectedFindingId) {
        queryClient.invalidateQueries({ queryKey: ['finding-detail', selectedFindingId] });
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setReviewError(msg || 'Failed to submit review decision');
    },
  });

  // AI Explanation Mutation
  const [explanation, setExplanation] = useState<AiExplanation | null>(null);
  const explainMutation = useMutation({
    mutationFn: (findingId: string) => financialService.explainFinding(findingId, true),
    onSuccess: (data) => {
      setExplanation(data);
      if (selectedFindingId) {
        queryClient.invalidateQueries({ queryKey: ['finding-detail', selectedFindingId] });
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setReviewError(msg || 'Failed to generate AI explanation.');
    },
  });

  const handleStartScan = () => {
    detectionRunMutation.mutate(undefined);
  };

  const handleCustomScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const scope: {
      startDate?: string;
      endDate?: string;
      currencies?: SupportedCurrency[];
    } = {};

    if (scanStartDate) scope.startDate = scanStartDate;
    if (scanEndDate) scope.endDate = scanEndDate;
    if (scanCurrency && scanCurrency !== 'all') {
      scope.currencies = [scanCurrency as SupportedCurrency];
    }

    detectionRunMutation.mutate(Object.keys(scope).length > 0 ? scope : undefined);
  };

  const handleRefresh = () => {
    refetchSummary();
    refetchFindings();
    if (selectedFindingId) refetchDetail();
  };

  const handleOpenDetail = (finding: FinancialFinding) => {
    setSelectedFindingId(finding.id);
    setExplanation(null);
    setReviewAction(null);
    setReviewError(null);
  };

  const handleCloseDetail = () => {
    setSelectedFindingId(null);
    setExplanation(null);
    setReviewAction(null);
    setReviewError(null);
  };

  const submitReview = () => {
    if (!selectedFindingId || !reviewAction) return;
    if (reviewAction === 'dismiss' && !reviewReason.trim()) {
      setReviewError('A dismissal reason is required.');
      return;
    }
    reviewMutation.mutate({
      findingId: selectedFindingId,
      action: reviewAction,
      reason: reviewReason.trim() || undefined,
      notes: reviewNotes.trim() || undefined,
    });
  };

  const handleResetFilters = () => {
    setSelectedType('all');
    setSelectedStatus('all');
    setSelectedSeverity('all');
    setSelectedCurrency('all');
    setStartDate('');
    setEndDate('');
    setSortBy('detectedAt');
    setSortOrder('desc');
    setPage(1);
  };

  const isFilterActive = useMemo(() => {
    return (
      selectedType !== 'all' ||
      selectedStatus !== 'all' ||
      selectedSeverity !== 'all' ||
      selectedCurrency !== 'all' ||
      startDate !== '' ||
      endDate !== '' ||
      sortBy !== 'detectedAt' ||
      sortOrder !== 'desc'
    );
  }, [
    selectedType,
    selectedStatus,
    selectedSeverity,
    selectedCurrency,
    startDate,
    endDate,
    sortBy,
    sortOrder,
  ]);

  const availableCurrencies = useMemo(() => {
    if (!summaryData?.byCurrency) return [];
    return Object.keys(summaryData.byCurrency);
  }, [summaryData]);

  // Finding Type Label Mapper
  const getFindingTypeLabel = (type: FindingType) => {
    switch (type) {
      case 'potential_duplicate_payment':
        return 'Duplicate Payment';
      case 'unusual_expense':
        return 'Unusual Expense';
      case 'recurring_expense':
        return 'Recurring Expense';
      case 'recurring_cost_increase':
        return 'Recurring Price Increase';
      case 'supplier_price_variance':
        return 'Supplier Price Variance';
      case 'reconciliation_inconsistency':
        return 'Reconciliation Anomaly';
      default:
        return String(type).replace(/_/g, ' ');
    }
  };

  const headerActions = (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={isFindingsFetching || isSummaryFetching}
        title="Refresh findings data"
        className="w-9 h-9 rounded-xl border border-[#E8E7E2] bg-white text-[#66645C] hover:text-[#171714] hover:bg-[#F8F7F2] transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center shrink-0"
        aria-label="Refresh findings data"
      >
        <RefreshCw
          className={`w-4 h-4 ${
            isFindingsFetching || isSummaryFetching ? 'animate-spin text-[#E5BB45]' : ''
          }`}
        />
      </button>

      <button
        type="button"
        onClick={() => setIsScanModalOpen(true)}
        disabled={detectionRunMutation.isPending}
        className="inline-flex items-center gap-1.5 bg-[#E5BB45] hover:bg-[#D3A82F] text-[#171714] text-xs font-semibold py-1.5 px-2.5 sm:px-3.5 rounded-full shadow-2xs hover:shadow-xs transition-all duration-150 active:scale-95 cursor-pointer shrink-0 min-h-[36px] disabled:opacity-50"
      >
        {detectionRunMutation.isPending ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Play className="w-3.5 h-3.5 fill-current" />
        )}
        <span className="hidden sm:inline">
          {detectionRunMutation.isPending ? 'Analyzing...' : 'Run Leakage Scan'}
        </span>
        <span className="sm:hidden">{detectionRunMutation.isPending ? 'Scanning...' : 'Scan'}</span>
      </button>
    </div>
  );

  const bodyContent = (
    <>
      <div className="space-y-8">
        {/* Breadcrumbs & Editorial Header */}
        <section className="space-y-4">
          {/* Breadcrumb Navigation */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[#66645C]">
            <Link to="/dashboard" className="hover:text-[#171714] transition-colors">
              Dashboard
            </Link>
            <span>/</span>
            <span className="font-semibold text-[#171714]">Financial Findings</span>
          </nav>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#66645C]">
                <ShieldAlert className="w-3.5 h-3.5 text-[#E5BB45]" />
                <span>Financial Findings &amp; Exposure Radar</span>
                <span>·</span>
                <span className="text-[#171714]">Deterministic Detection</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-serif tracking-tight text-[#171714]">
                Financial Findings
              </h1>
              <p className="text-sm text-[#66645C] max-w-2xl leading-relaxed">
                Deterministic, evidence-backed financial leak detection. Every finding is anchored
                to verifiable transaction records, empirical rule criteria, and explainable
                intelligence.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                to="/transactions"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#E8E7E2] hover:bg-[#F8F7F2] text-xs font-semibold text-[#171714] transition-colors shadow-2xs"
              >
                <span>Open Transaction Ledger</span>
                <ExternalLink className="w-3.5 h-3.5 text-[#66645C]" />
              </Link>
            </div>
          </div>

          {/* Operational Integrity Safeguard Banner */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E8E7E2] flex items-start gap-3.5 shadow-2xs">
            <div className="p-2 rounded-xl bg-[#FAF4E0] border border-[#E5BB45]/40 text-[#171714] shrink-0 mt-0.5">
              <ShieldCheck className="w-4 h-4 text-[#171714]" />
            </div>
            <div className="space-y-1 text-xs">
              <h2 className="font-bold text-[#171714] text-xs sm:text-sm">
                Deterministic detection rules with explainable intelligence
              </h2>
              <p className="text-[#66645C] leading-relaxed">
                Findings represent potential anomalies or policy violations detected across
                transaction history using deterministic rule thresholds. Potential exposure figures
                represent unconfirmed risk awaiting review, not verified losses. AI explanations
                provide contextual commentary and verification steps without modifying underlying
                financial data.
              </p>
              {summaryData?.lastDetectionRunAt ? (
                <div className="pt-1 text-[11px] text-[#66645C] flex items-center gap-1.5">
                  <Calendar className="w-3 h-3 text-[#E5BB45]" />
                  <span>
                    Detection Engine Status: Evaluated{' '}
                    <strong className="text-[#171714]">
                      {new Date(summaryData.lastDetectionRunAt).toLocaleString()}
                    </strong>
                  </span>
                </div>
              ) : (
                <div className="pt-1 text-[11px] text-[#66645C] flex items-center gap-1.5">
                  <Info className="w-3 h-3 text-[#E5BB45]" />
                  <span>
                    Detection Engine Status: No run recorded. Click 'Run Leakage Scan' to evaluate
                    ledger.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Action Success / Feedback Banner */}
          {actionSuccessBanner && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between shadow-2xs animate-fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-medium">{actionSuccessBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setActionSuccessBanner(null)}
                className="text-emerald-700 hover:text-emerald-950 p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Detection Run Mutation Completion Results */}
          {detectionRunMutation.isSuccess && detectionRunMutation.data && (
            <div className="p-4 rounded-2xl bg-[#FAF4E0] border border-[#E5BB45]/50 text-[#171714] text-xs flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#B89020] shrink-0" />
                <span>
                  Detection run complete: Evaluated{' '}
                  {detectionRunMutation.data.transactionsEvaluated} transactions. Created{' '}
                  {detectionRunMutation.data.findingsCreated} new findings, updated{' '}
                  {detectionRunMutation.data.findingsUpdated},{' '}
                  {detectionRunMutation.data.findingsUnchanged} unchanged.
                </span>
              </div>
              <span className="font-mono text-[11px] text-[#66645C]">
                Status: {detectionRunMutation.data.status}
              </span>
            </div>
          )}
        </section>

        {/* ============================================================ */}
        {/* 3. Currency-Segregated Potential Exposure Metrics             */}
        {/* ============================================================ */}
        <section aria-label="Potential Exposure by Currency" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#171714] flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-[#E5BB45]" />
              <span>Potential Exposure by Currency</span>
            </h2>
            <span className="text-xs text-[#66645C]">
              Strictly segregated &bull; Never blended across exchange rates
            </span>
          </div>

          {isSummaryLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-36 rounded-2xl bg-white border border-[#E8E7E2] animate-pulse"
                />
              ))}
            </div>
          ) : summaryData && Object.keys(summaryData.byCurrency).length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.values(summaryData.byCurrency).map((item) => (
                <div
                  key={item.currency}
                  className="p-5 rounded-2xl border border-[#E8E7E2] bg-white shadow-2xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-lg bg-[#171714] text-white text-xs font-bold font-mono">
                      {item.currency}
                    </span>
                    <div className="flex items-center gap-1.5 text-xs text-[#66645C]">
                      <span>
                        {item.openFindingCount + item.underReviewFindingCount} active findings
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#E8E7E2]">
                    <div>
                      <div className="text-[11px] text-[#66645C] font-medium">
                        Potential Exposure
                      </div>
                      <div className="text-xl font-bold font-mono text-[#171714] tracking-tight">
                        {item.currency}{' '}
                        {formatCurrencyAmount(item.potentialExposureMinor, item.currency)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-rose-700 font-medium">Confirmed Issues</div>
                      <div className="text-xl font-bold font-mono text-rose-800 tracking-tight">
                        {item.currency}{' '}
                        {formatCurrencyAmount(item.confirmedExposureMinor, item.currency)}
                      </div>
                    </div>
                  </div>

                  {/* Lifecycle Breakdown Pills */}
                  <div className="flex flex-wrap items-center gap-1 pt-1 text-[10px] text-[#66645C]">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                      Open: {item.openFindingCount}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                      Review: {item.underReviewFindingCount}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200">
                      Confirmed: {item.confirmedFindingCount}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200">
                      Resolved: {item.resolvedFindingCount}
                    </span>
                  </div>

                  <div className="text-[10px] text-[#66645C] flex items-center gap-1 pt-1 border-t border-[#F8F7F2]">
                    <Info className="w-3 h-3 text-[#66645C]" />
                    <span>Potential exposure represents unconfirmed risk awaiting review.</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 rounded-2xl border border-dashed border-[#E8E7E2] bg-white text-center text-[#66645C] text-sm">
              No financial findings generated yet. Run a leakage scan to inspect ledger records.
            </div>
          )}
        </section>

        {/* ============================================================ */}
        {/* 4. Findings Summary KPI Strip                                */}
        {/* ============================================================ */}
        {summaryData && (
          <section
            aria-label="Findings Severity Breakdown"
            className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <div className="p-4 rounded-2xl bg-white border border-[#E8E7E2] shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-xs text-[#66645C]">
                <span>Total Findings</span>
                <Layers className="w-3.5 h-3.5 text-[#E5BB45]" />
              </div>
              <div className="text-2xl font-bold font-mono text-[#171714]">
                {summaryData.totalFindingsCount}
              </div>
              <p className="text-[11px] text-[#66645C]">Identified across all rules</p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#E8E7E2] shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-xs text-rose-700">
                <span>High Severity</span>
                <span className="w-2 h-2 rounded-full bg-rose-600" />
              </div>
              <div className="text-2xl font-bold font-mono text-rose-800">
                {summaryData.highSeverityCount}
              </div>
              <p className="text-[11px] text-[#66645C]">Urgent review required</p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#E8E7E2] shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-xs text-amber-700">
                <span>Medium Severity</span>
                <span className="w-2 h-2 rounded-full bg-amber-500" />
              </div>
              <div className="text-2xl font-bold font-mono text-amber-800">
                {summaryData.mediumSeverityCount}
              </div>
              <p className="text-[11px] text-[#66645C]">Variance &amp; recurring cost shifts</p>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-[#E8E7E2] shadow-2xs space-y-1">
              <div className="flex items-center justify-between text-xs text-blue-700">
                <span>Low Severity</span>
                <span className="w-2 h-2 rounded-full bg-blue-500" />
              </div>
              <div className="text-2xl font-bold font-mono text-blue-800">
                {summaryData.lowSeverityCount}
              </div>
              <p className="text-[11px] text-[#66645C]">Informational policy deviations</p>
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* 5. Findings Filter & Sort Toolbar                            */}
        {/* ============================================================ */}
        <section
          aria-label="Findings Filters"
          className="rounded-2xl border border-[#E8E7E2] bg-white p-4 sm:p-5 shadow-2xs space-y-4"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Status Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[#66645C] font-semibold text-xs mr-1 hidden sm:inline">
                Status:
              </span>
              {(
                ['all', 'open', 'under_review', 'confirmed_issue', 'dismissed', 'resolved'] as const
              ).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    setSelectedStatus(status);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl font-medium transition cursor-pointer capitalize text-xs ${
                    selectedStatus === status
                      ? 'bg-[#171714] text-white shadow-2xs'
                      : 'bg-[#F8F7F2] text-[#66645C] hover:text-[#171714] hover:bg-[#E8E7E2]'
                  }`}
                >
                  {status === 'all' ? 'All Statuses' : status.replace('_', ' ')}
                </button>
              ))}
            </div>

            {/* Clear Filters Reset */}
            {isFilterActive && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 text-xs text-[#66645C] hover:text-[#171714] font-medium transition cursor-pointer self-start lg:self-center"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>

          {/* Secondary Controls: Type, Severity, Currency, Date Range, Sort */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-[#E8E7E2] text-xs">
            {/* Finding Type */}
            <div>
              <label className="block text-[11px] font-semibold text-[#66645C] mb-1">
                Finding Type
              </label>
              <select
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value as FindingType | 'all');
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] text-[#171714] text-xs focus:outline-none focus:border-[#E5BB45]"
              >
                <option value="all">All Types</option>
                <option value="potential_duplicate_payment">Duplicate Payments</option>
                <option value="unusual_expense">Unusual Expenses</option>
                <option value="recurring_expense">Subscriptions &amp; Recurring</option>
                <option value="recurring_cost_increase">Price Increases</option>
                <option value="supplier_price_variance">Supplier Variance</option>
                <option value="reconciliation_inconsistency">Reconciliation Anomalies</option>
              </select>
            </div>

            {/* Severity */}
            <div>
              <label className="block text-[11px] font-semibold text-[#66645C] mb-1">
                Severity
              </label>
              <select
                value={selectedSeverity}
                onChange={(e) => {
                  setSelectedSeverity(e.target.value as FindingSeverity | 'all');
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] text-[#171714] text-xs focus:outline-none focus:border-[#E5BB45]"
              >
                <option value="all">All Severities</option>
                <option value="high">High Severity</option>
                <option value="medium">Medium Severity</option>
                <option value="low">Low Severity</option>
              </select>
            </div>

            {/* Currency */}
            <div>
              <label className="block text-[11px] font-semibold text-[#66645C] mb-1">
                Currency
              </label>
              <select
                value={selectedCurrency}
                onChange={(e) => {
                  setSelectedCurrency(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] text-[#171714] text-xs focus:outline-none focus:border-[#E5BB45]"
              >
                <option value="all">All Currencies</option>
                {availableCurrencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Window */}
            <div>
              <label className="block text-[11px] font-semibold text-[#66645C] mb-1">
                From Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] text-[#171714] text-xs focus:outline-none focus:border-[#E5BB45]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#66645C] mb-1">To Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] text-[#171714] text-xs focus:outline-none focus:border-[#E5BB45]"
              />
            </div>

            {/* Sorting */}
            <div>
              <label className="block text-[11px] font-semibold text-[#66645C] mb-1">
                Sort Order
              </label>
              <div className="flex items-center gap-1">
                <select
                  value={sortBy}
                  onChange={(e) => {
                    setSortBy(e.target.value as 'detectedAt' | 'estimatedAmountMinor' | 'severity');
                    setPage(1);
                  }}
                  className="flex-1 px-2 py-1.5 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] text-[#171714] text-xs focus:outline-none focus:border-[#E5BB45]"
                >
                  <option value="detectedAt">Detected Date</option>
                  <option value="estimatedAmountMinor">Exposure</option>
                  <option value="severity">Severity</option>
                </select>
                <button
                  type="button"
                  onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                  title={`Toggle sort order (currently ${sortOrder === 'desc' ? 'descending' : 'ascending'})`}
                  className="p-1.5 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] text-[#66645C] hover:text-[#171714] cursor-pointer"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* 6. Findings Register Table                                   */}
        {/* ============================================================ */}
        <section
          aria-label="Findings Register"
          className="rounded-2xl border border-[#E8E7E2] bg-white overflow-hidden shadow-2xs"
        >
          {isFindingsLoading ? (
            <div className="p-12 text-center text-[#66645C] text-sm space-y-3">
              <RefreshCw className="w-5 h-5 animate-spin text-[#E5BB45] mx-auto" />
              <div>Loading financial findings...</div>
            </div>
          ) : findingsData && findingsData.items.length > 0 ? (
            <>
              {/* Mobile Card List View (md:hidden) */}
              <div className="md:hidden divide-y divide-[#E8E7E2]">
                {findingsData.items.map((finding, idx) => (
                  <div
                    key={
                      finding.id ||
                      (finding as unknown as { _id?: string })._id ||
                      `finding-m-${idx}`
                    }
                    className="p-4 space-y-3 hover:bg-[#F8F7F2]/50 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          finding.severity === 'high'
                            ? 'bg-rose-50 text-rose-800 border border-rose-200'
                            : finding.severity === 'medium'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-blue-50 text-blue-800 border border-blue-200'
                        }`}
                      >
                        {finding.severity}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium capitalize ${
                          finding.status === 'open'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : finding.status === 'under_review'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : finding.status === 'confirmed_issue'
                                ? 'bg-rose-50 text-rose-800 font-bold border border-rose-200'
                                : finding.status === 'resolved'
                                  ? 'bg-teal-50 text-teal-800 border border-teal-200'
                                  : 'bg-[#F8F7F2] text-[#66645C] border border-[#E8E7E2]'
                        }`}
                      >
                        {finding.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div>
                      <Link
                        to={`/findings/${finding.id}`}
                        className="font-bold text-sm text-[#171714] hover:text-[#B89020] transition block leading-snug"
                      >
                        {finding.title}
                      </Link>
                      <p className="text-xs text-[#66645C] mt-1 line-clamp-2">{finding.summary}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-[#F8F7F2]/80 p-2.5 rounded-xl border border-[#E8E7E2]">
                      <div>
                        <div className="text-[10px] text-[#66645C] uppercase tracking-wider font-semibold">
                          Exposure
                        </div>
                        <div className="font-mono font-bold text-[#171714] text-sm mt-0.5">
                          {finding.currency}{' '}
                          {formatCurrencyAmount(finding.estimatedAmountMinor, finding.currency)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#66645C] uppercase tracking-wider font-semibold">
                          Detected
                        </div>
                        <div className="text-[#66645C] text-xs mt-0.5">
                          {new Date(finding.detectedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="col-span-2 pt-1 border-t border-[#E8E7E2]/60">
                        <div className="text-[10px] text-[#66645C] uppercase tracking-wider font-semibold">
                          Rule
                        </div>
                        <div className="text-[#171714] font-medium text-[11px] mt-0.5 truncate">
                          {getFindingTypeLabel(finding.findingType)} &bull;{' '}
                          <span className="font-mono text-[#66645C]">{finding.ruleId}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleOpenDetail(finding)}
                        className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-[#171714] hover:bg-[#2A2A26] text-white text-xs font-semibold transition cursor-pointer text-center shadow-2xs"
                      >
                        Inspect Evidence
                      </button>
                      <Link
                        to={`/findings/${finding.id}`}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-white border border-[#E8E7E2] hover:bg-[#F8F7F2] text-[#171714] text-xs font-semibold transition flex items-center justify-center"
                      >
                        Details &rarr;
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View (hidden md:block) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8F7F2] text-[#66645C] border-b border-[#E8E7E2] font-semibold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th scope="col" className="py-3 px-4">
                        Severity
                      </th>
                      <th scope="col" className="py-3 px-4">
                        Finding &amp; Summary
                      </th>
                      <th scope="col" className="py-3 px-4">
                        Type / Rule
                      </th>
                      <th scope="col" className="py-3 px-4 text-right">
                        Potential Amount
                      </th>
                      <th scope="col" className="py-3 px-4">
                        Status
                      </th>
                      <th scope="col" className="py-3 px-4">
                        Detected
                      </th>
                      <th scope="col" className="py-3 px-4 text-right">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E7E2]">
                    {findingsData.items.map((finding, idx) => (
                      <tr
                        key={
                          finding.id ||
                          (finding as unknown as { _id?: string })._id ||
                          `finding-${idx}`
                        }
                        className="hover:bg-[#F8F7F2]/60 transition"
                      >
                        {/* Severity Badge */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                              finding.severity === 'high'
                                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                : finding.severity === 'medium'
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                  : 'bg-blue-50 text-blue-800 border border-blue-200'
                            }`}
                          >
                            {finding.severity}
                          </span>
                        </td>

                        {/* Finding Title & Summary */}
                        <td className="py-3.5 px-4 max-w-md">
                          <Link
                            to={`/findings/${finding.id}`}
                            className="font-semibold text-[#171714] hover:text-[#B89020] transition truncate block"
                            title="Open Finding Details & Evidence"
                          >
                            {finding.title}
                          </Link>
                          <div className="text-[#66645C] text-[11px] truncate mt-0.5">
                            {finding.summary}
                          </div>
                        </td>

                        {/* Finding Type & Rule ID */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="text-[#171714] font-medium text-[11px]">
                            {getFindingTypeLabel(finding.findingType)}
                          </div>
                          <div className="text-[#66645C] font-mono text-[10px]">
                            {finding.ruleId} &bull; {finding.ruleVersion}
                          </div>
                        </td>

                        {/* Monetary Exposure */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-right font-mono font-bold text-[#171714]">
                          {finding.currency}{' '}
                          {formatCurrencyAmount(finding.estimatedAmountMinor, finding.currency)}
                        </td>

                        {/* Lifecycle Status */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium capitalize ${
                              finding.status === 'open'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : finding.status === 'under_review'
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                  : finding.status === 'confirmed_issue'
                                    ? 'bg-rose-50 text-rose-800 font-bold border border-rose-200'
                                    : finding.status === 'resolved'
                                      ? 'bg-teal-50 text-teal-800 border border-teal-200'
                                      : 'bg-[#F8F7F2] text-[#66645C] border border-[#E8E7E2]'
                            }`}
                          >
                            {finding.status.replace('_', ' ')}
                          </span>
                        </td>

                        {/* Detected Timestamp */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-[#66645C] text-[11px]">
                          {new Date(finding.detectedAt).toLocaleDateString()}
                        </td>

                        {/* Action Button */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-right">
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(finding)}
                            className="px-3 py-1 rounded-lg bg-[#171714] hover:bg-[#2A2A26] text-white text-xs font-semibold transition cursor-pointer shadow-2xs"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-[#66645C] text-sm space-y-3">
              <Filter className="w-6 h-6 text-[#66645C]/60 mx-auto" />
              <div className="font-semibold text-[#171714]">
                No findings match the current filter criteria.
              </div>
              <p className="text-xs text-[#66645C] max-w-sm mx-auto">
                {isFilterActive
                  ? 'Try clearing active filters or adjusting the date range and severity selectors.'
                  : 'Run a leakage scan to inspect transaction history against deterministic detection rules.'}
              </p>
              {isFilterActive ? (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F8F7F2] hover:bg-[#E8E7E2] text-xs font-semibold text-[#171714] cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset All Filters</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartScan}
                  disabled={detectionRunMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#E5BB45] hover:bg-[#D3A82F] text-xs font-semibold text-[#171714] cursor-pointer shadow-2xs"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run First Leakage Scan</span>
                </button>
              )}
            </div>
          )}

          {/* Pagination Controls */}
          {findingsData && findingsData.pagination.totalPages > 1 && (
            <div className="p-4 border-t border-[#E8E7E2] flex items-center justify-between text-xs text-[#66645C]">
              <span>
                Page {findingsData.pagination.page} of {findingsData.pagination.totalPages} (
                {findingsData.pagination.totalItems} findings)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-[#E8E7E2] text-[#171714] disabled:opacity-40 hover:bg-[#F8F7F2] transition cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  disabled={page >= findingsData.pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-[#E8E7E2] text-[#171714] disabled:opacity-40 hover:bg-[#F8F7F2] transition cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ============================================================ */}
      {/* 7. Scan Configuration Modal                                  */}
      {/* ============================================================ */}
      {isScanModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="scan-modal-title"
          className="fixed inset-0 z-50 bg-[#171714]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="relative w-full max-w-lg rounded-3xl border border-[#E8E7E2] bg-white p-6 shadow-2xl space-y-5 animate-scale-in">
            <div className="flex items-start justify-between border-b border-[#E8E7E2] pb-4">
              <div>
                <h3 id="scan-modal-title" className="text-lg font-serif font-bold text-[#171714]">
                  Run Financial Leakage Scan
                </h3>
                <p className="text-xs text-[#66645C] mt-0.5">
                  Evaluate transactions against deterministic duplicate, expense anomaly, and price
                  variance rules.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsScanModalOpen(false)}
                className="p-1.5 rounded-xl bg-[#F8F7F2] text-[#66645C] hover:text-[#171714] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCustomScanSubmit} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-[#66645C]">
                  Observation Scope
                </label>
                <p className="text-[11px] text-[#66645C]">
                  Leave dates blank to scan the entire transaction history within {organizationName}
                  .
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#66645C] mb-1">
                    Start Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={scanStartDate}
                    onChange={(e) => setScanStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] text-[#171714] text-xs focus:outline-none focus:border-[#E5BB45]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#66645C] mb-1">
                    End Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={scanEndDate}
                    onChange={(e) => setScanEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] text-[#171714] text-xs focus:outline-none focus:border-[#E5BB45]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#66645C] mb-1">
                  Currency Filter (Optional)
                </label>
                <select
                  value={scanCurrency}
                  onChange={(e) => setScanCurrency(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] text-[#171714] text-xs focus:outline-none focus:border-[#E5BB45]"
                >
                  <option value="all">All Currencies</option>
                  {availableCurrencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 rounded-xl bg-[#FAF4E0] border border-[#E5BB45]/40 text-[#171714] text-[11px] space-y-1">
                <span className="font-semibold">Deterministic Execution Notice:</span>
                <p className="text-[#66645C]">
                  The engine will compare debits across timing thresholds, compute price variance
                  baselines, and flag unconfirmed potential exposures without modifying ledger
                  balances.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E8E7E2]">
                <button
                  type="button"
                  onClick={() => setIsScanModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#F8F7F2] text-[#66645C] hover:text-[#171714] font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={detectionRunMutation.isPending}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#E5BB45] hover:bg-[#D3A82F] text-[#171714] font-semibold cursor-pointer shadow-2xs disabled:opacity-50"
                >
                  {detectionRunMutation.isPending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  <span>
                    {detectionRunMutation.isPending ? 'Executing Scan...' : 'Start Evaluation'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 8. Finding Detail, Evidence & Review Drawer / Modal          */}
      {/* ============================================================ */}
      {selectedFindingId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-finding-title"
          className="fixed inset-0 z-50 bg-[#171714]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          {isDetailLoading || !findingDetailData ? (
            <div className="p-8 rounded-3xl bg-white border border-[#E8E7E2] text-[#171714] flex items-center gap-3 shadow-2xl">
              <RefreshCw className="w-5 h-5 animate-spin text-[#E5BB45]" />
              <span className="text-sm font-medium">Loading finding details and evidence...</span>
            </div>
          ) : (
            <div className="relative w-full max-w-4xl rounded-3xl border border-[#E8E7E2] bg-white p-6 md:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-4 border-b border-[#E8E7E2] pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        findingDetailData.finding.severity === 'high'
                          ? 'bg-rose-50 text-rose-800 border border-rose-200'
                          : findingDetailData.finding.severity === 'medium'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-blue-50 text-blue-800 border border-blue-200'
                      }`}
                    >
                      {findingDetailData.finding.severity} Severity
                    </span>
                    <span className="text-xs text-[#66645C] font-mono">
                      Rule: {findingDetailData.finding.ruleId} (
                      {findingDetailData.finding.ruleVersion})
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${
                        findingDetailData.finding.status === 'open'
                          ? 'bg-emerald-50 text-emerald-800'
                          : findingDetailData.finding.status === 'under_review'
                            ? 'bg-amber-50 text-amber-800'
                            : findingDetailData.finding.status === 'confirmed_issue'
                              ? 'bg-rose-50 text-rose-800'
                              : 'bg-teal-50 text-teal-800'
                      }`}
                    >
                      {findingDetailData.finding.status.replace('_', ' ')}
                    </span>
                  </div>
                  <h3
                    id="modal-finding-title"
                    className="text-xl font-bold text-[#171714] font-serif"
                  >
                    {findingDetailData.finding.title}
                  </h3>
                  <p className="text-xs text-[#66645C]">{findingDetailData.finding.summary}</p>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    to={`/findings/${findingDetailData.finding.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E8E7E2] hover:bg-[#F8F7F2] text-xs font-semibold text-[#171714] transition shadow-2xs"
                    title="Open dedicated finding details & evidence page"
                  >
                    <span>Full Page Dossier</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#66645C]" />
                  </Link>
                  <button
                    type="button"
                    onClick={handleCloseDetail}
                    className="p-2 rounded-xl bg-[#F8F7F2] text-[#66645C] hover:text-[#171714] hover:bg-[#E8E7E2] transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Evidence Breakdown Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Detection Evidence */}
                <div className="p-4 rounded-2xl bg-[#F8F7F2] border border-[#E8E7E2] space-y-2">
                  <h4 className="text-xs font-bold text-[#171714] flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#E5BB45]" />
                    <span>Detection Evidence</span>
                  </h4>
                  <div className="text-xs text-[#171714] space-y-1.5">
                    <div>
                      <span className="text-[#66645C]">Trigger Reason: </span>
                      {findingDetailData.finding.evidence.reason}
                    </div>
                    <div>
                      <span className="text-[#66645C]">Estimated Exposure: </span>
                      <span className="font-mono font-bold text-[#171714]">
                        {findingDetailData.finding.currency}{' '}
                        {formatCurrencyAmount(
                          findingDetailData.finding.estimatedAmountMinor,
                          findingDetailData.finding.currency,
                        )}
                      </span>
                    </div>
                    {findingDetailData.finding.evidence.dateDifferenceDays !== undefined && (
                      <div>
                        <span className="text-[#66645C]">Date Window: </span>
                        {findingDetailData.finding.evidence.dateDifferenceDays} day(s) difference
                      </div>
                    )}
                    {findingDetailData.finding.evidence.percentageChange !== undefined && (
                      <div>
                        <span className="text-[#66645C]">Percentage Variance: </span>
                        {findingDetailData.finding.evidence.percentageChange > 0 ? '+' : ''}
                        {findingDetailData.finding.evidence.percentageChange.toFixed(1)}%
                      </div>
                    )}
                    {findingDetailData.finding.evidence.historicalComparisonPeriod && (
                      <div>
                        <span className="text-[#66645C]">Historical Observations: </span>
                        {findingDetailData.finding.evidence.historicalComparisonPeriod
                          .observationCount || 0}{' '}
                        entries (
                        {findingDetailData.finding.evidence.historicalComparisonPeriod.startDate} to{' '}
                        {findingDetailData.finding.evidence.historicalComparisonPeriod.endDate})
                      </div>
                    )}
                    {findingDetailData.finding.evidence.dataQualityLimitations &&
                      findingDetailData.finding.evidence.dataQualityLimitations.length > 0 && (
                        <div className="pt-1 text-[11px] text-[#66645C]">
                          <span className="font-semibold text-[#171714]">Limitations: </span>
                          {findingDetailData.finding.evidence.dataQualityLimitations.join(' ')}
                        </div>
                      )}
                  </div>
                </div>

                {/* Verification Checks */}
                <div className="p-4 rounded-2xl bg-[#F8F7F2] border border-[#E8E7E2] space-y-2">
                  <h4 className="text-xs font-bold text-[#171714] flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-[#E5BB45]" />
                    <span>Verification Checks</span>
                  </h4>
                  <ul className="text-xs text-[#66645C] space-y-1 list-disc list-inside">
                    {(
                      findingDetailData.finding.evidence.recommendedChecks || [
                        'Review vendor agreement and payment receipts.',
                        'Check clearance status in corporate bank portal.',
                      ]
                    ).map((check, i) => (
                      <li key={i}>{check}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Participating Transactions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#171714]">Linked Ledger Transactions</h4>
                  <Link
                    to="/transactions"
                    className="text-[11px] text-[#66645C] hover:text-[#171714] flex items-center gap-1 font-medium"
                  >
                    <span>View in ledger</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
                <div className="rounded-xl border border-[#E8E7E2] overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[460px]">
                    <thead className="bg-[#F8F7F2] text-[#66645C] text-[10px] uppercase font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3">Direction</th>
                        <th className="py-2.5 px-3 text-right">Amount</th>
                        <th className="py-2.5 px-3">Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E8E7E2]">
                      {findingDetailData.transactions.map((tx, idx) => (
                        <tr
                          key={tx.id || (tx as unknown as { _id?: string })._id || `tx-${idx}`}
                          className="hover:bg-[#F8F7F2]/40"
                        >
                          <td className="py-2 px-3 text-[#66645C]">
                            {new Date(tx.date).toISOString().split('T')[0]}
                          </td>
                          <td className="py-2 px-3 text-[#171714] font-medium">{tx.description}</td>
                          <td className="py-2 px-3 text-[#66645C] uppercase font-mono text-[10px]">
                            {tx.direction}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-[#171714]">
                            {tx.currency} {tx.amountDecimal}
                          </td>
                          <td className="py-2 px-3 text-[#66645C] font-mono text-[11px]">
                            {tx.sourceReference || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Explainable Intelligence Section */}
              <div className="p-5 rounded-2xl bg-[#FAF4E0]/60 border border-[#E5BB45]/50 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#B89020]" />
                    <span className="text-xs font-bold text-[#171714]">
                      Explainable Intelligence
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => explainMutation.mutate(findingDetailData.finding.id)}
                    disabled={explainMutation.isPending}
                    className="px-3 py-1.5 rounded-lg bg-[#171714] hover:bg-[#2A2A26] text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs disabled:opacity-50"
                  >
                    {explainMutation.isPending ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-[#E5BB45]" />
                    )}
                    <span>
                      {explainMutation.isPending
                        ? 'Analyzing Context...'
                        : explanation
                          ? 'Re-generate Explanation'
                          : 'Explain Finding'}
                    </span>
                  </button>
                </div>

                {explanation ? (
                  <div className="space-y-3 text-xs text-[#171714]">
                    <div className="p-3.5 rounded-xl bg-white border border-[#E8E7E2] space-y-1.5">
                      <div className="font-bold text-[#171714]">{explanation.summary}</div>
                      <div className="text-[#66645C] text-[11px] leading-relaxed">
                        {explanation.whyItWasFlagged}
                      </div>
                      <div className="pt-1 text-[11px] text-[#66645C]">
                        <strong className="text-[#171714]">Evidence: </strong>
                        {explanation.evidenceSummary}
                      </div>
                    </div>

                    {explanation.recommendedChecks && explanation.recommendedChecks.length > 0 && (
                      <div className="text-[11px] text-[#66645C] space-y-1">
                        <strong className="text-[#171714]">Recommended Actions:</strong>
                        <ul className="list-disc list-inside">
                          {explanation.recommendedChecks.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="text-[10px] text-[#66645C] font-mono flex items-center justify-between">
                      <span>
                        Provider: {explanation.provider}{' '}
                        {explanation.model ? `(${explanation.model})` : ''}
                      </span>
                      <span>Generated: {new Date(explanation.generatedAt).toLocaleString()}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[#66645C]">
                    Click 'Explain Finding' to generate a plain-language summary, trigger analysis,
                    and recommended verification steps based on participating ledger transactions.
                  </p>
                )}
              </div>

              {/* Review Decision Controls */}
              <div className="border-t border-[#E8E7E2] pt-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h4 className="text-xs font-bold text-[#171714]">Review Decision</h4>
                  <div className="flex flex-wrap items-center gap-2">
                    {findingDetailData.finding.status === 'open' && (
                      <button
                        type="button"
                        onClick={() => {
                          setReviewAction('open_review');
                          setReviewError(null);
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 text-xs font-semibold cursor-pointer"
                      >
                        Start Review
                      </button>
                    )}
                    {(findingDetailData.finding.status === 'open' ||
                      findingDetailData.finding.status === 'under_review') && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setReviewAction('confirm_issue');
                            setReviewError(null);
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-rose-600 text-white hover:bg-rose-700 text-xs font-semibold cursor-pointer shadow-2xs"
                        >
                          Confirm Issue
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReviewAction('dismiss');
                            setReviewError(null);
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-white border border-[#E8E7E2] text-[#66645C] hover:text-[#171714] hover:bg-[#F8F7F2] text-xs font-medium cursor-pointer"
                        >
                          Dismiss Finding
                        </button>
                      </>
                    )}
                    {(findingDetailData.finding.status === 'confirmed_issue' ||
                      findingDetailData.finding.status === 'under_review') && (
                      <button
                        type="button"
                        onClick={() => {
                          setReviewAction('resolve');
                          setReviewError(null);
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-semibold cursor-pointer shadow-2xs"
                      >
                        Mark Resolved
                      </button>
                    )}
                  </div>
                </div>

                {/* Review Input Box */}
                {reviewAction && (
                  <div className="p-4 rounded-2xl bg-[#F8F7F2] border border-[#E8E7E2] space-y-3">
                    <div className="text-xs font-bold text-[#171714] capitalize">
                      Confirming Action: {reviewAction.replace('_', ' ')}
                    </div>
                    {reviewAction === 'dismiss' && (
                      <div>
                        <label className="block text-[11px] font-semibold text-[#66645C] mb-1">
                          Dismissal Reason <span className="text-rose-600">*</span>
                        </label>
                        <input
                          type="text"
                          value={reviewReason}
                          onChange={(e) => setReviewReason(e.target.value)}
                          placeholder="e.g. Legitimate bulk purchase authorized under PO-9842"
                          className="w-full px-3 py-2 rounded-xl bg-white border border-[#E8E7E2] text-[#171714] text-xs focus:outline-none focus:border-[#E5BB45]"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-[11px] font-semibold text-[#66645C] mb-1">
                        Audit Notes (Optional)
                      </label>
                      <textarea
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        placeholder="Add investigation notes or vendor confirmation details..."
                        rows={2}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-[#E8E7E2] text-[#171714] text-xs focus:outline-none focus:border-[#E5BB45]"
                      />
                    </div>
                    {reviewError && (
                      <div className="text-rose-700 text-xs font-medium">{reviewError}</div>
                    )}
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setReviewAction(null);
                          setReviewError(null);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white border border-[#E8E7E2] text-[#66645C] hover:text-[#171714] text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={submitReview}
                        disabled={reviewMutation.isPending}
                        className="px-4 py-1.5 rounded-lg bg-[#171714] hover:bg-[#2A2A26] text-white text-xs font-semibold cursor-pointer shadow-2xs disabled:opacity-50"
                      >
                        {reviewMutation.isPending ? 'Saving...' : 'Submit Decision'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Audit History Timeline */}
              <div className="space-y-2 border-t border-[#E8E7E2] pt-4">
                <h4 className="text-xs font-bold text-[#171714] flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-[#66645C]" />
                  <span>Audit &amp; Decision History</span>
                </h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {findingDetailData.history && findingDetailData.history.length > 0 ? (
                    findingDetailData.history.map((h, idx) => (
                      <div
                        key={h.id || (h as unknown as { _id?: string })._id || `history-${idx}`}
                        className="p-2.5 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] text-xs flex items-center justify-between"
                      >
                        <div className="space-y-0.5">
                          <div className="text-[#171714] font-semibold capitalize">
                            {h.action.replace('_', ' ')}
                            {h.notes || h.reason ? (
                              <span className="text-[#66645C] font-normal text-[11px] ml-1.5">
                                &bull; {h.notes || h.reason}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <span className="text-[10px] text-[#66645C] font-mono">
                          {new Date(h.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-[#66645C]">No previous audit events recorded.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  if (!inShell) {
    return <div className="space-y-8">{bodyContent}</div>;
  }

  return (
    <Layout pageTitle="Financial Findings" headerActions={headerActions}>
      {bodyContent}
    </Layout>
  );
};
