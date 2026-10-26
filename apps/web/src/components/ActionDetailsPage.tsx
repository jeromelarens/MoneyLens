import React, { useState, useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layout } from './Layout';
import { financialService } from '../services/financial.service';
import type {
  BusinessAction,
  ActionStatus,
  ActionPriority,
  ActionCategory,
  ActionEvidenceQuality,
  ActionTransitionRequest,
  ActionHistory,
  ActionHistoryEventType,
  SupportedCurrency,
} from '@moneylens/shared';
import { formatCurrencyAmount } from '@moneylens/shared';
import {
  ArrowLeft,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  History as HistoryIcon,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  X,
  AlertTriangle,
  ArrowRight,
  Info,
  UserX,
  CalendarClock,
  Sparkles,
} from 'lucide-react';

export const ActionDetailsPage: React.FC = () => {
  const { actionId } = useParams<{ actionId: string }>();
  const queryClient = useQueryClient();

  // Document Title
  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'Action Details & History — MoneyLens';
    return () => {
      document.title = originalTitle;
    };
  }, []);

  // Organization Context from Storage / Environment
  const organizationName = useMemo(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('ml_organization_name') || 'Primary Retail Workspace';
    }
    return 'Primary Retail Workspace';
  }, []);

  const organizationBaseCurrency = useMemo(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return (localStorage.getItem('ml_organization_currency') as SupportedCurrency) || 'USD';
    }
    return 'USD';
  }, []);

  // Local Component State
  const [isCopiedId, setIsCopiedId] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  // Transition Dialog States
  const [dialogTargetStatus, setDialogTargetStatus] = useState<ActionStatus | null>(null);
  const [dismissalReason, setDismissalReason] = useState<string>('');
  const [completionNotes, setCompletionNotes] = useState<string>('');
  const [snoozeDays, setSnoozeDays] = useState<number>(7);
  const [customSnoozeDate, setCustomSnoozeDate] = useState<string>('');
  const [isCustomSnooze, setIsCustomSnooze] = useState<boolean>(false);

  // Modal Scroll Lock & Escape Dismiss
  useEffect(() => {
    if (dialogTargetStatus) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          closeTransitionDialog();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [dialogTargetStatus]);

  // 1. Fetch Action Details
  const {
    data: actionDetailData,
    isLoading: isActionLoading,
    isError: isActionError,
    error: actionQueryError,
    refetch: refetchAction,
    isFetching: isActionFetching,
  } = useQuery({
    queryKey: ['action-detail', actionId],
    queryFn: () => {
      if (!actionId) throw new Error('Missing action identifier');
      return financialService.getActionById(actionId);
    },
    enabled: Boolean(actionId),
  });

  const action: BusinessAction | undefined = actionDetailData?.data;

  // 2. Fetch Action Chronological Audit History
  const {
    data: actionHistoryData,
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    refetch: refetchHistory,
    isFetching: isHistoryFetching,
  } = useQuery({
    queryKey: ['action-history', actionId],
    queryFn: () => {
      if (!actionId) throw new Error('Missing action identifier');
      return financialService.getActionHistory(actionId);
    },
    enabled: Boolean(actionId),
  });

  const historyEvents: ActionHistory[] = useMemo(() => {
    const raw = actionHistoryData?.data || [];
    // Ensure chronological order
    return [...raw].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [actionHistoryData]);

  // 3. Fetch Linked Originating Finding if present
  const firstFindingId = action?.sourceFindingIds?.[0];
  const { data: findingDetailData, isLoading: isFindingLoading } = useQuery({
    queryKey: ['finding-detail', firstFindingId],
    queryFn: () => {
      if (!firstFindingId) return null;
      return financialService.getFindingDetail(firstFindingId);
    },
    enabled: Boolean(firstFindingId),
  });

  const linkedFinding = findingDetailData?.finding;
  const linkedTransactions = findingDetailData?.transactions || [];

  // 4. Lifecycle Transition Mutation
  const transitionMutation = useMutation({
    mutationFn: async (request: ActionTransitionRequest) => {
      if (!actionId) throw new Error('Missing action identifier');
      return financialService.transitionAction(actionId, request);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['action-detail', actionId] });
      queryClient.invalidateQueries({ queryKey: ['action-history', actionId] });
      queryClient.invalidateQueries({ queryKey: ['actions-list'] });
      queryClient.invalidateQueries({ queryKey: ['actions-summary'] });

      const newStatusFormatted = variables.status.replace(/_/g, ' ');
      setSuccessBanner(`Action status transitioned to "${newStatusFormatted}" successfully.`);
      setTimeout(() => setSuccessBanner(null), 6000);
      closeTransitionDialog();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setTransitionError(msg || 'Failed to update action lifecycle status');
    },
  });

  // Dialog Controls
  const openTransitionDialog = (status: ActionStatus) => {
    setDialogTargetStatus(status);
    setDismissalReason('');
    setCompletionNotes('');
    setSnoozeDays(7);
    setCustomSnoozeDate('');
    setIsCustomSnooze(false);
    setTransitionError(null);
  };

  const closeTransitionDialog = () => {
    setDialogTargetStatus(null);
    setDismissalReason('');
    setCompletionNotes('');
    setSnoozeDays(7);
    setCustomSnoozeDate('');
    setIsCustomSnooze(false);
    setTransitionError(null);
  };

  const submitTransition = () => {
    if (!dialogTargetStatus) return;

    if (dialogTargetStatus === 'dismissed' && !dismissalReason.trim()) {
      setTransitionError('A non-empty dismissal reason is required.');
      return;
    }

    const request: ActionTransitionRequest = {
      status: dialogTargetStatus,
      reason: dismissalReason.trim() || undefined,
      notes: completionNotes.trim() || undefined,
    };

    if (dialogTargetStatus === 'snoozed') {
      let deadlineIso: string;
      if (isCustomSnooze) {
        if (!customSnoozeDate) {
          setTransitionError('Please specify a future snooze date.');
          return;
        }
        const parsed = new Date(customSnoozeDate);
        if (isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
          setTransitionError('Snooze deadline must be a valid date in the future.');
          return;
        }
        deadlineIso = parsed.toISOString();
      } else {
        deadlineIso = new Date(Date.now() + snoozeDays * 86400000).toISOString();
      }
      request.snoozedUntil = deadlineIso;
    }

    transitionMutation.mutate(request);
  };

  // Copy Action ID Handler
  const handleCopyId = () => {
    if (!actionId) return;
    navigator.clipboard.writeText(actionId);
    setIsCopiedId(true);
    setTimeout(() => setIsCopiedId(false), 2000);
  };

  // Refresh All Queries
  const handleRefresh = () => {
    refetchAction();
    refetchHistory();
  };

  // Helper Badges
  const getStatusBadge = (status: ActionStatus) => {
    switch (status) {
      case 'open':
        return 'bg-sky-50 text-sky-800 border-sky-200';
      case 'in_progress':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'completed':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'snoozed':
        return 'bg-purple-50 text-purple-800 border-purple-200';
      case 'dismissed':
        return 'bg-rose-50 text-rose-800 border-rose-200';
      case 'superseded':
        return 'bg-stone-100 text-stone-600 border-stone-300';
      default:
        return 'bg-[#F8F7F2] text-[#66645C] border-[#DEDDD5]';
    }
  };

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
      case 'cost_reduction':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'cash_preservation':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'data_integrity':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'vendor_management':
        return 'bg-purple-50 text-purple-800 border-purple-200';
    }
  };

  const getEvidenceQualityBadge = (quality: ActionEvidenceQuality) => {
    switch (quality) {
      case 'high':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'adequate':
        return 'bg-sky-50 text-sky-800 border-sky-200';
      case 'preliminary':
        return 'bg-amber-50 text-amber-800 border-amber-200';
    }
  };

  const getEventTypeBadge = (eventType: ActionHistoryEventType) => {
    switch (eventType) {
      case 'created':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'status_transition':
        return 'bg-stone-100 text-stone-700 border-stone-300';
      case 'snoozed':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'reopened':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'dismissed':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'superseded':
        return 'bg-stone-200 text-stone-800 border-stone-300';
      case 're_evaluated':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      default:
        return 'bg-[#F8F7F2] text-[#66645C] border-[#DEDDD5]';
    }
  };

  const getActionTypeLabel = (type: string) => {
    switch (type) {
      case 'review_duplicate_payment':
        return 'Duplicate Payment Review';
      case 'verify_unusual_expense':
        return 'Unusual Expense Verification';
      case 'review_recurring_cost_increase':
        return 'Recurring Cost Increase Review';
      case 'mitigate_cash_flow_pressure':
        return 'Cash Flow Pressure Mitigation';
      case 'resolve_reconciliation_inconsistency':
        return 'Reconciliation Anomaly Resolution';
      case 'complete_financial_data':
        return 'Financial Statement Coverage Gap';
      case 'review_recurring_expense':
        return 'Recurring Outflow Audit';
      case 'audit_supplier_price_variance':
        return 'Supplier Price Variance Audit';
      default:
        return type.replace(/_/g, ' ');
    }
  };

  // Date Formatter
  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return isoString;
    }
  };

  // Check if snooze deadline is active or elapsed
  const getSnoozeStatus = (snoozedUntil?: string | null) => {
    if (!snoozedUntil) return null;
    const now = Date.now();
    const target = new Date(snoozedUntil).getTime();
    if (isNaN(target)) return null;

    if (target > now) {
      const remainingMs = target - now;
      const days = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
      return {
        isElapsed: false,
        text: `Active (due in ${days} ${days === 1 ? 'day' : 'days'})`,
      };
    } else {
      return {
        isElapsed: true,
        text: 'Elapsed (pending evaluation)',
      };
    }
  };

  // ==============================================================================
  // Render: Loading State
  // ==============================================================================
  if (isActionLoading) {
    return (
      <div className="min-h-screen bg-[#F8F7F2] text-[#171714] font-sans">
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#DEDDD5]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#171714] text-[#E5BB45] flex items-center justify-center font-serif text-lg font-bold">
                M
              </div>
              <span className="font-serif text-xl font-bold tracking-tight text-[#171714]">
                MoneyLens
              </span>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-[#E8E7E2] rounded w-1/4"></div>
            <div className="h-8 bg-[#E8E7E2] rounded w-3/4"></div>
            <div className="h-24 bg-white border border-[#DEDDD5] rounded-2xl p-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
              <div className="h-64 bg-white border border-[#DEDDD5] rounded-2xl"></div>
              <div className="h-64 bg-white border border-[#DEDDD5] rounded-2xl md:col-span-2"></div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ==============================================================================
  // Render: 404 Not Found or Access Error State
  // ==============================================================================
  if (isActionError || !action) {
    const is404 =
      actionQueryError instanceof Error &&
      (actionQueryError.message.includes('404') ||
        actionQueryError.message.includes('not found') ||
        actionQueryError.message.includes('ACTION_NOT_FOUND'));

    return (
      <div className="min-h-screen bg-[#F8F7F2] text-[#171714] font-sans">
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#DEDDD5]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#171714] text-[#E5BB45] flex items-center justify-center font-serif text-lg font-bold">
                  M
                </div>
                <span className="font-serif text-xl font-bold tracking-tight text-[#171714]">
                  MoneyLens
                </span>
              </Link>
            </div>
            <Link
              to="/actions"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#171714] hover:text-[#D3A82F] transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Action Center</span>
            </Link>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <div className="bg-white border border-[#DEDDD5] rounded-2xl p-8 sm:p-12 shadow-sm space-y-5">
            <div className="w-14 h-14 bg-rose-50 text-rose-700 rounded-full flex items-center justify-center mx-auto border border-rose-200">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <h1 className="font-serif text-2xl font-bold text-[#171714]">
              {is404 ? 'Business Action Not Found' : 'Unable to Load Action Details'}
            </h1>

            <p className="text-sm text-[#66645C] max-w-md mx-auto leading-relaxed">
              {is404
                ? `The requested action ID "${actionId || 'unknown'}" does not exist in the current organization workspace or may have been superseded.`
                : 'A network or authorization error occurred while retrieving this record from the MoneyLens intelligence engine.'}
            </p>

            <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/actions"
                className="inline-flex items-center gap-2 bg-[#171714] hover:bg-[#2A2A26] text-white text-xs sm:text-sm font-semibold py-2.5 px-5 rounded-full transition shadow-xs"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to Action Center</span>
              </Link>
              <button
                type="button"
                onClick={() => refetchAction()}
                className="inline-flex items-center gap-2 bg-white hover:bg-[#F8F7F2] text-[#171714] border border-[#DEDDD5] text-xs sm:text-sm font-semibold py-2.5 px-5 rounded-full transition cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry Request</span>
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const currency = action.currency || organizationBaseCurrency;
  const snoozeInfo = getSnoozeStatus(action.snoozedUntil);

  // ==============================================================================
  // Render: Main Action Details & History
  // ==============================================================================
  const headerActions = (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={isActionFetching || isHistoryFetching}
        title="Refresh action and audit trail"
        className="p-2 rounded-xl border border-[#DEDDD5] bg-white text-[#66645C] hover:text-[#171714] hover:bg-[#F8F7F2] transition active:scale-95 disabled:opacity-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E5BB45]"
        aria-label="Refresh action data"
      >
        <RefreshCw
          className={`w-4 h-4 ${isActionFetching || isHistoryFetching ? 'animate-spin text-[#E5BB45]' : ''}`}
        />
      </button>

      <Link
        to="/actions"
        className="inline-flex items-center gap-1.5 bg-[#171714] hover:bg-[#2A2A26] text-white text-xs sm:text-sm font-semibold py-2 px-3.5 sm:px-4 rounded-full shadow-2xs transition cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Action Center</span>
      </Link>
    </div>
  );

  return (
    <Layout pageTitle="Action Details" headerActions={headerActions}>
      <div className="space-y-6">
        {/* Breadcrumb Hierarchy */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[#66645C]">
          <Link to="/dashboard" className="hover:text-[#171714] transition">
            Dashboard
          </Link>
          <span className="text-[#DEDDD5]">/</span>
          <Link to="/actions" className="hover:text-[#171714] transition">
            Action Center
          </Link>
          <span className="text-[#DEDDD5]">/</span>
          <span className="font-mono font-medium text-[#171714] truncate max-w-[200px] sm:max-w-xs">
            {action.id}
          </span>
        </nav>

        {/* Real-Time User Feedback Banner */}
        {successBanner && (
          <div
            role="status"
            className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs sm:text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessBanner(null)}
              className="p-1 text-emerald-700 hover:text-emerald-900 rounded-md transition"
              aria-label="Dismiss banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ============================================================ */}
        {/* 2. Action Overview Hero Section                              */}
        {/* ============================================================ */}
        <div className="bg-white border border-[#DEDDD5] rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="space-y-3 max-w-4xl">
              {/* Badges Bar */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Status Badge */}
                <span
                  className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${getStatusBadge(action.status)} flex items-center gap-1.5`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${action.status === 'open' ? 'bg-sky-500' : action.status === 'in_progress' ? 'bg-amber-500' : action.status === 'completed' ? 'bg-emerald-500' : action.status === 'snoozed' ? 'bg-purple-500' : action.status === 'dismissed' ? 'bg-rose-500' : 'bg-stone-500'}`}
                  />
                  <span>{action.status.replace(/_/g, ' ').toUpperCase()}</span>
                </span>

                {/* Priority Badge */}
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${getPriorityBadge(action.priority)}`}
                >
                  {action.priority.toUpperCase()} Priority ({action.priorityScore}/100)
                </span>

                {/* Category Badge */}
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${getCategoryBadge(action.category)}`}
                >
                  {action.category.replace(/_/g, ' ')}
                </span>

                {/* Evidence Quality Badge */}
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${getEvidenceQualityBadge(action.evidenceQuality)}`}
                  title="Evidence quality score based on ledger corroboration"
                >
                  {action.evidenceQuality.toUpperCase()} Evidence Quality
                </span>

                {/* Action Type Badge */}
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[#F8F7F2] text-[#66645C] border border-[#DEDDD5]">
                  {getActionTypeLabel(action.actionType)}
                </span>
              </div>

              {/* Title */}
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#171714] tracking-tight leading-snug">
                {action.title}
              </h1>

              {/* Explanation */}
              <p className="text-sm sm:text-base text-[#66645C] leading-relaxed">
                {action.explanation}
              </p>

              {/* Action ID Bar */}
              <div className="flex items-center gap-2 pt-1 text-xs text-[#66645C]">
                <span>Identifier:</span>
                <code className="font-mono bg-[#F8F7F2] px-2 py-0.5 rounded border border-[#DEDDD5] text-[#171714]">
                  {action.id}
                </code>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="p-1 hover:text-[#171714] rounded transition cursor-pointer"
                  title="Copy action ID to clipboard"
                  aria-label="Copy action ID"
                >
                  {isCopiedId ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Quick Action Lifecycle Controls */}
            <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0 md:min-w-[180px]">
              {action.status === 'open' && (
                <>
                  <button
                    type="button"
                    onClick={() => openTransitionDialog('in_progress')}
                    disabled={transitionMutation.isPending}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-[#171714] hover:bg-[#2A2A26] rounded-xl transition shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Start Work</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openTransitionDialog('completed')}
                    disabled={transitionMutation.isPending}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Mark Completed</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openTransitionDialog('snoozed')}
                    disabled={transitionMutation.isPending}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-[#66645C] hover:text-[#171714] bg-[#F8F7F2] hover:bg-[#E8E7E2] border border-[#DEDDD5] rounded-xl transition cursor-pointer disabled:opacity-50"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Snooze Action</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openTransitionDialog('dismissed')}
                    disabled={transitionMutation.isPending}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition cursor-pointer disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Dismiss Action</span>
                  </button>
                </>
              )}

              {action.status === 'in_progress' && (
                <>
                  <button
                    type="button"
                    onClick={() => openTransitionDialog('completed')}
                    disabled={transitionMutation.isPending}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Mark Completed</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openTransitionDialog('open')}
                    disabled={transitionMutation.isPending}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-[#171714] bg-[#F8F7F2] hover:bg-[#E8E7E2] border border-[#DEDDD5] rounded-xl transition cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Return to Open</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openTransitionDialog('snoozed')}
                    disabled={transitionMutation.isPending}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-[#66645C] hover:text-[#171714] bg-[#F8F7F2] hover:bg-[#E8E7E2] border border-[#DEDDD5] rounded-xl transition cursor-pointer disabled:opacity-50"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Snooze Action</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openTransitionDialog('dismissed')}
                    disabled={transitionMutation.isPending}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition cursor-pointer disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Dismiss Action</span>
                  </button>
                </>
              )}

              {action.status === 'snoozed' && (
                <>
                  <button
                    type="button"
                    onClick={() => openTransitionDialog('open')}
                    disabled={transitionMutation.isPending}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-[#171714] hover:text-black bg-[#E5BB45] hover:bg-[#D3A82F] rounded-xl transition shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reopen Now</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openTransitionDialog('in_progress')}
                    disabled={transitionMutation.isPending}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#171714] hover:bg-[#2A2A26] rounded-xl transition cursor-pointer disabled:opacity-50"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Start Work</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openTransitionDialog('dismissed')}
                    disabled={transitionMutation.isPending}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition cursor-pointer disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Dismiss</span>
                  </button>
                </>
              )}

              {(action.status === 'completed' || action.status === 'dismissed') && (
                <button
                  type="button"
                  onClick={() => openTransitionDialog('open')}
                  disabled={transitionMutation.isPending}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-[#171714] hover:text-black bg-white hover:bg-[#F8F7F2] border border-[#DEDDD5] rounded-xl transition shadow-2xs cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reopen Action</span>
                </button>
              )}

              {action.status === 'superseded' && (
                <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-600 text-xs text-center space-y-1">
                  <span className="font-semibold block">Superseded</span>
                  <span className="text-[11px] block">
                    Underlying financial state changed. Read-only record.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Special Status Explanations Banner */}
          {action.status === 'snoozed' && action.snoozedUntil && (
            <div className="flex items-center gap-3 p-4 bg-purple-50 border border-purple-200 rounded-xl text-purple-900 text-xs">
              <CalendarClock className="w-4 h-4 text-purple-600 shrink-0" />
              <div>
                <span className="font-bold">Snooze Deadline Active:</span> Action is temporarily
                shelved until{' '}
                <span className="font-semibold">{formatDateTime(action.snoozedUntil)}</span>.{' '}
                {snoozeInfo && (
                  <span className="font-medium underline ml-1">Status: {snoozeInfo.text}</span>
                )}
              </div>
            </div>
          )}

          {action.status === 'completed' && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Action Completed at {formatDateTime(action.completedAt)}</span>
              </div>
              {action.completionNotes ? (
                <p className="text-emerald-800 pl-6 italic">
                  &ldquo;{action.completionNotes}&rdquo;
                </p>
              ) : (
                <p className="text-emerald-700 pl-6">No additional completion notes recorded.</p>
              )}
            </div>
          )}

          {action.status === 'dismissed' && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <X className="w-4 h-4 text-rose-600" />
                <span>Action Dismissed at {formatDateTime(action.dismissedAt)}</span>
              </div>
              <p className="text-rose-800 pl-6 font-medium">
                Reason: &ldquo;{action.dismissalReason || 'No reason provided'}&rdquo;
              </p>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* 3. Granular Financial Impact Classification (Separated)       */}
        {/* ============================================================ */}
        <section aria-labelledby="financial-impact-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 id="financial-impact-heading" className="text-base font-bold text-[#171714]">
              Granular Financial Exposure &amp; Impact
            </h2>
            <span className="text-xs text-[#66645C] font-mono">Currency: {currency}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            {/* Potential Exposure */}
            <div className="bg-white border border-[#DEDDD5] rounded-xl p-4 shadow-2xs space-y-1">
              <div className="text-[11px] font-semibold text-[#66645C] uppercase tracking-wider">
                Potential Exposure
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono text-[#171714]">
                {formatCurrencyAmount(
                  action.financialImpact?.potentialExposureMinor || 0,
                  currency,
                  true,
                  true,
                )}
              </div>
              <div className="text-[11px] text-[#66645C]">Upper bound leakage risk</div>
            </div>

            {/* Avoidable Cost */}
            <div className="bg-white border border-[#DEDDD5] rounded-xl p-4 shadow-2xs space-y-1">
              <div className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">
                Est. Avoidable Cost
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono text-amber-900">
                {formatCurrencyAmount(
                  action.financialImpact?.estimatedAvoidableCostMinor || 0,
                  currency,
                  true,
                  true,
                )}
              </div>
              <div className="text-[11px] text-[#66645C]">Addressable savings</div>
            </div>

            {/* Confirmed Issue */}
            <div className="bg-white border border-[#DEDDD5] rounded-xl p-4 shadow-2xs space-y-1">
              <div className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider">
                Confirmed Issue
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono text-rose-900">
                {formatCurrencyAmount(
                  action.financialImpact?.confirmedIssueMinor || 0,
                  currency,
                  true,
                  true,
                )}
              </div>
              <div className="text-[11px] text-[#66645C]">Verified ledger discrepancy</div>
            </div>

            {/* Projected Cash Flow Effect */}
            <div className="bg-white border border-[#DEDDD5] rounded-xl p-4 shadow-2xs space-y-1">
              <div className="text-[11px] font-semibold text-sky-800 uppercase tracking-wider">
                Cash Flow Projection
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono text-sky-900">
                {formatCurrencyAmount(
                  action.financialImpact?.projectedCashFlowEffectMinor || 0,
                  currency,
                  true,
                  true,
                )}
              </div>
              <div className="text-[11px] text-[#66645C]">Projected liquidity impact</div>
            </div>

            {/* Realized Savings */}
            <div className="bg-white border border-[#DEDDD5] rounded-xl p-4 shadow-2xs space-y-1 col-span-2 sm:col-span-1">
              <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
                Realized Savings
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono text-emerald-900">
                {formatCurrencyAmount(
                  action.financialImpact?.realizedSavingsMinor || 0,
                  currency,
                  true,
                  true,
                )}
              </div>
              <div className="text-[11px] text-[#66645C]">Audited &amp; verified cash</div>
            </div>
          </div>

          {/* Financial Governance & Verification Notice */}
          <div className="flex items-start gap-3 p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-xl text-amber-900 text-xs leading-relaxed">
            <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Financial Truth Disclaimer:</span> Marking this business
              action complete records task resolution by an operator. It does{' '}
              <span className="font-semibold underline">not</span> represent automated financial
              recovery or guaranteed clawback until verified through reconciled bank statements.
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* 4. Two-Column Layout: Details + Audit Trail & Metadata       */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column (2 cols): Recommended Steps, Source Evidence, & Timeline */}
          <div className="lg:col-span-2 space-y-6">
            {/* Section A: Recommended Next Steps Checklist */}
            <section
              aria-labelledby="recommended-steps-heading"
              className="bg-white border border-[#DEDDD5] rounded-2xl p-6 shadow-xs space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#E5BB45]" />
                  <h2
                    id="recommended-steps-heading"
                    className="font-serif text-lg font-bold text-[#171714]"
                  >
                    Recommended Operational Steps
                  </h2>
                </div>
                <span className="text-xs font-semibold text-[#66645C] bg-[#F8F7F2] px-2.5 py-1 rounded-full border border-[#DEDDD5]">
                  {action.recommendedSteps?.length || 0} Steps
                </span>
              </div>

              {action.recommendedSteps && action.recommendedSteps.length > 0 ? (
                <div className="space-y-3">
                  {action.recommendedSteps.map((step) => (
                    <div
                      key={step.stepNumber}
                      className="flex items-start gap-3.5 p-4 rounded-xl border border-[#DEDDD5] bg-[#F8F7F2]/50 hover:bg-[#F8F7F2] transition"
                    >
                      <div className="w-6 h-6 rounded-full bg-[#171714] text-[#E5BB45] font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {step.stepNumber}
                      </div>
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-[#171714]">{step.label}</h3>
                          {step.isOptional && (
                            <span className="text-[10px] font-semibold text-[#66645C] bg-white border border-[#DEDDD5] px-2 py-0.5 rounded-full">
                              Optional
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#66645C] leading-relaxed">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#66645C] italic">
                  No explicit sequential steps provided for this action type.
                </p>
              )}
            </section>

            {/* Section B: Originating Source Records & Context */}
            <section
              aria-labelledby="source-evidence-heading"
              className="bg-white border border-[#DEDDD5] rounded-2xl p-6 shadow-xs space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#E5BB45]" />
                  <h2
                    id="source-evidence-heading"
                    className="font-serif text-lg font-bold text-[#171714]"
                  >
                    Originating Source Evidence
                  </h2>
                </div>
                <span className="text-xs text-[#66645C] font-mono">
                  Rule: {action.ruleId} ({action.ruleVersion})
                </span>
              </div>

              {/* Linked Financial Finding Card */}
              {action.sourceFindingIds && action.sourceFindingIds.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-[#171714]">
                    Originating Financial Finding:
                  </div>

                  {linkedFinding ? (
                    <div className="p-4 bg-white border border-[#DEDDD5] rounded-xl shadow-2xs space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-stone-100 text-stone-800 border border-stone-200">
                              {linkedFinding.findingType.replace(/_/g, ' ')}
                            </span>
                            <span className="text-[11px] font-semibold text-[#66645C]">
                              Detected: {formatDateTime(linkedFinding.detectedAt)}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-[#171714]">
                            {linkedFinding.title}
                          </h4>
                        </div>

                        <Link
                          to={`/findings/${linkedFinding.id}`}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#171714] hover:text-[#D3A82F] bg-[#F8F7F2] hover:bg-[#E8E7E2] px-3 py-1.5 rounded-lg border border-[#DEDDD5] transition shrink-0"
                        >
                          <span>Inspect Finding</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </div>

                      {/* Participating Transactions Preview */}
                      {linkedTransactions && linkedTransactions.length > 0 && (
                        <div className="pt-2 border-t border-[#DEDDD5] space-y-2">
                          <div className="flex items-center justify-between text-xs text-[#66645C]">
                            <span className="font-semibold text-[#171714]">
                              Participating Ledger Transactions ({linkedTransactions.length}):
                            </span>
                            <Link
                              to="/transactions"
                              className="text-xs text-[#171714] hover:underline inline-flex items-center gap-1"
                            >
                              <span>View in Ledger</span>
                              <ArrowRight className="w-3 h-3" />
                            </Link>
                          </div>

                          <div className="space-y-1.5">
                            {linkedTransactions.slice(0, 3).map((tx) => (
                              <div
                                key={tx.id}
                                className="flex items-center justify-between p-2.5 rounded-lg bg-[#F8F7F2] border border-[#DEDDD5] text-xs"
                              >
                                <div className="space-y-0.5 truncate max-w-[65%]">
                                  <div className="font-medium text-[#171714] truncate">
                                    {tx.description}
                                  </div>
                                  <div className="text-[11px] text-[#66645C]">
                                    {formatDateTime(tx.date)} · Ref: {tx.sourceReference || 'None'}
                                  </div>
                                </div>
                                <div className="text-right font-mono font-bold text-[#171714]">
                                  {tx.direction === 'debit' ? '-' : '+'}
                                  {formatCurrencyAmount(tx.amountMinor, tx.currency)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : isFindingLoading ? (
                    <div className="p-4 bg-[#F8F7F2] rounded-xl text-xs text-[#66645C] animate-pulse">
                      Loading originating finding details...
                    </div>
                  ) : (
                    <div className="p-4 bg-[#F8F7F2] rounded-xl border border-[#DEDDD5] flex items-center justify-between">
                      <div className="text-xs text-[#66645C]">
                        Finding Reference:{' '}
                        <span className="font-mono text-[#171714]">{firstFindingId}</span>
                      </div>
                      <Link
                        to={`/findings/${firstFindingId}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#171714] hover:text-[#D3A82F]"
                      >
                        <span>Open Finding Record</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Linked Cash Flow Forecast */}
              {action.sourceForecastRunId && (
                <div className="p-4 bg-[#F8F7F2] rounded-xl border border-[#DEDDD5] flex items-center justify-between">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-[#171714]">
                      Linked Cash Flow Forecast
                    </div>
                    <div className="text-[11px] text-[#66645C] font-mono">
                      Run ID: {action.sourceForecastRunId}
                    </div>
                  </div>
                  <Link
                    to="/cash-flow"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#171714] hover:text-[#D3A82F] bg-white px-3 py-1.5 rounded-lg border border-[#DEDDD5] transition"
                  >
                    <span>View Projections</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}

              {/* Structured Evidence Key-Value Pairs */}
              {action.evidence && Object.keys(action.evidence).length > 0 && (
                <div className="space-y-2 pt-2">
                  <div className="text-xs font-semibold text-[#171714]">
                    Corroborating Evidence Parameters:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {Object.entries(action.evidence).map(([key, val]) => {
                      if (val === null || val === undefined) return null;
                      if (typeof val === 'object') return null; // Avoid raw nested object clutter
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-[#F8F7F2] border border-[#DEDDD5]"
                        >
                          <span className="font-medium text-[#66645C] capitalize">
                            {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                          </span>
                          <span className="font-mono font-semibold text-[#171714] truncate max-w-[150px]">
                            {String(val)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* Section C: Chronological Activity History & Append-Only Audit Trail */}
            <section
              aria-labelledby="audit-history-heading"
              className="bg-white border border-[#DEDDD5] rounded-2xl p-6 shadow-xs space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HistoryIcon className="w-4 h-4 text-[#E5BB45]" />
                  <h2
                    id="audit-history-heading"
                    className="font-serif text-lg font-bold text-[#171714]"
                  >
                    Recorded Activity &amp; Audit Trail
                  </h2>
                </div>
                <span className="text-xs font-semibold text-[#66645C] bg-[#F8F7F2] px-2.5 py-1 rounded-full border border-[#DEDDD5]">
                  {historyEvents.length} Recorded Events
                </span>
              </div>

              {isHistoryLoading ? (
                <div className="p-8 text-center text-xs text-[#66645C] animate-pulse">
                  Loading activity timeline...
                </div>
              ) : isHistoryError ? (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center justify-between">
                  <span>Unable to retrieve audit history from server.</span>
                  <button
                    type="button"
                    onClick={() => refetchHistory()}
                    className="underline font-semibold"
                  >
                    Retry
                  </button>
                </div>
              ) : historyEvents.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#66645C] bg-[#F8F7F2] rounded-xl border border-dashed border-[#DEDDD5]">
                  No historical lifecycle changes recorded yet for this action.
                </div>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-[#DEDDD5]">
                  {historyEvents.map((evt) => (
                    <div key={evt.id} className="relative flex flex-col gap-1 text-xs">
                      {/* Timeline Dot */}
                      <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-[#171714] border-2 border-white ring-2 ring-[#DEDDD5]" />

                      {/* Header line */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${getEventTypeBadge(evt.eventType)}`}
                        >
                          {evt.eventType.replace(/_/g, ' ')}
                        </span>

                        <span className="font-semibold text-[#171714]">
                          {formatDateTime(evt.createdAt)}
                        </span>

                        <span className="text-[#66645C]">·</span>

                        <span className="text-[#66645C]">
                          Actor: <code className="font-mono text-[#171714]">{evt.actorId}</code>
                        </span>
                      </div>

                      {/* Transition status change pills */}
                      {evt.nextStatus && (
                        <div className="flex items-center gap-1.5 pt-0.5 text-[11px]">
                          <span className="text-[#66645C]">Status:</span>
                          {evt.previousStatus ? (
                            <>
                              <span className="font-medium text-[#66645C] line-through">
                                {evt.previousStatus.replace(/_/g, ' ')}
                              </span>
                              <ArrowRight className="w-3 h-3 text-[#DEDDD5]" />
                            </>
                          ) : null}
                          <span className="font-bold text-[#171714]">
                            {evt.nextStatus.replace(/_/g, ' ')}
                          </span>
                        </div>
                      )}

                      {/* Reason & Notes */}
                      {evt.reason && (
                        <div className="p-2.5 bg-[#F8F7F2] border border-[#DEDDD5] rounded-lg text-[#171714] mt-1">
                          <span className="font-semibold text-[#66645C] block text-[10px] uppercase">
                            Reason / Context:
                          </span>
                          <span className="leading-relaxed">{evt.reason}</span>
                        </div>
                      )}

                      {evt.notes && (
                        <div className="p-2.5 bg-emerald-50/50 border border-emerald-200 rounded-lg text-emerald-950 mt-1">
                          <span className="font-semibold text-emerald-800 block text-[10px] uppercase">
                            Recorded Notes:
                          </span>
                          <span className="leading-relaxed">{evt.notes}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Column (1 col): Accountability, Ownership & Audit Metadata */}
          <div className="space-y-6">
            {/* Box 1: Ownership & Assignment Governance */}
            <div className="bg-white border border-[#DEDDD5] rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-[#171714] uppercase tracking-wider">
                Accountability &amp; Ownership
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[#66645C] block">Owning Organization:</span>
                  <div className="flex items-center gap-2 font-semibold text-[#171714] pt-0.5">
                    <Building2 className="w-3.5 h-3.5 text-[#E5BB45]" />
                    <span>{organizationName}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#DEDDD5]">
                  <span className="text-[#66645C] block">Assigned Individual Owner:</span>
                  <div className="flex items-center gap-2 text-[#66645C] pt-0.5">
                    <UserX className="w-3.5 h-3.5 text-stone-400" />
                    <span className="italic">
                      Organization-wide responsibility (individual user assignments not modeled in
                      current schema).
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#DEDDD5]">
                  <span className="text-[#66645C] block">Action Category:</span>
                  <span className="font-semibold text-[#171714] block pt-0.5 capitalize">
                    {action.category.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="pt-2 border-t border-[#DEDDD5]">
                  <span className="text-[#66645C] block">Severity Rating:</span>
                  <span className="font-semibold text-[#171714] block pt-0.5 uppercase">
                    {action.severity}
                  </span>
                </div>
              </div>
            </div>

            {/* Box 2: Deadlines & Lifecycle Timestamps */}
            <div className="bg-white border border-[#DEDDD5] rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-[#171714] uppercase tracking-wider">
                Lifecycle &amp; Deadlines
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[#66645C] block">Created At:</span>
                  <div className="flex items-center gap-1.5 font-medium text-[#171714] pt-0.5">
                    <Calendar className="w-3.5 h-3.5 text-[#66645C]" />
                    <span>{formatDateTime(action.createdAt)}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#DEDDD5]">
                  <span className="text-[#66645C] block">Last Evaluated:</span>
                  <div className="flex items-center gap-1.5 font-medium text-[#171714] pt-0.5">
                    <Clock className="w-3.5 h-3.5 text-[#66645C]" />
                    <span>{formatDateTime(action.lastEvaluatedAt)}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#DEDDD5]">
                  <span className="text-[#66645C] block">Snooze Review Deadline:</span>
                  {action.snoozedUntil ? (
                    <div className="pt-0.5 space-y-1">
                      <div className="font-bold text-purple-900 font-mono">
                        {formatDateTime(action.snoozedUntil)}
                      </div>
                      {snoozeInfo && (
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                            snoozeInfo.isElapsed
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {snoozeInfo.text}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[#66645C] italic block pt-0.5">
                      No snooze deadline applied
                    </span>
                  )}
                </div>

                {action.completedAt && (
                  <div className="pt-2 border-t border-[#DEDDD5]">
                    <span className="text-emerald-800 font-semibold block">Completed At:</span>
                    <span className="font-medium text-emerald-950 block pt-0.5">
                      {formatDateTime(action.completedAt)}
                    </span>
                  </div>
                )}

                {action.dismissedAt && (
                  <div className="pt-2 border-t border-[#DEDDD5]">
                    <span className="text-rose-800 font-semibold block">Dismissed At:</span>
                    <span className="font-medium text-rose-950 block pt-0.5">
                      {formatDateTime(action.dismissedAt)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Box 3: Verification & Auditing Fingerprint */}
            <div className="bg-white border border-[#DEDDD5] rounded-2xl p-6 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-[#171714] uppercase tracking-wider">
                Integrity &amp; Auditing
              </h3>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[#66645C] block">Deterministic Fingerprint:</span>
                  <code className="font-mono text-[10px] bg-[#F8F7F2] p-1.5 rounded border border-[#DEDDD5] text-[#171714] break-all block mt-1">
                    {action.fingerprint}
                  </code>
                </div>

                <div className="pt-2 border-t border-[#DEDDD5]">
                  <span className="text-[#66645C] block">Rule Contract:</span>
                  <span className="font-mono font-medium text-[#171714] block pt-0.5">
                    {action.ruleId} ({action.ruleVersion})
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 5. Interactive Transition Dialogs                            */}
      {/* ============================================================ */}
      {dialogTargetStatus && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="transition-details-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
        >
          <div className="bg-white border border-[#DEDDD5] rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-xl space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#DEDDD5]">
              <h3
                id="transition-details-dialog-title"
                className="font-serif text-lg font-bold text-[#171714]"
              >
                {dialogTargetStatus === 'in_progress' && 'Start Working on Action'}
                {dialogTargetStatus === 'completed' && 'Mark Action Completed'}
                {dialogTargetStatus === 'snoozed' && 'Snooze Action'}
                {dialogTargetStatus === 'dismissed' && 'Dismiss Action'}
                {dialogTargetStatus === 'open' && 'Reopen Action'}
              </h3>
              <button
                type="button"
                onClick={closeTransitionDialog}
                className="w-10 h-10 flex items-center justify-center rounded-xl text-[#66645C] hover:text-[#171714] hover:bg-[#F8F7F2] transition"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Message inside Dialog */}
            {transitionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-medium">
                {transitionError}
              </div>
            )}

            {/* Dialog Content by Status */}
            {dialogTargetStatus === 'dismissed' && (
              <div className="space-y-3">
                <p className="text-xs text-[#66645C]">
                  Dismissing this action removes it from active attention. A mandatory reason is
                  required to maintain compliance traceability.
                </p>
                <div>
                  <label
                    htmlFor="dismissalReason"
                    className="block text-xs font-bold text-[#171714] mb-1"
                  >
                    Dismissal Reason <span className="text-rose-600">*</span>
                  </label>
                  <textarea
                    id="dismissalReason"
                    value={dismissalReason}
                    onChange={(e) => setDismissalReason(e.target.value)}
                    rows={3}
                    placeholder="e.g. Legitimate dual charge authorized by management..."
                    className="w-full text-xs p-3 rounded-xl border border-[#DEDDD5] focus:outline-none focus:ring-2 focus:ring-[#E5BB45]"
                  />
                </div>
              </div>
            )}

            {dialogTargetStatus === 'completed' && (
              <div className="space-y-3">
                <p className="text-xs text-[#66645C]">
                  Confirm that the recommended operational steps for this action have been executed.
                  You may record optional completion notes for the audit trail.
                </p>
                <div>
                  <label
                    htmlFor="completionNotes"
                    className="block text-xs font-bold text-[#171714] mb-1"
                  >
                    Completion Notes (Optional)
                  </label>
                  <textarea
                    id="completionNotes"
                    value={completionNotes}
                    onChange={(e) => setCompletionNotes(e.target.value)}
                    rows={3}
                    placeholder="e.g. Supplier agreed to refund $150.00 credit note on next statement..."
                    className="w-full text-xs p-3 rounded-xl border border-[#DEDDD5] focus:outline-none focus:ring-2 focus:ring-[#E5BB45]"
                  />
                </div>
              </div>
            )}

            {dialogTargetStatus === 'snoozed' && (
              <div className="space-y-4">
                <p className="text-xs text-[#66645C]">
                  Snoozing suppresses this action until the chosen date. Once the snooze period
                  elapses, the recommendation engine will re-evaluate and reopen it if the condition
                  persists.
                </p>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-[#171714]">
                    Select Snooze Duration
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[3, 7, 14, 30].map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => {
                          setSnoozeDays(days);
                          setIsCustomSnooze(false);
                        }}
                        className={`p-2.5 text-xs font-semibold rounded-xl border transition ${
                          !isCustomSnooze && snoozeDays === days
                            ? 'bg-[#171714] text-white border-[#171714]'
                            : 'bg-[#F8F7F2] text-[#171714] border-[#DEDDD5] hover:bg-[#E8E7E2]'
                        }`}
                      >
                        {days} Days
                      </button>
                    ))}
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setIsCustomSnooze(!isCustomSnooze)}
                      className="text-xs font-semibold text-[#171714] hover:underline"
                    >
                      {isCustomSnooze
                        ? '← Use preset duration'
                        : 'Or choose specific calendar date →'}
                    </button>
                  </div>

                  {isCustomSnooze && (
                    <div className="pt-1">
                      <label
                        htmlFor="customSnoozeDate"
                        className="block text-xs font-bold text-[#171714] mb-1"
                      >
                        Specific Future Date
                      </label>
                      <input
                        id="customSnoozeDate"
                        type="date"
                        min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                        value={customSnoozeDate}
                        onChange={(e) => setCustomSnoozeDate(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-xl border border-[#DEDDD5] focus:outline-none focus:ring-2 focus:ring-[#E5BB45]"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {dialogTargetStatus === 'in_progress' && (
              <p className="text-xs text-[#66645C] leading-relaxed">
                Move this action to <strong>In Progress</strong> to indicate active investigation by
                your team.
              </p>
            )}

            {dialogTargetStatus === 'open' && (
              <p className="text-xs text-[#66645C] leading-relaxed">
                Reopening will restore this action to <strong>Open</strong> status and record a
                reopening audit entry.
              </p>
            )}

            {/* Dialog Footer Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#DEDDD5]">
              <button
                type="button"
                onClick={closeTransitionDialog}
                className="px-4 py-2 text-xs font-semibold text-[#66645C] hover:text-[#171714] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitTransition}
                disabled={transitionMutation.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#171714] hover:bg-[#2A2A26] rounded-xl transition cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {transitionMutation.isPending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Transition</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};
