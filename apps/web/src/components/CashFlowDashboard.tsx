import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { financialService } from '../services/financial.service';
import type {
  ForecastHorizon,
  SupportedCurrency,
  CashFlowForecast,
  ScenarioCalculationResult,
  OneTimeEvent,
  RecurringAdjustment,
} from '@moneylens/shared';
import { formatCurrencyAmount, parseInputToMinorUnits } from '@moneylens/shared';
import { CashFlowChart } from './CashFlowChart';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Play,
  RotateCcw,
  Sparkles,
  Sliders,
  Clock,
  Info,
  X,
  Plus,
  Trash2,
} from 'lucide-react';

export const CashFlowDashboard: React.FC = () => {
  const queryClient = useQueryClient();

  // State
  const [selectedHorizon, setSelectedHorizon] = useState<ForecastHorizon>('30d');
  const [selectedCurrency, setSelectedCurrency] = useState<SupportedCurrency>('USD');
  const [viewMode, setViewMode] = useState<'balance' | 'net' | 'flows'>('net');

  // New Forecast Modal State
  const [isForecastModalOpen, setIsForecastModalOpen] = useState(false);
  const [inputOpeningBalance, setInputOpeningBalance] = useState<string>('');
  const [forecastError, setForecastError] = useState<string | null>(null);

  // Scenario Simulator State
  const [revenueChange, setRevenueChange] = useState<number>(0);
  const [expenseChange, setExpenseChange] = useState<number>(0);
  const [oneTimeEvents, setOneTimeEvents] = useState<OneTimeEvent[]>([]);
  const [recurringAdjustments, setRecurringAdjustments] = useState<RecurringAdjustment[]>([]);
  const [simulationResult, setSimulationResult] = useState<ScenarioCalculationResult | null>(null);

  // New One-Time Event Form State
  const [eventDate, setEventDate] = useState<string>(
    new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]!,
  );
  const [eventName, setEventName] = useState<string>('');
  const [eventAmount, setEventAmount] = useState<string>('');
  const [eventDirection, setEventDirection] = useState<'inflow' | 'outflow'>('outflow');

  // 1. Fetch Executive Summary
  const { data: summaryData, isLoading: isSummaryLoading } = useQuery({
    queryKey: ['cash-flow-summary'],
    queryFn: financialService.getCashFlowSummary,
  });

  // 2. Fetch Latest Forecast Run Details
  const latestRunId = summaryData?.byCurrency?.[selectedCurrency]?.latestForecastRunId;

  const { data: runData, isLoading: isRunLoading } = useQuery({
    queryKey: ['cash-flow-run', latestRunId],
    queryFn: () => (latestRunId ? financialService.getForecastRun(latestRunId) : null),
    enabled: Boolean(latestRunId),
  });

  // Extract active forecast for current currency
  const activeForecast: CashFlowForecast | undefined = runData?.forecasts?.find(
    (fc) => fc.currency.toUpperCase() === selectedCurrency.toUpperCase(),
  );

  // 3. Trigger Forecast Run Mutation
  const forecastMutation = useMutation({
    mutationFn: (req: import('@moneylens/shared').CreateForecastRunRequest) =>
      financialService.createForecastRun(req),
    onSuccess: (data) => {
      setIsForecastModalOpen(false);
      setInputOpeningBalance('');
      setForecastError(null);
      setSimulationResult(null);
      queryClient.invalidateQueries({ queryKey: ['cash-flow-summary'] });
      queryClient.invalidateQueries({ queryKey: ['cash-flow-run'] });
      if (data.forecasts?.[0]?.hasReliableOpeningBalance) {
        setViewMode('balance');
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setForecastError(msg || 'Failed to trigger forecast execution');
    },
  });

  // 4. Simulate Scenario Mutation
  const simulateMutation = useMutation({
    mutationFn: (req: import('@moneylens/shared').SimulateScenarioRequest) =>
      financialService.simulateScenario(req),
    onSuccess: (data) => {
      setSimulationResult(data);
    },
  });

  const handleRunForecast = () => {
    let openingBalancesParam;
    if (inputOpeningBalance.trim().length > 0) {
      const parsedMinor = parseInputToMinorUnits(inputOpeningBalance, selectedCurrency);
      if (parsedMinor !== null && parsedMinor >= 0) {
        openingBalancesParam = [
          {
            currency: selectedCurrency,
            amountMinor: parsedMinor,
          },
        ];
      }
    }

    forecastMutation.mutate({
      horizon: selectedHorizon,
      currencies: [selectedCurrency],
      openingBalances: openingBalancesParam,
      historyWindowDays: 90,
    });
  };

  const handleSimulateScenario = () => {
    simulateMutation.mutate({
      currency: selectedCurrency,
      horizon: selectedHorizon,
      assumptions: {
        revenueChangePercent: revenueChange,
        expenseChangePercent: expenseChange,
        recurringAdjustments,
        oneTimeEvents,
      },
      openingBalanceMinor: activeForecast?.openingBalanceMinor ?? undefined,
    });
  };

  const handleResetScenario = () => {
    setRevenueChange(0);
    setExpenseChange(0);
    setOneTimeEvents([]);
    setRecurringAdjustments([]);
    setSimulationResult(null);
  };

  const handleAddOneTimeEvent = () => {
    const amtMinor = parseInputToMinorUnits(eventAmount, selectedCurrency);
    if (!eventName.trim() || amtMinor === null || amtMinor <= 0) return;

    const newEv: OneTimeEvent = {
      id: `ev-${Date.now()}`,
      name: eventName.trim(),
      date: eventDate,
      amountMinor: amtMinor,
      direction: eventDirection,
    };

    setOneTimeEvents([...oneTimeEvents, newEv]);
    setEventName('');
    setEventAmount('');
  };

  const handleRemoveOneTimeEvent = (id: string) => {
    setOneTimeEvents(oneTimeEvents.filter((ev) => ev.id !== id));
  };

  const getRiskBadge = (riskLevel?: string) => {
    switch (riskLevel) {
      case 'high_risk':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <AlertTriangle className="w-3.5 h-3.5" /> High Risk / Projected Deficit
          </span>
        );
      case 'moderate_risk':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3.5 h-3.5" /> Cash Flow Pressure
          </span>
        );
      case 'low_risk':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" /> Low Risk / Positive Net
          </span>
        );
      case 'no_balance_data':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30">
            <Info className="w-3.5 h-3.5" /> Net Movement Tracked
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/30">
            <HelpCircle className="w-3.5 h-3.5" /> Insufficient History
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Horizon Selector */}
      <section className="bg-slate-900/40 rounded-2xl border border-slate-800 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-sky-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">
              Cash Flow Forecasting & Scenario Planning
            </h1>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Explainable decision support for liquidity management, scheduled obligations, and
            what-if stress testing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Currency selector */}
          <select
            value={selectedCurrency}
            onChange={(e) => setSelectedCurrency(e.target.value as SupportedCurrency)}
            className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
            <option value="GBP">GBP (£)</option>
            <option value="INR">INR (₹)</option>
            <option value="CAD">CAD (CA$)</option>
          </select>

          {/* Horizon Selector */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(['7d', '30d', '60d', '90d'] as ForecastHorizon[]).map((h) => (
              <button
                key={h}
                onClick={() => setSelectedHorizon(h)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  selectedHorizon === h
                    ? 'bg-sky-500 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {h}
              </button>
            ))}
          </div>

          {/* Run Forecast Action */}
          <button
            onClick={() => setIsForecastModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-sky-500/20 transition"
          >
            <Play className="w-3.5 h-3.5" /> Run Forecast
          </button>
        </div>
      </section>

      {/* 2. Executive Metric Cards */}
      {isSummaryLoading || isRunLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-slate-900/60 rounded-2xl border border-slate-800" />
          ))}
        </div>
      ) : activeForecast ? (
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Card 1: Projected Inflow */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
              Projected Inflows ({selectedHorizon})
            </span>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              +{selectedCurrency}{' '}
              {formatCurrencyAmount(activeForecast.projectedInflowsMinor, selectedCurrency)}
            </div>
            <p className="text-[11px] text-slate-400">
              ~{selectedCurrency}{' '}
              {formatCurrencyAmount(activeForecast.historicalDailyAvgInflowMinor, selectedCurrency)}
              /day estimated run rate
            </p>
          </div>

          {/* Card 2: Projected Outflow */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
              Projected Outflows ({selectedHorizon})
            </span>
            <div className="text-2xl font-bold font-mono text-rose-400">
              -{selectedCurrency}{' '}
              {formatCurrencyAmount(activeForecast.projectedOutflowsMinor, selectedCurrency)}
            </div>
            <p className="text-[11px] text-slate-400">
              Includes {activeForecast.recurringOutflowsCount} scheduled recurring bill(s)
            </p>
          </div>

          {/* Card 3: Expected Net Movement */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
              Expected Net Cash Flow
            </span>
            <div
              className={`text-2xl font-bold font-mono ${
                activeForecast.expectedNetMovementMinor >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {activeForecast.expectedNetMovementMinor >= 0 ? '+' : '-'}
              {selectedCurrency}{' '}
              {formatCurrencyAmount(
                Math.abs(activeForecast.expectedNetMovementMinor),
                selectedCurrency,
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              Over {activeForecast.horizonDays}-day horizon
            </p>
          </div>

          {/* Card 4: Closing Balance / Solvency */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                Closing Position
              </span>
              {getRiskBadge(activeForecast.riskLevel)}
            </div>
            {activeForecast.hasReliableOpeningBalance &&
            activeForecast.projectedClosingBalanceMinor !== null ? (
              <div
                className={`text-2xl font-bold font-mono ${
                  activeForecast.projectedClosingBalanceMinor >= 0
                    ? 'text-cyan-400'
                    : 'text-rose-400'
                }`}
              >
                {selectedCurrency}{' '}
                {formatCurrencyAmount(
                  activeForecast.projectedClosingBalanceMinor,
                  selectedCurrency,
                )}
              </div>
            ) : (
              <div className="text-sm font-semibold text-amber-400/90 pt-1">Net Movement Only</div>
            )}
            <p className="text-[11px] text-slate-400 truncate" title={activeForecast.riskReason}>
              {activeForecast.riskReason}
            </p>
          </div>
        </section>
      ) : (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
          <Clock className="w-10 h-10 text-slate-500 mx-auto" />
          <h3 className="text-base font-semibold text-slate-300">No Forecast Run on File</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Click "Run Forecast" to evaluate transaction run rates, schedule recurring expenses, and
            project future cash movements.
          </p>
        </div>
      )}

      {/* 3. Visualization & Chart Section */}
      {activeForecast && (
        <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h2 className="text-base font-bold text-white">Cash Trajectory Visualization</h2>
              <p className="text-xs text-slate-400">
                {activeForecast.startDate} to {activeForecast.endDate} ({activeForecast.horizonDays}{' '}
                days)
              </p>
            </div>

            {/* View Mode Controls */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
              {activeForecast.hasReliableOpeningBalance && (
                <button
                  onClick={() => setViewMode('balance')}
                  className={`px-3 py-1 rounded-lg transition font-medium ${
                    viewMode === 'balance'
                      ? 'bg-sky-500 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Closing Balance
                </button>
              )}
              <button
                onClick={() => setViewMode('net')}
                className={`px-3 py-1 rounded-lg transition font-medium ${
                  viewMode === 'net' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Net Movement
              </button>
              <button
                onClick={() => setViewMode('flows')}
                className={`px-3 py-1 rounded-lg transition font-medium ${
                  viewMode === 'flows' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Daily In/Outflows
              </button>
            </div>
          </div>

          {/* SVG Chart */}
          <CashFlowChart
            points={activeForecast.points}
            scenarioPoints={simulationResult?.points}
            currency={selectedCurrency}
            hasReliableOpeningBalance={activeForecast.hasReliableOpeningBalance}
            viewMode={viewMode}
          />
        </section>
      )}

      {/* 4. Scenario Simulator & Stress-Testing Panel */}
      {activeForecast && (
        <section className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex justify-between items-center border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold text-white">
                What-If Scenario Simulator & Stress Testing
              </h2>
            </div>
            {simulationResult && (
              <button
                onClick={handleResetScenario}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset to Baseline
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sliders & Variables Column */}
            <div className="space-y-5 lg:col-span-1 bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              {/* Revenue Slider */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-medium">Revenue Adjustment</span>
                  <span
                    className={`font-mono font-bold ${
                      revenueChange > 0
                        ? 'text-emerald-400'
                        : revenueChange < 0
                          ? 'text-rose-400'
                          : 'text-slate-400'
                    }`}
                  >
                    {revenueChange > 0 ? `+${revenueChange}` : revenueChange}%
                  </span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  step="5"
                  value={revenueChange}
                  onChange={(e) => setRevenueChange(parseInt(e.target.value, 10))}
                  className="w-full accent-sky-400 bg-slate-800 rounded-lg cursor-pointer h-2"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>-50% (Slump)</span>
                  <span>0%</span>
                  <span>+50% (Growth)</span>
                </div>
              </div>

              {/* Expense Slider */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300 font-medium">Operating Expenses Adjustment</span>
                  <span
                    className={`font-mono font-bold ${
                      expenseChange > 0
                        ? 'text-rose-400'
                        : expenseChange < 0
                          ? 'text-emerald-400'
                          : 'text-slate-400'
                    }`}
                  >
                    {expenseChange > 0 ? `+${expenseChange}` : expenseChange}%
                  </span>
                </div>
                <input
                  type="range"
                  min="-30"
                  max="50"
                  step="5"
                  value={expenseChange}
                  onChange={(e) => setExpenseChange(parseInt(e.target.value, 10))}
                  className="w-full accent-amber-400 bg-slate-800 rounded-lg cursor-pointer h-2"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>-30% (Cuts)</span>
                  <span>0%</span>
                  <span>+50% (Inflation)</span>
                </div>
              </div>

              {/* Add One-Time Event Form */}
              <div className="border-t border-slate-800/80 pt-4 space-y-3">
                <span className="text-xs font-semibold text-slate-300 block">
                  Add One-Time Cash Event
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <input
                    type="text"
                    placeholder="e.g. Tax Payout, Grant"
                    value={eventName}
                    onChange={(e) => setEventName(e.target.value)}
                    className="col-span-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200"
                  />
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs"
                  />
                  <div className="flex items-center gap-1">
                    <select
                      value={eventDirection}
                      onChange={(e) => setEventDirection(e.target.value as 'inflow' | 'outflow')}
                      className="px-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs w-full"
                    >
                      <option value="outflow">- Outflow</option>
                      <option value="inflow">+ Inflow</option>
                    </select>
                  </div>
                  <div className="col-span-2 flex gap-2">
                    <input
                      type="number"
                      placeholder={`Amount (${selectedCurrency})`}
                      value={eventAmount}
                      onChange={(e) => setEventAmount(e.target.value)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs flex-1"
                    />
                    <button
                      type="button"
                      onClick={handleAddOneTimeEvent}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  </div>
                </div>

                {/* Event list */}
                {oneTimeEvents.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {oneTimeEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex justify-between items-center text-[11px] bg-slate-900/90 p-2 rounded-lg border border-slate-800"
                      >
                        <span className="truncate max-w-[130px] font-medium text-slate-200">
                          {ev.name} ({ev.date})
                        </span>
                        <div className="flex items-center gap-2 font-mono">
                          <span
                            className={
                              ev.direction === 'inflow' ? 'text-emerald-400' : 'text-rose-400'
                            }
                          >
                            {ev.direction === 'inflow' ? '+' : '-'}
                            {selectedCurrency}{' '}
                            {formatCurrencyAmount(ev.amountMinor, selectedCurrency)}
                          </span>
                          <button
                            onClick={() => handleRemoveOneTimeEvent(ev.id)}
                            className="text-slate-500 hover:text-rose-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Simulate Button */}
              <button
                onClick={handleSimulateScenario}
                disabled={simulateMutation.isPending}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                {simulateMutation.isPending ? 'Simulating...' : 'Simulate Scenario Impact'}
              </button>
            </div>

            {/* Scenario Results / Comparison Column */}
            <div className="lg:col-span-2 space-y-4">
              {simulationResult ? (
                <div className="space-y-4">
                  {/* Delta Summary Cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                      <span className="text-[11px] text-slate-400 block">Inflow Delta</span>
                      <span
                        className={`text-lg font-bold font-mono ${
                          simulationResult.scenarioSummary.inflowVarianceMinor >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {simulationResult.scenarioSummary.inflowVarianceMinor >= 0 ? '+' : '-'}
                        {selectedCurrency}{' '}
                        {formatCurrencyAmount(
                          Math.abs(simulationResult.scenarioSummary.inflowVarianceMinor),
                          selectedCurrency,
                        )}
                      </span>
                    </div>

                    <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                      <span className="text-[11px] text-slate-400 block">Outflow Delta</span>
                      <span
                        className={`text-lg font-bold font-mono ${
                          simulationResult.scenarioSummary.outflowVarianceMinor <= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {simulationResult.scenarioSummary.outflowVarianceMinor >= 0 ? '+' : '-'}
                        {selectedCurrency}{' '}
                        {formatCurrencyAmount(
                          Math.abs(simulationResult.scenarioSummary.outflowVarianceMinor),
                          selectedCurrency,
                        )}
                      </span>
                    </div>

                    <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800">
                      <span className="text-[11px] text-slate-400 block">Net Movement Delta</span>
                      <span
                        className={`text-lg font-bold font-mono ${
                          simulationResult.scenarioSummary.netVarianceMinor >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {simulationResult.scenarioSummary.netVarianceMinor >= 0 ? '+' : '-'}
                        {selectedCurrency}{' '}
                        {formatCurrencyAmount(
                          Math.abs(simulationResult.scenarioSummary.netVarianceMinor),
                          selectedCurrency,
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Scenario Impact Explanations */}
                  <div className="bg-slate-950/50 p-4 rounded-xl border border-amber-900/40 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-amber-300">
                        Adjustments Applied
                      </span>
                      {getRiskBadge(simulationResult.scenarioSummary.riskLevel)}
                    </div>
                    <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
                      {simulationResult.adjustmentsApplied.map((adj, i) => (
                        <li key={i}>{adj}</li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-amber-200/80 pt-1 border-t border-slate-800">
                      <strong>Scenario Risk Evaluation:</strong>{' '}
                      {simulationResult.scenarioSummary.riskReason}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center p-8 bg-slate-950/30 rounded-xl border border-dashed border-slate-800 text-center space-y-2">
                  <Sliders className="w-8 h-8 text-slate-600" />
                  <span className="text-xs text-slate-400">
                    Adjust variables on the left and click "Simulate Scenario Impact" to stress test
                    cash positions.
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 5. Explainability & Assumptions Panel */}
      {activeForecast && (
        <section className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Forecast Assumptions & Methodology Limitations
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80 space-y-2">
              <span className="font-semibold text-slate-300 block">Baseline Assumptions</span>
              <ul className="space-y-1.5 text-slate-400 list-disc list-inside">
                {activeForecast.assumptions.map((assump, i) => (
                  <li key={i}>{assump}</li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/80 space-y-2">
              <span className="font-semibold text-slate-300 block">Explicit Limitations</span>
              <ul className="space-y-1.5 text-slate-400 list-disc list-inside">
                {activeForecast.limitations.map((lim, i) => (
                  <li key={i}>{lim}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* 6. Run Forecast Modal */}
      {isForecastModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Execute Cash Flow Forecast</h3>
              <button
                onClick={() => setIsForecastModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-medium">Selected Currency</label>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 font-mono font-bold">
                  {selectedCurrency}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-medium">Forecast Horizon</label>
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200">
                  {selectedHorizon} ({selectedHorizon.replace('d', '')} days forward)
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="opening-balance-input" className="text-slate-300 font-medium">
                  Opening Bank Balance (Optional)
                </label>
                <input
                  id="opening-balance-input"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 15000.00"
                  value={inputOpeningBalance}
                  onChange={(e) => setInputOpeningBalance(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono focus:outline-none focus:border-sky-500"
                />
                <p className="text-[11px] text-slate-500">
                  Leave blank to project estimated net cash movement only without computing closing
                  balances.
                </p>
              </div>

              {forecastError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs">
                  {forecastError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setIsForecastModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleRunForecast}
                disabled={forecastMutation.isPending}
                className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-white font-semibold rounded-xl text-xs shadow-lg shadow-sky-500/20"
              >
                {forecastMutation.isPending ? 'Calculating...' : 'Start Projection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
