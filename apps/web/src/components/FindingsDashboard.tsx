import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { financialService } from '../services/financial.service';
import type {
  FinancialFinding,
  FindingStatus,
  FindingType,
  FindingSeverity,
  ReviewFindingAction,
  AiExplanation,
} from '@moneylens/shared';
import { formatCurrencyAmount } from '@moneylens/shared';
import {
  ShieldAlert,
  Play,
  RefreshCw,
  CheckCircle2,
  Sparkles,
  X,
  FileText,
  DollarSign,
  History,
  Info,
} from 'lucide-react';

export const FindingsDashboard: React.FC = () => {
  const queryClient = useQueryClient();

  // Filters State
  const [selectedType, setSelectedType] = useState<FindingType | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<FindingStatus | 'all'>('all');
  const [selectedSeverity, setSelectedSeverity] = useState<FindingSeverity | 'all'>('all');
  const [page, setPage] = useState<number>(1);

  // Detail Modal State
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [reviewAction, setReviewAction] = useState<ReviewFindingAction | null>(null);
  const [reviewReason, setReviewReason] = useState<string>('');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Summary Query
  const {
    data: summaryData,
    isLoading: isSummaryLoading,
    refetch: refetchSummary,
  } = useQuery({
    queryKey: ['findings-summary'],
    queryFn: financialService.getFindingsSummary,
  });

  // Findings List Query
  const {
    data: findingsData,
    isLoading: isFindingsLoading,
    refetch: refetchFindings,
  } = useQuery({
    queryKey: ['findings-list', page, selectedType, selectedStatus, selectedSeverity],
    queryFn: () =>
      financialService.getFindings({
        page,
        limit: 20,
        findingType: selectedType === 'all' ? undefined : selectedType,
        status: selectedStatus === 'all' ? undefined : selectedStatus,
        severity: selectedSeverity === 'all' ? undefined : selectedSeverity,
      }),
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
    mutationFn: financialService.triggerDetectionRun,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['findings-summary'] });
      queryClient.invalidateQueries({ queryKey: ['findings-list'] });
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
    onSuccess: () => {
      setReviewAction(null);
      setReviewReason('');
      setReviewNotes('');
      setReviewError(null);
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
    mutationFn: (findingId: string) => financialService.explainFinding(findingId),
    onSuccess: (data) => {
      setExplanation(data);
      if (selectedFindingId) {
        queryClient.invalidateQueries({ queryKey: ['finding-detail', selectedFindingId] });
      }
    },
  });

  const handleStartScan = () => {
    detectionRunMutation.mutate(undefined);
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

  return (
    <div className="space-y-8">
      {/* 1. Header & Controls */}
      <section className="rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
              <ShieldAlert className="w-3.5 h-3.5" />
              Phase 4 &bull; Leakage Detection & Explainable Intelligence
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Financial Findings & Exposure Radar
            </h2>
            <p className="text-sm text-slate-400 max-w-2xl">
              Deterministic, evidence-backed financial leak detection. Every finding is anchored to
              verifiable transaction records and clear inspection criteria.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRefresh}
              className="px-4 py-2 rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800 transition flex items-center gap-2 text-sm font-medium cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={handleStartScan}
              disabled={detectionRunMutation.isPending}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-semibold text-sm shadow-lg shadow-rose-500/20 disabled:opacity-50 flex items-center gap-2 transition cursor-pointer"
            >
              {detectionRunMutation.isPending ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              <span>
                {detectionRunMutation.isPending ? 'Analyzing Ledger...' : 'Run Leakage Scan'}
              </span>
            </button>
          </div>
        </div>

        {/* Scan Success / Status Notification */}
        {detectionRunMutation.isSuccess && detectionRunMutation.data && (
          <div className="mt-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Detection run complete: Evaluated {detectionRunMutation.data.transactionsEvaluated}{' '}
                transactions. Created {detectionRunMutation.data.findingsCreated} new findings,
                updated {detectionRunMutation.data.findingsUpdated},{' '}
                {detectionRunMutation.data.findingsUnchanged} unchanged.
              </span>
            </div>
            <span className="text-slate-400 font-mono">
              Status: {detectionRunMutation.data.status}
            </span>
          </div>
        )}
      </section>

      {/* 2. Exposure Metrics Partitioned by Currency */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            <span>Potential Exposure by Currency</span>
          </h3>
          <span className="text-xs text-slate-400">
            Strictly segregated &bull; Never blended across exchange rates
          </span>
        </div>

        {isSummaryLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-32 rounded-2xl bg-slate-900/50 animate-pulse border border-slate-800"
              />
            ))}
          </div>
        ) : summaryData && Object.keys(summaryData.byCurrency).length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.values(summaryData.byCurrency).map((item) => (
              <div
                key={item.currency}
                className="p-5 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-lg bg-slate-800 text-slate-200 text-xs font-bold font-mono">
                    {item.currency}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span>
                      {item.openFindingCount + item.underReviewFindingCount} active findings
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                  <div>
                    <div className="text-[11px] text-amber-400/90 font-medium">
                      Potential Exposure
                    </div>
                    <div className="text-xl font-bold text-white tracking-tight">
                      {item.currency}{' '}
                      {formatCurrencyAmount(item.potentialExposureMinor, item.currency)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-rose-400/90 font-medium">Confirmed Issues</div>
                    <div className="text-xl font-bold text-rose-200 tracking-tight">
                      {item.currency}{' '}
                      {formatCurrencyAmount(item.confirmedExposureMinor, item.currency)}
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-slate-500 flex items-center gap-1">
                  <Info className="w-3 h-3 text-slate-400" />
                  <span>Potential exposure represents unconfirmed risk awaiting review.</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 text-center text-slate-400 text-sm">
            No financial findings generated yet. Run a leakage scan to inspect ledger records.
          </div>
        )}
      </section>

      {/* 3. Findings Filter Toolbar */}
      <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
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
                className={`px-3 py-1.5 rounded-xl font-medium transition cursor-pointer capitalize ${
                  selectedStatus === status
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {status.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Type & Severity Selectors */}
          <div className="flex items-center gap-2">
            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value as FindingType | 'all');
                setPage(1);
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs focus:outline-none focus:border-rose-500"
            >
              <option value="all">All Finding Types</option>
              <option value="potential_duplicate_payment">Duplicate Payments</option>
              <option value="unusual_expense">Unusual Expenses</option>
              <option value="recurring_expense">Subscriptions & Recurring</option>
              <option value="recurring_cost_increase">Recurring Price Increases</option>
              <option value="supplier_price_variance">Supplier Price Variance</option>
              <option value="reconciliation_inconsistency">Reconciliation Anomalies</option>
            </select>

            <select
              value={selectedSeverity}
              onChange={(e) => {
                setSelectedSeverity(e.target.value as FindingSeverity | 'all');
                setPage(1);
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs focus:outline-none focus:border-rose-500"
            >
              <option value="all">All Severities</option>
              <option value="high">High Severity</option>
              <option value="medium">Medium Severity</option>
              <option value="low">Low Severity</option>
            </select>
          </div>
        </div>
      </section>

      {/* 4. Findings Table */}
      <section className="rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden shadow-lg">
        {isFindingsLoading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading findings...</div>
        ) : findingsData && findingsData.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-800 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Finding & Summary</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-right">Potential Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Detected</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {findingsData.items.map((finding) => (
                  <tr key={finding.id} className="hover:bg-slate-900/40 transition">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          finding.severity === 'high'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : finding.severity === 'medium'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        }`}
                      >
                        {finding.severity}
                      </span>
                    </td>
                    <td className="py-3 px-4 max-w-md">
                      <div className="font-semibold text-white truncate">{finding.title}</div>
                      <div className="text-slate-400 text-[11px] truncate mt-0.5">
                        {finding.summary}
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-300 font-mono text-[11px]">
                      {finding.findingType.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-right font-mono font-semibold text-white">
                      {finding.currency}{' '}
                      {formatCurrencyAmount(finding.estimatedAmountMinor, finding.currency)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium capitalize ${
                          finding.status === 'open'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : finding.status === 'under_review'
                              ? 'bg-amber-500/10 text-amber-400'
                              : finding.status === 'confirmed_issue'
                                ? 'bg-rose-500/10 text-rose-400 font-bold'
                                : finding.status === 'resolved'
                                  ? 'bg-teal-500/10 text-teal-400'
                                  : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {finding.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-400 text-[11px]">
                      {new Date(finding.detectedAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenDetail(finding)}
                        className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-400 text-sm">
            No findings match the current filter criteria.
          </div>
        )}

        {/* Pagination Bar */}
        {findingsData && findingsData.pagination.totalPages > 1 && (
          <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <span>
              Page {findingsData.pagination.page} of {findingsData.pagination.totalPages} (
              {findingsData.pagination.totalItems} findings)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= findingsData.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 5. Detail & Review Drawer / Modal */}
      {selectedFindingId && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          {isDetailLoading || !findingDetailData ? (
            <div className="p-8 rounded-2xl bg-slate-900 border border-slate-800 text-white flex items-center gap-3">
              <RefreshCw className="w-5 h-5 animate-spin text-rose-400" />
              <span>Loading finding details...</span>
            </div>
          ) : (
            <div className="relative w-full max-w-4xl rounded-3xl border border-slate-800 bg-slate-950 p-6 md:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-4 border-b border-slate-800/80 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        findingDetailData.finding.severity === 'high'
                          ? 'bg-rose-500/10 text-rose-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}
                    >
                      {findingDetailData.finding.severity} Severity
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      Rule: {findingDetailData.finding.ruleId} (
                      {findingDetailData.finding.ruleVersion})
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-white">
                    {findingDetailData.finding.title}
                  </h3>
                  <p className="text-xs text-slate-300">{findingDetailData.finding.summary}</p>
                </div>

                <button
                  type="button"
                  onClick={handleCloseDetail}
                  className="p-2 rounded-xl bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Evidence Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                  <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-rose-400" />
                    <span>Detection Evidence</span>
                  </h4>
                  <div className="text-xs text-slate-300 space-y-1.5">
                    <div>
                      <span className="text-slate-500">Trigger Reason: </span>
                      {findingDetailData.finding.evidence.reason}
                    </div>
                    <div>
                      <span className="text-slate-500">Estimated Exposure: </span>
                      <span className="font-mono font-semibold text-white">
                        {findingDetailData.finding.currency}{' '}
                        {formatCurrencyAmount(
                          findingDetailData.finding.estimatedAmountMinor,
                          findingDetailData.finding.currency,
                        )}
                      </span>
                    </div>
                    {findingDetailData.finding.evidence.dateDifferenceDays !== undefined && (
                      <div>
                        <span className="text-slate-500">Date Window: </span>
                        {findingDetailData.finding.evidence.dateDifferenceDays} day(s) difference
                      </div>
                    )}
                    {findingDetailData.finding.evidence.historicalComparisonPeriod && (
                      <div>
                        <span className="text-slate-500">Historical Observations: </span>
                        {findingDetailData.finding.evidence.historicalComparisonPeriod
                          .observationCount || 0}{' '}
                        entries (
                        {findingDetailData.finding.evidence.historicalComparisonPeriod.startDate} to{' '}
                        {findingDetailData.finding.evidence.historicalComparisonPeriod.endDate})
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                  <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-amber-400" />
                    <span>Verification Checks</span>
                  </h4>
                  <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
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
                <h4 className="text-xs font-semibold text-slate-200">Linked Ledger Transactions</h4>
                <div className="rounded-xl border border-slate-800 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase font-semibold">
                      <tr>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Description</th>
                        <th className="py-2 px-3">Direction</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                        <th className="py-2 px-3">Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {findingDetailData.transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-900/30">
                          <td className="py-2 px-3 text-slate-300">
                            {new Date(tx.date).toISOString().split('T')[0]}
                          </td>
                          <td className="py-2 px-3 text-white font-medium">{tx.description}</td>
                          <td className="py-2 px-3 text-slate-400 uppercase font-mono text-[10px]">
                            {tx.direction}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-white">
                            {tx.currency} {tx.amountDecimal}
                          </td>
                          <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">
                            {tx.sourceReference || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Explainable Intelligence Section */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950/30 border border-indigo-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold text-indigo-200">
                      Explainable Intelligence
                    </span>
                  </div>
                  {!explanation && (
                    <button
                      type="button"
                      onClick={() => explainMutation.mutate(findingDetailData.finding.id)}
                      disabled={explainMutation.isPending}
                      className="px-3 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      {explainMutation.isPending ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>{explainMutation.isPending ? 'Generating...' : 'Explain Finding'}</span>
                    </button>
                  )}
                </div>

                {explanation ? (
                  <div className="space-y-2 text-xs text-slate-300">
                    <div className="p-3 rounded-xl bg-slate-900/80 border border-indigo-500/10">
                      <div className="text-white font-medium mb-1">{explanation.summary}</div>
                      <div className="text-slate-400 text-[11px]">
                        {explanation.whyItWasFlagged}
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      Provider: {explanation.provider} &bull; Generated at:{' '}
                      {new Date(explanation.generatedAt).toLocaleString()}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">
                    Click 'Explain Finding' to generate a plain-language summary and recommended
                    verification steps.
                  </p>
                )}
              </div>

              {/* Review Decision Controls */}
              <div className="border-t border-slate-800 pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-slate-200">Review Decision</h4>
                  <div className="flex items-center gap-2">
                    {findingDetailData.finding.status === 'open' && (
                      <button
                        type="button"
                        onClick={() => setReviewAction('open_review')}
                        className="px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 text-xs font-medium cursor-pointer"
                      >
                        Start Review
                      </button>
                    )}
                    {(findingDetailData.finding.status === 'open' ||
                      findingDetailData.finding.status === 'under_review') && (
                      <>
                        <button
                          type="button"
                          onClick={() => setReviewAction('confirm_issue')}
                          className="px-3 py-1.5 rounded-xl bg-rose-500 text-white hover:bg-rose-600 text-xs font-semibold cursor-pointer"
                        >
                          Confirm Issue
                        </button>
                        <button
                          type="button"
                          onClick={() => setReviewAction('dismiss')}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-medium cursor-pointer"
                        >
                          Dismiss Finding
                        </button>
                      </>
                    )}
                    {(findingDetailData.finding.status === 'confirmed_issue' ||
                      findingDetailData.finding.status === 'under_review') && (
                      <button
                        type="button"
                        onClick={() => setReviewAction('resolve')}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 text-xs font-semibold cursor-pointer"
                      >
                        Mark Resolved
                      </button>
                    )}
                  </div>
                </div>

                {/* Review Input Box */}
                {reviewAction && (
                  <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                    <div className="text-xs font-semibold text-white capitalize">
                      Confirming Action: {reviewAction.replace('_', ' ')}
                    </div>
                    {reviewAction === 'dismiss' && (
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Dismissal Reason <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={reviewReason}
                          onChange={(e) => setReviewReason(e.target.value)}
                          placeholder="e.g. Legitimate bulk purchase authorized under PO-9842"
                          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-rose-500"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">
                        Audit Notes (Optional)
                      </label>
                      <textarea
                        value={reviewNotes}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        placeholder="Add any investigation notes or vendor confirmation details..."
                        rows={2}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    {reviewError && <div className="text-rose-400 text-xs">{reviewError}</div>}
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setReviewAction(null)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={submitReview}
                        disabled={reviewMutation.isPending}
                        className="px-4 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {reviewMutation.isPending ? 'Saving...' : 'Submit Decision'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Audit History Timeline */}
              <div className="space-y-2 border-t border-slate-800 pt-4">
                <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-slate-400" />
                  <span>Audit & Decision History</span>
                </h4>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {findingDetailData.history.map((h) => (
                    <div
                      key={h.id}
                      className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800/60 text-xs flex items-center justify-between"
                    >
                      <div className="space-y-0.5">
                        <div className="text-slate-300 font-medium capitalize">
                          {h.action.replace('_', ' ')} &bull;{' '}
                          <span className="text-slate-500 text-[11px]">
                            {h.notes || h.reason || 'No notes'}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(h.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
