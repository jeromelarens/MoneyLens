import React, { useState, useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layout } from './Layout';
import { financialService } from '../services/financial.service';
import type {
  FinancialFinding,
  FindingType,
  ReviewFindingAction,
  AiExplanation,
  Transaction,
  FinancialAccount,
} from '@moneylens/shared';
import { formatCurrencyAmount } from '@moneylens/shared';
import {
  ArrowLeft,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  X,
  FileText,
  History,
  Info,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

export const FindingDetailsPage: React.FC = () => {
  const { findingId } = useParams<{ findingId: string }>();
  const queryClient = useQueryClient();

  // Document Title
  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'Finding Details & Evidence — MoneyLens';
    return () => {
      document.title = originalTitle;
    };
  }, []);

  // Local state
  const [isCopiedId, setIsCopiedId] = useState(false);
  const [reviewAction, setReviewAction] = useState<ReviewFindingAction | null>(null);
  const [reviewReason, setReviewReason] = useState<string>('');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [actionSuccessBanner, setActionSuccessBanner] = useState<string | null>(null);

  // 1. Fetch Finding Detail
  const {
    data: findingDetailData,
    isLoading: isFindingLoading,
    isError: isFindingError,
    error: findingError,
    refetch: refetchFinding,
    isFetching: isFindingFetching,
  } = useQuery({
    queryKey: ['finding-detail', findingId],
    queryFn: () => {
      if (!findingId) throw new Error('Missing finding identifier');
      return financialService.getFindingDetail(findingId);
    },
    enabled: Boolean(findingId),
  });

  // 2. Fetch Accounts (to resolve account names in participating transactions)
  const { data: accountsData } = useQuery({
    queryKey: ['financial-accounts'],
    queryFn: financialService.getAccounts,
    staleTime: 60000,
  });

  const accountsMap = useMemo(() => {
    const map = new Map<string, FinancialAccount>();
    if (accountsData?.items) {
      accountsData.items.forEach((acc) => map.set(acc.id, acc));
    }
    return map;
  }, [accountsData]);

  // 3. Review Mutation
  const reviewMutation = useMutation({
    mutationFn: async (params: {
      action: ReviewFindingAction;
      reason?: string;
      notes?: string;
    }) => {
      if (!findingId) throw new Error('No finding selected');
      return financialService.reviewFinding(findingId, params.action, params.reason, params.notes);
    },
    onSuccess: (_, variables) => {
      const actionName = variables.action.replace('_', ' ');
      setReviewAction(null);
      setReviewReason('');
      setReviewNotes('');
      setReviewError(null);
      setActionSuccessBanner(`Finding successfully updated: ${actionName}`);
      setTimeout(() => setActionSuccessBanner(null), 5000);
      queryClient.invalidateQueries({ queryKey: ['finding-detail', findingId] });
      queryClient.invalidateQueries({ queryKey: ['findings-summary'] });
      queryClient.invalidateQueries({ queryKey: ['findings-list'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setReviewError(msg || 'Failed to submit review decision');
    },
  });

  // 4. AI Explanation Mutation
  const [explanation, setExplanation] = useState<AiExplanation | null>(null);
  const explainMutation = useMutation({
    mutationFn: (id: string) => financialService.explainFinding(id, true),
    onSuccess: (data) => {
      setExplanation(data);
      queryClient.invalidateQueries({ queryKey: ['finding-detail', findingId] });
      setActionSuccessBanner('Explainable intelligence analysis generated.');
      setTimeout(() => setActionSuccessBanner(null), 5000);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setReviewError(msg || 'Failed to generate AI explanation.');
    },
  });

  // Copy Finding ID to clipboard
  const handleCopyId = () => {
    if (!findingId) return;
    navigator.clipboard.writeText(findingId);
    setIsCopiedId(true);
    setTimeout(() => setIsCopiedId(false), 2000);
  };

  // Submit review handler
  const submitReview = () => {
    if (!findingId || !reviewAction) return;
    if (reviewAction === 'dismiss' && !reviewReason.trim()) {
      setReviewError('A dismissal reason is required when dismissing a finding.');
      return;
    }
    reviewMutation.mutate({
      action: reviewAction,
      reason: reviewReason.trim() || undefined,
      notes: reviewNotes.trim() || undefined,
    });
  };

  // Helper for human-readable finding type label
  const getFindingTypeLabel = (type: FindingType) => {
    switch (type) {
      case 'potential_duplicate_payment':
        return 'Duplicate Payment';
      case 'unusual_expense':
        return 'Unusual Expense';
      case 'recurring_expense':
        return 'Recurring Subscription';
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

  const finding: FinancialFinding | undefined = findingDetailData?.finding;
  const transactions: Transaction[] = findingDetailData?.transactions || [];
  const history = findingDetailData?.history || [];

  const headerActions = (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={() => refetchFinding()}
        disabled={isFindingFetching}
        title="Refresh finding evidence"
        className="p-2 rounded-xl border border-[#E8E7E2] bg-white text-[#66645C] hover:text-[#171714] hover:bg-[#F8F7F2] transition active:scale-95 disabled:opacity-50 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E5BB45]"
        aria-label="Refresh finding data"
      >
        <RefreshCw
          className={`w-4 h-4 ${isFindingFetching ? 'animate-spin text-[#E5BB45]' : ''}`}
        />
      </button>

      <Link
        to="/findings"
        className="inline-flex items-center gap-1.5 bg-[#171714] hover:bg-[#2A2A26] text-white text-xs sm:text-sm font-semibold py-2 px-3.5 sm:px-4 rounded-full shadow-2xs transition cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Back to Findings</span>
      </Link>
    </div>
  );

  return (
    <Layout pageTitle="Finding Details" headerActions={headerActions}>
      <div className="space-y-8">
        {/* Breadcrumb Navigation Bar */}
        <nav
          aria-label="Breadcrumb"
          className="flex items-center justify-between text-xs text-[#66645C]"
        >
          <div className="flex items-center gap-2">
            <Link to="/dashboard" className="hover:text-[#171714] transition-colors">
              Dashboard
            </Link>
            <span>/</span>
            <Link to="/findings" className="hover:text-[#171714] transition-colors">
              Financial Findings
            </Link>
            <span>/</span>
            <span className="font-semibold text-[#171714] font-mono">
              {findingId ? `Finding ${findingId.slice(0, 8)}...` : 'Details'}
            </span>
          </div>

          <Link
            to="/findings"
            className="inline-flex items-center gap-1 text-[#66645C] hover:text-[#171714] font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All Findings</span>
          </Link>
        </nav>

        {/* Action Success / Feedback Alert */}
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

        {/* Global Error Banner */}
        {reviewError && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-medium">{reviewError}</span>
            </div>
            <button
              type="button"
              onClick={() => setReviewError(null)}
              className="text-rose-700 hover:text-rose-950 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ============================================================ */}
        {/* Loading / Error / Content Switch                             */}
        {/* ============================================================ */}
        {isFindingLoading ? (
          <div className="p-12 rounded-3xl bg-white border border-[#E8E7E2] text-center text-[#66645C] space-y-4 shadow-2xs">
            <RefreshCw className="w-6 h-6 animate-spin text-[#E5BB45] mx-auto" />
            <div className="font-semibold text-[#171714]">
              Loading finding evidence and ledger dossier...
            </div>
            <p className="text-xs text-[#66645C]">
              Retrieving participating transactions and append-only audit history from verified
              records.
            </p>
          </div>
        ) : isFindingError || !finding ? (
          <div className="p-12 rounded-3xl bg-white border border-[#E8E7E2] text-center space-y-4 shadow-2xs">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-[#171714]">
                Financial Finding Record Unavailable
              </h2>
              <p className="text-xs text-[#66645C] max-w-md mx-auto leading-relaxed">
                {findingError instanceof Error
                  ? findingError.message
                  : 'The requested finding identifier does not exist or has been removed from this organization.'}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => refetchFinding()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-[#E8E7E2] hover:bg-[#F8F7F2] text-xs font-semibold text-[#171714] transition cursor-pointer shadow-2xs"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#E5BB45]" />
                <span>Retry Request</span>
              </button>
              <Link
                to="/findings"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#171714] text-white hover:bg-[#2A2A26] text-xs font-semibold transition shadow-2xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Findings Dashboard</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Finding Dossier Hero Banner */}
            <section className="space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                <div className="space-y-2 max-w-3xl">
                  {/* Eyebrow & Rule Identity */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider text-[10px] bg-[#FAF4E0] border border-[#E5BB45]/50 text-[#171714]">
                      <ShieldAlert className="w-3 h-3 text-[#B89020]" />
                      Rule {finding.ruleId} ({finding.ruleVersion})
                    </span>

                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                        finding.severity === 'high'
                          ? 'bg-rose-50 text-rose-800 border border-rose-200'
                          : finding.severity === 'medium'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-blue-50 text-blue-800 border border-blue-200'
                      }`}
                    >
                      {finding.severity} Severity
                    </span>

                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                        finding.status === 'open'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : finding.status === 'under_review'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : finding.status === 'confirmed_issue'
                              ? 'bg-rose-50 text-rose-800 border border-rose-200 font-bold'
                              : finding.status === 'resolved'
                                ? 'bg-teal-50 text-teal-800 border border-teal-200'
                                : 'bg-[#F8F7F2] text-[#66645C] border border-[#E8E7E2]'
                      }`}
                    >
                      Status: {finding.status.replace('_', ' ')}
                    </span>

                    <span className="text-[#66645C] font-mono text-xs">
                      Type: {getFindingTypeLabel(finding.findingType)}
                    </span>
                  </div>

                  {/* Title & Summary */}
                  <h1 className="text-3xl sm:text-4xl font-serif tracking-tight text-[#171714]">
                    {finding.title}
                  </h1>
                  <p className="text-sm text-[#66645C] leading-relaxed max-w-2xl">
                    {finding.summary}
                  </p>
                </div>

                {/* Top Action Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[#E8E7E2] hover:bg-[#F8F7F2] text-xs font-semibold text-[#171714] transition cursor-pointer shadow-2xs"
                    title="Copy unique finding record ID"
                  >
                    {isCopiedId ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-[#66645C]" />
                    )}
                    <span>{isCopiedId ? 'Copied ID' : 'Copy ID'}</span>
                  </button>

                  <Link
                    to="/transactions"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-[#E8E7E2] hover:bg-[#F8F7F2] text-xs font-semibold text-[#171714] transition shadow-2xs"
                  >
                    <span>Open Ledger</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#66645C]" />
                  </Link>
                </div>
              </div>

              {/* Truth-in-Accounting Safeguard Notice */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#E8E7E2] flex items-start gap-3.5 shadow-2xs">
                <div className="p-2 rounded-xl bg-[#FAF4E0] border border-[#E5BB45]/40 text-[#171714] shrink-0 mt-0.5">
                  <ShieldCheck className="w-4 h-4 text-[#171714]" />
                </div>
                <div className="space-y-1 text-xs">
                  <h2 className="font-bold text-[#171714] text-xs sm:text-sm">
                    Evidence Verification &amp; Explainability Separation
                  </h2>
                  <p className="text-[#66645C] leading-relaxed">
                    Transaction records listed below represent immutable ledger facts extracted from
                    ingested bank statements. Potential exposure values represent unconfirmed
                    financial risk awaiting audit review, not verified cash losses. AI explanations
                    provide contextual commentary without altering underlying financial data.
                  </p>
                  <div className="pt-1 flex flex-wrap items-center gap-4 text-[11px] text-[#66645C]">
                    <span>
                      Detected:{' '}
                      <strong className="text-[#171714]">
                        {new Date(finding.detectedAt).toLocaleString()}
                      </strong>
                    </span>
                    <span>&bull;</span>
                    <span>
                      Last Evaluated:{' '}
                      <strong className="text-[#171714]">
                        {new Date(finding.lastEvaluatedAt).toLocaleString()}
                      </strong>
                    </span>
                    {finding.reviewedAt && (
                      <>
                        <span>&bull;</span>
                        <span>
                          Reviewed:{' '}
                          <strong className="text-[#171714]">
                            {new Date(finding.reviewedAt).toLocaleString()}
                          </strong>
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* ============================================================ */}
            {/* Two-Column Structured Investigation Grid                     */}
            {/* ============================================================ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              {/* ========================================================== */}
              {/* Left Column (Primary Evidence - 2/3 width)                 */}
              {/* ========================================================== */}
              <div className="lg:col-span-2 space-y-8">
                {/* 1. Participating Ledger Transactions */}
                <section
                  aria-labelledby="section-transactions-evidence"
                  className="rounded-3xl border border-[#E8E7E2] bg-white p-6 shadow-2xs space-y-4"
                >
                  <div className="flex items-center justify-between border-b border-[#E8E7E2] pb-3">
                    <div className="space-y-0.5">
                      <h2
                        id="section-transactions-evidence"
                        className="text-base font-bold text-[#171714] flex items-center gap-2"
                      >
                        <FileText className="w-4 h-4 text-[#E5BB45]" />
                        <span>Participating Ledger Transactions</span>
                      </h2>
                      <p className="text-xs text-[#66645C]">
                        Verifiable double-entry records extracted from statement imports.
                      </p>
                    </div>

                    <span className="px-2.5 py-0.5 rounded-full bg-[#F8F7F2] border border-[#E8E7E2] text-xs font-semibold text-[#66645C]">
                      {transactions.length} record{transactions.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {transactions.length > 0 ? (
                    <div className="rounded-2xl border border-[#E8E7E2] overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[#F8F7F2] text-[#66645C] text-[10px] uppercase font-semibold border-b border-[#E8E7E2]">
                            <tr>
                              <th scope="col" className="py-2.5 px-3">
                                Role
                              </th>
                              <th scope="col" className="py-2.5 px-3">
                                Date
                              </th>
                              <th scope="col" className="py-2.5 px-3">
                                Description
                              </th>
                              <th scope="col" className="py-2.5 px-3">
                                Direction
                              </th>
                              <th scope="col" className="py-2.5 px-3 text-right">
                                Amount
                              </th>
                              <th scope="col" className="py-2.5 px-3">
                                Account
                              </th>
                              <th scope="col" className="py-2.5 px-3">
                                Reference
                              </th>
                              <th scope="col" className="py-2.5 px-3 text-right">
                                Action
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E8E7E2]">
                            {transactions.map((tx, idx) => {
                              const txId =
                                tx.id || (tx as unknown as { _id?: string })._id || `tx-${idx}`;
                              const isPrimary = finding.primaryTransactionIds.includes(txId);
                              const account = accountsMap.get(tx.accountId);
                              return (
                                <tr key={txId} className="hover:bg-[#F8F7F2]/40 transition">
                                  {/* Role Pill */}
                                  <td className="py-3 px-3 whitespace-nowrap">
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                        isPrimary
                                          ? 'bg-[#171714] text-white'
                                          : 'bg-[#F8F7F2] text-[#66645C] border border-[#E8E7E2]'
                                      }`}
                                    >
                                      {isPrimary ? 'Primary' : 'Related'}
                                    </span>
                                  </td>

                                  {/* Date */}
                                  <td className="py-3 px-3 whitespace-nowrap font-mono text-[#66645C]">
                                    {new Date(tx.date).toISOString().split('T')[0]}
                                  </td>

                                  {/* Description */}
                                  <td className="py-3 px-3 max-w-xs">
                                    <div className="font-semibold text-[#171714] truncate">
                                      {tx.description}
                                    </div>
                                    <div className="text-[10px] text-[#66645C] font-mono truncate">
                                      ID: {txId.slice(0, 8)}...
                                    </div>
                                  </td>

                                  {/* Direction */}
                                  <td className="py-3 px-3 whitespace-nowrap uppercase font-mono text-[10px]">
                                    <span
                                      className={`px-1.5 py-0.5 rounded ${
                                        tx.direction === 'debit'
                                          ? 'bg-rose-50 text-rose-800'
                                          : 'bg-emerald-50 text-emerald-800'
                                      }`}
                                    >
                                      {tx.direction}
                                    </span>
                                  </td>

                                  {/* Amount */}
                                  <td className="py-3 px-3 whitespace-nowrap text-right font-mono font-bold text-[#171714]">
                                    {tx.currency} {tx.amountDecimal}
                                  </td>

                                  {/* Account */}
                                  <td className="py-3 px-3 whitespace-nowrap text-[#66645C]">
                                    <Link
                                      to="/accounts"
                                      className="hover:text-[#171714] transition truncate block max-w-[120px]"
                                      title={account?.name || tx.accountId}
                                    >
                                      {account?.name || tx.accountId}
                                    </Link>
                                  </td>

                                  {/* Source Reference */}
                                  <td className="py-3 px-3 whitespace-nowrap font-mono text-[#66645C] text-[11px]">
                                    {tx.sourceReference || '—'}
                                  </td>

                                  {/* Action */}
                                  <td className="py-3 px-3 whitespace-nowrap text-right">
                                    <Link
                                      to="/transactions"
                                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#171714] hover:text-[#E5BB45] transition"
                                    >
                                      <span>Ledger</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </Link>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 rounded-2xl border border-dashed border-[#E8E7E2] text-center text-[#66645C] text-xs">
                      No participating transaction records attached to this finding.
                    </div>
                  )}
                </section>

                {/* 2. Structured Rule Evidence & Thresholds Matrix */}
                <section
                  aria-labelledby="section-rule-evidence"
                  className="rounded-3xl border border-[#E8E7E2] bg-white p-6 shadow-2xs space-y-4"
                >
                  <div className="border-b border-[#E8E7E2] pb-3">
                    <h2
                      id="section-rule-evidence"
                      className="text-base font-bold text-[#171714] flex items-center gap-2"
                    >
                      <ShieldCheck className="w-4 h-4 text-[#E5BB45]" />
                      <span>Deterministic Detection Criteria</span>
                    </h2>
                    <p className="text-xs text-[#66645C]">
                      Empirical evidence evaluated by rule {finding.evidence.ruleId} (v
                      {finding.evidence.ruleVersion}).
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {/* Reason & Date Diff */}
                    <div className="p-4 rounded-2xl bg-[#F8F7F2] border border-[#E8E7E2] space-y-2">
                      <div className="font-bold text-[#171714]">Detection Rule Rationale</div>
                      <p className="text-[#66645C] leading-relaxed">{finding.evidence.reason}</p>

                      {finding.evidence.dateDifferenceDays !== undefined && (
                        <div className="pt-1 text-[#66645C] flex items-center justify-between border-t border-[#E8E7E2]">
                          <span>Observed Date Separation:</span>
                          <strong className="text-[#171714] font-mono">
                            {finding.evidence.dateDifferenceDays} day(s)
                          </strong>
                        </div>
                      )}

                      {finding.evidence.percentageChange !== undefined && (
                        <div className="pt-1 text-[#66645C] flex items-center justify-between border-t border-[#E8E7E2]">
                          <span>Calculated Variance:</span>
                          <strong className="text-[#171714] font-mono">
                            {finding.evidence.percentageChange > 0 ? '+' : ''}
                            {finding.evidence.percentageChange.toFixed(1)}%
                          </strong>
                        </div>
                      )}
                    </div>

                    {/* Historical Baseline Window */}
                    <div className="p-4 rounded-2xl bg-[#F8F7F2] border border-[#E8E7E2] space-y-2">
                      <div className="font-bold text-[#171714]">Historical Comparison Baseline</div>
                      {finding.evidence.historicalComparisonPeriod ? (
                        <div className="space-y-1.5 text-[#66645C]">
                          <div className="flex items-center justify-between">
                            <span>Observations Count:</span>
                            <strong className="text-[#171714] font-mono">
                              {finding.evidence.historicalComparisonPeriod.observationCount || 0}{' '}
                              entries
                            </strong>
                          </div>
                          {finding.evidence.historicalComparisonPeriod.startDate && (
                            <div className="flex items-center justify-between text-[11px]">
                              <span>Observation Window:</span>
                              <span className="font-mono text-[#171714]">
                                {finding.evidence.historicalComparisonPeriod.startDate} &rarr;{' '}
                                {finding.evidence.historicalComparisonPeriod.endDate}
                              </span>
                            </div>
                          )}
                          {finding.evidence.historicalComparisonPeriod.baselineAmountMinor !==
                            undefined && (
                            <div className="flex items-center justify-between border-t border-[#E8E7E2] pt-1">
                              <span>Baseline Amount:</span>
                              <strong className="font-mono text-[#171714]">
                                {finding.currency}{' '}
                                {formatCurrencyAmount(
                                  finding.evidence.historicalComparisonPeriod.baselineAmountMinor,
                                  finding.currency,
                                )}
                              </strong>
                            </div>
                          )}
                          {finding.evidence.historicalComparisonPeriod.cadenceDays !==
                            undefined && (
                            <div className="flex items-center justify-between border-t border-[#E8E7E2] pt-1">
                              <span>Expected Cadence:</span>
                              <strong className="font-mono text-[#171714]">
                                Every {finding.evidence.historicalComparisonPeriod.cadenceDays} days
                              </strong>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-[#66645C]">
                          Baseline comparison established from direct debit transaction parameters.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Recommended Verification Checks & Limitations */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-1">
                    {/* Verification Checks */}
                    <div className="p-4 rounded-2xl bg-[#F8F7F2] border border-[#E8E7E2] space-y-2">
                      <div className="font-bold text-[#171714] flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#E5BB45]" />
                        <span>Recommended Verification Steps</span>
                      </div>
                      <ul className="text-xs text-[#66645C] space-y-1.5 list-disc list-inside">
                        {(
                          finding.evidence.recommendedChecks || [
                            'Review merchant invoice and purchase order authorization.',
                            'Verify clearance status in external banking portal.',
                          ]
                        ).map((check, i) => (
                          <li key={i}>{check}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Data Quality Limitations */}
                    <div className="p-4 rounded-2xl bg-[#F8F7F2] border border-[#E8E7E2] space-y-2">
                      <div className="font-bold text-[#171714] flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-[#66645C]" />
                        <span>Data Quality Notes &amp; Caveats</span>
                      </div>
                      {finding.evidence.dataQualityLimitations &&
                      finding.evidence.dataQualityLimitations.length > 0 ? (
                        <ul className="text-xs text-[#66645C] space-y-1.5 list-disc list-inside">
                          {finding.evidence.dataQualityLimitations.map((lim, i) => (
                            <li key={i}>{lim}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-[#66645C] leading-relaxed">
                          Evidence evaluated from verified bank statement ledger imports. No data
                          quality limitations recorded.
                        </p>
                      )}
                    </div>
                  </div>
                </section>

                {/* 3. Explainable Intelligence Section (AI Context) */}
                <section
                  aria-labelledby="section-explainable-intelligence"
                  className="rounded-3xl border border-[#E5BB45]/40 bg-[#FAF4E0]/40 p-6 shadow-2xs space-y-4"
                >
                  <div className="flex items-center justify-between border-b border-[#E5BB45]/30 pb-3">
                    <div className="space-y-0.5">
                      <h2
                        id="section-explainable-intelligence"
                        className="text-base font-bold text-[#171714] flex items-center gap-2"
                      >
                        <Sparkles className="w-4 h-4 text-[#B89020]" />
                        <span>Explainable Intelligence (AI Analysis)</span>
                      </h2>
                      <p className="text-xs text-[#66645C]">
                        Plain-language commentary generated from transaction evidence. Not an
                        immutable financial record.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => explainMutation.mutate(finding.id)}
                      disabled={explainMutation.isPending}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#171714] hover:bg-[#2A2A26] text-white text-xs font-semibold cursor-pointer shadow-2xs transition disabled:opacity-50"
                    >
                      {explainMutation.isPending ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-[#E5BB45]" />
                      )}
                      <span>
                        {explainMutation.isPending
                          ? 'Generating...'
                          : explanation
                            ? 'Re-generate'
                            : 'Explain Finding'}
                      </span>
                    </button>
                  </div>

                  {explanation ? (
                    <div className="space-y-3 text-xs text-[#171714]">
                      <div className="p-4 rounded-2xl bg-white border border-[#E8E7E2] space-y-2">
                        <div className="font-bold text-sm text-[#171714]">
                          {explanation.summary}
                        </div>
                        <p className="text-[#66645C] leading-relaxed">
                          {explanation.whyItWasFlagged}
                        </p>
                        <div className="pt-2 text-[11px] text-[#66645C] border-t border-[#F8F7F2]">
                          <strong className="text-[#171714]">Evidence Synthesis: </strong>
                          {explanation.evidenceSummary}
                        </div>
                      </div>

                      {explanation.recommendedChecks &&
                        explanation.recommendedChecks.length > 0 && (
                          <div className="p-3.5 rounded-xl bg-white border border-[#E8E7E2] space-y-1">
                            <strong className="text-[#171714]">Contextual Recommendations:</strong>
                            <ul className="list-disc list-inside text-[#66645C] space-y-0.5">
                              {explanation.recommendedChecks.map((c, i) => (
                                <li key={i}>{c}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                      <div className="flex flex-wrap items-center justify-between text-[10px] text-[#66645C] font-mono px-1">
                        <span>
                          Provider: {explanation.provider}{' '}
                          {explanation.model ? `(${explanation.model})` : ''}
                        </span>
                        <span>Generated: {new Date(explanation.generatedAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 rounded-2xl bg-white/70 border border-[#E8E7E2] text-center text-[#66645C] text-xs space-y-2">
                      <p>
                        Click 'Explain Finding' to generate an automated plain-language synthesis of
                        why this finding was flagged and review specific verification steps.
                      </p>
                    </div>
                  )}
                </section>
              </div>

              {/* ========================================================== */}
              {/* Right Column (Sidebar: Impact, Actions, Audit Trail)       */}
              {/* ========================================================== */}
              <div className="space-y-6">
                {/* 1. Documented Monetary Impact Card */}
                <section
                  aria-labelledby="section-monetary-impact"
                  className="rounded-3xl border border-[#E8E7E2] bg-white p-6 shadow-2xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#66645C]">
                      Documented Exposure
                    </span>
                    <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-[#171714] text-white">
                      {finding.currency}
                    </span>
                  </div>

                  <div>
                    <div className="text-3xl font-serif font-bold text-[#171714] tracking-tight">
                      {finding.currency}{' '}
                      {formatCurrencyAmount(finding.estimatedAmountMinor, finding.currency)}
                    </div>
                    <p className="text-[11px] text-[#66645C] mt-1 font-medium">
                      {finding.status === 'confirmed_issue'
                        ? 'Confirmed Financial Discrepancy'
                        : finding.status === 'dismissed'
                          ? 'Dismissed (Non-Loss)'
                          : finding.status === 'resolved'
                            ? 'Resolved / Remediated'
                            : 'Potential Exposure (Unconfirmed Risk)'}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] text-[11px] text-[#66645C] space-y-1">
                    <div className="font-semibold text-[#171714]">Minor Unit Precision:</div>
                    <p>
                      Calculated as {finding.estimatedAmountMinor} minor units. Never combined
                      across exchange rates or assumed as confirmed loss without audit review.
                    </p>
                  </div>
                </section>

                {/* 2. Review Lifecycle Actions Card */}
                <section
                  aria-labelledby="section-lifecycle-actions"
                  className="rounded-3xl border border-[#E8E7E2] bg-white p-6 shadow-2xs space-y-4"
                >
                  <div className="border-b border-[#E8E7E2] pb-3">
                    <h3 id="section-lifecycle-actions" className="text-sm font-bold text-[#171714]">
                      Finding Lifecycle &amp; Actions
                    </h3>
                    <p className="text-xs text-[#66645C]">
                      Execute auditable state transitions based on verified evidence.
                    </p>
                  </div>

                  {/* Current Status Pill */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#66645C]">Current Status:</span>
                    <span className="font-semibold text-[#171714] capitalize">
                      {finding.status.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Action Selection Buttons */}
                  <div className="space-y-2">
                    {finding.status === 'open' && (
                      <button
                        type="button"
                        onClick={() => {
                          setReviewAction('open_review');
                          setReviewError(null);
                        }}
                        className="w-full py-2 px-3 rounded-xl bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 text-xs font-semibold cursor-pointer transition text-center"
                      >
                        Start Review
                      </button>
                    )}

                    {(finding.status === 'open' || finding.status === 'under_review') && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setReviewAction('confirm_issue');
                            setReviewError(null);
                          }}
                          className="py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer transition shadow-2xs text-center"
                        >
                          Confirm Issue
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReviewAction('dismiss');
                            setReviewError(null);
                          }}
                          className="py-2 px-3 rounded-xl bg-white border border-[#E8E7E2] text-[#66645C] hover:text-[#171714] hover:bg-[#F8F7F2] text-xs font-medium cursor-pointer transition text-center"
                        >
                          Dismiss Finding
                        </button>
                      </div>
                    )}

                    {(finding.status === 'confirmed_issue' ||
                      finding.status === 'under_review') && (
                      <button
                        type="button"
                        onClick={() => {
                          setReviewAction('resolve');
                          setReviewError(null);
                        }}
                        className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer transition shadow-2xs text-center"
                      >
                        Mark Resolved
                      </button>
                    )}

                    {finding.status === 'dismissed' && (
                      <div className="p-3 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] text-xs space-y-1">
                        <span className="font-semibold text-[#171714]">Dismissal Recorded:</span>
                        <p className="text-[#66645C]">
                          {finding.dismissalReason || 'No reason provided'}
                        </p>
                      </div>
                    )}

                    {finding.status === 'resolved' && (
                      <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-xs space-y-1">
                        <span className="font-semibold text-teal-900">Resolution Recorded:</span>
                        <p className="text-teal-800">
                          {finding.resolutionNotes || 'Marked as resolved'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Interactive Review Decision Form */}
                  {reviewAction && (
                    <div className="p-4 rounded-2xl bg-[#F8F7F2] border border-[#E8E7E2] space-y-3 pt-3">
                      <div className="text-xs font-bold text-[#171714] capitalize">
                        Confirming: {reviewAction.replace('_', ' ')}
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
                            placeholder="e.g. Legitimate authorized bulk order"
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
                          placeholder="Add investigation commentary..."
                          rows={2}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-[#E8E7E2] text-[#171714] text-xs focus:outline-none focus:border-[#E5BB45]"
                        />
                      </div>

                      <div className="flex items-center gap-2 justify-end pt-1">
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
                          {reviewMutation.isPending ? 'Submitting...' : 'Submit Decision'}
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                {/* 3. Append-Only Audit Trail & Activity Timeline */}
                <section
                  aria-labelledby="section-audit-history"
                  className="rounded-3xl border border-[#E8E7E2] bg-white p-6 shadow-2xs space-y-4"
                >
                  <div className="border-b border-[#E8E7E2] pb-3">
                    <h3
                      id="section-audit-history"
                      className="text-sm font-bold text-[#171714] flex items-center gap-2"
                    >
                      <History className="w-4 h-4 text-[#E5BB45]" />
                      <span>Audit &amp; Decision History</span>
                    </h3>
                    <p className="text-xs text-[#66645C]">
                      Append-only chronological record of lifecycle events.
                    </p>
                  </div>

                  <div className="space-y-2.5 max-h-72 overflow-y-auto">
                    {history && history.length > 0 ? (
                      history.map((h, idx) => (
                        <div
                          key={h.id || (h as unknown as { _id?: string })._id || `history-${idx}`}
                          className="p-3 rounded-2xl bg-[#F8F7F2] border border-[#E8E7E2] text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between font-semibold text-[#171714] capitalize">
                            <span>{h.action.replace('_', ' ')}</span>
                            <span className="text-[10px] text-[#66645C] font-mono font-normal">
                              {new Date(h.createdAt).toLocaleTimeString()}
                            </span>
                          </div>
                          {(h.reason || h.notes) && (
                            <p className="text-[11px] text-[#66645C] leading-normal">
                              {h.reason || h.notes}
                            </p>
                          )}
                          <div className="text-[10px] text-[#66645C] font-mono flex items-center justify-between pt-0.5">
                            <span>Actor: {h.actorId || 'system'}</span>
                            <span>{new Date(h.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-[#66645C] text-center py-4">
                        No previous audit events recorded.
                      </p>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};
