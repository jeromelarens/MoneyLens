import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { financialService } from '../services/financial.service';
import type {
  BusinessAction,
  ActionStatus,
  ActionPriority,
  ActionCategory,
  ActionTransitionRequest,
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
} from 'lucide-react';

export const ActionCenterDashboard: React.FC = () => {
  const queryClient = useQueryClient();

  // Filters State
  const [selectedStatus, setSelectedStatus] = useState<ActionStatus | 'all'>('open');
  const [selectedPriority, setSelectedPriority] = useState<ActionPriority | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState<ActionCategory | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
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

  // 1. Action Summary Query
  const { data: summaryData, isLoading: isSummaryLoading } = useQuery({
    queryKey: ['actions-summary'],
    queryFn: financialService.getActionSummary,
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
      searchTerm,
    ],
    queryFn: () =>
      financialService.getActions({
        page,
        limit: 15,
        status: selectedStatus === 'all' ? undefined : selectedStatus,
        priority: selectedPriority === 'all' ? undefined : selectedPriority,
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        search: searchTerm.trim() || undefined,
        sortBy: 'priorityScore',
        sortOrder: 'desc',
      }),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actions-summary'] });
      queryClient.invalidateQueries({ queryKey: ['actions-list'] });
    },
  });

  // 6. Transition Action Mutation
  const transitionMutation = useMutation({
    mutationFn: async (params: { actionId: string; request: ActionTransitionRequest }) => {
      return financialService.transitionAction(params.actionId, params.request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actions-summary'] });
      queryClient.invalidateQueries({ queryKey: ['actions-list'] });
      if (selectedActionId) {
        queryClient.invalidateQueries({ queryKey: ['action-detail', selectedActionId] });
        queryClient.invalidateQueries({ queryKey: ['action-history', selectedActionId] });
      }
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

  const summary = summaryData?.data;
  const actions = actionsData?.items || [];
  const pagination = actionsData?.pagination;
  const detail = actionDetailData?.data;
  const history = actionHistoryData?.data || [];

  const getPriorityBadge = (priority: ActionPriority) => {
    switch (priority) {
      case 'critical':
        return 'bg-rose-950/80 text-rose-300 border-rose-800';
      case 'high':
        return 'bg-amber-950/80 text-amber-300 border-amber-800';
      case 'medium':
        return 'bg-sky-950/80 text-sky-300 border-sky-800';
      case 'low':
        return 'bg-slate-800/80 text-slate-300 border-slate-700';
    }
  };

  const getCategoryBadge = (category: ActionCategory) => {
    switch (category) {
      case 'cash_preservation':
        return 'bg-cyan-950/60 text-cyan-300 border-cyan-800';
      case 'cost_reduction':
        return 'bg-emerald-950/60 text-emerald-300 border-emerald-800';
      case 'data_integrity':
        return 'bg-indigo-950/60 text-indigo-300 border-indigo-800';
      case 'vendor_management':
        return 'bg-violet-950/60 text-violet-300 border-violet-800';
    }
  };

  const getStatusBadge = (status: ActionStatus) => {
    switch (status) {
      case 'open':
        return 'bg-blue-950/60 text-blue-300 border-blue-800';
      case 'in_progress':
        return 'bg-amber-950/60 text-amber-300 border-amber-800';
      case 'snoozed':
        return 'bg-purple-950/60 text-purple-300 border-purple-800';
      case 'completed':
        return 'bg-emerald-950/60 text-emerald-300 border-emerald-800';
      case 'dismissed':
        return 'bg-slate-800/60 text-slate-400 border-slate-700';
      case 'superseded':
        return 'bg-slate-900 text-slate-500 border-slate-800';
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Header & Evaluation Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Zap className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">Business Action Center</h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium border border-slate-700">
              Decision Intelligence
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Prioritized, evidence-backed operational guidance synthesized from financial leakage
            findings and cash-flow projections.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {summary?.lastEvaluatedAt && (
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Evaluated: {new Date(summary.lastEvaluatedAt).toLocaleDateString()}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => evaluateMutation.mutate()}
            disabled={evaluateMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-xl transition cursor-pointer shadow-lg shadow-indigo-600/20 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${evaluateMutation.isPending ? 'animate-spin' : ''}`} />
            <span>{evaluateMutation.isPending ? 'Evaluating...' : 'Evaluate Now'}</span>
          </button>
        </div>
      </div>

      {/* 2. Executive Metrics Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {/* Urgent Actions */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Critical & High</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {isSummaryLoading
              ? '...'
              : (summary?.criticalPriorityCount || 0) + (summary?.highPriorityCount || 0)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Requires prompt attention</div>
        </div>

        {/* Open Actions */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Open Tasks</span>
            <AlertCircle className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {isSummaryLoading ? '...' : summary?.totalOpen || 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Awaiting decision</div>
        </div>

        {/* In Progress */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>In Progress</span>
            <Play className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {isSummaryLoading ? '...' : summary?.totalInProgress || 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Active investigations</div>
        </div>

        {/* Snoozed */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Snoozed</span>
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {isSummaryLoading ? '...' : summary?.totalSnoozed || 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Deferred review</div>
        </div>

        {/* Completed */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Completed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {isSummaryLoading ? '...' : summary?.totalCompleted || 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Resolved by owner</div>
        </div>

        {/* Dismissed */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Dismissed</span>
            <Archive className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-400 mt-2">
            {isSummaryLoading ? '...' : summary?.totalDismissed || 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Documented reasons</div>
        </div>
      </div>

      {/* 3. Evidence-Backed Financial Exposure (Segregated by Currency) */}
      {summary?.byCurrency && Object.keys(summary.byCurrency).length > 0 && (
        <div className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">
              Active Financial Exposure (Strict Currency Segregation)
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {Object.values(summary.byCurrency).map((item) => (
              <div
                key={item.currency}
                className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-bold text-indigo-400">{item.currency} Exposure</div>
                  <div className="text-xl font-bold text-white mt-1">
                    {item.currency}{' '}
                    {formatCurrencyAmount(item.potentialExposureMinor, item.currency)}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Est. Avoidable: {item.currency}{' '}
                    {formatCurrencyAmount(item.estimatedAvoidableCostMinor, item.currency)}
                  </div>
                </div>
                <div className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                  {item.actionCount} {item.actionCount === 1 ? 'action' : 'actions'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Filter Toolbar */}
      <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value as ActionStatus | 'all');
                setPage(1);
              }}
              className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
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
            <span className="text-xs text-slate-400">Priority:</span>
            <select
              value={selectedPriority}
              onChange={(e) => {
                setSelectedPriority(e.target.value as ActionPriority | 'all');
                setPage(1);
              }}
              className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
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
            <span className="text-xs text-slate-400">Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value as ActionCategory | 'all');
                setPage(1);
              }}
              className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">All Categories</option>
              <option value="cash_preservation">Cash Preservation</option>
              <option value="cost_reduction">Cost Reduction</option>
              <option value="data_integrity">Data Integrity</option>
              <option value="vendor_management">Vendor Management</option>
            </select>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search actions..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg pl-9 pr-3 py-1.5 focus:outline-none focus:border-indigo-500 placeholder-slate-500"
          />
        </div>
      </div>

      {/* 5. Action Cards List */}
      <div className="space-y-3">
        {isActionsLoading ? (
          <div className="p-12 text-center text-slate-400 bg-slate-900/20 border border-slate-800/80 rounded-2xl">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-400 mb-2" />
            <p className="text-sm">Loading business action recommendations...</p>
          </div>
        ) : isActionsError ? (
          <div className="p-8 text-center bg-rose-950/20 border border-rose-900/50 rounded-2xl text-rose-300">
            <AlertCircle className="w-6 h-6 mx-auto mb-2" />
            <p className="text-sm font-semibold">Failed to load action items.</p>
            <button
              type="button"
              onClick={() => refetchActions()}
              className="mt-3 px-3 py-1.5 bg-rose-900/50 hover:bg-rose-900 text-xs font-medium rounded-lg transition"
            >
              Retry
            </button>
          </div>
        ) : actions.length === 0 ? (
          <div className="p-12 text-center bg-slate-900/20 border border-slate-800/80 rounded-2xl text-slate-400">
            <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-3 opacity-80" />
            <p className="text-base font-semibold text-white">
              No actions matching current filters
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Your financial records and forecasts currently have no active recommendations under
              the selected criteria.
            </p>
          </div>
        ) : (
          actions.map((act) => (
            <div
              key={act.id}
              className="p-5 rounded-2xl bg-slate-900/30 border border-slate-800/80 hover:border-slate-700/80 transition shadow-sm hover:shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
            >
              <div className="space-y-2 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${getPriorityBadge(act.priority)}`}
                  >
                    {act.priority.toUpperCase()} ({act.priorityScore} pts)
                  </span>
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${getCategoryBadge(act.category)}`}
                  >
                    {act.category.replace('_', ' ')}
                  </span>
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${getStatusBadge(act.status)}`}
                  >
                    {act.status.replace('_', ' ')}
                  </span>
                  {act.currency && act.financialImpact?.potentialExposureMinor > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-950/40 text-emerald-300 border border-emerald-800">
                      {act.currency}{' '}
                      {formatCurrencyAmount(
                        act.financialImpact.potentialExposureMinor,
                        act.currency,
                      )}{' '}
                      Exposure
                    </span>
                  )}
                </div>

                <h3
                  className="text-base font-bold text-white hover:text-indigo-300 transition cursor-pointer"
                  onClick={() => setSelectedActionId(act.id)}
                >
                  {act.title}
                </h3>
                <p className="text-xs text-slate-400 line-clamp-2">{act.explanation}</p>

                {act.recommendedSteps.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800/60 w-fit">
                    <span className="font-semibold text-indigo-400">Step 1:</span>
                    <span>{act.recommendedSteps[0]!.label}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 self-end md:self-center">
                {act.status === 'open' && (
                  <button
                    type="button"
                    onClick={() => openTransitionDialog(act, 'in_progress')}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600/80 hover:bg-indigo-600 rounded-lg transition cursor-pointer"
                  >
                    Start Action
                  </button>
                )}

                {act.status === 'in_progress' && (
                  <button
                    type="button"
                    onClick={() => openTransitionDialog(act, 'completed')}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600/80 hover:bg-emerald-600 rounded-lg transition cursor-pointer"
                  >
                    Mark Done
                  </button>
                )}

                {(act.status === 'open' || act.status === 'in_progress') && (
                  <>
                    <button
                      type="button"
                      onClick={() => openTransitionDialog(act, 'snoozed')}
                      className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition cursor-pointer"
                    >
                      Snooze
                    </button>
                    <button
                      type="button"
                      onClick={() => openTransitionDialog(act, 'dismissed')}
                      className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-rose-300 bg-slate-800/60 hover:bg-rose-950/40 rounded-lg transition cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </>
                )}

                {(act.status === 'completed' || act.status === 'dismissed') && (
                  <button
                    type="button"
                    onClick={() => openTransitionDialog(act, 'open')}
                    className="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reopen</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedActionId(act.id)}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:text-white border border-slate-700/80 hover:border-slate-600 rounded-lg transition cursor-pointer"
                >
                  Details
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 6. Pagination Controls */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-400 p-2">
          <span>
            Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} total
            actions)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPage((prev) => prev + 1)}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 7. Action Detail Modal */}
      {selectedActionId && detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${getPriorityBadge(detail.priority)}`}
                  >
                    {detail.priority.toUpperCase()} ({detail.priorityScore} pts)
                  </span>
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${getCategoryBadge(detail.category)}`}
                  >
                    {detail.category}
                  </span>
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${getStatusBadge(detail.status)}`}
                  >
                    {detail.status}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white mt-2">{detail.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedActionId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto">
              {/* Financial Impact Box */}
              {detail.currency && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-[11px] text-slate-400">Potential Exposure</span>
                    <p className="text-sm font-bold text-white mt-0.5">
                      {detail.currency}{' '}
                      {formatCurrencyAmount(
                        detail.financialImpact.potentialExposureMinor,
                        detail.currency,
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400">Estimated Avoidable</span>
                    <p className="text-sm font-bold text-emerald-400 mt-0.5">
                      {detail.currency}{' '}
                      {formatCurrencyAmount(
                        detail.financialImpact.estimatedAvoidableCostMinor,
                        detail.currency,
                      )}
                    </p>
                  </div>
                  {detail.financialImpact.projectedCashFlowEffectMinor !== 0 && (
                    <div>
                      <span className="text-[11px] text-slate-400">Net Flow Effect</span>
                      <p className="text-sm font-bold text-sky-400 mt-0.5">
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
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Why This Action Was Generated
                </h4>
                <p className="text-sm text-slate-300 leading-relaxed bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/50">
                  {detail.explanation}
                </p>
              </div>

              {/* Recommended Action Steps */}
              {detail.recommendedSteps.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Recommended Next Steps
                  </h4>
                  <div className="space-y-2">
                    {detail.recommendedSteps.map((step) => (
                      <div
                        key={step.stepNumber}
                        className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/60 flex items-start gap-3"
                      >
                        <span className="w-5 h-5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-800 text-xs font-bold flex items-center justify-center shrink-0">
                          {step.stepNumber}
                        </span>
                        <div>
                          <div className="text-xs font-semibold text-white">
                            {step.label}{' '}
                            {step.isOptional && (
                              <span className="text-slate-500 font-normal">(Optional)</span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">{step.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Underlying Evidence */}
              <div>
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Underlying Source Evidence
                </h4>
                <div className="p-3 rounded-xl bg-slate-950 text-slate-400 text-xs font-mono overflow-x-auto max-h-40 border border-slate-800/80">
                  <pre>{JSON.stringify(detail.evidence, null, 2)}</pre>
                </div>
              </div>

              {/* Audit History Trail */}
              <div>
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Lifecycle History (Append-Only Audit Trail)</span>
                </h4>
                {isHistoryLoading ? (
                  <p className="text-xs text-slate-500">Loading audit trail...</p>
                ) : history.length === 0 ? (
                  <p className="text-xs text-slate-500">No events recorded yet.</p>
                ) : (
                  <div className="space-y-2 border-l-2 border-slate-800 pl-3 ml-1.5">
                    {history.map((event) => (
                      <div key={event.id} className="text-xs space-y-0.5">
                        <div className="text-slate-400">
                          <span className="font-semibold text-white">{event.eventType}</span> &rarr;{' '}
                          <span className="text-indigo-400">{event.nextStatus}</span>
                          <span className="text-slate-500 ml-2">
                            {new Date(event.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {event.reason && (
                          <p className="text-slate-400 italic">Reason: {event.reason}</p>
                        )}
                        {event.notes && <p className="text-slate-400">Notes: {event.notes}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="text-xs text-slate-500">
                Rule: {detail.ruleId} ({detail.ruleVersion})
              </div>
              <button
                type="button"
                onClick={() => setSelectedActionId(null)}
                className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Transition Action Dialog */}
      {transitionAction && targetStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">
              {targetStatus === 'dismissed' && 'Dismiss Recommendation'}
              {targetStatus === 'completed' && 'Mark Action Completed'}
              {targetStatus === 'snoozed' && 'Snooze Action'}
              {targetStatus === 'in_progress' && 'Start Working on Action'}
              {targetStatus === 'open' && 'Reopen Action'}
            </h3>

            <p className="text-xs text-slate-400">
              {targetStatus === 'dismissed' &&
                'Please provide a non-empty reason explaining why this recommendation is not applicable or has been dismissed.'}
              {targetStatus === 'completed' &&
                'Record resolution notes for your team (optional). Marking completed records your action, but does not claim verified monetary recovery.'}
              {targetStatus === 'snoozed' &&
                'Select how long to defer this action before it automatically re-evaluates and reopens.'}
              {targetStatus === 'in_progress' &&
                'Move this action to in-progress status to notify collaborators it is under active review.'}
              {targetStatus === 'open' && 'Restore this action to open review status.'}
            </p>

            {targetStatus === 'dismissed' && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Dismissal Reason <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={3}
                  value={dismissalReason}
                  onChange={(e) => setDismissalReason(e.target.value)}
                  placeholder="e.g., Authorized annual software license expansion confirmed by store manager."
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            {targetStatus === 'completed' && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Completion Notes (Optional)
                </label>
                <textarea
                  rows={3}
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  placeholder="e.g., Contacted vendor billing; credit note #992 received for next month statement."
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            {targetStatus === 'snoozed' && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Snooze Duration
                </label>
                <select
                  value={snoozeDays}
                  onChange={(e) => setSnoozeDays(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 focus:outline-none focus:border-indigo-500"
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
              <p className="text-xs text-rose-400 font-medium">{transitionError}</p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeTransitionDialog}
                disabled={transitionMutation.isPending}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitTransition}
                disabled={transitionMutation.isPending}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition disabled:opacity-50"
              >
                {transitionMutation.isPending ? 'Updating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
