import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { healthService } from '../services/health.service';
import { financialService } from '../services/financial.service';
import { env } from '../lib/env';
import { StatusBadge } from '../components/StatusBadge';
import { FileUploadZone } from '../components/FileUploadZone';
import { ImportSummaryBanner } from '../components/ImportSummaryBanner';
import { RowErrorsTable } from '../components/RowErrorsTable';
import { TransactionLedger } from '../components/TransactionLedger';
import { ReconciliationDashboard } from '../components/ReconciliationDashboard';
import { FindingsDashboard } from '../components/FindingsDashboard';
import { CashFlowDashboard } from '../components/CashFlowDashboard';
import { ActionCenterDashboard } from '../components/ActionCenterDashboard';
import type { ImportJob } from '@moneylens/shared';
import {
  Zap,
  Server,
  Database,
  RefreshCw,
  Layers,
  Shield,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Search,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Activity,
  ArrowLeftRight,
  ShieldAlert,
} from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    'ingestion' | 'reconciliation' | 'findings' | 'cash-flow' | 'actions' | 'telemetry'
  >('ingestion');
  const [latestJob, setLatestJob] = useState<ImportJob | null>(null);
  const [isErrorsOpen, setIsErrorsOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Accounts query for statement selector
  const { data: accountsData } = useQuery({
    queryKey: ['financial-accounts'],
    queryFn: financialService.getAccounts,
    retry: 1,
  });

  // System Diagnostics Queries
  const {
    data: health,
    isLoading: isHealthLoading,
    isError: isHealthError,
    refetch: refetchHealth,
    isFetching: isHealthFetching,
  } = useQuery({
    queryKey: ['system-health'],
    queryFn: healthService.getHealth,
    retry: 1,
    refetchInterval: 30000,
  });

  const {
    data: readiness,
    isLoading: isReadinessLoading,
    isError: isReadinessError,
    refetch: refetchReadiness,
    isFetching: isReadinessFetching,
  } = useQuery({
    queryKey: ['system-readiness'],
    queryFn: healthService.getReadiness,
    retry: 1,
    refetchInterval: 30000,
  });

  const isRefreshing = isHealthFetching || isReadinessFetching;

  const handleRefreshDiagnostics = () => {
    refetchHealth();
    refetchReadiness();
  };

  const handleImportSuccess = (job: ImportJob) => {
    setLatestJob(job);
    setIsErrorsOpen(job.rejectedRows > 0);
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="space-y-8">
      {/* Platform Hero Section */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-800/80 bg-gradient-to-b from-slate-900/60 to-slate-950 p-6 sm:p-10 shadow-2xl">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
            Phase 2 &bull; Domain Modeling & Ingestion Foundation
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
            Financial Intelligence &{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200">
              Data Ingestion
            </span>
          </h1>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Ingest financial statements from CSV and Excel with bounded parsing, automated column
            mapping, minor-unit financial normalization, and duplicate record protection.
          </p>

          <div className="pt-2 flex flex-wrap gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
              <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
              Integer Minor Unit Precision
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
              <Search className="w-3.5 h-3.5 text-teal-400" />
              Row-Level Diagnostics
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              Fingerprint Duplicate Protection
            </span>
          </div>
        </div>
      </section>

      {/* Workspace Navigation Tabs */}
      <div className="border-b border-slate-800 flex items-center gap-4 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab('ingestion')}
          className={`pb-3 px-1 flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === 'ingestion'
              ? 'border-emerald-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          <span>Statement Ingestion & Ledger</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('reconciliation')}
          className={`pb-3 px-1 flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === 'reconciliation'
              ? 'border-emerald-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ArrowLeftRight className="w-4 h-4 text-emerald-400" />
          <span>Reconciliation Engine</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('findings')}
          className={`pb-3 px-1 flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === 'findings'
              ? 'border-rose-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-rose-400" />
          <span>Financial Leakage & Intelligence</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cash-flow')}
          className={`pb-3 px-1 flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === 'cash-flow'
              ? 'border-sky-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-sky-400" />
          <span>Cash Flow & Scenarios</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('actions')}
          className={`pb-3 px-1 flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === 'actions'
              ? 'border-indigo-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Zap className="w-4 h-4 text-indigo-400" />
          <span>Action Center</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('telemetry')}
          className={`pb-3 px-1 flex items-center gap-2 border-b-2 transition cursor-pointer ${
            activeTab === 'telemetry'
              ? 'border-emerald-500 text-white'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4 text-emerald-400" />
          <span>System Diagnostics & Architecture</span>
        </button>
      </div>

      {/* Tab 1: Financial Ingestion & Ledger */}
      {activeTab === 'ingestion' && (
        <div className="space-y-8">
          {/* File Upload Dropzone */}
          <section className="rounded-3xl border border-slate-800 bg-slate-950 p-6 shadow-lg">
            <FileUploadZone
              accounts={accountsData?.items || []}
              onImportSuccess={handleImportSuccess}
            />
          </section>

          {/* Import Processing Summary & Diagnostics */}
          {latestJob && (
            <section className="space-y-4">
              <ImportSummaryBanner
                job={latestJob}
                isErrorsOpen={isErrorsOpen}
                onToggleErrors={() => setIsErrorsOpen((prev) => !prev)}
              />

              {isErrorsOpen && <RowErrorsTable importId={latestJob.id} />}
            </section>
          )}

          {/* Transaction Ledger */}
          <section>
            <TransactionLedger refreshTrigger={refreshTrigger} />
          </section>
        </div>
      )}

      {/* Tab 2: Financial Reconciliation Engine */}
      {activeTab === 'reconciliation' && (
        <section>
          <ReconciliationDashboard accounts={accountsData?.items || []} />
        </section>
      )}

      {/* Tab 3: Financial Findings & Leakage Detection */}
      {activeTab === 'findings' && (
        <section>
          <FindingsDashboard />
        </section>
      )}

      {/* Tab 4: Cash Flow Forecasting & Scenario Planning */}
      {activeTab === 'cash-flow' && (
        <section>
          <CashFlowDashboard />
        </section>
      )}

      {/* Tab 5: Business Action Center */}
      {activeTab === 'actions' && (
        <section>
          <ActionCenterDashboard />
        </section>
      )}

      {/* Tab 6: System Diagnostics & Architecture */}
      {activeTab === 'telemetry' && (
        <div className="space-y-8">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-white">System Diagnostics</h2>
                <p className="text-xs text-slate-400">
                  Real-time connectivity and readiness telemetry from the backend API
                </p>
              </div>

              <button
                type="button"
                onClick={handleRefreshDiagnostics}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 active:scale-95 text-xs font-medium text-slate-200 transition-all cursor-pointer disabled:opacity-50"
                aria-label="Refresh system diagnostics"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-emerald-400 ${isRefreshing ? 'animate-spin' : ''}`}
                />
                <span>{isRefreshing ? 'Checking...' : 'Refresh Telemetry'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Process Health Card */}
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">API Service Process</h3>
                      <p className="text-xs text-slate-400">Express Liveness Check (/health)</p>
                    </div>
                  </div>

                  {isHealthLoading ? (
                    <StatusBadge status="loading" label="Connecting..." />
                  ) : isHealthError ? (
                    <StatusBadge status="error" label="Unavailable" />
                  ) : health?.status === 'ok' ? (
                    <StatusBadge
                      status="success"
                      label="Operational"
                      sublabel={`v${health.version}`}
                    />
                  ) : (
                    <StatusBadge status="warning" label="Degraded" />
                  )}
                </div>

                <div className="pt-2 border-t border-slate-800/60 space-y-2 text-xs">
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Target Endpoint</span>
                    <span className="font-mono text-slate-300">{env.VITE_API_URL}/health</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Process Uptime</span>
                    <span className="font-mono text-slate-300">
                      {health ? `${health.uptime.toFixed(1)}s` : '--'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Environment</span>
                    <span className="font-mono text-slate-300 uppercase">
                      {health?.environment || 'UNKNOWN'}
                    </span>
                  </div>
                </div>

                {isHealthError && (
                  <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-900/50 text-xs text-rose-300 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">Cannot reach API server</p>
                      <p className="text-rose-400/80 mt-0.5">
                        Start the backend service using{' '}
                        <code className="text-white">npm run dev:api</code>.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Database Infrastructure Readiness */}
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                      <Database className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">Database Infrastructure</h3>
                      <p className="text-xs text-slate-400">MongoDB Readiness Check (/ready)</p>
                    </div>
                  </div>

                  {isReadinessLoading ? (
                    <StatusBadge status="loading" label="Connecting..." />
                  ) : isReadinessError ? (
                    <StatusBadge status="error" label="Disconnected" />
                  ) : readiness?.status === 'ready' ? (
                    <StatusBadge status="success" label="Connected" sublabel="Ready" />
                  ) : (
                    <StatusBadge status="warning" label="Not Ready" sublabel="Degraded" />
                  )}
                </div>

                <div className="pt-2 border-t border-slate-800/60 space-y-2 text-xs">
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Infrastructure Target</span>
                    <span className="font-mono text-slate-300">MongoDB Cluster</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Service Status</span>
                    <span className="font-mono text-slate-300 uppercase">
                      {readiness?.services.database.status ||
                        (isReadinessError ? 'DOWN' : 'UNKNOWN')}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Readiness Probe</span>
                    <span className="font-mono text-slate-300">
                      {readiness?.status === 'ready' ? 'PASSING (200 OK)' : 'DEGRADED (503)'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Engineering Foundation Pillars */}
          <section className="space-y-4">
            <h2 className="text-lg font-bold tracking-tight text-white">
              Engineering Architecture
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/20 p-5 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <Layers className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-white">Clean Monorepo</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Unified npm workspaces dividing <code className="text-slate-200">apps/web</code>,{' '}
                  <code className="text-slate-200">apps/api</code>, and{' '}
                  <code className="text-slate-200">packages/shared</code> with zero circular
                  dependencies.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/20 p-5 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400">
                  <Shield className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-white">Defense-in-Depth</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Helmet security headers, strict CORS domain gating, request body size limits, rate
                  limiting, and structured Pino logging with redaction.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/20 p-5 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-white">Strict Type Safety</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  TypeScript strict mode throughout the entire codebase, unified Zod schemas for
                  runtime contract and environment verification.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/20 p-5 space-y-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                  <ArrowRight className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-semibold text-white">Phase Roadmap</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Phase 2 establishes normalized financial ingestion. Phase 3 introduces automated
                  payment discrepancy engines and leakage detection algorithms.
                </p>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
