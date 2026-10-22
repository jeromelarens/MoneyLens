import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { financialService } from '../services/financial.service';
import type { FinancialAccount, ReconciliationMatchStatus } from '@moneylens/shared';
import {
  ArrowLeftRight,
  Play,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Check,
  X,
  RefreshCw,
  ShieldAlert,
  ListOrdered,
} from 'lucide-react';

interface ReconciliationDashboardProps {
  accounts: FinancialAccount[];
}

export const ReconciliationDashboard: React.FC<ReconciliationDashboardProps> = ({ accounts }) => {
  const queryClient = useQueryClient();

  // Run Controls State
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [targetAccountId, setTargetAccountId] = useState<string>('');
  const [dateToleranceDays, setDateToleranceDays] = useState<number>(3);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // View & Filter State
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReconciliationMatchStatus | 'all'>('all');
  const [confirmingMatchId, setConfirmingMatchId] = useState<string | null>(null);
  const [rejectingMatchId, setRejectingMatchId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [isAuditTrailOpen, setIsAuditTrailOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Queries
  const { data: runsData, refetch: refetchRuns } = useQuery({
    queryKey: ['reconciliation-runs'],
    queryFn: () => financialService.getReconciliationRuns(1, 10),
  });

  const {
    data: matchesData,
    isLoading: isMatchesLoading,
    refetch: refetchMatches,
  } = useQuery({
    queryKey: ['reconciliation-matches', selectedRunId, statusFilter],
    queryFn: () =>
      financialService.getReconciliationMatches({
        runId: selectedRunId || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        pageSize: 50,
      }),
  });

  const { data: auditTrailData } = useQuery({
    queryKey: ['reconciliation-audit-trail', selectedRunId],
    queryFn: () =>
      selectedRunId ? financialService.getReconciliationAuditTrail(selectedRunId) : null,
    enabled: Boolean(selectedRunId && isAuditTrailOpen),
  });

  // Run Execution Mutation
  const createRunMutation = useMutation({
    mutationFn: financialService.createReconciliationRun,
    onSuccess: (newRun) => {
      setSelectedRunId(newRun.id);
      queryClient.invalidateQueries({ queryKey: ['reconciliation-runs'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-matches'] });
      setActionError(null);
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to start reconciliation run');
    },
  });

  // Confirm Mutation with conflict refresh and rapid-click lock
  const confirmMutation = useMutation({
    mutationFn: ({ matchId, notes }: { matchId: string; notes?: string }) =>
      financialService.confirmMatch(matchId, notes),
    onSuccess: () => {
      setConfirmingMatchId(null);
      queryClient.invalidateQueries({ queryKey: ['reconciliation-matches'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-runs'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setActionError(null);
    },
    onError: (err: Error) => {
      setConfirmingMatchId(null);
      setActionError(err.message || 'Failed to confirm match');
      // Invalidate on 409 conflict to clear stale candidates
      queryClient.invalidateQueries({ queryKey: ['reconciliation-matches'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-runs'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  // Reject Mutation with conflict refresh
  const rejectMutation = useMutation({
    mutationFn: ({ matchId, reason }: { matchId: string; reason: string }) =>
      financialService.rejectMatch(matchId, reason),
    onSuccess: () => {
      setRejectingMatchId(null);
      setRejectionReason('');
      queryClient.invalidateQueries({ queryKey: ['reconciliation-matches'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-runs'] });
      setActionError(null);
    },
    onError: (err: Error) => {
      setActionError(err.message || 'Failed to reject match');
      queryClient.invalidateQueries({ queryKey: ['reconciliation-matches'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-runs'] });
    },
  });

  const handleStartRun = () => {
    setActionError(null);
    createRunMutation.mutate({
      accountId: selectedAccountId || undefined,
      targetAccountId: targetAccountId || undefined,
      dateToleranceDays,
      startDate: startDate ? new Date(startDate).toISOString() : undefined,
      endDate: endDate ? new Date(endDate).toISOString() : undefined,
    });
  };

  const activeRun = runsData?.items.find((r) => r.id === selectedRunId) || runsData?.items[0];

  return (
    <div className="space-y-8">
      {/* 1. Header & Execution Controls */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
              Phase 3 &bull; Financial Reconciliation Engine
            </div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5 text-emerald-400" />
              Automated Transaction Reconciliation
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Compare imported statement records, detect inter-account transfers, match external
              references, and review candidate relationships.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                refetchRuns();
                refetchMatches();
              }}
              className="px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>

            <button
              onClick={handleStartRun}
              disabled={createRunMutation.isPending}
              className="px-4 py-2 text-xs font-semibold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              {createRunMutation.isPending ? 'Running Engine...' : 'Run Reconciliation'}
            </button>
          </div>
        </div>

        {/* Action Error Banner */}
        {actionError && (
          <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center gap-3 text-rose-400 text-xs">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Configuration Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Source Account</label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-700 bg-slate-800/80 text-white px-3 py-2 focus:outline-none focus:border-emerald-500"
            >
              <option value="">All Accounts (Organization-wide)</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.currency})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Target Account (Optional)
            </label>
            <select
              value={targetAccountId}
              onChange={(e) => setTargetAccountId(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-700 bg-slate-800/80 text-white px-3 py-2 focus:outline-none focus:border-emerald-500"
            >
              <option value="">Any Other Account</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.currency})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Date Tolerance</label>
            <select
              value={dateToleranceDays}
              onChange={(e) => setDateToleranceDays(Number(e.target.value))}
              className="w-full text-xs rounded-lg border border-slate-700 bg-slate-800/80 text-white px-3 py-2 focus:outline-none focus:border-emerald-500"
            >
              <option value={0}>Exact Date Only (0 days)</option>
              <option value={1}>± 1 Calendar Day</option>
              <option value={3}>± 3 Calendar Days (Default)</option>
              <option value={7}>± 7 Calendar Days</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Date Range (Optional)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-700 bg-slate-800/80 text-white px-2 py-2 focus:outline-none focus:border-emerald-500"
              />
              <span className="text-slate-500 text-xs">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full text-xs rounded-lg border border-slate-700 bg-slate-800/80 text-white px-2 py-2 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Run Statistics & History */}
      {activeRun && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              Active Run: <strong className="text-slate-200">{activeRun.id}</strong> &bull; Rules:{' '}
              <strong className="text-emerald-400">{activeRun.rulesVersion}</strong>
            </span>
            <button
              onClick={() => setIsAuditTrailOpen((prev) => !prev)}
              className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium transition-colors cursor-pointer"
            >
              <ListOrdered className="w-3.5 h-3.5" />
              {isAuditTrailOpen ? 'Hide Audit Trail' : 'View Audit Trail'}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <span className="text-xs text-slate-400">Total Analyzed</span>
              <div className="text-2xl font-bold text-white mt-1">
                {activeRun.totalSourceTransactions}
              </div>
              <span className="text-[11px] text-slate-500">Unreconciled transactions</span>
            </div>

            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Suggested Matches
              </span>
              <div className="text-2xl font-bold text-emerald-300 mt-1">
                {activeRun.matchedCount}
              </div>
              <span className="text-[11px] text-emerald-500/80">High confidence matches</span>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <span className="text-xs text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                Needs Review
              </span>
              <div className="text-2xl font-bold text-amber-300 mt-1">{activeRun.reviewCount}</div>
              <span className="text-[11px] text-amber-500/80">Competing / partial candidates</span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Unmatched Records
              </span>
              <div className="text-2xl font-bold text-slate-300 mt-1">
                {activeRun.unmatchedCount}
              </div>
              <span className="text-[11px] text-slate-500">No candidate found</span>
            </div>
          </div>

          {/* Audit Trail Drawer */}
          {isAuditTrailOpen && auditTrailData && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2">
              <span className="text-xs font-semibold text-slate-300">Run Audit Trail</span>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {auditTrailData.items.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between text-xs py-1 border-b border-slate-900"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-800 text-emerald-400">
                        {event.action.replace('_', ' ')}
                      </span>
                      <span className="text-slate-400 text-[11px]">
                        {JSON.stringify(event.details)}
                      </span>
                    </div>
                    <span className="text-slate-500 text-[10px]">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Match Decision & Review Panel */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl backdrop-blur-md space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-white">
              Reconciliation Candidates & Review
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Review rule-based suggestions, inspect evidence, and confirm or reject pairings.
            </p>
          </div>

          {/* Status Tabs */}
          <div className="inline-flex rounded-lg bg-slate-800/80 p-1 border border-slate-700/60 text-xs">
            {(['all', 'suggested', 'needs_review', 'confirmed', 'rejected'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 rounded-md font-medium capitalize transition-all ${
                  statusFilter === tab
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Matches List */}
        {isMatchesLoading ? (
          <div className="py-12 text-center text-slate-500 text-xs">Loading candidates...</div>
        ) : !matchesData?.items || matchesData.items.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs space-y-2">
            <CheckCircle2 className="w-8 h-8 mx-auto text-slate-600" />
            <p className="font-medium text-slate-400">No reconciliation matches found</p>
            <p className="text-slate-500 max-w-sm mx-auto text-[11px]">
              Execute a reconciliation run or select a different filter status to inspect
              candidates.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {matchesData.items.map((match) => (
              <div
                key={match.id}
                className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-5 hover:border-slate-700 transition-all space-y-4"
              >
                {/* Match Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full font-semibold uppercase text-[10px] ${
                        match.status === 'confirmed'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : match.status === 'needs_review'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : match.status === 'rejected'
                              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              : 'bg-teal-500/10 text-teal-300 border border-teal-500/20'
                      }`}
                    >
                      {match.status.replace('_', ' ')}
                    </span>

                    <span className="text-slate-400">
                      Method:{' '}
                      <strong className="text-slate-200">
                        {match.matchMethod.replace('_', ' ')}
                      </strong>
                    </span>

                    <span className="text-slate-500">&bull;</span>
                    <span className="text-slate-400">
                      Score: <strong className="text-emerald-400">{match.matchScore}%</strong>
                    </span>
                  </div>

                  {/* Actions */}
                  {match.status !== 'confirmed' && match.status !== 'rejected' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setConfirmingMatchId(match.id);
                          confirmMutation.mutate({ matchId: match.id });
                        }}
                        disabled={
                          confirmingMatchId === match.id ||
                          confirmMutation.isPending ||
                          rejectMutation.isPending
                        }
                        className="px-3 py-1.5 text-xs font-semibold text-emerald-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        {confirmingMatchId === match.id ? 'Confirming...' : 'Confirm Match'}
                      </button>

                      <button
                        onClick={() => {
                          setRejectingMatchId(match.id);
                          setRejectionReason('');
                        }}
                        disabled={confirmMutation.isPending || rejectMutation.isPending}
                        className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-rose-500/20 hover:text-rose-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        Reject
                      </button>
                    </div>
                  )}

                  {match.status === 'confirmed' && (
                    <span className="text-emerald-400 text-xs font-medium flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Confirmed on{' '}
                      {match.confirmedAt
                        ? new Date(match.confirmedAt).toLocaleDateString()
                        : 'Confirmed'}
                    </span>
                  )}

                  {match.status === 'rejected' && (
                    <span className="text-rose-400 text-xs font-medium flex items-center gap-1">
                      <X className="w-3.5 h-3.5" /> Rejected: {match.rejectionReason}
                    </span>
                  )}
                </div>

                {/* Side-by-Side Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-900">
                  {/* Source Transaction */}
                  <div className="rounded-lg bg-slate-900/80 p-3.5 border border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Source Transaction
                    </span>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white">
                        {match.sourceTransaction?.currency} {match.sourceTransaction?.amountDecimal}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                          match.sourceTransaction?.direction === 'debit'
                            ? 'bg-rose-500/10 text-rose-400'
                            : 'bg-emerald-500/10 text-emerald-400'
                        }`}
                      >
                        {match.sourceTransaction?.direction}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 line-clamp-1">
                      {match.sourceTransaction?.description}
                    </p>
                    <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1">
                      <span>
                        Date:{' '}
                        {match.sourceTransaction?.date
                          ? new Date(match.sourceTransaction.date).toLocaleDateString()
                          : 'N/A'}
                      </span>
                      <span>Ref: {match.sourceTransaction?.sourceReference || 'None'}</span>
                    </div>
                  </div>

                  {/* Candidate Transaction */}
                  <div className="rounded-lg bg-slate-900/80 p-3.5 border border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Candidate Transaction
                    </span>
                    {match.candidateTransaction ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-white">
                            {match.candidateTransaction.currency}{' '}
                            {match.candidateTransaction.amountDecimal}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                              match.candidateTransaction.direction === 'debit'
                                ? 'bg-rose-500/10 text-rose-400'
                                : 'bg-emerald-500/10 text-emerald-400'
                            }`}
                          >
                            {match.candidateTransaction.direction}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 line-clamp-1">
                          {match.candidateTransaction.description}
                        </p>
                        <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1">
                          <span>
                            Date: {new Date(match.candidateTransaction.date).toLocaleDateString()}
                          </span>
                          <span>Ref: {match.candidateTransaction.sourceReference || 'None'}</span>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-slate-500 italic py-3">No direct pair</p>
                    )}
                  </div>
                </div>

                {/* Evidence & Review Reason */}
                {match.reviewReason && (
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span>{match.reviewReason}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Rejection Modal */}
      {rejectingMatchId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <X className="w-5 h-5 text-rose-400" /> Reject Reconciliation Match
            </h3>
            <p className="text-xs text-slate-400">
              Provide an auditable reason for rejecting this candidate match:
            </p>

            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Unrelated supplier invoices with coincidental amounts"
              className="w-full text-xs rounded-lg border border-slate-700 bg-slate-950 text-white p-3 focus:outline-none focus:border-rose-500 min-h-[90px]"
            />

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setRejectingMatchId(null)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (rejectingMatchId && rejectionReason.trim()) {
                    rejectMutation.mutate({
                      matchId: rejectingMatchId,
                      reason: rejectionReason.trim(),
                    });
                  }
                }}
                disabled={!rejectionReason.trim() || rejectMutation.isPending}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 rounded-lg shadow-lg shadow-rose-600/20 transition-all"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
