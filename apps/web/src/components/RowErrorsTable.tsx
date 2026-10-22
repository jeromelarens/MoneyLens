import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { financialService } from '../services/financial.service';
import { AlertCircle, Loader2 } from 'lucide-react';

interface RowErrorsTableProps {
  importId: string;
}

export const RowErrorsTable: React.FC<RowErrorsTableProps> = ({ importId }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['import-errors', importId],
    queryFn: () => financialService.getImportRowErrors(importId, 1, 50),
  });

  if (isLoading) {
    return (
      <div className="p-8 rounded-2xl border border-slate-800 bg-slate-900/30 flex items-center justify-center gap-2 text-xs text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
        <span>Loading row-level error details...</span>
      </div>
    );
  }

  if (isError || !data || data.items.length === 0) {
    return (
      <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/20 text-center text-xs text-slate-400">
        No specific row errors to display.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-rose-900/40 bg-slate-900/60 overflow-hidden">
      <div className="p-4 border-b border-rose-900/30 bg-rose-950/20 flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-rose-400" />
        <h4 className="text-xs font-bold text-rose-300 uppercase tracking-wider">
          Row-Level Validation Diagnostics ({data.pagination.totalItems} Errors)
        </h4>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
            <tr>
              <th className="py-2.5 px-4 w-20">Row #</th>
              <th className="py-2.5 px-4 w-40">Error Code</th>
              <th className="py-2.5 px-4">Message</th>
              <th className="py-2.5 px-4">Raw Content</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {data.items.map((err) => (
              <tr key={err.id} className="hover:bg-slate-800/30 transition">
                <td className="py-2.5 px-4 font-mono text-slate-300">{err.rowNumber}</td>
                <td className="py-2.5 px-4">
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-400 border border-rose-900/60">
                    {err.errorCode}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-slate-300">{err.errorMessage}</td>
                <td className="py-2.5 px-4 font-mono text-[10px] text-slate-400 truncate max-w-xs">
                  {JSON.stringify(err.rawData)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
