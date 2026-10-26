import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { financialService } from '../services/financial.service';
import { AlertCircle, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';

interface RowErrorsTableProps {
  importId: string;
}

export const RowErrorsTable: React.FC<RowErrorsTableProps> = ({ importId }) => {
  const [page, setPage] = useState<number>(1);
  const limit = 25;

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['import-errors', importId, page],
    queryFn: () => financialService.getImportRowErrors(importId, page, limit),
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <div className="p-8 rounded-2xl border border-[#E8E7E2] bg-[#F8F7F2]/60 flex items-center justify-center gap-2.5 text-xs text-[#66645C]">
        <Loader2 className="w-4 h-4 animate-spin text-[#E5BB45]" />
        <span>Loading row-level error details...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-5 rounded-2xl border border-red-200 bg-red-50 text-xs text-red-900 flex items-center gap-2.5">
        <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
        <span>
          Failed to load row errors: {error instanceof Error ? error.message : 'Unknown error'}
        </span>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="p-6 rounded-2xl border border-[#E8E7E2] bg-white text-center text-xs text-[#66645C]">
        No specific row validation errors recorded for this import job.
      </div>
    );
  }

  const { pagination } = data;

  return (
    <div className="rounded-2xl border border-red-200 bg-white overflow-hidden shadow-2xs">
      {/* Diagnostics Header */}
      <div className="p-4 border-b border-red-200 bg-red-50/70 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center text-red-700">
            <AlertCircle className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-red-900 tracking-tight">
              Row-Level Validation Diagnostics
            </h4>
            <p className="text-[11px] text-red-700">
              {pagination.totalItems} total row{pagination.totalItems === 1 ? '' : 's'} failed
              schema or financial validation
            </p>
          </div>
        </div>

        {isFetching && (
          <span className="text-[11px] text-[#66645C] flex items-center gap-1.5 font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E5BB45]" />
            Updating...
          </span>
        )}
      </div>

      {/* Errors Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#E8E7E2] bg-[#F8F7F2]/80 text-[#66645C] uppercase text-[10px] tracking-wider font-semibold select-none">
              <th scope="col" className="py-2.5 px-4 w-20">
                Row #
              </th>
              <th scope="col" className="py-2.5 px-4 w-44">
                Error Code
              </th>
              <th scope="col" className="py-2.5 px-4">
                Validation Reason
              </th>
              <th scope="col" className="py-2.5 px-4">
                Raw Content Snippet
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8E7E2]">
            {data.items.map((err) => (
              <tr key={err.id} className="hover:bg-[#F8F7F2]/50 transition-colors">
                <td className="py-3 px-4 font-mono font-bold text-[#171714] align-top">
                  {err.rowNumber}
                </td>
                <td className="py-3 px-4 align-top">
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-800 border border-red-200 font-semibold whitespace-nowrap">
                    {err.errorCode}
                  </span>
                </td>
                <td className="py-3 px-4 text-[#171714] font-medium align-top leading-relaxed">
                  {err.errorMessage}
                </td>
                <td className="py-3 px-4 font-mono text-[11px] text-[#66645C] align-top max-w-xs">
                  <div className="bg-[#F8F7F2] border border-[#E8E7E2] rounded-lg p-1.5 truncate max-h-16 overflow-hidden">
                    {err.rawData ? JSON.stringify(err.rawData) : '—'}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {pagination.totalPages > 1 && (
        <div className="p-3 bg-[#F8F7F2]/60 border-t border-[#E8E7E2] flex items-center justify-between text-xs text-[#66645C]">
          <span>
            Page <strong className="text-[#171714]">{pagination.page}</strong> of{' '}
            <strong className="text-[#171714]">{pagination.totalPages}</strong> (
            {pagination.totalItems} errors)
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              className="p-1.5 rounded-lg border border-[#E8E7E2] bg-white text-[#171714] hover:bg-[#F8F7F2] transition disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              aria-label="Previous error page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))}
              className="p-1.5 rounded-lg border border-[#E8E7E2] bg-white text-[#171714] hover:bg-[#F8F7F2] transition disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              aria-label="Next error page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
