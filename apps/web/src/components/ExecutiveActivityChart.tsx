import React, { useState } from 'react';
import type { Transaction } from '@moneylens/shared';
import { formatCurrencyAmount } from '@moneylens/shared';
import { ArrowUpRight, ArrowDownRight, Layers } from 'lucide-react';

interface ActivityBucket {
  periodLabel: string;
  startDate: string;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  count: number;
}

interface ExecutiveActivityChartProps {
  transactions: Transaction[];
  currency: string;
  period: '30d' | '90d' | 'ytd' | 'all';
}

/**
 * Builds chronological time buckets from transactions.
 * Uses integer minor-unit sums with zero floating-point arithmetic.
 */
function buildBuckets(transactions: Transaction[], period: string): ActivityBucket[] {
  if (transactions.length === 0) return [];

  // Filter transactions matching currency
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const bucketMap = new Map<string, ActivityBucket>();

  for (const t of sorted) {
    const d = new Date(t.date);
    if (isNaN(d.getTime())) continue;

    // Bucket key based on period
    let key: string;
    let label: string;

    if (period === '30d') {
      // Group by day: YYYY-MM-DD
      key = d.toISOString().slice(0, 10);
      label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } else if (period === '90d') {
      // Group by week (start of week)
      const dayOfWeek = d.getUTCDay();
      const diff = d.getUTCDate() - dayOfWeek;
      const weekStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff));
      key = weekStart.toISOString().slice(0, 10);
      label = weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } else {
      // Group by month: YYYY-MM
      key = d.toISOString().slice(0, 7);
      label = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    }

    let bucket = bucketMap.get(key);
    if (!bucket) {
      bucket = {
        periodLabel: label,
        startDate: key,
        incomeMinor: 0,
        expenseMinor: 0,
        netMinor: 0,
        count: 0,
      };
      bucketMap.set(key, bucket);
    }

    bucket.count += 1;
    if (t.direction === 'credit') {
      bucket.incomeMinor += t.amountMinor;
      bucket.netMinor += t.amountMinor;
    } else {
      bucket.expenseMinor += t.amountMinor;
      bucket.netMinor -= t.amountMinor;
    }
  }

  return Array.from(bucketMap.values());
}

export const ExecutiveActivityChart: React.FC<ExecutiveActivityChartProps> = ({
  transactions,
  currency,
  period,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const buckets = buildBuckets(transactions, period);

  if (buckets.length === 0) {
    return (
      <div className="h-64 rounded-2xl border border-dashed border-[#E8E7E2] bg-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 rounded-full bg-[#F8F7F2] border border-[#E8E7E2] flex items-center justify-center text-[#66645C] mb-3">
          <Layers className="w-5 h-5 text-stone-400" />
        </div>
        <p className="font-serif text-lg text-[#171714] font-normal">No Activity Data Available</p>
        <p className="text-xs text-[#66645C] mt-1 max-w-sm">
          No transactions recorded in {currency} for the selected period. Ingest a statement to
          generate activity visualizations.
        </p>
      </div>
    );
  }

  // SVG dimensions
  const width = 800;
  const height = 260;
  const paddingLeft = 70;
  const paddingRight = 30;
  const paddingTop = 25;
  const paddingBottom = 40;

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  // Calculate extents
  const maxAmount = Math.max(
    100,
    ...buckets.map((b) => Math.max(b.incomeMinor, b.expenseMinor, Math.abs(b.netMinor))),
  );

  const getY = (valMinor: number) => {
    return paddingTop + chartH - (Math.max(0, valMinor) / maxAmount) * chartH;
  };

  const getNetY = (netMinor: number) => {
    // Net can be negative or positive
    // Middle zero line
    const zeroY = paddingTop + chartH / 2;
    const scale = chartH / 2 / maxAmount;
    return zeroY - netMinor * scale;
  };

  const barGroupWidth = chartW / buckets.length;
  const singleBarWidth = Math.max(6, Math.min(22, barGroupWidth * 0.32));

  // Ticks for Y Axis
  const tickValues = [0, Math.round(maxAmount * 0.5), maxAmount];

  return (
    <div className="relative w-full overflow-hidden">
      {/* Legend & Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 text-xs">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-emerald-600 inline-block shadow-2xs" />
            <span className="text-[#171714] font-medium">Income (Credits)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-[#171714] inline-block shadow-2xs" />
            <span className="text-[#171714] font-medium">Expenses (Debits)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-1 bg-[#E5BB45] inline-block rounded-full" />
            <span className="text-[#171714] font-medium">Net Movement</span>
          </div>
        </div>

        <span className="text-[11px] text-[#66645C]">
          {buckets.length} reporting {buckets.length === 1 ? 'interval' : 'intervals'} ({currency})
        </span>
      </div>

      {/* Responsive SVG Chart */}
      <div className="w-full overflow-x-auto pb-2 -mx-1 px-1">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[540px] sm:min-w-full h-auto select-none overflow-visible"
          role="img"
          aria-label="Financial activity breakdown chart"
        >
          {/* Horizontal Grid Lines */}
          {tickValues.map((val) => {
            const y = getY(val);
            return (
              <g key={val}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#E8E7E2"
                  strokeWidth="1"
                  strokeDasharray={val === 0 ? 'none' : '3 3'}
                />
                <text
                  x={paddingLeft - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="#66645C"
                  fontFamily="Manrope, sans-serif"
                >
                  {formatCurrencyAmount(val, currency, true, true)}
                </text>
              </g>
            );
          })}

          {/* Bar Groups (Income & Expenses) */}
          {buckets.map((b, idx) => {
            const groupCenterX = paddingLeft + (idx + 0.5) * barGroupWidth;
            const incomeX = groupCenterX - singleBarWidth - 2;
            const expenseX = groupCenterX + 2;

            const incomeY = getY(b.incomeMinor);
            const incomeH = paddingTop + chartH - incomeY;

            const expenseY = getY(b.expenseMinor);
            const expenseH = paddingTop + chartH - expenseY;

            const isHovered = hoveredIdx === idx;

            return (
              <g
                key={b.startDate}
                tabIndex={0}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                onFocus={() => setHoveredIdx(idx)}
                onBlur={() => setHoveredIdx(null)}
                className="cursor-pointer focus:outline-none"
                aria-label={`${b.periodLabel}: Income ${formatCurrencyAmount(b.incomeMinor, currency, true)}, Expenses ${formatCurrencyAmount(b.expenseMinor, currency, true)}`}
              >
                {/* Hover Background Highlight Column */}
                <rect
                  x={paddingLeft + idx * barGroupWidth}
                  y={paddingTop}
                  width={barGroupWidth}
                  height={chartH}
                  fill={isHovered ? 'rgba(229, 187, 69, 0.08)' : 'transparent'}
                  rx="6"
                  className="transition-colors duration-150"
                />

                {/* Income Bar (Emerald) */}
                <rect
                  x={incomeX}
                  y={incomeY}
                  width={singleBarWidth}
                  height={Math.max(2, incomeH)}
                  rx="3"
                  fill="#059669"
                  opacity={isHovered ? 1 : 0.85}
                  className="transition-all duration-150"
                />

                {/* Expense Bar (Deep Black) */}
                <rect
                  x={expenseX}
                  y={expenseY}
                  width={singleBarWidth}
                  height={Math.max(2, expenseH)}
                  rx="3"
                  fill="#171714"
                  opacity={isHovered ? 1 : 0.75}
                  className="transition-all duration-150"
                />

                {/* X-Axis Date Label */}
                <text
                  x={groupCenterX}
                  y={height - 12}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight={isHovered ? '600' : '400'}
                  fill={isHovered ? '#171714' : '#66645C'}
                  fontFamily="Manrope, sans-serif"
                >
                  {b.periodLabel}
                </text>
              </g>
            );
          })}

          {/* Polyline for Net Movement */}
          {buckets.length > 1 && (
            <path
              d={buckets
                .map((b, idx) => {
                  const x = paddingLeft + (idx + 0.5) * barGroupWidth;
                  const y = getNetY(b.netMinor);
                  return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
                })
                .join(' ')}
              fill="none"
              stroke="#E5BB45"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Points on Net Movement Line */}
          {buckets.map((b, idx) => {
            const x = paddingLeft + (idx + 0.5) * barGroupWidth;
            const y = getNetY(b.netMinor);
            const isHovered = hoveredIdx === idx;

            return (
              <circle
                key={`point-${b.startDate}`}
                cx={x}
                cy={y}
                r={isHovered ? 5 : 3.5}
                fill="#FFFFFF"
                stroke="#E5BB45"
                strokeWidth={isHovered ? 2.5 : 2}
                className="transition-all duration-150"
              />
            );
          })}
        </svg>
      </div>

      {/* Floating Tooltip Box */}
      {hoveredIdx !== null && buckets[hoveredIdx] && (
        <div
          className="absolute z-20 pointer-events-none bg-[#171714] text-white p-3 rounded-xl shadow-xl text-xs space-y-1.5 border border-stone-800 transition-all duration-150"
          style={{
            left: Math.min(Math.max(10, ((hoveredIdx + 0.5) / buckets.length) * 100), 82) + '%',
            top: '8px',
            transform: 'translateX(-50%)',
          }}
        >
          <div className="font-semibold text-stone-200 border-b border-stone-800 pb-1 flex items-center justify-between gap-4">
            <span>{buckets[hoveredIdx].periodLabel}</span>
            <span className="text-[10px] text-stone-400">
              {buckets[hoveredIdx].count} {buckets[hoveredIdx].count === 1 ? 'tx' : 'txs'}
            </span>
          </div>

          <div className="space-y-1 pt-0.5">
            <div className="flex items-center justify-between gap-3 text-emerald-400">
              <span className="flex items-center gap-1">
                <ArrowDownRight className="w-3 h-3" />
                <span>Income:</span>
              </span>
              <span className="font-mono font-medium">
                {formatCurrencyAmount(buckets[hoveredIdx].incomeMinor, currency, true, true)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 text-rose-300">
              <span className="flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3" />
                <span>Expenses:</span>
              </span>
              <span className="font-mono font-medium">
                {formatCurrencyAmount(buckets[hoveredIdx].expenseMinor, currency, true, true)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 text-[#E5BB45] pt-1 border-t border-stone-800 font-semibold">
              <span>Net Movement:</span>
              <span className="font-mono">
                {formatCurrencyAmount(buckets[hoveredIdx].netMinor, currency, true, true)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
