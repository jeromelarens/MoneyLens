import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { financialService } from '../services/financial.service';
import { FileUploadZone } from './FileUploadZone';
import { RowErrorsTable } from './RowErrorsTable';
import { Layout } from './Layout';
import type { ImportJob, FinancialAccount } from '@moneylens/shared';
import {
  FileSpreadsheet,
  RefreshCw,
  Search,
  ArrowUpRight,
  Copy,
  Check,
  Info,
  ShieldCheck,
  X,
  FileText,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  UploadCloud,
} from 'lucide-react';

export const ImportsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const uploadSectionRef = useRef<HTMLDivElement>(null);

  // Document Title
  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'Imports & Import History — MoneyLens';
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

  // Pagination & Filter State
  const [page, setPage] = useState<number>(1);
  const pageSize = 10;
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals & Inspect State
  const [detailJob, setDetailJob] = useState<ImportJob | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null);

  // 1. Fetch Financial Accounts for mapping target account IDs
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

  // 2. Fetch Paginated Import Jobs (Organization-scoped)
  const {
    data: importJobsData,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['import-jobs', organizationId, page, pageSize],
    queryFn: () => financialService.getImports(page, pageSize),
    staleTime: 30000,
  });

  const importJobs: ImportJob[] = useMemo(() => {
    return importJobsData?.items || [];
  }, [importJobsData]);

  const pagination = importJobsData?.pagination || {
    page: 1,
    limit: pageSize,
    totalItems: 0,
    totalPages: 1,
  };

  // Filtered Jobs
  const filteredJobs = useMemo(() => {
    return importJobs.filter((job) => {
      if (statusFilter !== 'all' && job.status !== statusFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesName = job.fileName.toLowerCase().includes(query);
        const matchesHash = job.fileHash.toLowerCase().includes(query);
        const matchesId = job.id.toLowerCase().includes(query);
        const acc = accountsMap.get(job.accountId);
        const matchesAcc = acc ? acc.name.toLowerCase().includes(query) : false;
        if (!matchesName && !matchesHash && !matchesId && !matchesAcc) {
          return false;
        }
      }
      return true;
    });
  }, [importJobs, statusFilter, searchTerm, accountsMap]);

  // Aggregated Pipeline Metrics (Across current batch and total counts)
  const totalAcceptedRows = useMemo(() => {
    return importJobs.reduce((acc, job) => acc + job.acceptedRows, 0);
  }, [importJobs]);

  const totalRejectedRows = useMemo(() => {
    return importJobs.reduce((acc, job) => acc + job.rejectedRows, 0);
  }, [importJobs]);

  const totalDuplicateRows = useMemo(() => {
    return importJobs.reduce((acc, job) => acc + job.duplicateRows, 0);
  }, [importJobs]);

  // Copy helper
  const handleCopyHash = (hash: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handleCopyJobId = (jobId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(jobId);
    setCopiedJobId(jobId);
    setTimeout(() => setCopiedJobId(null), 2000);
  };

  // Refresh handler
  const handleRefresh = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['import-jobs'] });
  };

  // Upload success handler
  const handleUploadSuccess = (job: ImportJob) => {
    refetch();
    setPage(1);
    setDetailJob(job);
  };

  // Scroll to upload dropzone
  const handleScrollToUpload = () => {
    uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Inspect existing job from duplicate banner
  const handleInspectExistingJob = async (jobId: string) => {
    try {
      const job = await financialService.getImportJob(jobId);
      setDetailJob(job);
    } catch {
      // Fallback: look in current items
      const found = importJobs.find((j) => j.id === jobId);
      if (found) setDetailJob(found);
    }
  };

  // Escape key handler for modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && detailJob) {
        setDetailJob(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [detailJob]);

  // Lock body scroll when detailJob modal is active
  useEffect(() => {
    if (detailJob) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [detailJob]);

  // Helper for Status Badge
  const renderStatusBadge = (job: ImportJob) => {
    switch (job.status) {
      case 'completed':
        if (job.rejectedRows > 0) {
          return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200">
              <AlertTriangle className="w-3 h-3 text-amber-600" />
              Completed ({job.rejectedRows} error{job.rejectedRows === 1 ? '' : 's'})
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-900 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Completed
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-900 border border-sky-200 animate-pulse">
            <Clock className="w-3 h-3 text-sky-600 animate-spin" />
            Processing
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F8F7F2] text-[#66645C] border border-[#E8E7E2]">
            <Clock className="w-3 h-3 text-[#66645C]" />
            Queued
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-900 border border-red-200">
            <AlertTriangle className="w-3 h-3 text-red-600" />
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F8F7F2] text-[#66645C] border border-[#E8E7E2]">
            {job.status}
          </span>
        );
    }
  };

  return (
    <Layout
      pageTitle="Imports"
      headerActions={
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isFetching}
            title="Refresh imports history"
            className="w-9 h-9 rounded-xl border border-[#DEDDD5] bg-white text-[#66645C] hover:text-[#171714] hover:bg-[#F8F7F2] transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center shrink-0"
            aria-label="Refresh imports"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-[#E5BB45]' : ''}`} />
          </button>
          <button
            type="button"
            onClick={handleScrollToUpload}
            className="inline-flex items-center gap-1.5 bg-[#E5BB45] hover:bg-[#D3A82F] text-[#171714] text-xs font-semibold py-1.5 px-2.5 sm:px-3.5 rounded-full shadow-2xs hover:shadow transition cursor-pointer shrink-0 min-h-[36px]"
          >
            <UploadCloud className="w-3.5 h-3.5 stroke-[2.2] shrink-0" />
            <span className="hidden sm:inline">Upload Statement</span>
            <span className="sm:hidden">Upload</span>
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
                <span>Financial Ingestion</span>
                <span>·</span>
                <span className="text-[#171714]">Batch Audit Trail</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-serif tracking-tight text-[#171714]">
                Imports &amp; Import History
              </h1>
              <p className="text-sm text-[#66645C] max-w-2xl leading-relaxed">
                Ingest bank and credit card statement files into {organizationName}. Every statement
                is fingerprinted with SHA-256 deduplication and normalized into integer minor units.
              </p>
            </div>

            {/* Quick Ledger Link */}
            <div className="flex items-center gap-3">
              <Link
                to="/transactions"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#171714] hover:text-[#66645C] bg-white border border-[#E8E7E2] px-3 py-2 rounded-xl shadow-2xs hover:bg-[#F8F7F2] transition"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#E5BB45]" />
                <span>Open Transaction Ledger</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[#66645C]" />
              </Link>
            </div>
          </div>

          {/* Cryptographic Pipeline Safeguard Notice */}
          <div className="rounded-2xl border border-[#E8E7E2] bg-white p-4 sm:p-5 shadow-2xs flex items-start gap-3.5">
            <div className="w-8 h-8 rounded-lg bg-[#FAF4E0] border border-[#E5BB45]/30 flex items-center justify-center shrink-0 text-[#171714] mt-0.5">
              <ShieldCheck className="w-4 h-4 text-[#171714]" />
            </div>
            <div className="space-y-1 text-xs">
              <div className="font-semibold text-[#171714]">
                Deterministic statement ingestion &amp; double-counting protection
              </div>
              <p className="text-[#66645C] leading-relaxed">
                Uploaded statement files undergo cryptographic hashing (SHA-256) scoped to this
                organization. Re-uploading identical files is blocked automatically to prevent
                duplicate balances. Transaction amounts are parsed strictly into minor units without
                floating-point drift.
              </p>
            </div>
          </div>
        </section>

        {/* Pipeline Summary Metrics Strip */}
        <section
          aria-label="Ingestion Overview Metrics"
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {/* Total Import Jobs */}
          <div className="p-5 rounded-2xl bg-white border border-[#E8E7E2] shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-[#66645C]">
              <span>Ingested Statements</span>
              <FileSpreadsheet className="w-4 h-4 text-[#E5BB45]" />
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight text-[#171714]">
              {isLoading ? (
                <div className="h-7 w-12 bg-[#E8E7E2]/60 animate-pulse rounded" />
              ) : (
                pagination.totalItems
              )}
            </div>
            <p className="text-[11px] text-[#66645C]">Historical statement batches</p>
          </div>

          {/* Accepted Transactions */}
          <div className="p-5 rounded-2xl bg-white border border-[#E8E7E2] shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-[#66645C]">
              <span>Accepted Records</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight text-[#171714]">
              {isLoading ? (
                <div className="h-7 w-16 bg-[#E8E7E2]/60 animate-pulse rounded" />
              ) : (
                totalAcceptedRows.toLocaleString()
              )}
            </div>
            <p className="text-[11px] text-[#66645C]">Normalized ledger transactions</p>
          </div>

          {/* Duplicate Records Skipped */}
          <div className="p-5 rounded-2xl bg-white border border-[#E8E7E2] shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-[#66645C]">
              <span>Deduplicated Records</span>
              <Copy className="w-4 h-4 text-[#E5BB45]" />
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight text-[#171714]">
              {isLoading ? (
                <div className="h-7 w-16 bg-[#E8E7E2]/60 animate-pulse rounded" />
              ) : (
                totalDuplicateRows.toLocaleString()
              )}
            </div>
            <p className="text-[11px] text-[#66645C]">Idempotent records preserved</p>
          </div>

          {/* Rejected Validation Errors */}
          <div className="p-5 rounded-2xl bg-white border border-[#E8E7E2] shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-[#66645C]">
              <span>Rejected Rows</span>
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
            <div className="text-2xl font-bold font-mono tracking-tight text-[#171714]">
              {isLoading ? (
                <div className="h-7 w-12 bg-[#E8E7E2]/60 animate-pulse rounded" />
              ) : (
                totalRejectedRows.toLocaleString()
              )}
            </div>
            <p className="text-[11px] text-[#66645C]">Caught by boundary validation</p>
          </div>
        </section>

        {/* ============================================================ */}
        {/* Upload Statement Area                                        */}
        {/* ============================================================ */}
        <section
          ref={uploadSectionRef}
          id="statement-upload-zone"
          aria-label="Upload Statement File"
          className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E8E7E2] shadow-2xs space-y-5"
        >
          <FileUploadZone
            accounts={accounts}
            onImportSuccess={handleUploadSuccess}
            onViewExistingJob={handleInspectExistingJob}
          />
        </section>

        {/* ============================================================ */}
        {/* Import History Table                                         */}
        {/* ============================================================ */}
        <section aria-label="Statement Import History" className="space-y-4">
          {/* Controls Bar: Search & Status Filter */}
          <div className="bg-white p-4 rounded-2xl border border-[#E8E7E2] shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-[#66645C] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by file name, job ID, or hash..."
                aria-label="Search import history"
                className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-[#F8F7F2] border border-[#E8E7E2] rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#E5BB45] transition placeholder:text-[#66645C]"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Clear search input"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#66645C] hover:text-[#171714] p-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="import-status-filter"
                className="text-xs text-[#66645C] whitespace-nowrap"
              >
                Status:
              </label>
              <select
                id="import-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-[#F8F7F2] border border-[#E8E7E2] text-xs text-[#171714] rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#E5BB45] cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="processing">Processing</option>
                <option value="pending">Queued</option>
                <option value="failed">Failed</option>
              </select>

              {(searchTerm || statusFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                  }}
                  className="text-xs text-[#66645C] hover:text-[#171714] underline underline-offset-2 px-2 py-1 transition cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Loading Skeleton */}
          {isLoading && (
            <div className="bg-white rounded-3xl border border-[#E8E7E2] p-6 space-y-4 shadow-2xs">
              {[1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className="h-16 bg-[#F8F7F2] rounded-2xl animate-pulse flex items-center justify-between px-6"
                >
                  <div className="space-y-2">
                    <div className="h-4 w-44 bg-[#E8E7E2] rounded" />
                    <div className="h-3 w-28 bg-[#E8E7E2]/70 rounded" />
                  </div>
                  <div className="h-6 w-24 bg-[#E8E7E2] rounded-full" />
                  <div className="h-4 w-20 bg-[#E8E7E2] rounded" />
                  <div className="h-8 w-24 bg-[#E8E7E2] rounded-xl" />
                </div>
              ))}
            </div>
          )}

          {/* Error Alert */}
          {isError && !isLoading && (
            <div
              role="alert"
              className="p-6 rounded-3xl bg-red-50 border border-red-200 text-red-900 space-y-3"
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                <h3 className="text-sm font-bold">Failed to load statement import history</h3>
              </div>
              <p className="text-xs text-red-700">
                {error instanceof Error
                  ? error.message
                  : 'An unexpected network error occurred while retrieving statement import records.'}
              </p>
              <button
                type="button"
                onClick={handleRefresh}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Request</span>
              </button>
            </div>
          )}

          {/* Empty History State */}
          {!isLoading && !isError && importJobs.length === 0 && (
            <div className="bg-white rounded-3xl border border-[#E8E7E2] p-12 text-center space-y-5 shadow-2xs">
              <div className="w-14 h-14 rounded-2xl bg-[#FAF4E0] border border-[#E5BB45]/40 flex items-center justify-center mx-auto text-[#171714]">
                <FileSpreadsheet className="w-7 h-7" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className="text-lg font-bold text-[#171714]">No Statement Imports Yet</h3>
                <p className="text-xs text-[#66645C] leading-relaxed">
                  Your organization hasn&apos;t ingested any bank or credit card statements yet.
                  Upload your first statement above to populate normalized transactions.
                </p>
              </div>
              <div>
                <button
                  type="button"
                  onClick={handleScrollToUpload}
                  className="inline-flex items-center gap-2 bg-[#E5BB45] hover:bg-[#D3A82F] text-[#171714] text-xs font-semibold py-2.5 px-5 rounded-full shadow-xs transition cursor-pointer"
                >
                  <UploadCloud className="w-4 h-4 stroke-[2.2]" />
                  <span>Upload Statement File</span>
                </button>
              </div>
            </div>
          )}

          {/* Empty Filter State */}
          {!isLoading && !isError && importJobs.length > 0 && filteredJobs.length === 0 && (
            <div className="bg-white rounded-3xl border border-[#E8E7E2] p-10 text-center space-y-4 shadow-2xs">
              <div className="w-12 h-12 rounded-xl bg-[#F8F7F2] border border-[#E8E7E2] flex items-center justify-center mx-auto text-[#66645C]">
                <Search className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-sm mx-auto">
                <h3 className="text-sm font-bold text-[#171714]">No matching import jobs</h3>
                <p className="text-xs text-[#66645C]">
                  No statements match your search &quot;{searchTerm}&quot; or status filter.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setStatusFilter('all');
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#171714] bg-[#F8F7F2] hover:bg-[#E8E7E2] px-4 py-2 rounded-xl border border-[#E8E7E2] transition cursor-pointer"
              >
                <span>Clear Filters</span>
              </button>
            </div>
          )}

          {/* History Table & Mobile Card List */}
          {!isLoading && !isError && filteredJobs.length > 0 && (
            <div className="bg-white rounded-2xl sm:rounded-3xl border border-[#E8E7E2] shadow-2xs overflow-hidden">
              {/* Desktop / Tablet Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#E8E7E2] bg-[#F8F7F2]/60 text-[#66645C] uppercase text-[10px] tracking-wider font-semibold select-none">
                      <th scope="col" className="py-3.5 pl-6 pr-4">
                        Statement File &amp; Hash
                      </th>
                      <th scope="col" className="py-3.5 px-4">
                        Target Account
                      </th>
                      <th scope="col" className="py-3.5 px-4">
                        Status
                      </th>
                      <th scope="col" className="py-3.5 px-4 text-center">
                        Rows Breakdown
                      </th>
                      <th scope="col" className="py-3.5 px-4">
                        Ingested At
                      </th>
                      <th scope="col" className="py-3.5 pr-6 pl-4 text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E7E2]">
                    {filteredJobs.map((job) => {
                      const account = accountsMap.get(job.accountId);
                      const formattedDate = new Date(job.createdAt).toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      return (
                        <tr key={job.id} className="hover:bg-[#F8F7F2]/40 transition-colors group">
                          {/* File Name & Hash */}
                          <td className="py-4 pl-6 pr-4 align-middle">
                            <div className="space-y-1">
                              <div className="font-bold text-[#171714] text-sm flex items-center gap-2">
                                <FileText className="w-4 h-4 text-[#E5BB45] shrink-0" />
                                <span className="truncate max-w-xs">{job.fileName}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-[#66645C]">
                                <span className="font-mono text-[10px] bg-[#F8F7F2] border border-[#E8E7E2] px-1.5 py-0.5 rounded text-[#66645C]">
                                  SHA: {job.fileHash.slice(0, 8)}...
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => handleCopyHash(job.fileHash, e)}
                                  title="Copy SHA-256 Hash"
                                  className="text-[#66645C] hover:text-[#171714] transition p-0.5 cursor-pointer"
                                  aria-label={`Copy SHA-256 Hash for ${job.fileName}`}
                                >
                                  {copiedHash === job.fileHash ? (
                                    <Check className="w-3 h-3 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3 h-3" />
                                  )}
                                </button>
                              </div>
                            </div>
                          </td>

                          {/* Target Account */}
                          <td className="py-4 px-4 align-middle">
                            {account ? (
                              <div className="space-y-0.5">
                                <div className="font-semibold text-xs text-[#171714]">
                                  {account.name}
                                </div>
                                <div className="text-[11px] text-[#66645C] flex items-center gap-1.5">
                                  <span>{account.institutionName}</span>
                                  <span>·</span>
                                  <span className="font-mono font-bold text-[10px] uppercase px-1 rounded bg-[#F8F7F2] border border-[#E8E7E2]">
                                    {account.currency}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <span className="font-mono text-[11px] text-[#66645C]">
                                ID: {job.accountId.slice(0, 8)}...
                              </span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-4 px-4 align-middle">{renderStatusBadge(job)}</td>

                          {/* Rows Summary Breakdown */}
                          <td className="py-4 px-4 align-middle text-center">
                            <div className="inline-flex items-center gap-2 font-mono text-xs">
                              <span title="Accepted Rows" className="text-emerald-700 font-bold">
                                {job.acceptedRows.toLocaleString()}
                              </span>
                              <span className="text-[#E8E7E2]">/</span>
                              <span title="Total Rows" className="text-[#171714]">
                                {job.totalRows.toLocaleString()}
                              </span>
                              {job.rejectedRows > 0 && (
                                <span
                                  title="Rejected Rows"
                                  className="text-[10px] px-1.5 py-0.2 rounded-full bg-red-100 text-red-800 font-bold"
                                >
                                  {job.rejectedRows} rej
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Date Ingested */}
                          <td className="py-4 px-4 align-middle text-[#66645C] text-xs font-mono">
                            {formattedDate}
                          </td>

                          {/* Actions */}
                          <td className="py-4 pr-6 pl-4 align-middle text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Inspect Details / Row Errors */}
                              <button
                                type="button"
                                onClick={() => setDetailJob(job)}
                                title="Inspect job outcomes and row validation diagnostics"
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#E8E7E2] bg-white text-[#171714] text-xs font-semibold hover:bg-[#F8F7F2] transition cursor-pointer"
                              >
                                <Info className="w-3.5 h-3.5 text-[#E5BB45]" />
                                <span>Inspect</span>
                              </button>

                              {/* Ledger Link */}
                              <Link
                                to={`/transactions?accountId=${job.accountId}`}
                                title="View transactions in Ledger"
                                className="p-1.5 rounded-xl border border-[#E8E7E2] bg-white text-[#66645C] hover:text-[#171714] hover:bg-[#F8F7F2] transition cursor-pointer"
                                aria-label={`View ledger for ${job.fileName}`}
                              >
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List (Visible on phones < md) */}
              <div className="md:hidden divide-y divide-[#E8E7E2]">
                {filteredJobs.map((job) => {
                  const account = accountsMap.get(job.accountId);
                  const formattedDate = new Date(job.createdAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div key={job.id} className="p-4 space-y-3">
                      {/* Top Row: File Name & Status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="font-bold text-[#171714] text-sm flex items-center gap-1.5">
                            <FileText className="w-4 h-4 text-[#E5BB45] shrink-0" />
                            <span className="truncate max-w-[190px]">{job.fileName}</span>
                          </div>
                          <div className="text-[11px] text-[#66645C]">
                            {account ? (
                              <span>
                                {account.name} · {account.currency}
                              </span>
                            ) : (
                              <span>Target: {job.accountId.slice(0, 8)}...</span>
                            )}
                          </div>
                        </div>

                        <div className="shrink-0">{renderStatusBadge(job)}</div>
                      </div>

                      {/* Middle Row: Rows Breakdown & Date */}
                      <div className="flex items-center justify-between text-xs text-[#66645C] pt-1">
                        <div className="inline-flex items-center gap-1.5 font-mono text-xs">
                          <span className="text-emerald-700 font-bold">
                            {job.acceptedRows.toLocaleString()}
                          </span>
                          <span className="text-stone-300">/</span>
                          <span className="text-[#171714]">
                            {job.totalRows.toLocaleString()} rows
                          </span>
                          {job.rejectedRows > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-800 font-bold">
                              {job.rejectedRows} rej
                            </span>
                          )}
                        </div>

                        <span className="text-[10px] font-mono text-[#66645C]">
                          {formattedDate}
                        </span>
                      </div>

                      {/* SHA-256 Hash Row */}
                      <div className="flex items-center justify-between text-[11px] text-[#66645C] bg-[#F8F7F2] p-2 rounded-lg border border-[#E8E7E2]">
                        <span className="font-mono text-[10px] truncate">
                          SHA: {job.fileHash.slice(0, 16)}...
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleCopyHash(job.fileHash, e)}
                          className="p-0.5 text-[#66645C] hover:text-[#171714]"
                          aria-label={`Copy SHA-256 for ${job.fileName}`}
                        >
                          {copiedHash === job.fileHash ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      {/* Actions Row */}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setDetailJob(job)}
                          className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#E8E7E2] bg-white text-[#171714] text-xs font-semibold hover:bg-[#F8F7F2] transition"
                        >
                          <Info className="w-4 h-4 text-[#E5BB45]" />
                          <span>Inspect Diagnostics</span>
                        </button>

                        <Link
                          to={`/transactions?accountId=${job.accountId}`}
                          className="min-h-[40px] px-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#171714] text-white text-xs font-semibold hover:bg-black transition"
                        >
                          <span>Ledger</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Table Pagination Bar */}
              <div className="p-4 bg-[#F8F7F2]/40 border-t border-[#E8E7E2] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#66645C]">
                <div>
                  Showing {filteredJobs.length} of {pagination.totalItems} import job
                  {pagination.totalItems === 1 ? '' : 's'}
                </div>

                {pagination.totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[#171714]">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                        className="p-1.5 rounded-lg border border-[#E8E7E2] bg-white text-[#171714] hover:bg-[#F8F7F2] transition disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                        aria-label="Previous history page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={page >= pagination.totalPages}
                        onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))}
                        className="p-1.5 rounded-lg border border-[#E8E7E2] bg-white text-[#171714] hover:bg-[#F8F7F2] transition disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                        aria-label="Next history page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ============================================================ */}
      {/* Import Details & Diagnostics Modal                           */}
      {/* ============================================================ */}
      {detailJob && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-details-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-3xl bg-white rounded-3xl border border-[#E8E7E2] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-[#E8E7E2] bg-[#F8F7F2]/60">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FAF4E0] border border-[#E5BB45]/40 flex items-center justify-center text-[#171714]">
                  <FileSpreadsheet className="w-5 h-5 stroke-[2]" />
                </div>
                <div>
                  <h3 id="import-details-title" className="text-base font-bold text-[#171714]">
                    {detailJob.fileName}
                  </h3>
                  <p className="text-xs text-[#66645C]">
                    Import job execution diagnostics and batch validation record.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDetailJob(null)}
                className="p-2 rounded-xl text-[#66645C] hover:text-[#171714] hover:bg-[#E8E7E2] transition cursor-pointer"
                aria-label="Close import details dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto text-xs">
              {/* Top Row Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3.5 rounded-2xl bg-[#F8F7F2] border border-[#E8E7E2]">
                  <span className="text-[10px] uppercase font-semibold text-[#66645C] block mb-1">
                    Total Rows
                  </span>
                  <span className="font-mono font-bold text-lg text-[#171714]">
                    {detailJob.totalRows.toLocaleString()}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200">
                  <span className="text-[10px] uppercase font-semibold text-emerald-800 block mb-1">
                    Accepted
                  </span>
                  <span className="font-mono font-bold text-lg text-emerald-900">
                    {detailJob.acceptedRows.toLocaleString()}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200">
                  <span className="text-[10px] uppercase font-semibold text-amber-800 block mb-1">
                    Duplicates
                  </span>
                  <span className="font-mono font-bold text-lg text-amber-900">
                    {detailJob.duplicateRows.toLocaleString()}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200">
                  <span className="text-[10px] uppercase font-semibold text-red-800 block mb-1">
                    Rejected
                  </span>
                  <span className="font-mono font-bold text-lg text-red-900">
                    {detailJob.rejectedRows.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Status and Error Alert */}
              <div className="flex items-center justify-between p-4 rounded-2xl bg-white border border-[#E8E7E2]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#66645C]">Execution Status:</span>
                  {renderStatusBadge(detailJob)}
                </div>
                <div className="text-xs font-mono text-[#66645C]">
                  {new Date(detailJob.createdAt).toLocaleString()}
                </div>
              </div>

              {detailJob.errorMessage && (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-900 space-y-1">
                  <span className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    Ingestion Error Message
                  </span>
                  <p className="text-red-800">{detailJob.errorMessage}</p>
                </div>
              )}

              {/* Hashes and Identifiers */}
              <div className="p-4 rounded-2xl bg-white border border-[#E8E7E2] space-y-3">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-[#66645C]">
                    Import Job ID
                  </span>
                  <div className="flex items-center justify-between gap-2 bg-[#F8F7F2] border border-[#E8E7E2] rounded-xl px-3 py-2 font-mono text-[11px] text-[#171714]">
                    <span className="truncate">{detailJob.id}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyJobId(detailJob.id)}
                      className="text-[#66645C] hover:text-[#171714] shrink-0 p-1 cursor-pointer"
                      aria-label="Copy Import Job ID"
                    >
                      {copiedJobId === detailJob.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-[#66645C]">
                    SHA-256 File Hash
                  </span>
                  <div className="flex items-center justify-between gap-2 bg-[#F8F7F2] border border-[#E8E7E2] rounded-xl px-3 py-2 font-mono text-[11px] text-[#171714]">
                    <span className="truncate">{detailJob.fileHash}</span>
                    <button
                      type="button"
                      onClick={() => handleCopyHash(detailJob.fileHash)}
                      className="text-[#66645C] hover:text-[#171714] shrink-0 p-1 cursor-pointer"
                      aria-label="Copy SHA-256 Hash"
                    >
                      {copiedHash === detailJob.fileHash ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-semibold text-[#66645C]">
                    Target Account
                  </span>
                  <div className="bg-[#F8F7F2] border border-[#E8E7E2] rounded-xl px-3 py-2 text-xs text-[#171714] flex items-center justify-between">
                    <span className="font-semibold">
                      {accountsMap.get(detailJob.accountId)?.name || detailJob.accountId}
                    </span>
                    <span className="font-mono text-[10px] text-[#66645C]">
                      ID: {detailJob.accountId}
                    </span>
                  </div>
                </div>
              </div>

              {/* Row-Level Diagnostics (if rejectedRows > 0) */}
              {detailJob.rejectedRows > 0 && (
                <div className="space-y-2">
                  <RowErrorsTable importId={detailJob.id} />
                </div>
              )}

              {/* Actions Footer */}
              <div className="pt-3 border-t border-[#E8E7E2] flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setDetailJob(null)}
                  className="px-4 py-2 rounded-xl border border-[#E8E7E2] bg-white text-[#171714] text-xs font-semibold hover:bg-[#F8F7F2] transition cursor-pointer"
                >
                  Close
                </button>

                <Link
                  to={`/transactions?accountId=${detailJob.accountId}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#171714] text-white text-xs font-semibold hover:bg-black transition cursor-pointer"
                >
                  <span>Open Transactions Ledger</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};
