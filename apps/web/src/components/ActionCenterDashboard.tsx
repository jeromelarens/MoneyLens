import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layout } from './Layout';
import { financialService } from '../services/financial.service';
import type {
  BusinessAction,
  ActionStatus,
  ActionPriority,
  ActionCategory,
  ActionTransitionRequest,
  SupportedCurrency,
} from '@moneylens/shared';
import { formatCurrencyAmount } from '@moneylens/shared';
import {
  Zap,
  Play,
  CheckCircle2,
  Clock,
  Archive,
  RefreshCw,
  Search,
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  X,
  History,
  DollarSign,
  ShieldCheck,
  RotateCcw,
  ExternalLink,
  ArrowRight,
  Check,
} from 'lucide-react';

export const ActionCenterDashboard: React.FC<{ inShell?: boolean }> = ({ inShell = true }) => {
  const queryClient = useQueryClient();

  // Document Title
  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'Business Action Center — MoneyLens';
    return () => {
      document.title = originalTitle;
    };
  }, []);

  // Filters State
  const [selectedStatus, setSelectedStatus] = useState<ActionStatus | 'all'>('open');
  const [selectedPriority, setSelectedPriority] = useState<ActionPriority | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<ActionCategory | 'all'>('all');
  const [selectedCurrency, setSelectedCurrency] = useState<SupportedCurrency | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sortBy, setSortBy] = useState<
    'priorityScore' | 'potentialExposureMinor' | 'createdAt' | 'updatedAt'
  >('priorityScore');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState<number>(1);

  // Detail Modal State
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);

  // Transition Dialog State
  const [transitionAction, setTransitionAction] = useState<BusinessAction | null>(null);
  const [targetStatus, setTargetStatus] = useState<ActionStatus | null>(null);
  const [dismissalReason, setDismissalReason] = useState<string>('');
  const [completionNotes, setCompletionNotes] = useState<string>('');
  const [snoozeDays, setSnoozeDays] = useState<number>(7);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  // User Notification Banner
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Modal Scroll Lock & Escape Dismiss
  useEffect(() => {
    const isAnyModalOpen = Boolean(selectedActionId || transitionAction);
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setSelectedActionId(null);
          closeTransitionDialog();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [selectedActionId, transitionAction]);

  // 1. Action Summary Query
  const { data: summaryData, isLoading: isSummaryLoading } = useQuery({
    queryKey: ['actions-summary'],
    queryFn: financialService.getActionSummary,
    staleTime: 30000,
  });

  // 2. Action List Query
  const {
    data: actionsData,
    isLoading: isActionsLoading,
    isError: isActionsError,
    refetch: refetchActions,
  } = useQuery({
    queryKey: [
      'actions-list',
      page,
      selectedStatus,
      selectedPriority,
      selectedCategory,
      selectedCurrency,
      searchTerm,
      sortBy,
      sortOrder,
    ],
    queryFn: () =>
      financialService.getActions({
        page,
        limit: 15,
        status: selectedStatus === 'all' ? undefined : selectedStatus,
        priority: selectedPriority === 'all' ? undefined : selectedPriority,
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        currency: selectedCurrency === 'all' ? undefined : selectedCurrency,
        search: searchTerm.trim() || undefined,
        sortBy,
        sortOrder,
      }),
    staleTime: 30000,
  });

  // 3. Action Detail Query
  const { data: actionDetailData } = useQuery({
    queryKey: ['action-detail', selectedActionId],
    queryFn: () => (selectedActionId ? financialService.getActionById(selectedActionId) : null),
    enabled: Boolean(selectedActionId),
  });

  // 4. Action History Query
  const { data: actionHistoryData, isLoading: isHistoryLoading } = useQuery({
    queryKey: ['action-history', selectedActionId],
    queryFn: () => (selectedActionId ? financialService.getActionHistory(selectedActionId) : null),
    enabled: Boolean(selectedActionId),
  });

  // 5. Evaluate Actions Mutation
  const evaluateMutation = useMutation({
    mutationFn: financialService.evaluateActions,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['actions-summary'] });
      queryClient.invalidateQueries({ queryKey: ['actions-list'] });
      const created = data?.data?.createdCount ?? 0;
      const updated = data?.data?.updatedCount ?? 0;
      const superseded = data?.data?.supersededCount ?? 0;
      setSuccessBanner(
        `Action evaluation complete: ${created} created, ${updated} refreshed, ${superseded} superseded.`,
      );
      setTimeout(() => setSuccessBanner(null), 6000);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setTransitionError(msg || 'Evaluation failed. Please try again.');
    },
  });

  // 6. Transition Action Mutation
  const transitionMutation = useMutation({
    mutationFn: async (params: { actionId: string; request: ActionTransitionRequest }) => {
      return financialService.transitionAction(params.actionId, params.request);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['actions-summary'] });
      queryClient.invalidateQueries({ queryKey: ['actions-list'] });
      if (selectedActionId) {
        queryClient.invalidateQueries({ queryKey: ['action-detail', selectedActionId] });
        queryClient.invalidateQueries({ queryKey: ['action-history', selectedActionId] });
      }
      setSuccessBanner(
        `Action transitioned to "${variables.request.status.replace('_', ' ')}" status successfully.`,
      );
      setTimeout(() => setSuccessBanner(null), 5000);
      closeTransitionDialog();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setTransitionError(msg || 'Failed to update action lifecycle status');
    },
  });

  const openTransitionDialog = (action: BusinessAction, status: ActionStatus) => {
    setTransitionAction(action);
    setTargetStatus(status);
    setDismissalReason('');
    setCompletionNotes('');
    setSnoozeDays(7);
    setTransitionError(null);
  };

  const closeTransitionDialog = () => {
    setTransitionAction(null);
    setTargetStatus(null);
    setDismissalReason('');
    setCompletionNotes('');
    setTransitionError(null);
  };

  const submitTransition = () => {
    if (!transitionAction || !targetStatus) return;

    if (targetStatus === 'dismissed' && !dismissalReason.trim()) {
      setTransitionError('A non-empty dismissal reason is required.');
      return;
    }

    const request: ActionTransitionRequest = {
      status: targetStatus,
      reason: dismissalReason.trim() || undefined,
      notes: completionNotes.trim() || undefined,
    };

    if (targetStatus === 'snoozed') {
      const snoozeDeadline = new Date(Date.now() + snoozeDays * 86400000).toISOString();
      request.snoozedUntil = snoozeDeadline;
    }

    transitionMutation.mutate({
      actionId: transitionAction.id,
      request,
    });
  };

  const resetFilters = () => {
    setSelectedStatus('open');
    setSelectedPriority('all');
    setSelectedCategory('all');
    setSelectedCurrency('all');
    setSearchTerm('');
    setSortBy('priorityScore');
    setSortOrder('desc');
    setPage(1);
  };

  const isFilterActive = useMemo(() => {
    return (
      selectedStatus !== 'open' ||
      selectedPriority !== 'all' ||
      selectedCategory !== 'all' ||
      selectedCurrency !== 'all' ||
      searchTerm !== '' ||
      sortBy !== 'priorityScore' ||
      sortOrder !== 'desc'
    );
  }, [
    selectedStatus,
    selectedPriority,
    selectedCategory,
    selectedCurrency,
    searchTerm,
    sortBy,
    sortOrder,
  ]);

  const summary = summaryData?.data;
  const actions = actionsData?.items || [];
  const pagination = actionsData?.pagination;
  const detail = actionDetailData?.data;
  const history = actionHistoryData?.data || [];

  const getPriorityBadge = (priority: ActionPriority) => {
    switch (priority) {
      case 'critical':
        return 'bg-rose-50 text-rose-800 border-rose-200';
      case 'high':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'medium':
        return 'bg-sky-50 text-sky-800 border-sky-200';
      case 'low':
        return 'bg-[#F8F7F2] text-[#66645C] border-[#DEDDD5]';
    }
  };

  const getCategoryBadge = (category: ActionCategory) => {
    switch (category) {
      case 'cash_preservation':
        return 'bg-cyan-50 text-cyan-800 border-cyan-200';
      case 'cost_reduction':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'data_integrity':
        return 'bg-indigo-50 text-indigo-800 border-indigo-200';
      case 'vendor_management':
        return 'bg-purple-50 text-purple-800 border-purple-200';
    }
  };

  const getStatusBadge = (status: ActionStatus) => {
    switch (status) {
      case 'open':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'in_progress':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'snoozed':
        return 'bg-purple-50 text-purple-800 border-purple-200';
      case 'completed':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'dismissed':
        return 'bg-[#F8F7F2] text-[#66645C] border-[#DEDDD5]';
      case 'superseded':
        return 'bg-slate-100 text-slate-500 border-slate-200';
    }
  };

  const bodyContent = (
    <div className="space-y-8">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[#66645C]">
        <Link to="/" className="hover:text-[#171714] transition-colors">
          MoneyLens
        </Link>
        <span>/</span>
        <Link to="/dashboard" className="hover:text-[#171714] transition-colors">
          Treasury & Findings
        </Link>
        <span>/</span>
        <span className="font-semibold text-[#171714]">Action Center</span>
      </nav>

      {/* Success Banner Notification */}
      {successBanner && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between gap-3 shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Page Header & Evaluation Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-[#DEDDD5]">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#171714] text-[#E5BB45] flex items-center justify-center shadow-xs">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-serif text-3xl font-bold tracking-tight text-[#171714]">
                Business Action Center
              </h1>
              <p className="text-xs font-semibold text-[#66645C] tracking-wide uppercase mt-0.5">
                Evidence-Driven Operational Follow-Up
              </p>
            </div>
          </div>
          <p className="text-sm text-[#66645C] mt-2 max-w-3xl leading-relaxed">
            Synthesizes confirmed ledger leakage, reconciliation anomalies, and forecast obligations
            into prioritized, trackable operational tasks without speculative financial claims.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
          {summary?.lastEvaluatedAt && (
            <div className="text-xs text-[#66645C] flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#DEDDD5]">
              <Clock className="w-3.5 h-3.5 text-[#E5BB45]" />
              <span>Evaluated: {new Date(summary.lastEvaluatedAt).toLocaleDateString()}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => evaluateMutation.mutate()}
            disabled={evaluateMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#171714] hover:bg-[#2A2A26] active:bg-[#0D0D0B] rounded-xl transition cursor-pointer shadow-xs disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-[#E5BB45] ${evaluateMutation.isPending ? 'animate-spin' : ''}`}
            />
            <span>{evaluateMutation.isPending ? 'Evaluating...' : 'Evaluate Now'}</span>
          </button>
        </div>
      </div>

      {/* 3. Executive Metrics Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Urgent Actions */}
        <div className="p-4 rounded-xl bg-white border border-[#DEDDD5] shadow-2xs hover:shadow-xs transition">
          <div className="flex items-center justify-between text-[#66645C] text-xs font-semibold">
            <span>Critical & High</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#171714] mt-2">
            {isSummaryLoading
              ? '...'
              : (summary?.criticalPriorityCount || 0) + (summary?.highPriorityCount || 0)}
          </div>
          <div className="text-[11px] text-[#66645C] mt-1 font-medium">Requires prompt review</div>
        </div>

        {/* Open Actions */}
        <div className="p-4 rounded-xl bg-white border border-[#DEDDD5] shadow-2xs hover:shadow-xs transition">
          <div className="flex items-center justify-between text-[#66645C] text-xs font-semibold">
            <span>Open Tasks</span>
            <AlertCircle className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#171714] mt-2">
            {isSummaryLoading ? '...' : summary?.totalOpen || 0}
          </div>
          <div className="text-[11px] text-[#66645C] mt-1 font-medium">Awaiting decision</div>
        </div>

        {/* In Progress */}
        <div className="p-4 rounded-xl bg-white border border-[#DEDDD5] shadow-2xs hover:shadow-xs transition">
          <div className="flex items-center justify-between text-[#66645C] text-xs font-semibold">
            <span>In Progress</span>
            <Play className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#171714] mt-2">
            {isSummaryLoading ? '...' : summary?.totalInProgress || 0}
          </div>
          <div className="text-[11px] text-[#66645C] mt-1 font-medium">Active investigations</div>
        </div>

        {/* Snoozed */}
        <div className="p-4 rounded-xl bg-white border border-[#DEDDD5] shadow-2xs hover:shadow-xs transition">
          <div className="flex items-center justify-between text-[#66645C] text-xs font-semibold">
            <span>Snoozed</span>
            <Clock className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#171714] mt-2">
            {isSummaryLoading ? '...' : summary?.totalSnoozed || 0}
          </div>
          <div className="text-[11px] text-[#66645C] mt-1 font-medium">Deferred review</div>
        </div>

        {/* Completed */}
        <div className="p-4 rounded-xl bg-white border border-[#DEDDD5] shadow-2xs hover:shadow-xs transition">
          <div className="flex items-center justify-between text-[#66645C] text-xs font-semibold">
            <span>Completed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#171714] mt-2">
            {isSummaryLoading ? '...' : summary?.totalCompleted || 0}
          </div>
          <div className="text-[11px] text-[#66645C] mt-1 font-medium">Resolved by team</div>
        </div>

        {/* Dismissed */}
        <div className="p-4 rounded-xl bg-white border border-[#DEDDD5] shadow-2xs hover:shadow-xs transition">
          <div className="flex items-center justify-between text-[#66645C] text-xs font-semibold">
            <span>Dismissed</span>
            <Archive className="w-4 h-4 text-[#66645C]" />
          </div>
          <div className="text-2xl font-serif font-bold text-[#66645C] mt-2">
            {isSummaryLoading ? '...' : summary?.totalDismissed || 0}
          </div>
          <div className="text-[11px] text-[#66645C] mt-1 font-medium">Documented reasons</div>
        </div>
      </div>

      {/* 4. Evidence-Backed Financial Exposure (Strict Currency Segregation) */}
      {summary?.byCurrency && Object.keys(summary.byCurrency).length > 0 && (
        <div className="p-6 rounded-2xl bg-white border border-[#DEDDD5] shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                <DollarSign className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#171714]">
                  Active Financial Exposure (Strict Currency Segregation)
                </h3>
                <p className="text-xs text-[#66645C]">
                  Calculated strictly within verified currency buckets without speculative
                  cross-currency conversions.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {Object.values(summary.byCurrency).map((item) => (
              <div
                key={item.currency}
                className="p-4 rounded-xl bg-[#F8F7F2] border border-[#DEDDD5] flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-[#171714]">{item.currency} Exposure</div>
                  <div className="text-xl font-serif font-bold text-[#171714] mt-1">
                    {item.currency}{' '}
                    {formatCurrencyAmount(item.potentialExposureMinor, item.currency)}
                  </div>
                  <div className="text-[11px] text-[#66645C] mt-0.5">
                    Est. Avoidable: {item.currency}{' '}
                    {formatCurrencyAmount(item.estimatedAvoidableCostMinor, item.currency)}
                  </div>
                </div>
                <div className="text-xs px-2.5 py-1 rounded-lg bg-white text-[#171714] font-semibold border border-[#DEDDD5] shadow-2xs">
                  {item.actionCount} {item.actionCount === 1 ? 'action' : 'actions'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-white border border-[#DEDDD5] shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-[#66645C]">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value as ActionStatus | 'all');
                setPage(1);
              }}
              className="bg-[#F8F7F2] border border-[#DEDDD5] text-[#171714] text-xs font-medium rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#E5BB45]"
            >
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="snoozed">Snoozed</option>
              <option value="completed">Completed</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-[#66645C]">Priority:</span>
            <select
              value={selectedPriority}
              onChange={(e) => {
                setSelectedPriority(e.target.value as ActionPriority | 'all');
                setPage(1);
              }}
              className="bg-[#F8F7F2] border border-[#DEDDD5] text-[#171714] text-xs font-medium rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#E5BB45]"
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-[#66645C]">Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value as ActionCategory | 'all');
                setPage(1);
              }}
              className="bg-[#F8F7F2] border border-[#DEDDD5] text-[#171714] text-xs font-medium rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#E5BB45]"
            >
              <option value="all">All Categories</option>
              <option value="cash_preservation">Cash Preservation</option>
              <option value="cost_reduction">Cost Reduction</option>
              <option value="data_integrity">Data Integrity</option>
              <option value="vendor_management">Vendor Management</option>
            </select>
          </div>

          {/* Currency Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-[#66645C]">Currency:</span>
            <select
              value={selectedCurrency}
              onChange={(e) => {
                setSelectedCurrency(e.target.value as SupportedCurrency | 'all');
                setPage(1);
              }}
              className="bg-[#F8F7F2] border border-[#DEDDD5] text-[#171714] text-xs font-medium rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#E5BB45]"
            >
              <option value="all">All Currencies</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="CAD">CAD</option>
              <option value="AUD">AUD</option>
              <option value="JPY">JPY</option>
            </select>
          </div>

          {/* Reset Filters */}
          {isFilterActive && (
            <button
              type="button"
              onClick={resetFilters}
              className="px-2.5 py-1.5 text-xs font-semibold text-[#66645C] hover:text-[#171714] hover:bg-[#F8F7F2] rounded-lg transition"
            >
              Reset
            </button>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-[#66645C] absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search actions..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="w-full bg-[#F8F7F2] border border-[#DEDDD5] text-[#171714] text-xs rounded-lg pl-9 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#E5BB45] placeholder-[#66645C]"
          ></input>
        </div>
      </div>

      {/* 6. Action Register List */}
      <div className="space-y-4">
        {isActionsLoading ? (
          <div className="p-12 text-center text-[#66645C] bg-white border border-[#DEDDD5] rounded-2xl shadow-2xs">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#E5BB45] mb-2" />
            <p className="text-sm font-semibold text-[#171714]">Loading business actions...</p>
            <p className="text-xs text-[#66645C] mt-1">
              Retrieving evidence-backed operational recommendations.
            </p>
          </div>
        ) : isActionsError ? (
          <div className="p-8 text-center bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 shadow-2xs">
            <AlertCircle className="w-6 h-6 mx-auto mb-2 text-rose-600" />
            <p className="text-sm font-bold">Failed to load action items.</p>
            <p className="text-xs text-rose-700 mt-1">
              An error occurred while communicating with the actions service.
            </p>
            <button
              type="button"
              onClick={() => refetchActions()}
              className="mt-3 px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg transition"
            >
              Retry
            </button>
          </div>
        ) : actions.length === 0 ? (
          <div className="p-12 text-center bg-white border border-[#DEDDD5] rounded-2xl text-[#66645C] shadow-2xs">
            <ShieldCheck className="w-10 h-10 text-emerald-600 mx-auto mb-3 opacity-90" />
            <p className="text-base font-bold text-[#171714]">
              No actions matching current filters
            </p>
            <p className="text-xs text-[#66645C] mt-1 max-w-md mx-auto leading-relaxed">
              Your financial records and forecasts currently have no active recommendations under
              the selected filters.
            </p>
            {isFilterActive && (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 px-3 py-1.5 text-xs font-bold text-[#171714] bg-[#F8F7F2] border border-[#DEDDD5] rounded-lg hover:bg-[#E8E7E2] transition"
              >
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          actions.map((act) => (
            <div
              key={act.id}
              className="p-5 rounded-2xl bg-white border border-[#DEDDD5] hover:border-[#171714]/40 transition shadow-2xs hover:shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6"
            >
              <div className="space-y-2 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getPriorityBadge(act.priority)}`}
                  >
                    {act.priority.toUpperCase()} ({act.priorityScore} pts)
                  </span>
                  <span
                    className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${getCategoryBadge(act.category)}`}
                  >
                    {act.category.replace(/_/g, ' ')}
                  </span>
                  <span
                    className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${getStatusBadge(act.status)}`}
                  >
                    {act.status.replace(/_/g, ' ')}
                  </span>
                  {act.currency && act.financialImpact?.potentialExposureMinor > 0 && (
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {act.currency}{' '}
                      {formatCurrencyAmount(
                        act.financialImpact.potentialExposureMinor,
                        act.currency,
                      )}{' '}
                      Exposure
                    </span>
                  )}
                </div>

                <Link
                  to={`/actions/${act.id}`}
                  className="text-base font-bold text-[#171714] hover:text-[#D3A82F] transition cursor-pointer inline-block"
                >
                  {act.title}
                </Link>
                <p className="text-xs text-[#66645C] line-clamp-2 leading-relaxed">
                  {act.explanation}
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {act.recommendedSteps.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-[#171714] bg-[#F8F7F2] px-3 py-1.5 rounded-lg border border-[#DEDDD5]">
                      <span className="font-bold text-[#D3A82F]">Step 1:</span>
                      <span>{act.recommendedSteps[0]!.label}</span>
                    </div>
                  )}

                  {act.sourceFindingIds.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-[#66645C]">
                      <span>Source:</span>
                      {act.sourceFindingIds.slice(0, 2).map((findId) => (
                        <Link
                          key={findId}
                          to={`/findings/${findId}`}
                          className="inline-flex items-center gap-1 font-semibold text-[#171714] hover:text-[#D3A82F] hover:underline"
                        >
                          <span>Finding {findId.slice(0, 8)}...</span>
                          <ArrowRight className="w-3 h-3 text-[#E5BB45]" />
                        </Link>
                      ))}
                    </div>
                  )}

                  {act.sourceForecastRunId && (
                    <Link
                      to="/cash-flow"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#171714] hover:text-[#D3A82F] hover:underline"
                    >
                      <span>Linked Forecast Run</span>
                      <ArrowRight className="w-3 h-3 text-[#E5BB45]" />
                    </Link>
                  )}
                </div>
              </div>

              {/* State-Aware Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 self-end md:self-center shrink-0">
                {act.status === 'open' && (
                  <button
                    type="button"
                    onClick={() => openTransitionDialog(act, 'in_progress')}
                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#171714] hover:bg-[#2A2A26] rounded-xl transition cursor-pointer shadow-2xs"
                  >
                    Start Action
                  </button>
                )}

                {act.status === 'in_progress' && (
                  <button
                    type="button"
                    onClick={() => openTransitionDialog(act, 'completed')}
                    className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition cursor-pointer shadow-2xs"
                  >
                    Mark Done
                  </button>
                )}

                {(act.status === 'open' || act.status === 'in_progress') && (
                  <>
                    <button
                      type="button"
                      onClick={() => openTransitionDialog(act, 'snoozed')}
                      className="px-3 py-1.5 text-xs font-semibold text-[#66645C] hover:text-[#171714] bg-[#F8F7F2] hover:bg-[#E8E7E2] border border-[#DEDDD5] rounded-xl transition cursor-pointer"
                    >
                      Snooze
                    </button>
                    <button
                      type="button"
                      onClick={() => openTransitionDialog(act, 'dismissed')}
                      className="px-3 py-1.5 text-xs font-semibold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </>
                )}

                {(act.status === 'completed' || act.status === 'dismissed') && (
                  <button
                    type="button"
                    onClick={() => openTransitionDialog(act, 'open')}
                    className="px-3 py-1.5 text-xs font-bold text-[#171714] hover:text-black bg-[#F8F7F2] hover:bg-[#E8E7E2] border border-[#DEDDD5] rounded-xl transition cursor-pointer flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reopen</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedActionId(act.id)}
                  className="px-3 py-1.5 text-xs font-bold text-[#171714] hover:bg-[#F8F7F2] border border-[#DEDDD5] rounded-xl transition cursor-pointer"
                >
                  Details
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 7. Pagination Controls */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-[#66645C] p-3 bg-white border border-[#DEDDD5] rounded-xl shadow-2xs">
          <span>
            Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} total
            actions)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              className="p-2 rounded-lg bg-[#F8F7F2] border border-[#DEDDD5] hover:bg-[#E8E7E2] disabled:opacity-40 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4 text-[#171714]" />
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((prev) => prev + 1)}
              className="p-2 rounded-lg bg-[#F8F7F2] border border-[#DEDDD5] hover:bg-[#E8E7E2] disabled:opacity-40 transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4 text-[#171714]" />
            </button>
          </div>
        </div>
      )}

      {/* 8. Action Detail & Evidence Modal */}
      {selectedActionId && detail && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="action-detail-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="bg-white border border-[#DEDDD5] rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-6 border-b border-[#DEDDD5] flex items-start justify-between gap-4 bg-[#F8F7F2]">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getPriorityBadge(detail.priority)}`}
                  >
                    {detail.priority.toUpperCase()} ({detail.priorityScore} pts)
                  </span>
                  <span
                    className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${getCategoryBadge(detail.category)}`}
                  >
                    {detail.category.replace(/_/g, ' ')}
                  </span>
                  <span
                    className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${getStatusBadge(detail.status)}`}
                  >
                    {detail.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <h2
                  id="action-detail-title"
                  className="font-serif text-lg sm:text-xl font-bold text-[#171714] mt-2"
                >
                  {detail.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedActionId(null)}
                className="w-10 h-10 flex items-center justify-center rounded-xl text-[#66645C] hover:text-[#171714] hover:bg-[#E8E7E2] transition shrink-0"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto">
              {/* Financial Impact Box */}
              {detail.currency && (
                <div className="p-4 rounded-xl bg-[#F8F7F2] border border-[#DEDDD5] grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <span className="text-[11px] font-semibold text-[#66645C]">
                      Potential Exposure
                    </span>
                    <p className="text-sm font-bold text-[#171714] mt-0.5">
                      {detail.currency}{' '}
                      {formatCurrencyAmount(
                        detail.financialImpact.potentialExposureMinor,
                        detail.currency,
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-[#66645C]">
                      Estimated Avoidable
                    </span>
                    <p className="text-sm font-bold text-emerald-700 mt-0.5">
                      {detail.currency}{' '}
                      {formatCurrencyAmount(
                        detail.financialImpact.estimatedAvoidableCostMinor,
                        detail.currency,
                      )}
                    </p>
                  </div>
                  {detail.financialImpact.projectedCashFlowEffectMinor !== 0 && (
                    <div>
                      <span className="text-[11px] font-semibold text-[#66645C]">
                        Net Flow Effect
                      </span>
                      <p className="text-sm font-bold text-sky-700 mt-0.5">
                        {detail.currency}{' '}
                        {formatCurrencyAmount(
                          detail.financialImpact.projectedCashFlowEffectMinor,
                          detail.currency,
                        )}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Rationale & Explanation */}
              <div>
                <h4 className="text-xs font-bold text-[#171714] uppercase tracking-wider mb-2">
                  Why This Action Was Generated
                </h4>
                <p className="text-xs text-[#171714] leading-relaxed bg-[#F8F7F2] p-4 rounded-xl border border-[#DEDDD5]">
                  {detail.explanation}
                </p>
              </div>

              {/* Recommended Action Steps */}
              {detail.recommendedSteps.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-[#171714] uppercase tracking-wider mb-2">
                    Recommended Next Steps
                  </h4>
                  <div className="space-y-2">
                    {detail.recommendedSteps.map((step) => (
                      <div
                        key={step.stepNumber}
                        className="p-3 rounded-xl bg-white border border-[#DEDDD5] flex items-start gap-3"
                      >
                        <span className="w-5 h-5 rounded-full bg-[#171714] text-[#E5BB45] text-xs font-bold flex items-center justify-center shrink-0">
                          {step.stepNumber}
                        </span>
                        <div>
                          <div className="text-xs font-bold text-[#171714]">
                            {step.label}{' '}
                            {step.isOptional && (
                              <span className="text-[#66645C] font-normal">(Optional)</span>
                            )}
                          </div>
                          <div className="text-xs text-[#66645C] mt-0.5">{step.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Linked Records Navigation */}
              {(detail.sourceFindingIds.length > 0 || detail.sourceForecastRunId) && (
                <div>
                  <h4 className="text-xs font-bold text-[#171714] uppercase tracking-wider mb-2">
                    Linked Source Records
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {detail.sourceFindingIds.map((findId) => (
                      <Link
                        key={findId}
                        to={`/findings/${findId}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F8F7F2] border border-[#DEDDD5] text-xs font-semibold text-[#171714] hover:bg-[#E8E7E2] transition"
                      >
                        <span>Finding: {findId}</span>
                        <ExternalLink className="w-3 h-3 text-[#E5BB45]" />
                      </Link>
                    ))}
                    {detail.sourceForecastRunId && (
                      <Link
                        to="/cash-flow"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F8F7F2] border border-[#DEDDD5] text-xs font-semibold text-[#171714] hover:bg-[#E8E7E2] transition"
                      >
                        <span>Cash Flow Forecast Workspace</span>
                        <ExternalLink className="w-3 h-3 text-[#E5BB45]" />
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {/* Underlying Evidence */}
              <div>
                <h4 className="text-xs font-bold text-[#171714] uppercase tracking-wider mb-2">
                  Underlying Source Evidence
                </h4>
                <div className="p-3 rounded-xl bg-[#F8F7F2] text-[#171714] text-xs font-mono overflow-x-auto max-h-40 border border-[#DEDDD5]">
                  <pre>{JSON.stringify(detail.evidence, null, 2)}</pre>
                </div>
              </div>

              {/* Audit History Trail */}
              <div>
                <h4 className="text-xs font-bold text-[#171714] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-[#E5BB45]" />
                  <span>Lifecycle History (Append-Only Audit Trail)</span>
                </h4>
                {isHistoryLoading ? (
                  <p className="text-xs text-[#66645C]">Loading audit trail...</p>
                ) : history.length === 0 ? (
                  <p className="text-xs text-[#66645C]">No events recorded yet.</p>
                ) : (
                  <div className="space-y-2 border-l-2 border-[#DEDDD5] pl-3 ml-1.5">
                    {history.map((event) => (
                      <div key={event.id} className="text-xs space-y-0.5">
                        <div className="text-[#66645C]">
                          <span className="font-bold text-[#171714]">{event.eventType}</span> &rarr;{' '}
                          <span className="font-semibold text-blue-700">{event.nextStatus}</span>
                          <span className="text-[#66645C] ml-2">
                            {new Date(event.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {event.reason && (
                          <p className="text-[#66645C] italic">Reason: {event.reason}</p>
                        )}
                        {event.notes && <p className="text-[#66645C]">Notes: {event.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 border-t border-[#DEDDD5] flex items-center justify-between bg-[#F8F7F2]">
              <div className="text-xs text-[#66645C]">
                Rule: {detail.ruleId} ({detail.ruleVersion})
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/actions/${detail.id}`}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#171714] hover:bg-[#2A2A26] rounded-xl transition shadow-2xs"
                >
                  <span>Full Details &amp; History</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
                <button
                  type="button"
                  onClick={() => setSelectedActionId(null)}
                  className="px-4 py-2 text-xs font-bold text-[#171714] bg-white border border-[#DEDDD5] hover:bg-[#E8E7E2] rounded-xl transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 9. Transition Action Dialog */}
      {transitionAction && targetStatus && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="transition-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="bg-white border border-[#DEDDD5] rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3
              id="transition-dialog-title"
              className="font-serif text-lg font-bold text-[#171714]"
            >
              {targetStatus === 'dismissed' && 'Dismiss Recommendation'}
              {targetStatus === 'completed' && 'Mark Action Completed'}
              {targetStatus === 'snoozed' && 'Snooze Action'}
              {targetStatus === 'in_progress' && 'Start Working on Action'}
              {targetStatus === 'open' && 'Reopen Action'}
            </h3>

            <p className="text-xs text-[#66645C] leading-relaxed">
              {targetStatus === 'dismissed' &&
                'Please provide a non-empty reason explaining why this recommendation is not applicable or has been dismissed.'}
              {targetStatus === 'completed' &&
                'Record resolution notes for your team (optional). Marking completed records your action, but does not claim verified monetary recovery without bank confirmation.'}
              {targetStatus === 'snoozed' &&
                'Select how long to defer this action before it automatically re-evaluates and reopens.'}
              {targetStatus === 'in_progress' &&
                'Move this action to in-progress status to notify collaborators it is under active review.'}
              {targetStatus === 'open' && 'Restore this action to open review status.'}
            </p>

            {targetStatus === 'dismissed' && (
              <div>
                <label className="block text-xs font-bold text-[#171714] mb-1">
                  Dismissal Reason <span className="text-rose-600">*</span>
                </label>
                <textarea
                  rows={3}
                  value={dismissalReason}
                  onChange={(e) => setDismissalReason(e.target.value)}
                  placeholder="e.g., Authorized annual software license expansion confirmed by store manager."
                  className="w-full bg-[#F8F7F2] border border-[#DEDDD5] text-[#171714] text-xs rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-[#E5BB45]"
                />
              </div>
            )}

            {targetStatus === 'completed' && (
              <div>
                <label className="block text-xs font-bold text-[#171714] mb-1">
                  Completion Notes (Optional)
                </label>
                <textarea
                  rows={3}
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  placeholder="e.g., Contacted vendor billing; credit note #992 received for next month statement."
                  className="w-full bg-[#F8F7F2] border border-[#DEDDD5] text-[#171714] text-xs rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-[#E5BB45]"
                />
              </div>
            )}

            {targetStatus === 'snoozed' && (
              <div>
                <label className="block text-xs font-bold text-[#171714] mb-1">
                  Snooze Duration
                </label>
                <select
                  value={snoozeDays}
                  onChange={(e) => setSnoozeDays(Number(e.target.value))}
                  className="w-full bg-[#F8F7F2] border border-[#DEDDD5] text-[#171714] text-xs rounded-xl p-2.5 focus:outline-none focus:ring-1 focus:ring-[#E5BB45]"
                >
                  <option value={1}>1 Day (Tomorrow)</option>
                  <option value={3}>3 Days</option>
                  <option value={7}>7 Days (1 Week)</option>
                  <option value={14}>14 Days (2 Weeks)</option>
                  <option value={30}>30 Days (1 Month)</option>
                </select>
              </div>
            )}

            {transitionError && (
              <p className="text-xs text-rose-600 font-bold">{transitionError}</p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeTransitionDialog}
                disabled={transitionMutation.isPending}
                className="px-3.5 py-1.5 text-xs font-semibold text-[#66645C] hover:text-[#171714] rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitTransition}
                disabled={transitionMutation.isPending}
                className="px-4 py-1.5 text-xs font-bold text-white bg-[#171714] hover:bg-[#2A2A26] rounded-xl transition disabled:opacity-50 cursor-pointer shadow-2xs"
              >
                {transitionMutation.isPending ? 'Updating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (!inShell) {
    return bodyContent;
  }

  return <Layout pageTitle="Action Center">{bodyContent}</Layout>;
};
