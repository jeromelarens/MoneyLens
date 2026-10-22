import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { financialService } from '../services/financial.service';
import {
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Loader2,
} from 'lucide-react';

interface TransactionLedgerProps {
  refreshTrigger?: number;
}

export const TransactionLedger: React.FC<TransactionLedgerProps> = ({ refreshTrigger }) => {
  const [page, setPage] = useState(1);
  const [directionFilter, setDirectionFilter] = useState<'all' | 'debit' | 'credit'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['transactions', page, directionFilter, searchTerm, refreshTrigger],
    queryFn: () =>
      financialService.getTransactions({
        page,
        limit: 15,
        direction: directionFilter === 'all' ? undefined : directionFilter,
        search: searchTerm.trim() || undefined,
      }),
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setPage(1);
  };

  const handleDirectionChange = (val: 'all' | 'debit' | 'credit') => {
    setDirectionFilter(val);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Financial Ledger</h2>
          <p className="text-xs text-slate-400">
            Normalized ledger transactions with integer minor unit precision.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder="Search description..."
              className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 w-48 sm:w-56"
            />
          </div>

          {/* Direction Filter */}
          <div className="flex rounded-xl bg-slate-900 border border-slate-800 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => handleDirectionChange('all')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                directionFilter === 'all'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => handleDirectionChange('debit')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                directionFilter === 'debit'
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-900/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Outflow (Debit)
            </button>
            <button
              type="button"
              onClick={() => handleDirectionChange('credit')}
              className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                directionFilter === 'credit'
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-900/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Inflow (Credit)
            </button>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden shadow-xl">
        {isLoading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3 text-xs text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
            <span>Loading normalized financial ledger...</span>
          </div>
        ) : isError ? (
          <div className="p-12 text-center text-xs text-rose-400">
            Failed to retrieve financial transactions. Please verify your connection.
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700/60 mx-auto flex items-center justify-center text-slate-400">
              <Receipt className="w-6 h-6 stroke-[1.5]" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white">No transactions recorded yet</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Upload a bank or credit card statement (.CSV or .XLSX) above to populate the
                financial ledger.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Direction</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {data.items.map((tx) => {
                  const isDebit = tx.direction === 'debit';
                  const formattedDate = new Date(tx.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  });

                  return (
                    <tr key={tx.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                        {formattedDate}
                      </td>

                      <td className="py-3 px-4 font-medium text-white max-w-md truncate">
                        {tx.description}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {isDebit ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/60 text-rose-400 border border-rose-900/50">
                            <ArrowDownLeft className="w-3 h-3" />
                            Debit
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
                            <ArrowUpRight className="w-3 h-3" />
                            Credit
                          </span>
                        )}
                      </td>

                      <td
                        className={`py-3 px-4 text-right font-mono font-semibold whitespace-nowrap ${
                          isDebit ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {isDebit ? '-' : '+'}
                        {tx.currency} {tx.amountDecimal}
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        {tx.sourceReference || '--'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {data && data.pagination.totalPages > 1 && (
          <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
            <div>
              Showing Page <span className="font-semibold text-white">{data.pagination.page}</span>{' '}
              of <span className="font-semibold text-white">{data.pagination.totalPages}</span> (
              {data.pagination.totalItems} total transactions)
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isFetching}
                className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-40 transition cursor-pointer"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4 text-slate-200" />
              </button>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                disabled={page >= data.pagination.totalPages || isFetching}
                className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-40 transition cursor-pointer"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4 text-slate-200" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
