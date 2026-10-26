import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { financialService } from '../services/financial.service';
import { Layout } from './Layout';
import type {
  ReconciliationRun,
  ReconciliationMatch,
  FinancialAccount,
  ReconciliationMatchStatus,
  ReconciliationMatchMethod,
} from '@moneylens/shared';
import { formatCurrencyAmount } from '@moneylens/shared';
import {
  ArrowRight,
  Play,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Check,
  X,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  ListOrdered,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Scale,
  Ban,
  FileText,
} from 'lucide-react';

export const ReconciliationPage: React.FC = () => {
  const queryClient = useQueryClient();

  // Document Title
  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'Reconciliation Workspace — MoneyLens';
    return () => {
      document.title = originalTitle;
    };
  }, []);

  const organizationName = useMemo(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('ml_organization_name') || 'Primary Retail Workspace';
    }
    return 'Primary Retail Workspace';
  }, []);

  const organizationId = useMemo(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('ml_organization_id') || 'default-org';
    }
    return 'default-org';
  }, []);

  // State: Run Selection & Pagination
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [matchesPage, setMatchesPage] = useState<number>(1);
  const matchesPageSize = 25;

  // State: Filters & Search
  const [statusFilter, setStatusFilter] = useState<ReconciliationMatchStatus | 'all'>('all');
  const [methodFilter, setMethodFilter] = useState<ReconciliationMatchMethod | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // State: Modals & Drawers
  const [isNewRunModalOpen, setIsNewRunModalOpen] = useState(false);
  const [isAuditTrailOpen, setIsAuditTrailOpen] = useState(false);
  const [inspectingMatch, setInspectingMatch] = useState<ReconciliationMatch | null>(null);
  const [confirmingMatch, setConfirmingMatch] = useState<ReconciliationMatch | null>(null);
  const [confirmNotes, setConfirmNotes] = useState<string>('');
  const [rejectingMatch, setRejectingMatch] = useState<ReconciliationMatch | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');

  // State: New Run Form
  const [newRunAccountId, setNewRunAccountId] = useState<string>('');
  const [newRunTargetAccountId, setNewRunTargetAccountId] = useState<string>('');
  const [newRunTolerance, setNewRunTolerance] = useState<number>(3);
  const [newRunStartDate, setNewRunStartDate] = useState<string>('');
  const [newRunEndDate, setNewRunEndDate] = useState<string>('');
  const [newRunFormError, setNewRunFormError] = useState<string | null>(null);

  // Global action error banner
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // 1. Fetch Accounts for display and dropdowns
  const { data: accountsData } = useQuery({
    queryKey: ['financial-accounts', organizationId],
    queryFn: financialService.getAccounts,
    staleTime: 60000,
  });

  const accounts: FinancialAccount[] = useMemo(() => {
    return accountsData?.items || [];
  }, [accountsData]);

  const accountsMap = useMemo(() => {
    const map = new Map<string, FinancialAccount>();
    accounts.forEach((acc) => map.set(acc.id, acc));
    return map;
  }, [accounts]);

  // 2. Fetch Reconciliation Runs list
  const {
    data: runsData,
    isLoading: isRunsLoading,
    refetch: refetchRuns,
  } = useQuery({
    queryKey: ['reconciliation-runs', organizationId],
    queryFn: () => financialService.getReconciliationRuns(1, 20),
    staleTime: 30000,
  });

  const runs: ReconciliationRun[] = useMemo(() => {
    return runsData?.items || [];
  }, [runsData]);

  // Determine active run (selected or latest)
  const activeRun: ReconciliationRun | null = useMemo(() => {
    if (!runs || runs.length === 0) return null;
    if (selectedRunId) {
      const found = runs.find((r) => r.id === selectedRunId);
      if (found) return found;
    }
    return runs[0] ?? null;
  }, [runs, selectedRunId]);

  // Auto-sync selectedRunId if unset
  useEffect(() => {
    if (!selectedRunId && runs.length > 0 && runs[0]) {
      setSelectedRunId(runs[0].id);
    }
  }, [runs, selectedRunId]);

  // Escape key handler for modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inspectingMatch) setInspectingMatch(null);
        if (confirmingMatch) setConfirmingMatch(null);
        if (rejectingMatch) setRejectingMatch(null);
        if (isNewRunModalOpen) setIsNewRunModalOpen(false);
        if (isAuditTrailOpen) setIsAuditTrailOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inspectingMatch, confirmingMatch, rejectingMatch, isNewRunModalOpen, isAuditTrailOpen]);

  // Lock body scroll when any modal is open
  useEffect(() => {
    const hasOpenModal = Boolean(
      inspectingMatch || confirmingMatch || rejectingMatch || isNewRunModalOpen || isAuditTrailOpen,
    );
    if (hasOpenModal) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [inspectingMatch, confirmingMatch, rejectingMatch, isNewRunModalOpen, isAuditTrailOpen]);

  // 3. Fetch Matches for active run
  const activeRunId = activeRun?.id;
  const {
    data: matchesData,
    isLoading: isMatchesLoading,
    isError: isMatchesError,
    error: matchesError,
    refetch: refetchMatches,
    isFetching: isMatchesFetching,
  } = useQuery({
    queryKey: [
      'reconciliation-matches',
      organizationId,
      activeRunId,
      statusFilter,
      matchesPage,
      matchesPageSize,
    ],
    queryFn: () =>
      financialService.getReconciliationMatches({
        runId: activeRunId || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        page: matchesPage,
        pageSize: matchesPageSize,
      }),
    enabled: Boolean(activeRunId),
    staleTime: 30000,
  });

  const matches: ReconciliationMatch[] = useMemo(() => {
    return matchesData?.items || [];
  }, [matchesData]);

  const matchesPagination = matchesData?.pagination || {
    page: 1,
    limit: matchesPageSize,
    totalItems: 0,
    totalPages: 1,
  };

  // 4. Fetch Audit Trail for active run
  const {
    data: auditTrailData,
    isLoading: isAuditTrailLoading,
    refetch: refetchAuditTrail,
  } = useQuery({
    queryKey: ['reconciliation-audit-trail', organizationId, activeRunId],
    queryFn: () => (activeRunId ? financialService.getReconciliationAuditTrail(activeRunId) : null),
    enabled: Boolean(activeRunId && isAuditTrailOpen),
    staleTime: 30000,
  });

  // Client-side text search & method filter
  const filteredMatches = useMemo(() => {
    return matches.filter((match) => {
      // Method filter
      if (methodFilter !== 'all' && match.matchMethod !== methodFilter) {
        return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const srcDesc = match.sourceTransaction?.description?.toLowerCase() || '';
        const srcRef = match.sourceTransaction?.sourceReference?.toLowerCase() || '';
        const candDesc = match.candidateTransaction?.description?.toLowerCase() || '';
        const candRef = match.candidateTransaction?.sourceReference?.toLowerCase() || '';
        const reason = match.reviewReason?.toLowerCase() || '';
        const matchId = match.id.toLowerCase();

        if (
          !srcDesc.includes(q) &&
          !srcRef.includes(q) &&
          !candDesc.includes(q) &&
          !candRef.includes(q) &&
          !reason.includes(q) &&
          !matchId.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [matches, methodFilter, searchTerm]);

  // Mutations
  // Create Run Mutation
  const createRunMutation = useMutation({
    mutationFn: financialService.createReconciliationRun,
    onSuccess: (newRun) => {
      setIsNewRunModalOpen(false);
      setSelectedRunId(newRun.id);
      setMatchesPage(1);
      setActionSuccess(
        `Reconciliation run started successfully (${newRun.totalSourceTransactions} transactions analyzed).`,
      );
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['reconciliation-runs'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-matches'] });
      // Reset form
      setNewRunAccountId('');
      setNewRunTargetAccountId('');
      setNewRunTolerance(3);
      setNewRunStartDate('');
      setNewRunEndDate('');
      setNewRunFormError(null);
      setTimeout(() => setActionSuccess(null), 5000);
    },
    onError: (err: Error) => {
      setNewRunFormError(err.message || 'Failed to start reconciliation run');
    },
  });

  // Confirm Match Mutation
  const confirmMutation = useMutation({
    mutationFn: ({ matchId, notes }: { matchId: string; notes?: string }) =>
      financialService.confirmMatch(matchId, notes),
    onSuccess: (updatedMatch) => {
      setConfirmingMatch(null);
      setConfirmNotes('');
      // If inspecting the same match, update it
      if (inspectingMatch && inspectingMatch.id === updatedMatch.id) {
        setInspectingMatch(updatedMatch);
      }
      setActionSuccess('Match confirmed and transactions reconciled successfully.');
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['reconciliation-matches'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-runs'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: Error) => {
      setConfirmingMatch(null);
      setActionError(err.message || 'Failed to confirm match');
      // Invalidate to refresh stale candidate locks
      queryClient.invalidateQueries({ queryKey: ['reconciliation-matches'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-runs'] });
    },
  });

  // Reject Match Mutation
  const rejectMutation = useMutation({
    mutationFn: ({ matchId, reason }: { matchId: string; reason: string }) =>
      financialService.rejectMatch(matchId, reason),
    onSuccess: (updatedMatch) => {
      setRejectingMatch(null);
      setRejectionReason('');
      if (inspectingMatch && inspectingMatch.id === updatedMatch.id) {
        setInspectingMatch(updatedMatch);
      }
      setActionSuccess('Match candidate rejected with auditable reason.');
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['reconciliation-matches'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-runs'] });
      setTimeout(() => setActionSuccess(null), 4000);
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to reject match');
      queryClient.invalidateQueries({ queryKey: ['reconciliation-matches'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-runs'] });
    },
  });

  // Handlers
  const handleRefreshAll = () => {
    refetchRuns();
    if (activeRunId) {
      refetchMatches();
      if (isAuditTrailOpen) refetchAuditTrail();
    }
  };

  const handleNewRunSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setNewRunFormError(null);

    if (newRunStartDate && newRunEndDate) {
      if (new Date(newRunStartDate) > new Date(newRunEndDate)) {
        setNewRunFormError('Start date must be less than or equal to end date.');
        return;
      }
    }

    createRunMutation.mutate({
      accountId: newRunAccountId || undefined,
      targetAccountId: newRunTargetAccountId || undefined,
      dateToleranceDays: newRunTolerance,
      startDate: newRunStartDate ? new Date(newRunStartDate).toISOString() : undefined,
      endDate: newRunEndDate ? new Date(newRunEndDate).toISOString() : undefined,
    });
  };

  // Helper for Status Badges
  const renderMatchStatusBadge = (status: ReconciliationMatchStatus) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Confirmed
          </span>
        );
      case 'needs_review':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Needs Review
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
            <Ban className="w-3.5 h-3.5 text-rose-600" />
            Rejected
          </span>
        );
      case 'suggested':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FAF4E0] text-[#171714] border border-[#E5BB45]/40">
            <Scale className="w-3.5 h-3.5 text-[#B89020]" />
            Suggested
          </span>
        );
    }
  };

  // Helper for Run Status Badges
  const renderRunStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Completed
          </span>
        );
      case 'completed_with_errors':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-900 border border-amber-200">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            Errors Handled
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-800 border border-blue-200 animate-pulse">
            <RefreshCw className="w-3 h-3 text-blue-600 animate-spin" />
            Processing
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-800 border border-rose-200">
            <ShieldAlert className="w-3 h-3 text-rose-600" />
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#F8F7F2] text-[#66645C] border border-[#E8E7E2]">
            <Clock className="w-3 h-3 text-[#66645C]" />
            Pending
          </span>
        );
    }
  };

  // Helper for Match Method badge
  const renderMethodBadge = (method: ReconciliationMatchMethod) => {
    switch (method) {
      case 'exact_reference':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#F8F7F2] text-[#171714] border border-[#E8E7E2]">
            Exact Ref
          </span>
        );
      case 'transfer_match':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
            Transfer Match
          </span>
        );
      case 'amount_date_reference':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-800 border border-blue-200">
            Amount + Date + Ref
          </span>
        );
      case 'amount_date_description':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-800 border border-purple-200">
            Amount + Date + Desc
          </span>
        );
      case 'manual':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            Manual
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#F8F7F2] text-[#66645C] border border-[#E8E7E2]">
            {method}
          </span>
        );
    }
  };

  return (
    <Layout
      pageTitle="Reconciliation Workspace"
      headerActions={
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={isMatchesFetching}
            title="Refresh reconciliation data"
            className="w-9 h-9 rounded-xl border border-[#DEDDD5] bg-white text-[#66645C] hover:text-[#171714] hover:bg-[#F8F7F2] transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center shrink-0"
            aria-label="Refresh workspace"
          >
            <RefreshCw
              className={`w-4 h-4 ${isMatchesFetching ? 'animate-spin text-[#E5BB45]' : ''}`}
            />
          </button>
          <button
            type="button"
            onClick={() => setIsNewRunModalOpen(true)}
            aria-label="Run Reconciliation"
            className="inline-flex items-center gap-1.5 bg-[#E5BB45] hover:bg-[#D3A82F] text-[#171714] text-xs font-semibold py-1.5 px-2.5 sm:px-3.5 rounded-full shadow-2xs hover:shadow transition cursor-pointer shrink-0 min-h-[36px]"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span className="hidden sm:inline">Run Reconciliation</span>
            <span className="sm:hidden">Run</span>
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
                <span>Transaction Matching</span>
                <span>·</span>
                <span className="text-[#171714]">Dual-Entry Verification</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-serif tracking-tight text-[#171714]">
                Reconciliation Workspace
              </h1>
              <p className="text-sm text-[#66645C] max-w-2xl leading-relaxed">
                Inspect candidate matches, investigate multi-account discrepancies, and resolve
                transfer pairings with auditable confirmation.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                to={activeRunId ? `/reconciliation/runs/${activeRunId}` : '/reconciliation/runs'}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#E8E7E2] hover:bg-[#F8F7F2] text-xs font-semibold text-[#171714] transition-colors shadow-2xs"
                title="View full run details and complete chronological audit history"
              >
                <FileText className="w-3.5 h-3.5 text-[#66645C]" />
                <span>Run Details & History</span>
              </Link>
              <button
                type="button"
                onClick={() => setIsAuditTrailOpen(true)}
                disabled={!activeRunId}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#E8E7E2] hover:bg-[#F8F7F2] text-xs font-semibold text-[#171714] transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
              >
                <ListOrdered className="w-3.5 h-3.5 text-[#66645C]" />
                <span>Audit Trail</span>
              </button>
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
          <div className="p-4 rounded-2xl bg-white border border-[#E8E7E2] flex items-start gap-3.5 shadow-2xs">
            <div className="p-2 rounded-xl bg-[#FAF4E0] border border-[#E5BB45]/40 text-[#171714] shrink-0 mt-0.5">
              <ShieldCheck className="w-4 h-4 text-[#B89020]" />
            </div>
            <div className="space-y-0.5 text-xs">
              <h2 className="font-bold text-[#171714] text-xs sm:text-sm">
                Deterministic matching engine with auditable resolution
              </h2>
              <p className="text-[#66645C] leading-relaxed">
                Candidate relationships are evaluated across strict boundary rules: exact
                references, inter-account transfer direction, and calendar tolerances. Ambiguous
                pairings are marked as Needs Review rather than guessed. Confirmed pairings
                transition underlying transactions to reconciled status.
              </p>
            </div>
          </div>

          {/* Action Success / Error Notifications */}
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
        </section>

        {/* ============================================================ */}
        {/* Run Selector & Active Run Context Bar                        */}
        {/* ============================================================ */}
        <section className="bg-white rounded-2xl border border-[#E8E7E2] p-5 shadow-2xs space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Run Selection Dropdown */}
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="run-selector"
                className="text-xs font-semibold uppercase tracking-wider text-[#66645C]"
              >
                Reconciliation Run:
              </label>

              {isRunsLoading ? (
                <div className="h-9 w-64 bg-[#F8F7F2] rounded-xl animate-pulse" />
              ) : runs.length === 0 ? (
                <span className="text-xs text-[#66645C] italic">No reconciliation runs found</span>
              ) : (
                <div className="relative">
                  <select
                    id="run-selector"
                    value={activeRun?.id || ''}
                    onChange={(e) => {
                      setSelectedRunId(e.target.value);
                      setMatchesPage(1);
                    }}
                    className="appearance-none pl-3 pr-8 py-1.5 rounded-xl border border-[#E8E7E2] bg-[#F8F7F2] text-xs font-mono font-medium text-[#171714] focus:outline-none focus:ring-2 focus:ring-[#E5BB45] cursor-pointer"
                  >
                    {runs.map((r) => (
                      <option key={r.id} value={r.id}>
                        Run {r.id.substring(0, 8)}... ({r.status}) &bull;{' '}
                        {new Date(r.createdAt).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-[#66645C] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              )}

              {activeRun && (
                <div className="flex items-center gap-2">
                  {renderRunStatusBadge(activeRun.status)}
                  <span className="text-xs text-[#66645C]">
                    Rules:{' '}
                    <strong className="text-[#171714] font-mono">{activeRun.rulesVersion}</strong>
                  </span>
                  <span className="text-xs text-[#66645C]">
                    Tolerance:{' '}
                    <strong className="text-[#171714]">±{activeRun.dateToleranceDays}d</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Run Metadata Details */}
            {activeRun && (
              <div className="flex flex-wrap items-center gap-4 text-xs text-[#66645C]">
                <div>
                  Scope:{' '}
                  <span className="font-semibold text-[#171714]">
                    {activeRun.accountId
                      ? accountsMap.get(activeRun.accountId)?.name || 'Specified Account'
                      : 'All Organization Accounts'}
                  </span>
                </div>
                {activeRun.targetAccountId && (
                  <div>
                    Target:{' '}
                    <span className="font-semibold text-[#171714]">
                      {accountsMap.get(activeRun.targetAccountId)?.name || 'Target Account'}
                    </span>
                  </div>
                )}
                <div>
                  Executed:{' '}
                  <span className="font-semibold text-[#171714]">
                    {new Date(activeRun.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Run Error Summary if run failed or had errors */}
          {activeRun?.errorMessage && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Run Notice: {activeRun.errorMessage}</span>
            </div>
          )}
        </section>

        {/* ============================================================ */}
        {/* Reconciliation Summary Metrics Strip                         */}
        {/* ============================================================ */}
        {activeRun && (
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {/* 1. Analyzed Transactions */}
            <div className="bg-white rounded-2xl border border-[#E8E7E2] p-5 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-[#66645C]">
                <span>Analyzed Records</span>
                <Scale className="w-4 h-4 text-[#66645C]" />
              </div>
              <div className="text-2xl sm:text-3xl font-serif text-[#171714]">
                {activeRun.totalSourceTransactions.toLocaleString()}
              </div>
              <p className="text-xs text-[#66645C]">Unreconciled transactions processed</p>
            </div>

            {/* 2. Suggested Matches */}
            <div className="bg-white rounded-2xl border border-[#E8E7E2] p-5 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
                <span>Suggested Matches</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl sm:text-3xl font-serif text-emerald-700">
                {activeRun.matchedCount.toLocaleString()}
              </div>
              <p className="text-xs text-[#66645C]">High-confidence candidates</p>
            </div>

            {/* 3. Needs Review */}
            <div className="bg-white rounded-2xl border border-[#E8E7E2] p-5 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-800">
                <span>Needs Review</span>
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl sm:text-3xl font-serif text-amber-700">
                {activeRun.reviewCount.toLocaleString()}
              </div>
              <p className="text-xs text-[#66645C]">Competing or ambiguous candidates</p>
            </div>

            {/* 4. Unmatched Records */}
            <div className="bg-white rounded-2xl border border-[#E8E7E2] p-5 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-[#66645C]">
                <span>Unmatched Records</span>
                <Clock className="w-4 h-4 text-[#66645C]" />
              </div>
              <div className="text-2xl sm:text-3xl font-serif text-[#171714]">
                {activeRun.unmatchedCount.toLocaleString()}
              </div>
              <p className="text-xs text-[#66645C]">No eligible counterparty detected</p>
            </div>
          </section>
        )}

        {/* ============================================================ */}
        {/* Filter, Search & Match Review Section                        */}
        {/* ============================================================ */}
        <section className="bg-white rounded-2xl border border-[#E8E7E2] shadow-2xs overflow-hidden">
          {/* Section Subheader & Filter Controls */}
          <div className="p-5 border-b border-[#E8E7E2] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-[#171714]">
                  Reconciliation Candidate Ledger
                </h2>
                <p className="text-xs text-[#66645C] mt-0.5">
                  Review pairings generated by the rule engine. Compare amounts, references, and
                  dates.
                </p>
              </div>

              {/* Status Segmented Tabs */}
              <div className="flex overflow-x-auto max-w-full rounded-xl bg-[#F8F7F2] p-1 border border-[#E8E7E2] text-xs py-1">
                {(
                  [
                    { id: 'all', label: 'All Records' },
                    { id: 'needs_review', label: 'Needs Review' },
                    { id: 'suggested', label: 'Suggested' },
                    { id: 'confirmed', label: 'Confirmed' },
                    { id: 'rejected', label: 'Rejected' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setStatusFilter(tab.id);
                      setMatchesPage(1);
                    }}
                    className={`whitespace-nowrap px-3 py-1.5 min-h-[36px] flex items-center rounded-lg font-medium transition-all cursor-pointer ${
                      statusFilter === tab.id
                        ? 'bg-white text-[#171714] font-bold shadow-2xs'
                        : 'text-[#66645C] hover:text-[#171714]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input & Method Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Search */}
              <div className="relative sm:col-span-2">
                <Search className="w-4 h-4 text-[#66645C] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filter by counterparty description, reference, or reason..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-[#E8E7E2] bg-[#F8F7F2] text-xs text-[#171714] placeholder-[#66645C] focus:outline-none focus:ring-2 focus:ring-[#E5BB45]"
                />
              </div>

              {/* Method Filter Dropdown */}
              <div className="relative">
                <select
                  value={methodFilter}
                  onChange={(e) =>
                    setMethodFilter(e.target.value as ReconciliationMatchMethod | 'all')
                  }
                  className="w-full appearance-none pl-3 pr-8 py-2 rounded-xl border border-[#E8E7E2] bg-[#F8F7F2] text-xs text-[#171714] focus:outline-none focus:ring-2 focus:ring-[#E5BB45] cursor-pointer"
                >
                  <option value="all">All Matching Methods</option>
                  <option value="exact_reference">Exact Reference</option>
                  <option value="transfer_match">Transfer Match</option>
                  <option value="amount_date_reference">Amount + Date + Ref</option>
                  <option value="amount_date_description">Amount + Date + Desc</option>
                  <option value="manual">Manual Review</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-[#66645C] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Matches List / Table Container */}
          {isMatchesLoading ? (
            <div className="p-8 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-28 bg-[#F8F7F2] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : isMatchesError ? (
            <div className="p-8 text-center space-y-3">
              <ShieldAlert className="w-8 h-8 text-rose-600 mx-auto" />
              <p className="text-sm font-semibold text-rose-900">
                {matchesError instanceof Error
                  ? matchesError.message
                  : 'Failed to retrieve reconciliation matches'}
              </p>
              <button
                type="button"
                onClick={() => refetchMatches()}
                className="px-4 py-2 rounded-xl bg-white border border-[#E8E7E2] hover:bg-[#F8F7F2] text-xs font-semibold text-[#171714] transition-colors"
              >
                Retry
              </button>
            </div>
          ) : !activeRun ? (
            <div className="p-12 text-center space-y-3">
              <Scale className="w-10 h-10 text-[#66645C] mx-auto opacity-40" />
              <h3 className="text-base font-bold text-[#171714]">No Reconciliation Runs Yet</h3>
              <p className="text-xs text-[#66645C] max-w-md mx-auto leading-relaxed">
                Execute your first deterministic reconciliation run to compare imported statement
                records across financial accounts.
              </p>
              <button
                type="button"
                onClick={() => setIsNewRunModalOpen(true)}
                className="inline-flex items-center gap-2 bg-[#E5BB45] hover:bg-[#D3A82F] text-[#171714] text-xs font-semibold py-2 px-4 rounded-full transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Execute First Run</span>
              </button>
            </div>
          ) : filteredMatches.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-[#66645C] mx-auto opacity-40" />
              <h3 className="text-base font-bold text-[#171714]">No Matches Found</h3>
              <p className="text-xs text-[#66645C] max-w-md mx-auto leading-relaxed">
                {searchTerm || statusFilter !== 'all' || methodFilter !== 'all'
                  ? 'No reconciliation pairs match your active filter criteria. Try resetting filters.'
                  : 'This reconciliation run completed with no matches for the selected configuration.'}
              </p>
              {(searchTerm || statusFilter !== 'all' || methodFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('all');
                    setMethodFilter('all');
                    setSearchTerm('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white border border-[#E8E7E2] hover:bg-[#F8F7F2] text-xs font-medium text-[#171714]"
                >
                  Reset Filters
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[#E8E7E2]">
              {filteredMatches.map((match) => {
                const src = match.sourceTransaction;
                const cand = match.candidateTransaction;
                const srcAccount = src?.accountId ? accountsMap.get(src.accountId) : null;
                const candAccount = cand?.accountId ? accountsMap.get(cand.accountId) : null;

                return (
                  <div
                    key={match.id}
                    className="p-5 hover:bg-[#FAF9F5] transition-colors space-y-3.5"
                  >
                    {/* Row Header: Status, Method, Score & Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex flex-wrap items-center gap-2.5">
                        {renderMatchStatusBadge(match.status)}
                        {renderMethodBadge(match.matchMethod)}
                        <span className="text-[#66645C]">&bull;</span>
                        <span className="text-xs font-mono font-semibold text-[#171714]">
                          Score: {match.matchScore}%
                        </span>
                        {match.evidence?.dateDifferenceDays !== undefined && (
                          <span className="text-xs text-[#66645C]">
                            Date diff:{' '}
                            <strong className="text-[#171714]">
                              {match.evidence.dateDifferenceDays === 0
                                ? 'Same day'
                                : `${match.evidence.dateDifferenceDays}d`}
                            </strong>
                          </span>
                        )}
                        {match.amountDifferenceMinor !== 0 && (
                          <span className="text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            Amount Delta:{' '}
                            {formatCurrencyAmount(
                              match.amountDifferenceMinor,
                              src?.currency || 'USD',
                              true,
                            )}
                          </span>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => setInspectingMatch(match)}
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white border border-[#E8E7E2] hover:bg-[#F8F7F2] text-xs font-medium text-[#171714] transition-colors cursor-pointer flex-1 sm:flex-initial text-center"
                        >
                          Inspect Match
                        </button>

                        {match.status !== 'confirmed' && match.status !== 'rejected' && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmingMatch(match);
                                setConfirmNotes('');
                              }}
                              disabled={confirmMutation.isPending || rejectMutation.isPending}
                              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 flex-1 sm:flex-initial"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Confirm</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectingMatch(match);
                                setRejectionReason('');
                              }}
                              disabled={confirmMutation.isPending || rejectMutation.isPending}
                              className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 flex-1 sm:flex-initial"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Side-by-Side Dual-Entry Visual Comparison */}
                    <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-center">
                      {/* Left: Source Record */}
                      <div className="md:col-span-5 p-3.5 rounded-xl bg-white border border-[#E8E7E2] space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-[#66645C] uppercase tracking-wider">
                            Source Transaction
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#F8F7F2] text-[#171714] font-medium border border-[#E8E7E2]">
                            {srcAccount?.name || 'Account'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm sm:text-base font-bold text-[#171714]">
                            {src
                              ? formatCurrencyAmount(src.amountMinor, src.currency, true, true)
                              : 'N/A'}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                              src?.direction === 'debit'
                                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {src?.direction || 'N/A'}
                          </span>
                        </div>
                        <p className="text-xs text-[#171714] font-medium line-clamp-1">
                          {src?.description || 'No description provided'}
                        </p>
                        <div className="flex items-center justify-between text-[11px] text-[#66645C] pt-1 border-t border-[#F8F7F2]">
                          <span>
                            Date: {src?.date ? new Date(src.date).toLocaleDateString() : 'N/A'}
                          </span>
                          <span>Ref: {src?.sourceReference || 'None'}</span>
                        </div>
                      </div>

                      {/* Center: Direction / Transfer Indicator */}
                      <div className="md:col-span-1 flex flex-col items-center justify-center py-1">
                        <div className="w-8 h-8 rounded-full bg-[#FAF4E0] border border-[#E5BB45]/40 flex items-center justify-center text-[#171714]">
                          <ArrowRight className="w-4 h-4 text-[#B89020] rotate-90 md:rotate-0" />
                        </div>
                      </div>

                      {/* Right: Candidate Record */}
                      <div className="md:col-span-5 p-3.5 rounded-xl bg-white border border-[#E8E7E2] space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-[#66645C] uppercase tracking-wider">
                            Candidate Transaction
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#F8F7F2] text-[#171714] font-medium border border-[#E8E7E2]">
                            {candAccount?.name || (cand ? 'Account' : 'None')}
                          </span>
                        </div>

                        {cand ? (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-sm sm:text-base font-bold text-[#171714]">
                                {formatCurrencyAmount(cand.amountMinor, cand.currency, true, true)}
                              </span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                                  cand.direction === 'debit'
                                    ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                }`}
                              >
                                {cand.direction}
                              </span>
                            </div>
                            <p className="text-xs text-[#171714] font-medium line-clamp-1">
                              {cand.description}
                            </p>
                            <div className="flex items-center justify-between text-[11px] text-[#66645C] pt-1 border-t border-[#F8F7F2]">
                              <span>Date: {new Date(cand.date).toLocaleDateString()}</span>
                              <span>Ref: {cand.sourceReference || 'None'}</span>
                            </div>
                          </>
                        ) : (
                          <div className="py-4 text-center text-xs text-[#66645C] italic">
                            Unmatched — No direct counterparty detected
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Review Reason / Competing Candidates Notification */}
                    {match.reviewReason && (
                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="font-medium">Review Reason: {match.reviewReason}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination Controls */}
          {matchesPagination.totalPages > 1 && (
            <div className="p-4 border-t border-[#E8E7E2] bg-[#FAF9F5] flex items-center justify-between text-xs text-[#66645C]">
              <span>
                Page {matchesPagination.page} of {matchesPagination.totalPages} (
                {matchesPagination.totalItems} total matches)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMatchesPage((p) => Math.max(1, p - 1))}
                  disabled={matchesPagination.page <= 1}
                  className="px-3 py-1.5 rounded-lg bg-white border border-[#E8E7E2] hover:bg-[#F8F7F2] text-[#171714] font-medium disabled:opacity-50 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMatchesPage((p) => Math.min(matchesPagination.totalPages, p + 1))
                  }
                  disabled={matchesPagination.page >= matchesPagination.totalPages}
                  className="px-3 py-1.5 rounded-lg bg-white border border-[#E8E7E2] hover:bg-[#F8F7F2] text-[#171714] font-medium disabled:opacity-50 transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ============================================================ */}
      {/* Modal 1: Inspect Match Side-by-Side Detail View              */}
      {/* ============================================================ */}
      {inspectingMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171714]/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-2xl bg-white rounded-3xl border border-[#E8E7E2] shadow-2xl overflow-hidden space-y-5 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-[#E8E7E2] flex items-center justify-between bg-[#F8F7F2]">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#66645C]">
                  <span>Candidate Match Inspection</span>
                  <span>&bull;</span>
                  <span className="font-mono text-[#171714]">
                    ID: {inspectingMatch.id.substring(0, 8)}...
                  </span>
                </div>
                <h3 className="text-xl font-serif text-[#171714] mt-1">
                  Dual-Entry Pair Verification
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectingMatch(null)}
                className="p-1.5 rounded-full hover:bg-white text-[#66645C] hover:text-[#171714] transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
              {/* Status & Method Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#F8F7F2] border border-[#E8E7E2]">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#66645C]">Status:</span>
                  {renderMatchStatusBadge(inspectingMatch.status)}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#66645C]">Method:</span>
                  {renderMethodBadge(inspectingMatch.matchMethod)}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#66645C]">Confidence:</span>
                  <span className="font-mono font-bold text-[#171714]">
                    {inspectingMatch.matchScore}%
                  </span>
                </div>
              </div>

              {/* Side-by-side transaction breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Source Transaction */}
                <div className="p-4 rounded-2xl bg-white border border-[#E8E7E2] space-y-3">
                  <div className="font-bold text-xs uppercase tracking-wider text-[#66645C]">
                    Source Transaction
                  </div>
                  <div className="space-y-1">
                    <div className="text-lg font-serif text-[#171714]">
                      {inspectingMatch.sourceTransaction
                        ? formatCurrencyAmount(
                            inspectingMatch.sourceTransaction.amountMinor,
                            inspectingMatch.sourceTransaction.currency,
                            true,
                            true,
                          )
                        : 'N/A'}
                    </div>
                    <p className="font-medium text-[#171714]">
                      {inspectingMatch.sourceTransaction?.description}
                    </p>
                  </div>
                  <div className="space-y-1 text-[#66645C] pt-2 border-t border-[#E8E7E2]">
                    <div>
                      Account:{' '}
                      <strong className="text-[#171714]">
                        {accountsMap.get(inspectingMatch.sourceTransaction?.accountId || '')
                          ?.name || 'Account'}
                      </strong>
                    </div>
                    <div>
                      Date:{' '}
                      <strong className="text-[#171714]">
                        {inspectingMatch.sourceTransaction?.date
                          ? new Date(inspectingMatch.sourceTransaction.date).toLocaleDateString()
                          : 'N/A'}
                      </strong>
                    </div>
                    <div>
                      Direction:{' '}
                      <strong className="capitalize text-[#171714]">
                        {inspectingMatch.sourceTransaction?.direction}
                      </strong>
                    </div>
                    <div>
                      Reference:{' '}
                      <strong className="font-mono text-[#171714]">
                        {inspectingMatch.sourceTransaction?.sourceReference || 'None'}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Candidate Transaction */}
                <div className="p-4 rounded-2xl bg-white border border-[#E8E7E2] space-y-3">
                  <div className="font-bold text-xs uppercase tracking-wider text-[#66645C]">
                    Candidate Counterparty
                  </div>
                  {inspectingMatch.candidateTransaction ? (
                    <>
                      <div className="space-y-1">
                        <div className="text-lg font-serif text-[#171714]">
                          {formatCurrencyAmount(
                            inspectingMatch.candidateTransaction.amountMinor,
                            inspectingMatch.candidateTransaction.currency,
                            true,
                            true,
                          )}
                        </div>
                        <p className="font-medium text-[#171714]">
                          {inspectingMatch.candidateTransaction.description}
                        </p>
                      </div>
                      <div className="space-y-1 text-[#66645C] pt-2 border-t border-[#E8E7E2]">
                        <div>
                          Account:{' '}
                          <strong className="text-[#171714]">
                            {accountsMap.get(inspectingMatch.candidateTransaction.accountId)
                              ?.name || 'Account'}
                          </strong>
                        </div>
                        <div>
                          Date:{' '}
                          <strong className="text-[#171714]">
                            {new Date(
                              inspectingMatch.candidateTransaction.date,
                            ).toLocaleDateString()}
                          </strong>
                        </div>
                        <div>
                          Direction:{' '}
                          <strong className="capitalize text-[#171714]">
                            {inspectingMatch.candidateTransaction.direction}
                          </strong>
                        </div>
                        <div>
                          Reference:{' '}
                          <strong className="font-mono text-[#171714]">
                            {inspectingMatch.candidateTransaction.sourceReference || 'None'}
                          </strong>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="py-8 text-center text-[#66645C] italic">
                      No candidate counterparty assigned
                    </div>
                  )}
                </div>
              </div>

              {/* Evidence Matrix */}
              <div className="space-y-2">
                <span className="font-bold text-[#171714] uppercase tracking-wider text-[11px]">
                  Matching Evidence Breakdown
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2]">
                    <span className="text-[#66645C]">Amount Match</span>
                    <p className="font-semibold text-[#171714] mt-0.5">
                      {inspectingMatch.evidence?.amountMatch ? '✓ Exact Match' : '≠ Discrepancy'}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2]">
                    <span className="text-[#66645C]">Direction Compatibility</span>
                    <p className="font-semibold text-[#171714] mt-0.5">
                      {inspectingMatch.evidence?.directionCompatible
                        ? '✓ Dual Entry'
                        : '≠ Incompatible'}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2]">
                    <span className="text-[#66645C]">Date Difference</span>
                    <p className="font-semibold text-[#171714] mt-0.5">
                      {inspectingMatch.evidence?.dateDifferenceDays !== undefined
                        ? `${inspectingMatch.evidence.dateDifferenceDays} Days`
                        : '0 Days'}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2]">
                    <span className="text-[#66645C]">Reference Match</span>
                    <p className="font-semibold text-[#171714] mt-0.5">
                      {inspectingMatch.evidence?.externalReferenceMatch
                        ? '✓ Verified Match'
                        : 'None'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Notes / Rationale */}
              {inspectingMatch.reviewReason && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Review Reason:</span>
                    <p className="mt-0.5 text-[#66645C]">{inspectingMatch.reviewReason}</p>
                  </div>
                </div>
              )}

              {inspectingMatch.rejectionReason && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-2.5">
                  <Ban className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Rejection Reason:</span>
                    <p className="mt-0.5">{inspectingMatch.rejectionReason}</p>
                  </div>
                </div>
              )}

              {inspectingMatch.confirmedAt && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Confirmed on {new Date(inspectingMatch.confirmedAt).toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-6 border-t border-[#E8E7E2] bg-[#F8F7F2] flex items-center justify-between">
              <button
                type="button"
                onClick={() => setInspectingMatch(null)}
                className="px-4 py-2 rounded-xl border border-[#E8E7E2] bg-white text-xs font-semibold text-[#171714] hover:bg-[#F8F7F2]"
              >
                Close
              </button>

              {inspectingMatch.status !== 'confirmed' && inspectingMatch.status !== 'rejected' && (
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingMatch(inspectingMatch);
                      setRejectionReason('');
                    }}
                    className="px-4 py-2 rounded-xl border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 text-xs font-semibold"
                  >
                    Reject Candidate
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingMatch(inspectingMatch);
                      setConfirmNotes('');
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs"
                  >
                    Confirm Match
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* Modal 2: Confirm Match Dialog                                */}
      {/* ============================================================ */}
      {confirmingMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171714]/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-3xl border border-[#E8E7E2] shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-emerald-700 font-bold text-base">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>Confirm Reconciliation Match</span>
            </div>

            <p className="text-xs text-[#66645C] leading-relaxed">
              Confirming this match will link the source transaction to the candidate counterparty
              and mark both records as <strong className="text-[#171714]">reconciled</strong>.
            </p>

            <div className="space-y-1">
              <label htmlFor="confirm-notes" className="text-xs font-semibold text-[#171714]">
                Audit Notes (Optional):
              </label>
              <textarea
                id="confirm-notes"
                value={confirmNotes}
                onChange={(e) => setConfirmNotes(e.target.value)}
                placeholder="e.g. Verified wire reference with bank settlement advisor."
                className="w-full p-3 rounded-xl border border-[#E8E7E2] bg-[#F8F7F2] text-xs text-[#171714] placeholder-[#66645C] focus:outline-none focus:ring-2 focus:ring-[#E5BB45] min-h-[80px]"
                maxLength={500}
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmingMatch(null)}
                disabled={confirmMutation.isPending}
                className="px-4 py-2 rounded-xl border border-[#E8E7E2] bg-white text-xs font-semibold text-[#66645C] hover:text-[#171714]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmingMatch) {
                    confirmMutation.mutate({
                      matchId: confirmingMatch.id,
                      notes: confirmNotes.trim() || undefined,
                    });
                  }
                }}
                disabled={confirmMutation.isPending}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>{confirmMutation.isPending ? 'Confirming...' : 'Confirm Match'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* Modal 3: Reject Match Dialog (Mandatory Reason)               */}
      {/* ============================================================ */}
      {rejectingMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171714]/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-3xl border border-[#E8E7E2] shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-rose-700 font-bold text-base">
              <Ban className="w-5 h-5 text-rose-600" />
              <span>Reject Candidate Match</span>
            </div>

            <p className="text-xs text-[#66645C] leading-relaxed">
              An auditable justification is required before rejecting this candidate. Both records
              will remain unreconciled for subsequent runs.
            </p>

            <div className="space-y-1">
              <label htmlFor="rejection-reason" className="text-xs font-semibold text-[#171714]">
                Rejection Reason (Required):
              </label>
              <textarea
                id="rejection-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Unrelated vendor invoice with coincidental payment amount."
                className="w-full p-3 rounded-xl border border-[#E8E7E2] bg-[#F8F7F2] text-xs text-[#171714] placeholder-[#66645C] focus:outline-none focus:ring-2 focus:ring-rose-500 min-h-[90px]"
                maxLength={500}
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRejectingMatch(null)}
                disabled={rejectMutation.isPending}
                className="px-4 py-2 rounded-xl border border-[#E8E7E2] bg-white text-xs font-semibold text-[#66645C] hover:text-[#171714]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (rejectingMatch && rejectionReason.trim()) {
                    rejectMutation.mutate({
                      matchId: rejectingMatch.id,
                      reason: rejectionReason.trim(),
                    });
                  }
                }}
                disabled={!rejectionReason.trim() || rejectMutation.isPending}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
              >
                <X className="w-4 h-4" />
                <span>{rejectMutation.isPending ? 'Rejecting...' : 'Confirm Rejection'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* Modal 4: Execute New Reconciliation Run                      */}
      {/* ============================================================ */}
      {isNewRunModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171714]/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white rounded-3xl border border-[#E8E7E2] shadow-2xl p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-[#E8E7E2] pb-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#66645C]">
                  Dual-Entry Verification
                </span>
                <h3 className="text-xl font-serif text-[#171714]">Run Reconciliation Engine</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNewRunModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-[#F8F7F2] text-[#66645C] hover:text-[#171714]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {newRunFormError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center gap-2.5">
                <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{newRunFormError}</span>
              </div>
            )}

            <form onSubmit={handleNewRunSubmit} className="space-y-4 text-xs">
              {/* Source Account */}
              <div className="space-y-1">
                <label
                  htmlFor="new-run-source"
                  className="font-semibold text-[#171714] flex items-center justify-between"
                >
                  <span>Source Account (Optional)</span>
                  <span className="text-[#66645C] font-normal">Defaults to Organization-wide</span>
                </label>
                <select
                  id="new-run-source"
                  value={newRunAccountId}
                  onChange={(e) => setNewRunAccountId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E8E7E2] bg-[#F8F7F2] text-xs text-[#171714] focus:outline-none focus:ring-2 focus:ring-[#E5BB45]"
                >
                  <option value="">All Accounts (Organization-wide)</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.currency} &bull; {acc.type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Target Account */}
              <div className="space-y-1">
                <label htmlFor="new-run-target" className="font-semibold text-[#171714]">
                  Target Account (Optional Pairing Scope)
                </label>
                <select
                  id="new-run-target"
                  value={newRunTargetAccountId}
                  onChange={(e) => setNewRunTargetAccountId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E8E7E2] bg-[#F8F7F2] text-xs text-[#171714] focus:outline-none focus:ring-2 focus:ring-[#E5BB45]"
                >
                  <option value="">Any Other Financial Account</option>
                  {accounts
                    .filter((acc) => acc.id !== newRunAccountId)
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.currency} &bull; {acc.type})
                      </option>
                    ))}
                </select>
              </div>

              {/* Date Tolerance */}
              <div className="space-y-1">
                <label htmlFor="new-run-tolerance" className="font-semibold text-[#171714]">
                  Date Tolerance Window (Days)
                </label>
                <select
                  id="new-run-tolerance"
                  value={newRunTolerance}
                  onChange={(e) => setNewRunTolerance(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-[#E8E7E2] bg-[#F8F7F2] text-xs text-[#171714] focus:outline-none focus:ring-2 focus:ring-[#E5BB45]"
                >
                  <option value={0}>Exact Date Only (0 calendar days)</option>
                  <option value={1}>± 1 Calendar Day</option>
                  <option value={3}>± 3 Calendar Days (Recommended)</option>
                  <option value={7}>± 7 Calendar Days</option>
                  <option value={14}>± 14 Calendar Days</option>
                </select>
              </div>

              {/* Date Range Filters */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="new-run-start" className="font-semibold text-[#171714]">
                    Start Date (Optional)
                  </label>
                  <input
                    id="new-run-start"
                    type="date"
                    value={newRunStartDate}
                    onChange={(e) => setNewRunStartDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-[#E8E7E2] bg-[#F8F7F2] text-xs text-[#171714] focus:outline-none focus:ring-2 focus:ring-[#E5BB45]"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="new-run-end" className="font-semibold text-[#171714]">
                    End Date (Optional)
                  </label>
                  <input
                    id="new-run-end"
                    type="date"
                    value={newRunEndDate}
                    onChange={(e) => setNewRunEndDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-[#E8E7E2] bg-[#F8F7F2] text-xs text-[#171714] focus:outline-none focus:ring-2 focus:ring-[#E5BB45]"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#FAF4E0] border border-[#E5BB45]/40 text-xs text-[#171714]">
                <p className="leading-relaxed">
                  The reconciliation engine operates deterministically across transactions in{' '}
                  <strong className="font-semibold">{organizationName}</strong>. Unmatched or
                  ambiguous candidates are preserved for review.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E8E7E2]">
                <button
                  type="button"
                  onClick={() => setIsNewRunModalOpen(false)}
                  disabled={createRunMutation.isPending}
                  className="px-4 py-2 rounded-xl border border-[#E8E7E2] bg-white text-xs font-semibold text-[#66645C] hover:text-[#171714]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createRunMutation.isPending}
                  className="px-5 py-2.5 rounded-xl bg-[#E5BB45] hover:bg-[#D3A82F] text-[#171714] text-xs font-bold shadow-2xs disabled:opacity-50 flex items-center gap-2"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{createRunMutation.isPending ? 'Executing Engine...' : 'Start Run'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* Modal 5: Audit Trail Drawer                                  */}
      {/* ============================================================ */}
      {isAuditTrailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171714]/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-xl bg-white rounded-3xl border border-[#E8E7E2] shadow-2xl p-6 sm:p-8 space-y-5 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[#E8E7E2] pb-4">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#66645C]">
                  Run Event Log
                </span>
                <h3 className="text-xl font-serif text-[#171714]">Reconciliation Audit Trail</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAuditTrailOpen(false)}
                className="p-1.5 rounded-full hover:bg-[#F8F7F2] text-[#66645C] hover:text-[#171714]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {isAuditTrailLoading ? (
                <div className="py-8 text-center text-[#66645C]">Loading audit events...</div>
              ) : !auditTrailData?.items || auditTrailData.items.length === 0 ? (
                <div className="py-8 text-center text-[#66645C] italic">
                  No audit events recorded for this reconciliation run.
                </div>
              ) : (
                auditTrailData.items.map((event) => (
                  <div
                    key={event.id}
                    className="p-3.5 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-white border border-[#E8E7E2] text-[#171714]">
                        {event.action.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[11px] text-[#66645C]">
                        {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <pre className="text-[11px] font-mono text-[#66645C] bg-white p-2 rounded-lg border border-[#E8E7E2] overflow-x-auto mt-1.5">
                      {JSON.stringify(event.details, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-[#E8E7E2] flex items-center justify-between">
              {activeRunId ? (
                <Link
                  to={`/reconciliation/runs/${activeRunId}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#171714] hover:underline"
                >
                  <FileText className="w-3.5 h-3.5 text-[#E5BB45]" />
                  <span>Open Full Details & Audit Page</span>
                </Link>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={() => setIsAuditTrailOpen(false)}
                className="px-4 py-2 rounded-xl bg-white border border-[#E8E7E2] text-xs font-semibold text-[#171714] hover:bg-[#F8F7F2]"
              >
                Close Audit Trail
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};
