import React from 'react';
import { CheckCircle2, Copy, AlertTriangle, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import type { ImportJob } from '@moneylens/shared';

interface ImportSummaryBannerProps {
  job: ImportJob;
  isErrorsOpen: boolean;
  onToggleErrors: () => void;
}

export const ImportSummaryBanner: React.FC<ImportSummaryBannerProps> = ({
  job,
  isErrorsOpen,
  onToggleErrors,
}) => {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-slate-800 text-slate-300">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">{job.fileName}</h3>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {job.status}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Processed on {new Date(job.createdAt).toLocaleString()}
            </p>
          </div>
        </div>

        {job.rejectedRows > 0 && (
          <button
            type="button"
            onClick={onToggleErrors}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-950/60 border border-rose-900/60 text-xs font-semibold text-rose-300 transition cursor-pointer"
          >
            <span>
              {isErrorsOpen ? 'Hide Row Errors' : `Inspect ${job.rejectedRows} Row Errors`}
            </span>
            {isErrorsOpen ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800/60 text-xs">
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
          <span className="text-slate-400 block mb-1">Total Rows</span>
          <span className="text-base font-bold text-white font-mono">{job.totalRows}</span>
        </div>

        <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-900/40">
          <div className="flex items-center gap-1.5 text-emerald-400 mb-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Accepted</span>
          </div>
          <span className="text-base font-bold text-emerald-300 font-mono">{job.acceptedRows}</span>
        </div>

        <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-900/40">
          <div className="flex items-center gap-1.5 text-amber-400 mb-1">
            <Copy className="w-3.5 h-3.5" />
            <span>Duplicates</span>
          </div>
          <span className="text-base font-bold text-amber-300 font-mono">{job.duplicateRows}</span>
        </div>

        <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-900/40">
          <div className="flex items-center gap-1.5 text-rose-400 mb-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Rejected</span>
          </div>
          <span className="text-base font-bold text-rose-300 font-mono">{job.rejectedRows}</span>
        </div>
      </div>
    </div>
  );
};
