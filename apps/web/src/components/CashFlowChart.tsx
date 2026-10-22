import React, { useState } from 'react';
import type { CashFlowProjectionPoint, ScenarioComparisonPoint } from '@moneylens/shared';
import { formatCurrencyAmount } from '@moneylens/shared';

interface CashFlowChartProps {
  points: CashFlowProjectionPoint[];
  scenarioPoints?: ScenarioComparisonPoint[];
  currency: string;
  hasReliableOpeningBalance: boolean;
  viewMode: 'balance' | 'net' | 'flows';
}

export const CashFlowChart: React.FC<CashFlowChartProps> = ({
  points,
  scenarioPoints,
  currency,
  hasReliableOpeningBalance,
  viewMode,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!points || points.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
        No projection points available for chart visualization.
      </div>
    );
  }

  // SVG Dimensions & Padding
  const width = 800;
  const height = 280;
  const paddingLeft = 65;
  const paddingRight = 25;
  const paddingTop = 25;
  const paddingBottom = 40;

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  // Determine Value Extents based on selected viewMode
  let values: number[] = [];
  if (viewMode === 'balance' && hasReliableOpeningBalance) {
    values = points.map((p) => p.estimatedBalanceMinor).filter((v): v is number => v !== null);
    if (scenarioPoints) {
      const sVals = scenarioPoints
        .map((p) => p.scenarioBalanceMinor)
        .filter((v): v is number => v !== null);
      values = values.concat(sVals);
    }
  } else if (viewMode === 'flows') {
    values = points.flatMap((p) => [p.projectedInflowMinor, -p.projectedOutflowMinor]);
  } else {
    // viewMode === 'net'
    values = points.map((p) => p.projectedNetMinor);
    if (scenarioPoints) {
      values = values.concat(scenarioPoints.map((p) => p.scenarioNetMinor));
    }
  }

  const minVal = Math.min(0, ...values);
  const maxVal = Math.max(100, ...values);
  const range = maxVal - minVal || 1;

  const getY = (val: number) => {
    return paddingTop + chartH - ((val - minVal) / range) * chartH;
  };

  const zeroY = getY(0);

  // Helper for X coordinates
  const getX = (idx: number) => {
    if (points.length <= 1) return paddingLeft + chartW / 2;
    return paddingLeft + (idx / (points.length - 1)) * chartW;
  };

  // Generate Polyline points for baseline
  const baselinePolylinePoints = points
    .map((p, idx) => {
      const val =
        viewMode === 'balance' && hasReliableOpeningBalance && p.estimatedBalanceMinor !== null
          ? p.estimatedBalanceMinor
          : p.projectedNetMinor;
      return `${getX(idx)},${getY(val)}`;
    })
    .join(' ');

  // Generate Polyline points for scenario
  const scenarioPolylinePoints = scenarioPoints
    ? scenarioPoints
        .map((p, idx) => {
          const val =
            viewMode === 'balance' && hasReliableOpeningBalance && p.scenarioBalanceMinor !== null
              ? p.scenarioBalanceMinor
              : p.scenarioNetMinor;
          return `${getX(idx)},${getY(val)}`;
        })
        .join(' ')
    : null;

  // Y-axis tick intervals
  const yTicks = [
    maxVal,
    Math.round(maxVal * 0.5 + minVal * 0.5),
    0,
    minVal < 0 ? minVal : Math.round(maxVal * 0.25),
  ];

  const hoveredPoint = hoveredIdx !== null ? points[hoveredIdx] : null;
  const hoveredScenarioPoint =
    hoveredIdx !== null && scenarioPoints ? scenarioPoints[hoveredIdx] : null;

  return (
    <div className="relative w-full bg-slate-900/60 rounded-2xl border border-slate-800/80 p-4">
      {/* SVG Container */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible select-none"
        aria-label="Cash Flow Forecast Chart"
        role="img"
      >
        {/* Horizontal Grid lines */}
        {yTicks.map((tickVal, i) => {
          const y = getY(tickVal);
          return (
            <g key={i}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={width - paddingRight}
                y2={y}
                stroke={tickVal === 0 ? '#475569' : '#1e293b'}
                strokeWidth={tickVal === 0 ? 1.5 : 1}
                strokeDasharray={tickVal === 0 ? undefined : '4 4'}
              />
              <text
                x={paddingLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="text-[10px] fill-slate-400 font-mono"
              >
                {formatCurrencyAmount(tickVal, currency)}
              </text>
            </g>
          );
        })}

        {/* View Mode: Inflows & Outflows Bars */}
        {viewMode === 'flows' &&
          points.map((p, idx) => {
            const x = getX(idx);
            const barW = Math.max(3, Math.min(14, chartW / points.length - 2));

            const inflowH = (p.projectedInflowMinor / range) * chartH;
            const outflowH = (p.projectedOutflowMinor / range) * chartH;

            return (
              <g key={idx}>
                {/* Inflow Bar (Green, above zero) */}
                {p.projectedInflowMinor > 0 && (
                  <rect
                    x={x - barW / 2}
                    y={zeroY - inflowH}
                    width={barW}
                    height={inflowH}
                    fill="#10b981"
                    rx={2}
                    opacity={hoveredIdx === idx ? 1 : 0.75}
                  />
                )}
                {/* Outflow Bar (Rose, below zero) */}
                {p.projectedOutflowMinor > 0 && (
                  <rect
                    x={x - barW / 2}
                    y={zeroY}
                    width={barW}
                    height={outflowH}
                    fill="#f43f5e"
                    rx={2}
                    opacity={hoveredIdx === idx ? 1 : 0.75}
                  />
                )}
              </g>
            );
          })}

        {/* View Mode: Baseline Net or Balance Polyline */}
        {viewMode !== 'flows' && (
          <>
            <polyline
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={baselinePolylinePoints}
            />

            {/* Scenario Polyline Overlay */}
            {scenarioPolylinePoints && (
              <polyline
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2.5"
                strokeDasharray="6 4"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={scenarioPolylinePoints}
              />
            )}

            {/* Data Points */}
            {points.map((p, idx) => {
              const val =
                viewMode === 'balance' &&
                hasReliableOpeningBalance &&
                p.estimatedBalanceMinor !== null
                  ? p.estimatedBalanceMinor
                  : p.projectedNetMinor;
              const cx = getX(idx);
              const cy = getY(val);
              const hasRecurring = p.recurringExpenseBreakdown.length > 0;

              return (
                <g key={idx}>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={hoveredIdx === idx ? 5 : hasRecurring ? 4 : 2.5}
                    fill={hasRecurring ? '#ec4899' : '#38bdf8'}
                    stroke="#0f172a"
                    strokeWidth="1.5"
                  />
                </g>
              );
            })}
          </>
        )}

        {/* Hover Crosshair & Invisible Hitboxes */}
        {points.map((_, idx) => {
          const cx = getX(idx);
          const colW = chartW / points.length;

          return (
            <rect
              key={idx}
              x={cx - colW / 2}
              y={paddingTop}
              width={colW}
              height={chartH}
              fill="transparent"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer"
            />
          );
        })}

        {/* Active Hover Guideline */}
        {hoveredIdx !== null && (
          <line
            x1={getX(hoveredIdx)}
            y1={paddingTop}
            x2={getX(hoveredIdx)}
            y2={height - paddingBottom}
            stroke="#94a3b8"
            strokeWidth="1"
            strokeDasharray="2 2"
            pointerEvents="none"
          />
        )}

        {/* X-axis Date Labels */}
        {points.map((p, idx) => {
          // Display ~6-8 evenly spaced labels
          const interval = Math.ceil(points.length / 7);
          if (idx % interval !== 0 && idx !== points.length - 1) return null;

          const cx = getX(idx);
          const shortDate = p.date.slice(5); // MM-DD
          return (
            <text
              key={idx}
              x={cx}
              y={height - paddingBottom + 18}
              textAnchor="middle"
              className="text-[10px] fill-slate-400 font-mono"
            >
              {shortDate}
            </text>
          );
        })}
      </svg>

      {/* Floating Hover Tooltip */}
      {hoveredPoint && hoveredIdx !== null && (
        <div
          className="absolute z-20 pointer-events-none bg-slate-950/95 backdrop-blur border border-slate-700/80 rounded-xl p-3 shadow-xl text-xs space-y-1.5 min-w-[210px]"
          style={{
            left: `${Math.min(75, Math.max(15, (getX(hoveredIdx) / width) * 100))}%`,
            top: '12px',
          }}
        >
          <div className="flex justify-between items-center border-b border-slate-800 pb-1">
            <span className="font-semibold text-slate-200">{hoveredPoint.date}</span>
            <span className="text-[10px] text-slate-400">Day {hoveredIdx + 1}</span>
          </div>

          <div className="flex justify-between text-slate-300">
            <span className="text-emerald-400">Projected Inflow:</span>
            <span className="font-mono">
              +{currency} {formatCurrencyAmount(hoveredPoint.projectedInflowMinor, currency)}
            </span>
          </div>

          <div className="flex justify-between text-slate-300">
            <span className="text-rose-400">Projected Outflow:</span>
            <span className="font-mono">
              -{currency} {formatCurrencyAmount(hoveredPoint.projectedOutflowMinor, currency)}
            </span>
          </div>

          <div className="flex justify-between text-slate-200 font-semibold border-t border-slate-800/60 pt-1">
            <span>Baseline Net:</span>
            <span
              className={`font-mono ${
                hoveredPoint.projectedNetMinor >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {hoveredPoint.projectedNetMinor >= 0 ? '+' : '-'}
              {currency} {formatCurrencyAmount(Math.abs(hoveredPoint.projectedNetMinor), currency)}
            </span>
          </div>

          {hasReliableOpeningBalance && hoveredPoint.estimatedBalanceMinor !== null && (
            <div className="flex justify-between text-cyan-300 border-t border-slate-800/60 pt-1">
              <span>Closing Balance:</span>
              <span className="font-mono font-bold">
                {currency} {formatCurrencyAmount(hoveredPoint.estimatedBalanceMinor, currency)}
              </span>
            </div>
          )}

          {/* Scenario Comparison if available */}
          {hoveredScenarioPoint && (
            <div className="border-t border-amber-900/60 pt-1 mt-1 text-amber-300">
              <div className="flex justify-between">
                <span>Scenario Net:</span>
                <span className="font-mono font-bold">
                  {hoveredScenarioPoint.scenarioNetMinor >= 0 ? '+' : '-'}
                  {currency}{' '}
                  {formatCurrencyAmount(Math.abs(hoveredScenarioPoint.scenarioNetMinor), currency)}
                </span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Net Delta:</span>
                <span className="font-mono">
                  {hoveredScenarioPoint.netDifferenceMinor >= 0 ? '+' : '-'}
                  {currency}{' '}
                  {formatCurrencyAmount(
                    Math.abs(hoveredScenarioPoint.netDifferenceMinor),
                    currency,
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Scheduled Recurring Items */}
          {hoveredPoint.recurringExpenseBreakdown.length > 0 && (
            <div className="border-t border-pink-950/80 pt-1 text-[11px] text-pink-300 space-y-0.5">
              <div className="font-medium text-pink-400">Scheduled Recurring Bills:</div>
              {hoveredPoint.recurringExpenseBreakdown.map((item, rIdx) => (
                <div key={rIdx} className="flex justify-between">
                  <span className="truncate max-w-[130px]">{item.merchant}</span>
                  <span className="font-mono">
                    -{currency} {formatCurrencyAmount(item.amountMinor, currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chart Legend */}
      <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 pt-3 border-t border-slate-800/70 mt-2 px-2">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500/80 inline-block" />
            <span>Inflows</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-rose-500/80 inline-block" />
            <span>Outflows</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-sky-400 inline-block" />
            <span>
              Baseline {hasReliableOpeningBalance && viewMode === 'balance' ? 'Balance' : 'Net'}
            </span>
          </div>
          {scenarioPoints && (
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-t border-amber-400 border-dashed inline-block" />
              <span className="text-amber-400 font-medium">Scenario Impact</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-pink-500 inline-block" />
            <span>Scheduled Recurring</span>
          </div>
        </div>

        <div className="text-[11px] text-slate-500">
          {!hasReliableOpeningBalance && (
            <span className="text-amber-400/90 font-medium">
              * Net Cash Movement only (No opening balance configured)
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
