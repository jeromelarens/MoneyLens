import React, { useState, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layout } from './Layout';
import { financialService } from '../services/financial.service';
import type {
  ReconciliationRun,
  ReconciliationMatch,
  ReconciliationAuditEvent,
  FinancialAccount,
  ReconciliationMatchStatus,
  ReconciliationMatchMethod,
  ReconciliationAuditAction,
} from '@moneylens/shared';
import { formatCurrencyAmount } from '@moneylens/shared';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Check,
  X,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Layers,
  GitCompare,
  Copy,
  SlidersHorizontal,
  Code2,
  History,
  XCircle,
  Activity,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

export const ReconciliationRunDetailsPage: React.FC = () => {
  const { runId } = useParams<{ runId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // Active Tab state: 'timeline' | 'matches' | 'parameters'
  const activeTab =
    (searchParams.get('tab') as 'timeline' | 'matches' | 'parameters') || 'timeline';
  const setActiveTab = (tab: 'timeline' | 'matches' | 'parameters') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  };

  // State for Audit Trail Timeline
  const [eventCategoryFilter, setEventCategoryFilter] = useState<
    'all' | 'lifecycle' | 'decisions' | 'generation'
  >('all');
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  const [inspectingEvent, setInspectingEvent] = useState<ReconciliationAuditEvent | null>(null);

  // State for Matches Review Ledger
  const [matchesStatusFilter, setMatchesStatusFilter] = useState<ReconciliationMatchStatus | 'all'>(
    'all',
  );
  const [matchesMethodFilter, setMatchesMethodFilter] = useState<ReconciliationMatchMethod | 'all'>(
    'all',
  );
  const [matchesSearchQuery, setMatchesSearchQuery] = useState('');
  const [matchesPage, setMatchesPage] = useState(1);
  const [inspectingMatch, setInspectingMatch] = useState<ReconciliationMatch | null>(null);

  // Resolution Modals state
  const [confirmingMatch, setConfirmingMatch] = useState<ReconciliationMatch | null>(null);
  const [confirmNotes, setConfirmNotes] = useState('');
  const [rejectingMatch, setRejectingMatch] = useState<ReconciliationMatch | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionError, setRejectionError] = useState<string | null>(null);

  // Action Feedback state
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCopiedRunId, setIsCopiedRunId] = useState(false);

  // Close modals on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inspectingEvent) setInspectingEvent(null);
        if (inspectingMatch) setInspectingMatch(null);
        if (confirmingMatch) setConfirmingMatch(null);
        if (rejectingMatch) setRejectingMatch(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectingEvent, inspectingMatch, confirmingMatch, rejectingMatch]);

  // Lock body scroll when modal is active
  React.useEffect(() => {
    const hasOpenModal = Boolean(
      inspectingEvent || inspectingMatch || confirmingMatch || rejectingMatch,
    );
    if (hasOpenModal) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [inspectingEvent, inspectingMatch, confirmingMatch, rejectingMatch]);

  // 1. Query: Single Reconciliation Run
  const {
    data: run,
    isLoading: isRunLoading,
    isError: isRunError,
    error: runError,
    refetch: refetchRun,
    isFetching: isRunFetching,
  } = useQuery<ReconciliationRun>({
    queryKey: ['reconciliation-run', runId],
    queryFn: () => financialService.getReconciliationRun(runId!),
    enabled: Boolean(runId),
    retry: 1,
  });

  // 2. Query: Audit Trail Events
  const {
    data: auditTrailData,
    isLoading: isAuditTrailLoading,
    isError: isAuditTrailError,
    refetch: refetchAuditTrail,
    isFetching: isAuditTrailFetching,
  } = useQuery({
    queryKey: ['reconciliation-audit-trail', runId],
    queryFn: () => financialService.getReconciliationAuditTrail(runId!),
    enabled: Boolean(runId),
  });

  // 3. Query: Matches for this run
  const {
    data: matchesData,
    isLoading: isMatchesLoading,
    refetch: refetchMatches,
    isFetching: isMatchesFetching,
  } = useQuery({
    queryKey: ['reconciliation-matches', runId, matchesPage, matchesStatusFilter],
    queryFn: () =>
      financialService.getReconciliationMatches({
        runId,
        page: matchesPage,
        pageSize: 15,
        status: matchesStatusFilter === 'all' ? undefined : matchesStatusFilter,
      }),
    enabled: Boolean(runId),
  });

  // 4. Query: Accounts
  const { data: accountsData } = useQuery<{ items: FinancialAccount[] }>({
    queryKey: ['financial-accounts'],
    queryFn: () => financialService.getAccounts(),
  });

  // 5. Query: Recent Runs (for fallback run selector if needed)
  const { data: recentRunsData } = useQuery({
    queryKey: ['reconciliation-runs-list'],
    queryFn: () => financialService.getReconciliationRuns(1, 20),
  });

  // Accounts lookup map
  const accountsMap = useMemo(() => {
    const map = new Map<string, FinancialAccount>();
    if (accountsData?.items) {
      accountsData.items.forEach((acc) => map.set(acc.id, acc));
    }
    return map;
  }, [accountsData]);

  // Mutations
  const confirmMatchMutation = useMutation({
    mutationFn: ({ matchId, notes }: { matchId: string; notes?: string }) =>
      financialService.confirmMatch(matchId, notes),
    onSuccess: (updatedMatch) => {
      setConfirmingMatch(null);
      setConfirmNotes('');
      if (inspectingMatch && inspectingMatch.id === updatedMatch.id) {
        setInspectingMatch(updatedMatch);
      }
      setActionSuccess('Match confirmed successfully. Underlying records updated.');
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['reconciliation-matches', runId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-run', runId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-audit-trail', runId] });
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to confirm match candidate');
      queryClient.invalidateQueries({ queryKey: ['reconciliation-matches', runId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-run', runId] });
    },
  });

  const rejectMatchMutation = useMutation({
    mutationFn: ({ matchId, reason }: { matchId: string; reason: string }) =>
      financialService.rejectMatch(matchId, reason),
    onSuccess: (updatedMatch) => {
      setRejectingMatch(null);
      setRejectionReason('');
      if (inspectingMatch && inspectingMatch.id === updatedMatch.id) {
        setInspectingMatch(updatedMatch);
      }
      setActionSuccess('Match rejected with auditable reason.');
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['reconciliation-matches', runId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-run', runId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-audit-trail', runId] });
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to reject match candidate');
      queryClient.invalidateQueries({ queryKey: ['reconciliation-matches', runId] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-run', runId] });
    },
  });

  // Filtered Audit Events
  const filteredEvents = useMemo(() => {
    if (!auditTrailData?.items) return [];

    return auditTrailData.items.filter((event) => {
      // Category filter
      if (eventCategoryFilter === 'lifecycle') {
        if (!['run_started', 'run_completed', 'run_failed'].includes(event.action)) return false;
      } else if (eventCategoryFilter === 'decisions') {
        if (!['match_confirmed', 'match_rejected', 'match_reversed'].includes(event.action))
          return false;
      } else if (eventCategoryFilter === 'generation') {
        if (event.action !== 'matches_generated') return false;
      }

      // Text search query
      if (eventSearchQuery.trim()) {
        const q = eventSearchQuery.toLowerCase();
        const actionMatch = event.action.toLowerCase().includes(q);
        const idMatch = event.id.toLowerCase().includes(q);
        const matchIdMatch = event.matchId ? event.matchId.toLowerCase().includes(q) : false;
        const detailsStr = JSON.stringify(event.details).toLowerCase();
        const detailsMatch = detailsStr.includes(q);
        return actionMatch || idMatch || matchIdMatch || detailsMatch;
      }

      return true;
    });
  }, [auditTrailData?.items, eventCategoryFilter, eventSearchQuery]);

  // Filtered Matches
  const filteredMatches = useMemo(() => {
    if (!matchesData?.items) return [];

    return matchesData.items.filter((m) => {
      // Match Method filter
      if (matchesMethodFilter !== 'all' && m.matchMethod !== matchesMethodFilter) {
        return false;
      }

      // Search query filter
      if (matchesSearchQuery.trim()) {
        const q = matchesSearchQuery.toLowerCase();
        const descMatch = m.sourceTransaction?.description.toLowerCase().includes(q);
        const candDescMatch = m.candidateTransaction?.description.toLowerCase().includes(q);
        const refMatch = m.sourceTransaction?.sourceReference?.toLowerCase().includes(q);
        const candRefMatch = m.candidateTransaction?.sourceReference?.toLowerCase().includes(q);
        const reasonMatch = m.reviewReason?.toLowerCase().includes(q);
        return descMatch || candDescMatch || refMatch || candRefMatch || reasonMatch;
      }

      return true;
    });
  }, [matchesData?.items, matchesMethodFilter, matchesSearchQuery]);

  // Helpers
  const handleCopyRunId = () => {
    if (run?.id) {
      navigator.clipboard.writeText(run.id);
      setIsCopiedRunId(true);
      setTimeout(() => setIsCopiedRunId(false), 2000);
    }
  };

  const handleRefreshAll = () => {
    refetchRun();
    refetchAuditTrail();
    refetchMatches();
  };

  const handleConfirmSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmingMatch) return;
    confirmMatchMutation.mutate({
      matchId: confirmingMatch.id,
      notes: confirmNotes.trim() || undefined,
    });
  };

  const handleRejectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingMatch) return;
    if (!rejectionReason.trim()) {
      setRejectionError(
        'An explicit auditable reason is required to reject a reconciliation candidate.',
      );
      return;
    }
    setRejectionError(null);
    rejectMatchMutation.mutate({
      matchId: rejectingMatch.id,
      reason: rejectionReason.trim(),
    });
  };

  const formatExecutionDuration = (startStr?: string | null, endStr?: string | null) => {
    if (!startStr || !endStr) return null;
    const start = new Date(startStr).getTime();
    const end = new Date(endStr).getTime();
    const deltaMs = Math.max(0, end - start);
    if (deltaMs < 1000) return `${deltaMs}ms`;
    if (deltaMs < 60000) return `${(deltaMs / 1000).toFixed(2)}s`;
    return `${(deltaMs / 60000).toFixed(1)}m`;
  };

  const renderRunStatusBadge = (status: ReconciliationRun['status']) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Completed
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <RefreshCw className="w-3.5 h-3.5 text-amber-600 animate-spin" />
            Processing
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            Execution Failed
          </span>
        );
      case 'completed_with_errors':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Completed with Discrepancies
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-300">
            <Clock className="w-3.5 h-3.5 text-slate-600" />
            Pending
          </span>
        );
    }
  };

  const renderAuditEventIcon = (action: ReconciliationAuditAction) => {
    switch (action) {
      case 'run_started':
        return <Play className="w-4 h-4 text-amber-600" />;
      case 'matches_generated':
        return <GitCompare className="w-4 h-4 text-blue-600" />;
      case 'match_confirmed':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
      case 'match_rejected':
        return <XCircle className="w-4 h-4 text-rose-600" />;
      case 'match_reversed':
        return <RotateCcw className="w-4 h-4 text-amber-600" />;
      case 'run_completed':
        return <ShieldCheck className="w-4 h-4 text-emerald-600" />;
      case 'run_failed':
        return <AlertTriangle className="w-4 h-4 text-rose-600" />;
      default:
        return <Activity className="w-4 h-4 text-slate-600" />;
    }
  };

  const renderMatchStatusBadge = (status: ReconciliationMatchStatus) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Confirmed
          </span>
        );
      case 'suggested':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
            <Sparkles className="w-3 h-3 text-blue-600" />
            Suggested
          </span>
        );
      case 'needs_review':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            Needs Review
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <X className="w-3 h-3 text-slate-500" />
            Rejected
          </span>
        );
      default:
        return null;
    }
  };

  const headerActions = (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={handleRefreshAll}
        disabled={isRunFetching || isAuditTrailFetching || isMatchesFetching}
        title="Refresh run status and audit trail"
        className="p-2 rounded-xl text-[#66645C] hover:text-[#171714] hover:bg-[#F8F7F2] border border-[#E8E7E2] transition cursor-pointer"
      >
        <RefreshCw
          className={`w-4 h-4 ${
            isRunFetching || isAuditTrailFetching || isMatchesFetching
              ? 'animate-spin text-[#E5BB45]'
              : ''
          }`}
        />
      </button>
      <Link
        to={runId ? `/reconciliation?runId=${runId}` : '/reconciliation'}
        className="inline-flex items-center gap-1.5 bg-[#171714] hover:bg-[#0D0D0B] text-white text-xs sm:text-sm font-semibold py-2 px-3.5 sm:px-4 rounded-full shadow-2xs transition-all duration-150 cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Workspace</span>
      </Link>
    </div>
  );

  return (
    <Layout pageTitle="Reconciliation Run Details" headerActions={headerActions}>
      <div className="space-y-8">
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-[#66645C]">
          <Link to="/reconciliation" className="hover:text-[#171714] hover:underline">
            Reconciliation Workspace
          </Link>
          <span>/</span>
          <span className="font-mono text-[#171714]">
            {runId ? `Run ${runId.substring(0, 8)}...` : 'Runs'}
          </span>
          <span>/</span>
          <span className="font-semibold text-[#171714]">Run Details & Audit History</span>
        </nav>

        {/* Action Alerts */}
        {actionSuccess && (
          <div
            role="status"
            className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm flex items-center justify-between gap-3 animate-in fade-in duration-150"
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionSuccess(null)}
              className="text-emerald-700 hover:text-emerald-900 p-1"
              aria-label="Dismiss success message"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {actionError && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs sm:text-sm flex items-center justify-between gap-3 animate-in fade-in duration-150"
          >
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{actionError}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-rose-700 hover:text-rose-900 p-1"
              aria-label="Dismiss error message"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Missing or Invalid Run ID State */}
        {!runId && (
          <div className="bg-white rounded-2xl border border-[#E8E7E2] p-8 text-center space-y-4">
            <History className="w-10 h-10 text-[#66645C] mx-auto opacity-40" />
            <h2 className="text-xl font-serif text-[#171714]">No Reconciliation Run Selected</h2>
            <p className="text-xs sm:text-sm text-[#66645C] max-w-md mx-auto">
              Select an executed reconciliation run from your organization to inspect its traceable
              audit history and recorded match outcomes.
            </p>
            {recentRunsData?.items && recentRunsData.items.length > 0 && (
              <div className="max-w-md mx-auto pt-2">
                <label
                  htmlFor="select-run"
                  className="block text-xs font-semibold text-[#66645C] mb-1.5 text-left"
                >
                  Available Reconciliation Runs:
                </label>
                <div className="flex items-center gap-2">
                  <select
                    id="select-run"
                    onChange={(e) => {
                      if (e.target.value) {
                        window.location.href = `/reconciliation/runs/${e.target.value}`;
                      }
                    }}
                    className="w-full text-xs font-mono py-2 px-3 rounded-xl border border-[#E8E7E2] bg-[#F8F7F2]"
                  >
                    <option value="">Choose a run to inspect...</option>
                    {recentRunsData.items.map((r) => (
                      <option key={r.id} value={r.id}>
                        Run {r.id.substring(0, 8)}... ({r.status}) &bull;{' '}
                        {new Date(r.createdAt).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <div className="pt-4">
              <Link
                to="/reconciliation"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#171714] text-white text-xs font-semibold"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Reconciliation Workspace</span>
              </Link>
            </div>
          </div>
        )}

        {/* Loading State */}
        {runId && isRunLoading && (
          <div className="space-y-6 animate-pulse">
            <div className="h-10 w-96 bg-[#E8E7E2] rounded-xl" />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="h-28 bg-white rounded-2xl border border-[#E8E7E2]" />
              <div className="h-28 bg-white rounded-2xl border border-[#E8E7E2]" />
              <div className="h-28 bg-white rounded-2xl border border-[#E8E7E2]" />
              <div className="h-28 bg-white rounded-2xl border border-[#E8E7E2]" />
            </div>
            <div className="h-96 bg-white rounded-2xl border border-[#E8E7E2]" />
          </div>
        )}

        {/* Error / Not Found State */}
        {runId && isRunError && (
          <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center space-y-4">
            <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
            <h2 className="text-xl font-serif text-[#171714]">Reconciliation Run Not Found</h2>
            <p className="text-xs sm:text-sm text-[#66645C] max-w-md mx-auto">
              {(runError as Error)?.message ||
                'The specified reconciliation run could not be retrieved. It may have expired or belongs to another organization boundary.'}
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => refetchRun()}
                className="px-4 py-2 rounded-xl border border-[#E8E7E2] text-xs font-semibold text-[#171714] hover:bg-[#F8F7F2]"
              >
                Retry Request
              </button>
              <Link
                to="/reconciliation"
                className="px-4 py-2 rounded-xl bg-[#171714] text-white text-xs font-semibold"
              >
                Back to Workspace
              </Link>
            </div>
          </div>
        )}

        {/* Loaded Run View */}
        {runId && run && (
          <div className="space-y-8">
            {/* Page Header */}
            <section className="space-y-3">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#66645C]">
                    <span>Deterministic Run Audit</span>
                    <span>·</span>
                    <span className="text-[#171714]">Immutable Traceability</span>
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-serif tracking-tight text-[#171714]">
                    Reconciliation Run Details & Audit History
                  </h1>
                  <p className="text-sm text-[#66645C] max-w-2xl leading-relaxed">
                    Trustworthy, verifiable audit record of matching rule parameters, multi-account
                    outcomes, and chronological events recorded by the deterministic engine.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleCopyRunId}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#E8E7E2] hover:bg-[#F8F7F2] text-xs font-semibold text-[#171714] transition-colors shadow-2xs cursor-pointer"
                  >
                    {isCopiedRunId ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Copied ID</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-[#66645C]" />
                        <span>Copy Run ID</span>
                      </>
                    )}
                  </button>
                  <Link
                    to={`/reconciliation?runId=${run.id}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#E8E7E2] hover:bg-[#F8F7F2] text-xs font-semibold text-[#171714] transition-colors shadow-2xs"
                  >
                    <span>Inspect in Workspace</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#66645C]" />
                  </Link>
                </div>
              </div>

              {/* Run Failure Alert if present */}
              {run.errorMessage && (
                <div
                  role="alert"
                  className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs sm:text-sm flex items-start gap-3"
                >
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-semibold">Reconciliation Engine Recorded An Error:</span>
                    <p className="font-mono text-xs text-rose-800">{run.errorMessage}</p>
                  </div>
                </div>
              )}
            </section>

            {/* Run Overview Metadata Grid */}
            <section className="bg-white rounded-2xl border border-[#E8E7E2] p-6 shadow-2xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E8E7E2] pb-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#66645C]">
                    Run Identifier:
                  </span>
                  <span className="font-mono text-sm font-bold text-[#171714] bg-[#F8F7F2] px-2.5 py-1 rounded-lg border border-[#E8E7E2]">
                    {run.id}
                  </span>
                </div>
                <div>{renderRunStatusBadge(run.status)}</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-xs">
                {/* Column 1: Scope & Accounts */}
                <div className="space-y-3">
                  <span className="font-semibold uppercase tracking-wider text-[#66645C] block">
                    Account Scope
                  </span>
                  <div>
                    <span className="text-[#66645C] block">Source Account:</span>
                    <strong className="text-[#171714] text-sm font-semibold">
                      {run.accountId
                        ? accountsMap.get(run.accountId)?.name || 'Scoped Account'
                        : 'All Organization Accounts'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#66645C] block">Target Account:</span>
                    <strong className="text-[#171714] text-sm font-semibold">
                      {run.targetAccountId
                        ? accountsMap.get(run.targetAccountId)?.name || 'Target Account'
                        : 'Any Compatible Account'}
                    </strong>
                  </div>
                </div>

                {/* Column 2: Parameters & Rules */}
                <div className="space-y-3">
                  <span className="font-semibold uppercase tracking-wider text-[#66645C] block">
                    Engine Parameters
                  </span>
                  <div>
                    <span className="text-[#66645C] block">Rules Version:</span>
                    <strong className="text-[#171714] font-mono text-sm">{run.rulesVersion}</strong>
                  </div>
                  <div>
                    <span className="text-[#66645C] block">Date Tolerance Window:</span>
                    <strong className="text-[#171714] text-sm">
                      ±{run.dateToleranceDays} calendar{' '}
                      {run.dateToleranceDays === 1 ? 'day' : 'days'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#66645C] block">Reconciliation Period:</span>
                    <strong className="text-[#171714]">
                      {run.startDate && run.endDate
                        ? `${new Date(run.startDate).toLocaleDateString()} — ${new Date(run.endDate).toLocaleDateString()}`
                        : 'Full Historical Ledger'}
                    </strong>
                  </div>
                </div>

                {/* Column 3: Operational Timestamps */}
                <div className="space-y-3">
                  <span className="font-semibold uppercase tracking-wider text-[#66645C] block">
                    Execution Timeline
                  </span>
                  <div>
                    <span className="text-[#66645C] block">Created:</span>
                    <span className="text-[#171714] font-mono">
                      {new Date(run.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#66645C] block">Started:</span>
                    <span className="text-[#171714] font-mono">
                      {run.startedAt ? new Date(run.startedAt).toLocaleString() : 'Pending'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#66645C] block">Completed:</span>
                    <span className="text-[#171714] font-mono">
                      {run.completedAt ? new Date(run.completedAt).toLocaleString() : 'In Progress'}
                    </span>
                  </div>
                </div>

                {/* Column 4: Performance & Integrity */}
                <div className="space-y-3">
                  <span className="font-semibold uppercase tracking-wider text-[#66645C] block">
                    Operational Metrics
                  </span>
                  <div>
                    <span className="text-[#66645C] block">Total Duration:</span>
                    <strong className="text-[#171714] font-mono text-sm">
                      {formatExecutionDuration(run.startedAt, run.completedAt) || 'In execution'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#66645C] block">Audit Integrity:</span>
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      Deterministic Ledger
                    </span>
                  </div>
                  <div>
                    <span className="text-[#66645C] block">Last Status Update:</span>
                    <span className="text-[#171714] font-mono">
                      {new Date(run.updatedAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Reconciliation Outcome Metric Strip */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E8E7E2] shadow-2xs space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold text-[#66645C]">
                  <span>Analyzed Records</span>
                  <Layers className="w-4 h-4 text-[#66645C]" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold font-mono text-[#171714]">
                  {run.totalSourceTransactions.toLocaleString()}
                </div>
                <div className="text-[11px] text-[#66645C]">Source transactions evaluated</div>
              </div>

              <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E8E7E2] shadow-2xs space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
                  <span>Suggested Matches</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold font-mono text-emerald-950">
                  {run.matchedCount.toLocaleString()}
                </div>
                <div className="text-[11px] text-[#66645C]">High-confidence candidates</div>
              </div>

              <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E8E7E2] shadow-2xs space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold text-amber-800">
                  <span>Needs Review</span>
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold font-mono text-amber-950">
                  {run.reviewCount.toLocaleString()}
                </div>
                <div className="text-[11px] text-[#66645C]">Ambiguous or multi-candidate</div>
              </div>

              <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E8E7E2] shadow-2xs space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold text-[#66645C]">
                  <span>Unmatched Records</span>
                  <Clock className="w-4 h-4 text-[#66645C]" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold font-mono text-[#171714]">
                  {run.unmatchedCount.toLocaleString()}
                </div>
                <div className="text-[11px] text-[#66645C]">Unpaired in tolerance window</div>
              </div>
            </section>

            {/* Navigation Tabs */}
            <section className="space-y-6">
              <div className="border-b border-[#E8E7E2] flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('timeline')}
                    className={`inline-flex items-center gap-2 py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                      activeTab === 'timeline'
                        ? 'border-[#171714] text-[#171714]'
                        : 'border-transparent text-[#66645C] hover:text-[#171714]'
                    }`}
                  >
                    <History className="w-4 h-4" />
                    <span>Audit Trail Timeline</span>
                    {auditTrailData?.items && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#F8F7F2] border border-[#E8E7E2]">
                        {auditTrailData.items.length}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('matches')}
                    className={`inline-flex items-center gap-2 py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                      activeTab === 'matches'
                        ? 'border-[#171714] text-[#171714]'
                        : 'border-transparent text-[#66645C] hover:text-[#171714]'
                    }`}
                  >
                    <GitCompare className="w-4 h-4" />
                    <span>Reconciliation Match Records</span>
                    {matchesData?.pagination && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#F8F7F2] border border-[#E8E7E2]">
                        {matchesData.pagination.totalItems}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('parameters')}
                    className={`inline-flex items-center gap-2 py-3 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
                      activeTab === 'parameters'
                        ? 'border-[#171714] text-[#171714]'
                        : 'border-transparent text-[#66645C] hover:text-[#171714]'
                    }`}
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span>Engine Rules & Parameters</span>
                  </button>
                </div>
              </div>

              {/* ============================================================ */}
              {/* TAB 1: Audit Trail Timeline                                  */}
              {/* ============================================================ */}
              {activeTab === 'timeline' && (
                <div className="space-y-6">
                  {/* Timeline Filter Controls */}
                  <div className="bg-white rounded-2xl border border-[#E8E7E2] p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#66645C] mr-2">
                        Filter Events:
                      </span>
                      {(['all', 'lifecycle', 'decisions', 'generation'] as const).map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setEventCategoryFilter(cat)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            eventCategoryFilter === cat
                              ? 'bg-[#171714] text-white'
                              : 'bg-[#F8F7F2] text-[#66645C] hover:text-[#171714] border border-[#E8E7E2]'
                          }`}
                        >
                          {cat === 'all' && 'All Events'}
                          {cat === 'lifecycle' && 'Run Lifecycle'}
                          {cat === 'decisions' && 'Match Decisions'}
                          {cat === 'generation' && 'Generation'}
                        </button>
                      ))}
                    </div>

                    <div className="relative w-full md:w-72">
                      <Search className="w-3.5 h-3.5 text-[#66645C] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={eventSearchQuery}
                        onChange={(e) => setEventSearchQuery(e.target.value)}
                        placeholder="Search audit trail events..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-[#E8E7E2] bg-[#F8F7F2] text-xs focus:outline-none focus:ring-2 focus:ring-[#E5BB45]"
                      />
                      {eventSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setEventSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#66645C] hover:text-[#171714]"
                          aria-label="Clear event search"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Timeline Container */}
                  <div className="bg-white rounded-2xl border border-[#E8E7E2] p-6 shadow-2xs">
                    {isAuditTrailLoading ? (
                      <div className="space-y-4 py-8 animate-pulse">
                        <div className="h-6 w-48 bg-[#F8F7F2] rounded" />
                        <div className="h-16 bg-[#F8F7F2] rounded-xl" />
                        <div className="h-16 bg-[#F8F7F2] rounded-xl" />
                        <div className="h-16 bg-[#F8F7F2] rounded-xl" />
                      </div>
                    ) : isAuditTrailError ? (
                      <div className="text-center py-10 space-y-3">
                        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
                        <p className="text-sm font-semibold text-[#171714]">
                          Unable to retrieve audit trail
                        </p>
                        <p className="text-xs text-[#66645C]">
                          An error occurred while fetching chronological audit records for this run.
                        </p>
                        <button
                          type="button"
                          onClick={() => refetchAuditTrail()}
                          className="px-3.5 py-1.5 rounded-xl border border-[#E8E7E2] text-xs font-semibold hover:bg-[#F8F7F2]"
                        >
                          Retry Query
                        </button>
                      </div>
                    ) : filteredEvents.length === 0 ? (
                      <div className="text-center py-12 space-y-3">
                        <History className="w-8 h-8 text-[#66645C] mx-auto opacity-30" />
                        <p className="text-sm font-semibold text-[#171714]">
                          {eventSearchQuery || eventCategoryFilter !== 'all'
                            ? 'No audit events match your filter criteria'
                            : 'No audit events recorded for this run'}
                        </p>
                        {(eventSearchQuery || eventCategoryFilter !== 'all') && (
                          <button
                            type="button"
                            onClick={() => {
                              setEventSearchQuery('');
                              setEventCategoryFilter('all');
                            }}
                            className="text-xs text-[#171714] font-semibold underline"
                          >
                            Reset filters
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="relative pl-6 space-y-8 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#E8E7E2]">
                        {filteredEvents.map((event) => (
                          <div key={event.id} className="relative group">
                            {/* Timeline Point Icon */}
                            <div className="absolute -left-6 top-0 w-6 h-6 rounded-full bg-white border border-[#E8E7E2] flex items-center justify-center shadow-xs group-hover:scale-110 transition-transform">
                              {renderAuditEventIcon(event.action)}
                            </div>

                            <div className="ml-3 p-4 rounded-xl border border-[#E8E7E2] bg-[#F8F7F2]/60 hover:bg-[#F8F7F2] transition-colors space-y-2">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-[#171714] bg-white px-2 py-0.5 rounded border border-[#E8E7E2]">
                                    {event.action}
                                  </span>
                                  {event.matchId && (
                                    <span className="text-[11px] font-mono text-[#66645C]">
                                      Match ID: {event.matchId.substring(0, 8)}...
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs font-mono text-[#66645C]">
                                  {new Date(event.timestamp).toLocaleString()}
                                </span>
                              </div>

                              {/* Structured Event Summary */}
                              <div className="text-xs text-[#171714]">
                                {event.action === 'run_started' && (
                                  <p>
                                    Reconciliation run started with rules version{' '}
                                    <strong className="font-mono">
                                      {String(event.details.rulesVersion || 'v1.0.0')}
                                    </strong>{' '}
                                    and tolerance{' '}
                                    <strong>
                                      ±{String(event.details.dateToleranceDays ?? 3)}d
                                    </strong>
                                    .
                                  </p>
                                )}
                                {event.action === 'matches_generated' && (
                                  <p>
                                    Engine evaluated transactions and produced{' '}
                                    <strong className="text-emerald-700">
                                      {String(event.details.matchedCount ?? 0)} matches
                                    </strong>
                                    ,{' '}
                                    <strong className="text-amber-700">
                                      {String(event.details.reviewCount ?? 0)} review-required
                                    </strong>
                                    , and{' '}
                                    <strong>
                                      {String(event.details.unmatchedCount ?? 0)} unmatched records
                                    </strong>
                                    .
                                  </p>
                                )}
                                {event.action === 'match_confirmed' && (
                                  <p>
                                    Match candidate confirmed.
                                    {typeof event.details.notes === 'string' &&
                                      event.details.notes && (
                                        <span className="italic block mt-1 text-[#66645C]">
                                          Reviewer note: "{event.details.notes}"
                                        </span>
                                      )}
                                  </p>
                                )}
                                {event.action === 'match_rejected' && (
                                  <p>
                                    Match candidate rejected.
                                    {typeof event.details.reason === 'string' &&
                                      event.details.reason && (
                                        <span className="font-medium text-rose-800 block mt-1">
                                          Rejection reason: "{event.details.reason}"
                                        </span>
                                      )}
                                  </p>
                                )}
                                {event.action === 'run_completed' && (
                                  <p>
                                    Reconciliation run completed successfully. Total duration:{' '}
                                    <strong className="font-mono">
                                      {String(event.details.executionDurationMs ?? '—')}ms
                                    </strong>
                                    .
                                  </p>
                                )}
                                {event.action === 'run_failed' && (
                                  <p className="text-rose-700 font-medium">
                                    Execution failed:{' '}
                                    {String(event.details.error || 'Unknown error')}
                                  </p>
                                )}
                              </div>

                              <div className="pt-1 flex items-center justify-between text-[11px]">
                                <span className="font-mono text-[#66645C] text-[10px]">
                                  Event Ref: {event.id}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setInspectingEvent(event)}
                                  className="inline-flex items-center gap-1 font-semibold text-[#171714] hover:underline cursor-pointer"
                                >
                                  <Code2 className="w-3 h-3 text-[#66645C]" />
                                  <span>Inspect Payload</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ============================================================ */}
              {/* TAB 2: Reconciliation Match Records                          */}
              {/* ============================================================ */}
              {activeTab === 'matches' && (
                <div className="space-y-6">
                  {/* Matches Filtering Bar */}
                  <div className="bg-white rounded-2xl border border-[#E8E7E2] p-4 shadow-2xs space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Status Pills */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(
                          ['all', 'needs_review', 'suggested', 'confirmed', 'rejected'] as const
                        ).map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => {
                              setMatchesStatusFilter(status);
                              setMatchesPage(1);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                              matchesStatusFilter === status
                                ? 'bg-[#171714] text-white'
                                : 'bg-[#F8F7F2] text-[#66645C] hover:text-[#171714] border border-[#E8E7E2]'
                            }`}
                          >
                            {status === 'all' && 'All Records'}
                            {status === 'needs_review' && 'Needs Review'}
                            {status === 'suggested' && 'Suggested'}
                            {status === 'confirmed' && 'Confirmed'}
                            {status === 'rejected' && 'Rejected'}
                          </button>
                        ))}
                      </div>

                      {/* Matching Method Dropdown */}
                      <div className="relative">
                        <select
                          value={matchesMethodFilter}
                          onChange={(e) => {
                            setMatchesMethodFilter(
                              e.target.value as ReconciliationMatchMethod | 'all',
                            );
                            setMatchesPage(1);
                          }}
                          className="appearance-none pl-3 pr-8 py-1.5 rounded-xl border border-[#E8E7E2] bg-[#F8F7F2] text-xs font-semibold text-[#171714] focus:outline-none focus:ring-2 focus:ring-[#E5BB45] cursor-pointer"
                        >
                          <option value="all">All Matching Methods</option>
                          <option value="exact_reference">Exact Reference</option>
                          <option value="transfer_match">Transfer Match</option>
                          <option value="amount_date_reference">Amount + Date + Ref</option>
                          <option value="amount_date_description">
                            Amount + Date + Description
                          </option>
                          <option value="manual">Manual Pairing</option>
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-[#66645C] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-[#66645C] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={matchesSearchQuery}
                        onChange={(e) => setMatchesSearchQuery(e.target.value)}
                        placeholder="Filter matches by counterparty description, source reference, or review reason..."
                        className="w-full pl-8 pr-3 py-2 rounded-xl border border-[#E8E7E2] bg-[#F8F7F2] text-xs focus:outline-none focus:ring-2 focus:ring-[#E5BB45]"
                      />
                      {matchesSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setMatchesSearchQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#66645C] hover:text-[#171714]"
                          aria-label="Clear match search"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Matches Table */}
                  <div className="bg-white rounded-2xl border border-[#E8E7E2] shadow-2xs overflow-hidden">
                    {isMatchesLoading ? (
                      <div className="p-8 space-y-4 animate-pulse">
                        <div className="h-6 w-48 bg-[#F8F7F2] rounded" />
                        <div className="h-14 bg-[#F8F7F2] rounded-xl" />
                        <div className="h-14 bg-[#F8F7F2] rounded-xl" />
                        <div className="h-14 bg-[#F8F7F2] rounded-xl" />
                      </div>
                    ) : filteredMatches.length === 0 ? (
                      <div className="p-12 text-center space-y-3">
                        <GitCompare className="w-8 h-8 text-[#66645C] mx-auto opacity-30" />
                        <p className="text-sm font-semibold text-[#171714]">
                          No reconciliation matches found
                        </p>
                        <p className="text-xs text-[#66645C]">
                          {matchesSearchQuery ||
                          matchesStatusFilter !== 'all' ||
                          matchesMethodFilter !== 'all'
                            ? 'No pairings match your active search or method filters.'
                            : 'This run did not produce any candidate match records.'}
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-[#E8E7E2] bg-[#F8F7F2]/80 text-[11px] font-semibold uppercase tracking-wider text-[#66645C]">
                              <th className="py-3 px-4">Status & Score</th>
                              <th className="py-3 px-4">Source Transaction</th>
                              <th className="py-3 px-4 text-center">Flow</th>
                              <th className="py-3 px-4">Candidate Transaction</th>
                              <th className="py-3 px-4">Differences</th>
                              <th className="py-3 px-4 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E8E7E2] text-xs">
                            {filteredMatches.map((m) => (
                              <tr key={m.id} className="hover:bg-[#F8F7F2]/50 transition-colors">
                                <td className="py-3.5 px-4 space-y-1 whitespace-nowrap">
                                  <div>{renderMatchStatusBadge(m.status)}</div>
                                  <div className="font-mono text-[10px] text-[#66645C]">
                                    Score: {m.matchScore}% &bull; {m.matchMethod}
                                  </div>
                                </td>

                                <td className="py-3.5 px-4 space-y-0.5">
                                  <div className="font-semibold text-[#171714]">
                                    {m.sourceTransaction?.description || 'Source Transaction'}
                                  </div>
                                  <div className="text-[11px] text-[#66645C] flex items-center gap-2">
                                    <span>
                                      {m.sourceTransaction?.date
                                        ? new Date(m.sourceTransaction.date).toLocaleDateString()
                                        : '—'}
                                    </span>
                                    <span>&bull;</span>
                                    <span className="font-mono font-semibold text-[#171714]">
                                      {m.sourceTransaction
                                        ? formatCurrencyAmount(
                                            m.sourceTransaction.amountMinor,
                                            m.sourceTransaction.currency,
                                          )
                                        : '—'}
                                    </span>
                                  </div>
                                  {m.sourceTransaction?.sourceReference && (
                                    <div className="text-[10px] font-mono text-[#66645C]">
                                      Ref: {m.sourceTransaction.sourceReference}
                                    </div>
                                  )}
                                </td>

                                <td className="py-3.5 px-4 text-center">
                                  <div className="inline-flex p-1.5 rounded-full bg-[#F8F7F2] border border-[#E8E7E2]">
                                    <ArrowRight className="w-3.5 h-3.5 text-[#66645C]" />
                                  </div>
                                </td>

                                <td className="py-3.5 px-4 space-y-0.5">
                                  {m.candidateTransaction ? (
                                    <>
                                      <div className="font-semibold text-[#171714]">
                                        {m.candidateTransaction.description}
                                      </div>
                                      <div className="text-[11px] text-[#66645C] flex items-center gap-2">
                                        <span>
                                          {new Date(
                                            m.candidateTransaction.date,
                                          ).toLocaleDateString()}
                                        </span>
                                        <span>&bull;</span>
                                        <span className="font-mono font-semibold text-[#171714]">
                                          {formatCurrencyAmount(
                                            m.candidateTransaction.amountMinor,
                                            m.candidateTransaction.currency,
                                          )}
                                        </span>
                                      </div>
                                      {m.candidateTransaction.sourceReference && (
                                        <div className="text-[10px] font-mono text-[#66645C]">
                                          Ref: {m.candidateTransaction.sourceReference}
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-[#66645C] italic">
                                      No paired candidate
                                    </span>
                                  )}
                                </td>

                                <td className="py-3.5 px-4 space-y-0.5 whitespace-nowrap">
                                  <div className="font-mono text-xs">
                                    Date:{' '}
                                    {m.dateDifferenceDays === 0
                                      ? '0d'
                                      : `${m.dateDifferenceDays > 0 ? '+' : ''}${m.dateDifferenceDays}d`}
                                  </div>
                                  <div className="font-mono text-[11px] text-[#66645C]">
                                    Diff:{' '}
                                    {formatCurrencyAmount(
                                      m.amountDifferenceMinor,
                                      m.sourceTransaction?.currency || 'USD',
                                    )}
                                  </div>
                                </td>

                                <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => setInspectingMatch(m)}
                                    className="px-2.5 py-1 rounded-lg border border-[#E8E7E2] hover:bg-white text-xs font-semibold text-[#171714] cursor-pointer"
                                  >
                                    Inspect
                                  </button>
                                  {(m.status === 'suggested' || m.status === 'needs_review') && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmingMatch(m)}
                                        className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
                                      >
                                        Confirm
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setRejectingMatch(m);
                                          setRejectionReason('');
                                          setRejectionError(null);
                                        }}
                                        className="px-2.5 py-1 rounded-lg border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-semibold cursor-pointer"
                                      >
                                        Reject
                                      </button>
                                    </>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Pagination */}
                    {matchesData?.pagination && matchesData.pagination.totalPages > 1 && (
                      <div className="p-4 border-t border-[#E8E7E2] flex items-center justify-between text-xs text-[#66645C]">
                        <span>
                          Showing page {matchesData.pagination.page} of{' '}
                          {matchesData.pagination.totalPages} ({matchesData.pagination.totalItems}{' '}
                          total matches)
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={matchesPage <= 1}
                            onClick={() => setMatchesPage((p) => Math.max(1, p - 1))}
                            className="p-1.5 rounded-lg border border-[#E8E7E2] hover:bg-[#F8F7F2] disabled:opacity-40"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={matchesPage >= matchesData.pagination.totalPages}
                            onClick={() => setMatchesPage((p) => p + 1)}
                            className="p-1.5 rounded-lg border border-[#E8E7E2] hover:bg-[#F8F7F2] disabled:opacity-40"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ============================================================ */}
              {/* TAB 3: Engine Parameters & Configuration                     */}
              {/* ============================================================ */}
              {activeTab === 'parameters' && (
                <div className="bg-white rounded-2xl border border-[#E8E7E2] p-6 shadow-2xs space-y-6">
                  <div className="space-y-1">
                    <h3 className="text-base font-serif text-[#171714]">
                      Deterministic Engine Rules Specification
                    </h3>
                    <p className="text-xs text-[#66645C]">
                      Exact configuration and boundary conditions captured at run initialization.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                    <div className="p-4 rounded-xl border border-[#E8E7E2] bg-[#F8F7F2]/50 space-y-3">
                      <span className="font-semibold text-[#171714] block">
                        Execution Parameters
                      </span>
                      <div className="space-y-2 font-mono">
                        <div className="flex justify-between border-b border-[#E8E7E2] pb-1">
                          <span className="text-[#66645C]">rulesVersion:</span>
                          <span className="text-[#171714] font-bold">{run.rulesVersion}</span>
                        </div>
                        <div className="flex justify-between border-b border-[#E8E7E2] pb-1">
                          <span className="text-[#66645C]">dateToleranceDays:</span>
                          <span className="text-[#171714] font-bold">±{run.dateToleranceDays}</span>
                        </div>
                        <div className="flex justify-between border-b border-[#E8E7E2] pb-1">
                          <span className="text-[#66645C]">organizationId:</span>
                          <span className="text-[#171714]">{run.organizationId}</span>
                        </div>
                        <div className="flex justify-between border-b border-[#E8E7E2] pb-1">
                          <span className="text-[#66645C]">sourceAccountId:</span>
                          <span className="text-[#171714]">
                            {run.accountId || 'null (All Accounts)'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#66645C]">targetAccountId:</span>
                          <span className="text-[#171714]">
                            {run.targetAccountId || 'null (Any Account)'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-[#E8E7E2] bg-[#F8F7F2]/50 space-y-3">
                      <span className="font-semibold text-[#171714] block">
                        Dual-Entry Verification Safeguards
                      </span>
                      <ul className="space-y-2 text-[#66645C] list-disc pl-4">
                        <li>
                          <strong className="text-[#171714]">Strict Integer Arithmetic:</strong>{' '}
                          Amounts are evaluated strictly in minor units (cents) to eliminate IEEE
                          754 floating-point drift.
                        </li>
                        <li>
                          <strong className="text-[#171714]">
                            Cross-Account Direction Inversion:
                          </strong>{' '}
                          A debit in source account strictly requires an offset credit in target
                          account.
                        </li>
                        <li>
                          <strong className="text-[#171714]">Exact Reference Precedence:</strong>{' '}
                          Identical reference pairings receive guaranteed deterministic match
                          priority.
                        </li>
                        <li>
                          <strong className="text-[#171714]">Ambiguity Quarantine:</strong> Multiple
                          candidates for the same source are tagged as Needs Review rather than
                          arbitrarily matched.
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* Modal: Audit Event Payload Inspector                         */}
      {/* ============================================================ */}
      {inspectingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#E8E7E2] max-w-2xl w-full p-6 shadow-xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[#E8E7E2] pb-3">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-[#E5BB45]" />
                <h3 className="font-serif text-lg text-[#171714]">Audit Event Payload</h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectingEvent(null)}
                className="p-1 rounded-lg text-[#66645C] hover:text-[#171714] hover:bg-[#F8F7F2]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto flex-1 pr-1 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] font-mono">
                <div>
                  <span className="text-[#66645C] block text-[10px]">EVENT ID:</span>
                  <span className="text-[#171714] font-bold">{inspectingEvent.id}</span>
                </div>
                <div>
                  <span className="text-[#66645C] block text-[10px]">ACTION:</span>
                  <span className="text-[#171714] font-bold">{inspectingEvent.action}</span>
                </div>
                <div>
                  <span className="text-[#66645C] block text-[10px]">TIMESTAMP:</span>
                  <span className="text-[#171714]">{inspectingEvent.timestamp}</span>
                </div>
                <div>
                  <span className="text-[#66645C] block text-[10px]">MATCH ID:</span>
                  <span className="text-[#171714]">{inspectingEvent.matchId || 'null'}</span>
                </div>
              </div>

              <div>
                <span className="font-semibold text-[#171714] block mb-1">
                  Structured Event Details:
                </span>
                <pre className="p-4 rounded-xl bg-[#171714] text-white font-mono text-[11px] overflow-x-auto leading-relaxed">
                  {JSON.stringify(inspectingEvent.details, null, 2)}
                </pre>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectingEvent(null)}
                className="px-4 py-2 rounded-xl bg-[#171714] text-white text-xs font-semibold"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* Modal: Match Discrepancy Evidence Inspector                  */}
      {/* ============================================================ */}
      {inspectingMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#E8E7E2] max-w-3xl w-full p-6 shadow-xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E8E7E2] pb-3">
              <div>
                <h3 className="font-serif text-lg text-[#171714]">
                  Match Candidate Evidence Matrix
                </h3>
                <span className="text-xs text-[#66645C] font-mono">
                  Candidate ID: {inspectingMatch.id}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setInspectingMatch(null)}
                className="p-1 rounded-lg text-[#66645C] hover:text-[#171714] hover:bg-[#F8F7F2]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Side by side comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-xl border border-[#E8E7E2] bg-[#F8F7F2]/50 space-y-2">
                <span className="font-semibold text-[#171714] block uppercase tracking-wider text-[10px]">
                  Source Transaction
                </span>
                <div className="text-sm font-bold text-[#171714]">
                  {inspectingMatch.sourceTransaction?.description || 'Source'}
                </div>
                <div className="font-mono text-base font-bold text-[#171714]">
                  {inspectingMatch.sourceTransaction
                    ? formatCurrencyAmount(
                        inspectingMatch.sourceTransaction.amountMinor,
                        inspectingMatch.sourceTransaction.currency,
                      )
                    : '—'}
                </div>
                <div className="text-[#66645C] space-y-1">
                  <div>
                    Date:{' '}
                    {inspectingMatch.sourceTransaction?.date
                      ? new Date(inspectingMatch.sourceTransaction.date).toLocaleDateString()
                      : '—'}
                  </div>
                  <div>Direction: {inspectingMatch.sourceTransaction?.direction}</div>
                  <div>
                    Reference: {inspectingMatch.sourceTransaction?.sourceReference || 'None'}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-[#E8E7E2] bg-[#F8F7F2]/50 space-y-2">
                <span className="font-semibold text-[#171714] block uppercase tracking-wider text-[10px]">
                  Candidate Transaction
                </span>
                {inspectingMatch.candidateTransaction ? (
                  <>
                    <div className="text-sm font-bold text-[#171714]">
                      {inspectingMatch.candidateTransaction.description}
                    </div>
                    <div className="font-mono text-base font-bold text-[#171714]">
                      {formatCurrencyAmount(
                        inspectingMatch.candidateTransaction.amountMinor,
                        inspectingMatch.candidateTransaction.currency,
                      )}
                    </div>
                    <div className="text-[#66645C] space-y-1">
                      <div>
                        Date:{' '}
                        {new Date(inspectingMatch.candidateTransaction.date).toLocaleDateString()}
                      </div>
                      <div>Direction: {inspectingMatch.candidateTransaction.direction}</div>
                      <div>
                        Reference: {inspectingMatch.candidateTransaction.sourceReference || 'None'}
                      </div>
                    </div>
                  </>
                ) : (
                  <span className="text-[#66645C] italic block py-4">
                    No paired candidate record
                  </span>
                )}
              </div>
            </div>

            {/* Evidence Checklist */}
            <div className="p-4 rounded-xl border border-[#E8E7E2] space-y-3 text-xs">
              <span className="font-semibold text-[#171714] block">
                Engine Rule Validation Evidence:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-2.5 rounded-lg bg-[#F8F7F2] border border-[#E8E7E2]">
                  <span className="text-[10px] text-[#66645C] block">Amount Match</span>
                  <span className="font-semibold text-[#171714]">
                    {inspectingMatch.amountDifferenceMinor === 0
                      ? 'Exact Match ($0.00)'
                      : `Diff: ${inspectingMatch.amountDifferenceMinor}`}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-[#F8F7F2] border border-[#E8E7E2]">
                  <span className="text-[10px] text-[#66645C] block">Calendar Delta</span>
                  <span className="font-semibold text-[#171714]">
                    {inspectingMatch.dateDifferenceDays}d delta
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-[#F8F7F2] border border-[#E8E7E2]">
                  <span className="text-[10px] text-[#66645C] block">Match Method</span>
                  <span className="font-semibold text-[#171714] font-mono text-[11px]">
                    {inspectingMatch.matchMethod}
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-[#F8F7F2] border border-[#E8E7E2]">
                  <span className="text-[10px] text-[#66645C] block">Confidence Score</span>
                  <span className="font-semibold text-[#171714] font-mono">
                    {inspectingMatch.matchScore}%
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setInspectingMatch(null)}
                className="px-4 py-2 rounded-xl border border-[#E8E7E2] text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* Modal: Confirm Match Dialog                                  */}
      {/* ============================================================ */}
      {confirmingMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#E8E7E2] max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-serif text-lg text-[#171714]">Confirm Reconciliation Match</h3>
                <p className="text-xs text-[#66645C]">
                  Confirmed pairings transition both underlying transactions to reconciled status.
                </p>
              </div>
            </div>

            <form onSubmit={handleConfirmSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="confirm-notes"
                  className="block text-xs font-semibold text-[#171714] mb-1"
                >
                  Audit Notes (Optional):
                </label>
                <textarea
                  id="confirm-notes"
                  value={confirmNotes}
                  onChange={(e) => setConfirmNotes(e.target.value)}
                  placeholder="e.g., Verified against Chase wire confirmation TRF-88991"
                  rows={3}
                  className="w-full p-3 rounded-xl border border-[#E8E7E2] bg-[#F8F7F2] text-xs focus:outline-none focus:ring-2 focus:ring-[#E5BB45]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmingMatch(null)}
                  disabled={confirmMatchMutation.isPending}
                  className="px-4 py-2 rounded-xl border border-[#E8E7E2] text-xs font-semibold text-[#66645C] hover:text-[#171714]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={confirmMatchMutation.isPending}
                  className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {confirmMatchMutation.isPending ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Confirming...</span>
                    </>
                  ) : (
                    <span>Confirm Match</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* Modal: Reject Match Dialog                                   */}
      {/* ============================================================ */}
      {rejectingMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#E8E7E2] max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
                <XCircle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-serif text-lg text-[#171714]">Reject Match Candidate</h3>
                <p className="text-xs text-[#66645C]">
                  Rejection unbinds the pairing and preserves transactions for subsequent
                  reconciliation runs.
                </p>
              </div>
            </div>

            <form onSubmit={handleRejectSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="rejection-reason"
                  className="block text-xs font-semibold text-[#171714] mb-1"
                >
                  Rejection Reason <span className="text-rose-600">*</span>:
                </label>
                <textarea
                  id="rejection-reason"
                  value={rejectionReason}
                  onChange={(e) => {
                    setRejectionReason(e.target.value);
                    if (rejectionError) setRejectionError(null);
                  }}
                  placeholder="e.g., Unrelated counterparty transaction; timing coincidence"
                  rows={3}
                  className="w-full p-3 rounded-xl border border-[#E8E7E2] bg-[#F8F7F2] text-xs focus:outline-none focus:ring-2 focus:ring-[#E5BB45]"
                />
                {rejectionError && (
                  <p className="text-[11px] text-rose-600 mt-1">{rejectionError}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectingMatch(null)}
                  disabled={rejectMatchMutation.isPending}
                  className="px-4 py-2 rounded-xl border border-[#E8E7E2] text-xs font-semibold text-[#66645C] hover:text-[#171714]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rejectMatchMutation.isPending}
                  className="px-4 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {rejectMatchMutation.isPending ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Rejecting...</span>
                    </>
                  ) : (
                    <span>Reject Candidate</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
};
