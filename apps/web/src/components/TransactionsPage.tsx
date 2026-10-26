import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { financialService } from '../services/financial.service';
import { healthService } from '../services/health.service';
import { TransactionLedger } from './TransactionLedger';
import { FileUploadZone } from './FileUploadZone';
import { ImportSummaryBanner } from './ImportSummaryBanner';
import { RowErrorsTable } from './RowErrorsTable';
import { Layout } from './Layout';
import type { ImportJob } from '@moneylens/shared';
import { FileSpreadsheet, RefreshCw, X } from 'lucide-react';

export const TransactionsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const urlAccountId = searchParams.get('accountId') || undefined;

  // Document title
  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'Transactions Ledger — MoneyLens';
    return () => {
      document.title = originalTitle;
    };
  }, []);

  // State: Modal and Refresh Trigger
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [latestJob, setLatestJob] = useState<ImportJob | null>(null);
  const [isErrorsOpen, setIsErrorsOpen] = useState<boolean>(false);

  // Accounts for upload selector
  const { data: accountsData } = useQuery({
    queryKey: ['financial-accounts'],
    queryFn: financialService.getAccounts,
    staleTime: 60000,
  });

  // Health check for status indicator
  const {
    data: healthData,
    refetch: refetchHealth,
    isFetching: isHealthFetching,
  } = useQuery({
    queryKey: ['system-health'],
    queryFn: healthService.getHealth,
    staleTime: 30000,
  });

  const handleManualRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
    refetchHealth();
  };

  const handleImportSuccess = (job: ImportJob) => {
    setLatestJob(job);
    setIsErrorsOpen(job.rejectedRows > 0);
    setRefreshTrigger((prev) => prev + 1);
  };

  // Close modal on Escape key and lock body scroll
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isImportModalOpen) {
        setIsImportModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isImportModalOpen]);

  // Lock body scroll when import modal is open
  useEffect(() => {
    if (isImportModalOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [isImportModalOpen]);

  return (
    <Layout
      pageTitle="Transactions & Ledger"
      headerActions={
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isHealthFetching}
            title="Refresh transactions register"
            className="w-9 h-9 rounded-xl border border-[#DEDDD5] bg-white text-[#66645C] hover:text-[#171714] hover:bg-[#F8F7F2] transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center shrink-0"
            aria-label="Refresh transactions register"
          >
            <RefreshCw
              className={`w-4 h-4 ${isHealthFetching ? 'animate-spin text-[#E5BB45]' : ''}`}
            />
          </button>
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center gap-1.5 bg-[#E5BB45] hover:bg-[#D3A82F] text-[#171714] text-xs font-semibold py-1.5 px-2.5 sm:px-3.5 rounded-full shadow-2xs hover:shadow transition cursor-pointer shrink-0 min-h-[36px]"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 stroke-[2.2] shrink-0" />
            <span className="hidden sm:inline">Import Statement</span>
            <span className="sm:hidden">Import</span>
          </button>
        </div>
      }
    >
      <div className="space-y-8">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-[#E8E7E2]">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#E8E7E2] shadow-2xs text-xs font-semibold text-[#66645C]">
              <span className="w-2 h-2 rounded-full bg-[#E5BB45]" />
              <span>Verified Financial Register</span>
              {healthData?.status === 'ok' && (
                <span className="text-emerald-700 font-medium">&bull; API Online</span>
              )}
            </div>

            <h1 className="font-serif text-3xl sm:text-4xl text-[#171714] tracking-tight font-normal">
              Transactions
            </h1>

            <p className="text-sm sm:text-base text-[#66645C] leading-relaxed">
              Verified transaction register across all synced financial accounts and statements.
              Normalized to integer minor units with duplicate prevention.
            </p>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isHealthFetching}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-[#E8E7E2] text-xs font-semibold text-[#171714] hover:bg-[#F8F7F2] transition shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
              title="Refresh ledger records"
              aria-label="Refresh transaction records"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-[#66645C] ${isHealthFetching ? 'animate-spin' : ''}`}
              />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#171714] text-white text-xs font-semibold hover:bg-black transition shadow-xs cursor-pointer active:scale-95"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#E5BB45]" />
              <span>Import Transactions</span>
            </button>
          </div>
        </div>

        {/* Import Banner Feedback if just uploaded */}
        {latestJob && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#66645C] uppercase tracking-wider">
                Recent Import Results
              </span>
              <button
                type="button"
                onClick={() => setLatestJob(null)}
                className="text-xs text-[#66645C] hover:text-[#171714] cursor-pointer"
              >
                Dismiss
              </button>
            </div>
            <ImportSummaryBanner
              job={latestJob}
              isErrorsOpen={isErrorsOpen}
              onToggleErrors={() => setIsErrorsOpen((prev) => !prev)}
            />
            {isErrorsOpen && <RowErrorsTable importId={latestJob.id} />}
          </section>
        )}

        {/* Full Interactive Transaction Ledger */}
        <TransactionLedger
          initialAccountId={urlAccountId}
          refreshTrigger={refreshTrigger}
          onImportClick={() => setIsImportModalOpen(true)}
        />
      </div>

      {/* Modal: Statement File Upload */}
      {isImportModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Import Transactions Statement"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs"
        >
          <div className="bg-white rounded-2xl sm:rounded-3xl border border-[#E8E7E2] max-w-xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8E7E2]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#FAF4E0] border border-[#E5BB45]/40 flex items-center justify-center">
                  <FileSpreadsheet className="w-4 h-4 text-[#B89020]" />
                </div>
                <h3 className="font-serif text-base sm:text-lg font-bold text-[#171714]">
                  Import Transactions Statement
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="w-9 h-9 rounded-lg text-[#66645C] hover:text-[#171714] hover:bg-[#F8F7F2] transition flex items-center justify-center"
                aria-label="Close import dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <FileUploadZone
              accounts={accountsData?.items || []}
              onImportSuccess={(job) => {
                handleImportSuccess(job);
                setIsImportModalOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </Layout>
  );
};
