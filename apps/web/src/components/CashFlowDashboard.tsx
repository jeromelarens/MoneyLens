import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layout } from './Layout';
import { financialService } from '../services/financial.service';
import type {
  ForecastHorizon,
  SupportedCurrency,
  CashFlowForecast,
  ScenarioCalculationResult,
  OneTimeEvent,
  RecurringAdjustment,
  CashFlowScenario,
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
  RefreshCw,
  Save,
  Table as TableIcon,
  LineChart as LineChartIcon,
  BookmarkPlus,
  Check,
  ArrowRight,
} from 'lucide-react';

export const CashFlowDashboard: React.FC<{ inShell?: boolean }> = ({ inShell = true }) => {
  const queryClient = useQueryClient();

  // Document Title
  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'Cash Flow Forecast & Scenario Planning — MoneyLens';
    return () => {
      document.title = originalTitle;
    };
  }, []);

  // State
  const [selectedHorizon, setSelectedHorizon] = useState<ForecastHorizon>('30d');
  const [selectedCurrency, setSelectedCurrency] = useState<SupportedCurrency>('USD');
  const [viewMode, setViewMode] = useState<'balance' | 'net' | 'flows'>('net');
  const [displayType, setDisplayType] = useState<'chart' | 'table'>('chart');

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

  // Save Scenario Modal State
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [scenarioNameInput, setScenarioNameInput] = useState<string>('');
  const [saveSuccessBanner, setSaveSuccessBanner] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // New One-Time Event Form State
  const [eventDate, setEventDate] = useState<string>(
    new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]!,
  );
  const [eventName, setEventName] = useState<string>('');
  const [eventAmount, setEventAmount] = useState<string>('');
  const [eventDirection, setEventDirection] = useState<'inflow' | 'outflow'>('outflow');

  // Modal Scroll Lock & Escape Dismiss
  useEffect(() => {
    const isAnyModalOpen = isForecastModalOpen || isSaveModalOpen;
    if (isAnyModalOpen) {
      document.body.style.overflow = 'hidden';
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsForecastModalOpen(false);
          setIsSaveModalOpen(false);
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isForecastModalOpen, isSaveModalOpen]);

  // 1. Fetch Executive Summary
  const {
    data: summaryData,
    isLoading: isSummaryLoading,
    refetch: refetchSummary,
    isFetching: isSummaryFetching,
  } = useQuery({
    queryKey: ['cash-flow-summary'],
    queryFn: financialService.getCashFlowSummary,
  });

  // 2. Fetch Latest Forecast Run Details
  const latestRunId = summaryData?.byCurrency?.[selectedCurrency]?.latestForecastRunId;

  const {
    data: runData,
    isLoading: isRunLoading,
    refetch: refetchRun,
    isFetching: isRunFetching,
  } = useQuery({
    queryKey: ['cash-flow-run', latestRunId],
    queryFn: () => (latestRunId ? financialService.getForecastRun(latestRunId) : null),
    enabled: Boolean(latestRunId),
  });

  // 3. Fetch Saved Scenarios
  const { data: scenariosData, refetch: refetchScenarios } = useQuery({
    queryKey: ['cash-flow-scenarios'],
    queryFn: () => financialService.listScenarios({ limit: 20 }),
  });

  // Extract active forecast for current currency
  const activeForecast: CashFlowForecast | undefined = runData?.forecasts?.find(
    (fc) => fc.currency.toUpperCase() === selectedCurrency.toUpperCase(),
  );

  // Refresh all queries
  const handleRefreshAll = () => {
    refetchSummary();
    refetchRun();
    refetchScenarios();
  };

  // 4. Trigger Forecast Run Mutation
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

  // 5. Simulate Scenario Mutation
  const simulateMutation = useMutation({
    mutationFn: (req: import('@moneylens/shared').SimulateScenarioRequest) =>
      financialService.simulateScenario(req),
    onSuccess: (data) => {
      setSimulationResult(data);
    },
  });

  // 6. Create / Save Scenario Mutation
  const createScenarioMutation = useMutation({
    mutationFn: (req: import('@moneylens/shared').CreateScenarioRequest) =>
      financialService.createScenario(req),
    onSuccess: (data) => {
      setIsSaveModalOpen(false);
      setScenarioNameInput('');
      setSaveError(null);
      setSaveSuccessBanner(`Scenario "${data.name}" successfully saved.`);
      queryClient.invalidateQueries({ queryKey: ['cash-flow-scenarios'] });
      setTimeout(() => setSaveSuccessBanner(null), 5000);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(msg || 'Failed to save scenario');
    },
  });

  // 7. Delete Scenario Mutation
  const deleteScenarioMutation = useMutation({
    mutationFn: (scenarioId: string) => financialService.deleteScenario(scenarioId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-flow-scenarios'] });
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

  const handleSaveScenarioSubmit = () => {
    if (!scenarioNameInput.trim()) {
      setSaveError('Scenario name is required.');
      return;
    }

    createScenarioMutation.mutate({
      name: scenarioNameInput.trim(),
      currency: selectedCurrency,
      horizon: selectedHorizon,
      assumptions: {
        revenueChangePercent: revenueChange,
        expenseChangePercent: expenseChange,
        recurringAdjustments,
        oneTimeEvents,
      },
    });
  };

  const handleLoadSavedScenario = (scenario: CashFlowScenario) => {
    setSelectedCurrency(scenario.currency as SupportedCurrency);
    setRevenueChange(scenario.assumptions.revenueChangePercent);
    setExpenseChange(scenario.assumptions.expenseChangePercent);
    setOneTimeEvents(scenario.assumptions.oneTimeEvents || []);
    setRecurringAdjustments(scenario.assumptions.recurringAdjustments || []);

    // Immediately trigger simulation
    simulateMutation.mutate({
      currency: scenario.currency as SupportedCurrency,
      horizon: (scenario.horizonDays === 7
        ? '7d'
        : scenario.horizonDays === 60
          ? '60d'
          : scenario.horizonDays === 90
            ? '90d'
            : '30d') as ForecastHorizon,
      assumptions: scenario.assumptions,
      openingBalanceMinor: activeForecast?.openingBalanceMinor ?? undefined,
    });
  };

  const getRiskBadge = (riskLevel?: string) => {
    switch (riskLevel) {
      case 'high_risk':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> High Risk / Projected Deficit
          </span>
        );
      case 'moderate_risk':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> Cash Flow Pressure
          </span>
        );
      case 'low_risk':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Low Risk / Positive Net
          </span>
        );
      case 'no_balance_data':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#F8F7F2] text-[#66645C] border border-[#DEDDD5]">
            <Info className="w-3.5 h-3.5 text-[#E5BB45]" /> Net Movement Tracked
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#F8F7F2] text-[#66645C] border border-[#DEDDD5]">
            <HelpCircle className="w-3.5 h-3.5 text-[#66645C]" /> Insufficient History
          </span>
        );
    }
  };

  const headerActions = (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <button
        onClick={handleRefreshAll}
        disabled={isSummaryFetching || isRunFetching}
        className="w-9 h-9 rounded-xl border border-[#DEDDD5] bg-white text-[#66645C] hover:text-[#171714] hover:bg-[#F8F7F2] transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center shrink-0"
        title="Refresh Forecast Data"
        aria-label="Refresh Forecast Data"
      >
        <RefreshCw
          className={`w-4 h-4 ${isSummaryFetching || isRunFetching ? 'animate-spin text-[#E5BB45]' : ''}`}
        />
      </button>
      <button
        onClick={() => setIsForecastModalOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 bg-[#171714] hover:bg-[#0D0D0B] text-white rounded-full text-xs font-semibold shadow-2xs transition shrink-0 min-h-[36px]"
        title="Initialize Forecast Run"
      >
        <Play className="w-3.5 h-3.5 text-[#E5BB45]" />
        <span className="hidden sm:inline">New Projection</span>
        <span className="sm:hidden">Forecast</span>
      </button>
    </div>
  );

  const bodyContent = (
    <>
      <div className="space-y-6">
        {/* Banner if scenario was saved */}
        {saveSuccessBanner && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>{saveSuccessBanner}</span>
            </div>
            <button
              onClick={() => setSaveSuccessBanner(null)}
              className="text-emerald-700 hover:text-emerald-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 2. Page Header & Horizon Selector */}
        <section className="bg-white rounded-2xl border border-[#DEDDD5] p-6 shadow-2xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#171714] text-[#E5BB45] flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
              <h1 className="text-xl sm:text-2xl font-serif font-bold text-[#171714] tracking-tight">
                Cash Flow Forecasting & Scenario Planning
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-[#66645C]">
              Explainable decision support for liquidity management, scheduled obligations, and
              what-if stress testing.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Currency selector */}
            <select
              value={selectedCurrency}
              onChange={(e) => setSelectedCurrency(e.target.value as SupportedCurrency)}
              className="px-3 py-2 rounded-xl bg-[#F8F7F2] border border-[#DEDDD5] text-xs font-semibold text-[#171714] focus:outline-none focus:border-[#171714]"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="CAD">CAD (CA$)</option>
              <option value="INR">INR (₹)</option>
            </select>

            {/* Horizon Selector */}
            <div className="flex items-center bg-[#F8F7F2] p-1 rounded-xl border border-[#DEDDD5]">
              {(['7d', '30d', '60d', '90d'] as ForecastHorizon[]).map((h) => (
                <button
                  key={h}
                  onClick={() => setSelectedHorizon(h)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    selectedHorizon === h
                      ? 'bg-sky-500 text-white shadow-2xs'
                      : 'text-[#66645C] hover:text-[#171714]'
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>

            {/* Run Forecast Action */}
            <button
              onClick={() => setIsForecastModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#171714] hover:bg-[#0D0D0B] text-white rounded-xl text-xs font-semibold shadow-2xs transition"
            >
              <Play className="w-3.5 h-3.5 text-[#E5BB45]" /> Run Forecast
            </button>
          </div>
        </section>

        {/* 3. Executive Metric Cards */}
        {isSummaryLoading || isRunLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-white rounded-2xl border border-[#DEDDD5]" />
            ))}
          </div>
        ) : activeForecast ? (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Projected Inflow */}
            <div className="bg-white border border-[#DEDDD5] rounded-2xl p-5 space-y-2 shadow-2xs">
              <span className="text-xs text-[#66645C] uppercase tracking-wider font-semibold">
                Projected Inflows ({selectedHorizon})
              </span>
              <div className="text-xl sm:text-2xl font-bold font-mono text-emerald-600 break-words">
                +{selectedCurrency}{' '}
                {formatCurrencyAmount(activeForecast.projectedInflowsMinor, selectedCurrency)}
              </div>
              <p className="text-[11px] text-[#66645C]">
                ~{selectedCurrency}{' '}
                {formatCurrencyAmount(
                  activeForecast.historicalDailyAvgInflowMinor,
                  selectedCurrency,
                )}
                /day estimated run rate
              </p>
            </div>

            {/* Card 2: Projected Outflow */}
            <div className="bg-white border border-[#DEDDD5] rounded-2xl p-5 space-y-2 shadow-2xs">
              <span className="text-xs text-[#66645C] uppercase tracking-wider font-semibold">
                Projected Outflows ({selectedHorizon})
              </span>
              <div className="text-xl sm:text-2xl font-bold font-mono text-rose-600 break-words">
                -{selectedCurrency}{' '}
                {formatCurrencyAmount(activeForecast.projectedOutflowsMinor, selectedCurrency)}
              </div>
              <p className="text-[11px] text-[#66645C]">
                Includes {activeForecast.recurringOutflowsCount} scheduled recurring bill(s)
              </p>
            </div>

            {/* Card 3: Expected Net Movement */}
            <div className="bg-white border border-[#DEDDD5] rounded-2xl p-5 space-y-2 shadow-2xs">
              <span className="text-xs text-[#66645C] uppercase tracking-wider font-semibold">
                Expected Net Cash Flow
              </span>
              <div
                className={`text-xl sm:text-2xl font-bold font-mono break-words ${
                  activeForecast.expectedNetMovementMinor >= 0
                    ? 'text-emerald-600'
                    : 'text-rose-600'
                }`}
              >
                {activeForecast.expectedNetMovementMinor >= 0 ? '+' : '-'}
                {selectedCurrency}{' '}
                {formatCurrencyAmount(
                  Math.abs(activeForecast.expectedNetMovementMinor),
                  selectedCurrency,
                )}
              </div>
              <p className="text-[11px] text-[#66645C]">
                Over {activeForecast.horizonDays}-day horizon
              </p>
            </div>

            {/* Card 4: Closing Balance / Solvency */}
            <div className="bg-white border border-[#DEDDD5] rounded-2xl p-5 space-y-2 shadow-2xs">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#66645C] uppercase tracking-wider font-semibold">
                  Closing Position
                </span>
                {getRiskBadge(activeForecast.riskLevel)}
              </div>
              {activeForecast.hasReliableOpeningBalance &&
              activeForecast.projectedClosingBalanceMinor !== null ? (
                <div
                  className={`text-xl sm:text-2xl font-bold font-mono break-words ${
                    activeForecast.projectedClosingBalanceMinor >= 0
                      ? 'text-[#171714]'
                      : 'text-rose-600'
                  }`}
                >
                  {selectedCurrency}{' '}
                  {formatCurrencyAmount(
                    activeForecast.projectedClosingBalanceMinor,
                    selectedCurrency,
                  )}
                </div>
              ) : (
                <div className="text-sm font-semibold text-amber-700 pt-1">Net Movement Only</div>
              )}
              <p className="text-[11px] text-[#66645C] truncate" title={activeForecast.riskReason}>
                {activeForecast.riskReason}
              </p>
            </div>
          </section>
        ) : (
          <div className="bg-white border border-[#DEDDD5] rounded-2xl p-8 text-center space-y-3 shadow-2xs">
            <div className="w-12 h-12 rounded-full bg-[#F8F7F2] text-[#66645C] flex items-center justify-center mx-auto">
              <Clock className="w-6 h-6" />
            </div>
            <h3 className="text-base font-serif font-bold text-[#171714]">
              No Forecast Run on File
            </h3>
            <p className="text-xs text-[#66645C] max-w-md mx-auto">
              Click &quot;Run Forecast&quot; to evaluate transaction run rates, schedule recurring
              expenses, and project future cash movements for {selectedCurrency}.
            </p>
            <button
              onClick={() => setIsForecastModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#171714] text-[#E5BB45] rounded-xl text-xs font-semibold shadow-2xs hover:bg-[#0D0D0B] transition"
            >
              <Play className="w-3.5 h-3.5" /> Initialize First Forecast Run
            </button>
          </div>
        )}

        {/* 4. Visualization & Chart Section */}
        {activeForecast && (
          <section className="bg-white border border-[#DEDDD5] rounded-2xl p-6 space-y-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h2 className="text-base font-serif font-bold text-[#171714]">
                  Cash Trajectory Visualization
                </h2>
                <p className="text-xs text-[#66645C]">
                  {activeForecast.startDate} to {activeForecast.endDate} (
                  {activeForecast.horizonDays} days forward)
                </p>
              </div>

              {/* View Mode & Display Toggle */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Visual vs Tabular Toggle */}
                <div className="flex items-center bg-[#F8F7F2] p-1 rounded-xl border border-[#DEDDD5] text-xs">
                  <button
                    onClick={() => setDisplayType('chart')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition font-medium ${
                      displayType === 'chart'
                        ? 'bg-white text-[#171714] shadow-2xs border border-[#DEDDD5]'
                        : 'text-[#66645C] hover:text-[#171714]'
                    }`}
                  >
                    <LineChartIcon className="w-3.5 h-3.5" /> Chart View
                  </button>
                  <button
                    onClick={() => setDisplayType('table')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition font-medium ${
                      displayType === 'table'
                        ? 'bg-white text-[#171714] shadow-2xs border border-[#DEDDD5]'
                        : 'text-[#66645C] hover:text-[#171714]'
                    }`}
                  >
                    <TableIcon className="w-3.5 h-3.5" /> Projection Table
                  </button>
                </div>

                {/* View Mode Controls */}
                <div className="flex items-center gap-1 bg-[#F8F7F2] p-1 rounded-xl border border-[#DEDDD5] text-xs">
                  {activeForecast.hasReliableOpeningBalance && (
                    <button
                      onClick={() => setViewMode('balance')}
                      className={`px-3 py-1 rounded-lg transition font-medium ${
                        viewMode === 'balance'
                          ? 'bg-[#171714] text-white shadow-2xs'
                          : 'text-[#66645C] hover:text-[#171714]'
                      }`}
                    >
                      Closing Balance
                    </button>
                  )}
                  <button
                    onClick={() => setViewMode('net')}
                    className={`px-3 py-1 rounded-lg transition font-medium ${
                      viewMode === 'net'
                        ? 'bg-[#171714] text-white shadow-2xs'
                        : 'text-[#66645C] hover:text-[#171714]'
                    }`}
                  >
                    Net Movement
                  </button>
                  <button
                    onClick={() => setViewMode('flows')}
                    className={`px-3 py-1 rounded-lg transition font-medium ${
                      viewMode === 'flows'
                        ? 'bg-[#171714] text-white shadow-2xs'
                        : 'text-[#66645C] hover:text-[#171714]'
                    }`}
                  >
                    Daily In/Outflows
                  </button>
                </div>
              </div>
            </div>

            {/* Chart or Table */}
            {displayType === 'chart' ? (
              <CashFlowChart
                points={activeForecast.points}
                scenarioPoints={simulationResult?.points}
                currency={selectedCurrency}
                hasReliableOpeningBalance={activeForecast.hasReliableOpeningBalance}
                viewMode={viewMode}
              />
            ) : (
              <div className="border border-[#DEDDD5] rounded-xl overflow-x-auto max-h-96">
                <table className="w-full text-xs text-left text-[#171714]">
                  <thead className="bg-[#F8F7F2] border-b border-[#DEDDD5] text-[11px] font-semibold text-[#66645C] uppercase sticky top-0">
                    <tr>
                      <th className="py-2.5 px-4">Date</th>
                      <th className="py-2.5 px-4 text-right">Projected Inflow</th>
                      <th className="py-2.5 px-4 text-right">Projected Outflow</th>
                      <th className="py-2.5 px-4 text-right">Net Movement</th>
                      <th className="py-2.5 px-4 text-right">
                        {activeForecast.hasReliableOpeningBalance
                          ? 'Estimated Balance'
                          : 'Balance Status'}
                      </th>
                      <th className="py-2.5 px-4">Scheduled Obligations</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E7E2]">
                    {activeForecast.points.map((p, idx) => (
                      <tr key={idx} className="hover:bg-[#F8F7F2]/50 transition-colors">
                        <td className="py-2 px-4 font-mono font-medium">{p.date}</td>
                        <td className="py-2 px-4 text-right font-mono text-emerald-600">
                          +{selectedCurrency}{' '}
                          {formatCurrencyAmount(p.projectedInflowMinor, selectedCurrency)}
                        </td>
                        <td className="py-2 px-4 text-right font-mono text-rose-600">
                          -{selectedCurrency}{' '}
                          {formatCurrencyAmount(p.projectedOutflowMinor, selectedCurrency)}
                        </td>
                        <td
                          className={`py-2 px-4 text-right font-mono font-semibold ${
                            p.projectedNetMinor >= 0 ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {p.projectedNetMinor >= 0 ? '+' : '-'}
                          {selectedCurrency}{' '}
                          {formatCurrencyAmount(Math.abs(p.projectedNetMinor), selectedCurrency)}
                        </td>
                        <td className="py-2 px-4 text-right font-mono font-bold text-[#171714]">
                          {activeForecast.hasReliableOpeningBalance &&
                          p.estimatedBalanceMinor !== null ? (
                            `${selectedCurrency} ${formatCurrencyAmount(p.estimatedBalanceMinor, selectedCurrency)}`
                          ) : (
                            <span className="text-[10px] text-[#66645C] font-normal italic">
                              Net Movement Only
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-4">
                          {p.recurringExpenseBreakdown.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {p.recurringExpenseBreakdown.map((item, rIdx) => (
                                <span
                                  key={rIdx}
                                  className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-medium"
                                  title={`Finding ID: ${item.findingId}`}
                                >
                                  {item.merchant} (-{selectedCurrency}{' '}
                                  {formatCurrencyAmount(item.amountMinor, selectedCurrency)})
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[#A8A29E] text-[10px]">None</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* 5. Scenario Simulator & Stress-Testing Panel */}
        {activeForecast && (
          <section className="bg-white border border-[#DEDDD5] rounded-2xl p-6 space-y-6 shadow-2xs">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#E8E7E2] pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#E5BB45]/15 text-[#B45309] flex items-center justify-center font-bold">
                  <Sliders className="w-4 h-4 text-[#B45309]" />
                </div>
                <div>
                  <h2 className="text-base font-serif font-bold text-[#171714]">
                    What-If Scenario Simulator & Stress Testing
                  </h2>
                  <p className="text-xs text-[#66645C]">
                    Simulate revenue adjustments, operational expense shifts, and one-time capital
                    events against the baseline forecast.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {simulationResult && (
                  <>
                    <button
                      onClick={() => setIsSaveModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#171714] text-white hover:bg-[#0D0D0B] text-xs font-semibold shadow-2xs transition"
                    >
                      <Save className="w-3.5 h-3.5 text-[#E5BB45]" /> Save Scenario
                    </button>
                    <button
                      onClick={handleResetScenario}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#DEDDD5] bg-[#F8F7F2] text-[#66645C] hover:text-[#171714] text-xs font-medium transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Reset to Baseline
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Sliders & Variables Column */}
              <div className="space-y-5 lg:col-span-1 bg-[#F8F7F2] p-5 rounded-xl border border-[#DEDDD5]">
                {/* Revenue Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#171714] font-semibold">Revenue Adjustment</span>
                    <span
                      className={`font-mono font-bold ${
                        revenueChange > 0
                          ? 'text-emerald-600'
                          : revenueChange < 0
                            ? 'text-rose-600'
                            : 'text-[#66645C]'
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
                    className="w-full accent-[#171714] bg-[#E8E7E2] rounded-lg cursor-pointer h-2"
                  />
                  <div className="flex justify-between text-[10px] text-[#66645C]">
                    <span>-50% (Slump)</span>
                    <span>0% (Baseline)</span>
                    <span>+50% (Growth)</span>
                  </div>
                </div>

                {/* Expense Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#171714] font-semibold">
                      Operating Expenses Adjustment
                    </span>
                    <span
                      className={`font-mono font-bold ${
                        expenseChange > 0
                          ? 'text-rose-600'
                          : expenseChange < 0
                            ? 'text-emerald-600'
                            : 'text-[#66645C]'
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
                    className="w-full accent-[#E5BB45] bg-[#E8E7E2] rounded-lg cursor-pointer h-2"
                  />
                  <div className="flex justify-between text-[10px] text-[#66645C]">
                    <span>-30% (Cuts)</span>
                    <span>0% (Baseline)</span>
                    <span>+50% (Inflation)</span>
                  </div>
                </div>

                {/* Add One-Time Event Form */}
                <div className="border-t border-[#DEDDD5] pt-4 space-y-3">
                  <span className="text-xs font-semibold text-[#171714] block">
                    Add One-Time Cash Event
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <input
                      type="text"
                      placeholder="e.g. Tax Payout, Grant"
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                      className="col-span-2 px-3 py-1.5 rounded-lg bg-white border border-[#DEDDD5] text-[#171714] focus:outline-none focus:border-[#171714]"
                    />
                    <input
                      type="date"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className="px-2 py-1.5 rounded-lg bg-white border border-[#DEDDD5] text-[#171714] text-xs focus:outline-none focus:border-[#171714]"
                    />
                    <div className="flex items-center gap-1">
                      <select
                        value={eventDirection}
                        onChange={(e) => setEventDirection(e.target.value as 'inflow' | 'outflow')}
                        className="px-2 py-1.5 rounded-lg bg-white border border-[#DEDDD5] text-[#171714] text-xs w-full focus:outline-none focus:border-[#171714]"
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
                        className="px-3 py-1.5 rounded-lg bg-white border border-[#DEDDD5] text-[#171714] text-xs flex-1 focus:outline-none focus:border-[#171714]"
                      />
                      <button
                        type="button"
                        onClick={handleAddOneTimeEvent}
                        className="px-3 py-1.5 bg-[#171714] hover:bg-[#0D0D0B] text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow-2xs"
                      >
                        <Plus className="w-3.5 h-3.5 text-[#E5BB45]" /> Add
                      </button>
                    </div>
                  </div>

                  {/* Event list */}
                  {oneTimeEvents.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {oneTimeEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className="flex justify-between items-center text-[11px] bg-white p-2.5 rounded-lg border border-[#DEDDD5] shadow-2xs"
                        >
                          <span className="truncate max-w-[130px] font-medium text-[#171714]">
                            {ev.name} ({ev.date})
                          </span>
                          <div className="flex items-center gap-2 font-mono">
                            <span
                              className={
                                ev.direction === 'inflow' ? 'text-emerald-600' : 'text-rose-600'
                              }
                            >
                              {ev.direction === 'inflow' ? '+' : '-'}
                              {selectedCurrency}{' '}
                              {formatCurrencyAmount(ev.amountMinor, selectedCurrency)}
                            </span>
                            <button
                              onClick={() => handleRemoveOneTimeEvent(ev.id)}
                              className="text-[#66645C] hover:text-rose-600"
                              title="Delete Event"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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
                  className="w-full py-2.5 bg-[#171714] hover:bg-[#0D0D0B] text-[#E5BB45] font-bold text-xs rounded-xl shadow-2xs transition flex items-center justify-center gap-1.5"
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
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-[#F8F7F2] p-4 rounded-xl border border-[#DEDDD5]">
                        <span className="text-[11px] text-[#66645C] uppercase tracking-wider font-semibold block">
                          Inflow Delta
                        </span>
                        <span
                          className={`text-lg font-bold font-mono ${
                            simulationResult.scenarioSummary.inflowVarianceMinor >= 0
                              ? 'text-emerald-600'
                              : 'text-rose-600'
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

                      <div className="bg-[#F8F7F2] p-4 rounded-xl border border-[#DEDDD5]">
                        <span className="text-[11px] text-[#66645C] uppercase tracking-wider font-semibold block">
                          Outflow Delta
                        </span>
                        <span
                          className={`text-lg font-bold font-mono ${
                            simulationResult.scenarioSummary.outflowVarianceMinor <= 0
                              ? 'text-emerald-600'
                              : 'text-rose-600'
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

                      <div className="bg-[#F8F7F2] p-4 rounded-xl border border-[#DEDDD5]">
                        <span className="text-[11px] text-[#66645C] uppercase tracking-wider font-semibold block">
                          Net Movement Delta
                        </span>
                        <span
                          className={`text-lg font-bold font-mono ${
                            simulationResult.scenarioSummary.netVarianceMinor >= 0
                              ? 'text-emerald-600'
                              : 'text-rose-600'
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
                    <div className="bg-[#F8F7F2] p-4 rounded-xl border border-[#DEDDD5] space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-[#171714]">
                          Adjustments Applied
                        </span>
                        {getRiskBadge(simulationResult.scenarioSummary.riskLevel)}
                      </div>
                      <ul className="text-xs text-[#66645C] space-y-1 list-disc list-inside">
                        {simulationResult.adjustmentsApplied.map((adj, i) => (
                          <li key={i}>{adj}</li>
                        ))}
                      </ul>
                      <p className="text-[11px] text-[#171714] pt-2 border-t border-[#DEDDD5]">
                        <strong>Scenario Risk Evaluation:</strong>{' '}
                        {simulationResult.scenarioSummary.riskReason}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="h-full min-h-[220px] flex flex-col items-center justify-center p-8 bg-[#F8F7F2]/60 rounded-xl border border-dashed border-[#DEDDD5] text-center space-y-2">
                    <Sliders className="w-8 h-8 text-[#66645C]" />
                    <span className="text-xs text-[#66645C]">
                      Adjust variables on the left and click &quot;Simulate Scenario Impact&quot; to
                      stress test cash positions.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* 6. Saved Scenarios Management Panel */}
        {scenariosData && scenariosData.items && scenariosData.items.length > 0 && (
          <section className="bg-white border border-[#DEDDD5] rounded-2xl p-6 space-y-4 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#F8F7F2] text-[#171714] border border-[#DEDDD5] flex items-center justify-center font-bold">
                <BookmarkPlus className="w-4 h-4 text-[#E5BB45]" />
              </div>
              <div>
                <h3 className="text-sm font-serif font-bold text-[#171714]">
                  Saved Hypothetical Scenarios ({scenariosData.items.length})
                </h3>
                <p className="text-xs text-[#66645C]">
                  Load previously saved stress-test configurations directly into the simulator.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {scenariosData.items.map((scen) => (
                <div
                  key={scen.id}
                  className="p-4 rounded-xl bg-[#F8F7F2] border border-[#DEDDD5] space-y-2 flex flex-col justify-between hover:border-[#171714] transition"
                >
                  <div className="space-y-1">
                    <div className="flex justify-between items-start">
                      <span className="font-semibold text-xs text-[#171714]">{scen.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white border border-[#DEDDD5] font-mono text-[#66645C]">
                        {scen.currency} · {scen.horizonDays}d
                      </span>
                    </div>
                    <p className="text-[11px] text-[#66645C]">
                      Rev: {scen.assumptions.revenueChangePercent}% · Exp:{' '}
                      {scen.assumptions.expenseChangePercent}% · Events:{' '}
                      {scen.assumptions.oneTimeEvents?.length || 0}
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-[#DEDDD5]/70">
                    <button
                      onClick={() => handleLoadSavedScenario(scen)}
                      className="text-xs font-semibold text-[#171714] hover:text-[#B45309] flex items-center gap-1 transition"
                    >
                      <span>Load in Simulator</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete scenario "${scen.name}"?`)) {
                          deleteScenarioMutation.mutate(scen.id);
                        }
                      }}
                      className="text-[#66645C] hover:text-rose-600 transition p-1"
                      title="Delete Scenario"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 7. Explainability & Assumptions Panel */}
        {activeForecast && (
          <section className="bg-white border border-[#DEDDD5] rounded-2xl p-6 space-y-4 shadow-2xs">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-[#E5BB45]" />
              <h3 className="text-sm font-bold text-[#171714] uppercase tracking-wider">
                Forecast Assumptions & Methodology Limitations
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-[#F8F7F2] p-4 rounded-xl border border-[#DEDDD5] space-y-2">
                <span className="font-semibold text-[#171714] block">Baseline Assumptions</span>
                <ul className="space-y-1.5 text-[#66645C] list-disc list-inside">
                  {activeForecast.assumptions.map((assump, i) => (
                    <li key={i}>{assump}</li>
                  ))}
                </ul>
              </div>

              <div className="bg-[#F8F7F2] p-4 rounded-xl border border-[#DEDDD5] space-y-2">
                <span className="font-semibold text-[#171714] block">Explicit Limitations</span>
                <ul className="space-y-1.5 text-[#66645C] list-disc list-inside">
                  {activeForecast.limitations.map((lim, i) => (
                    <li key={i}>{lim}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}
      </div>

      {/* 8. Run Forecast Modal */}
      {isForecastModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="forecast-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs"
        >
          <div className="bg-white border border-[#DEDDD5] rounded-2xl max-w-md w-full p-4 sm:p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-[#E8E7E2] pb-3">
              <h3
                id="forecast-modal-title"
                className="text-base font-serif font-bold text-[#171714]"
              >
                Execute Cash Flow Forecast
              </h3>
              <button
                type="button"
                onClick={() => setIsForecastModalOpen(false)}
                className="w-10 h-10 flex items-center justify-center text-[#66645C] hover:text-[#171714] rounded-lg transition"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-[#171714] font-semibold">Selected Currency</label>
                <div className="p-2.5 rounded-xl bg-[#F8F7F2] border border-[#DEDDD5] text-[#171714] font-mono font-bold">
                  {selectedCurrency}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[#171714] font-semibold">Forecast Horizon</label>
                <div className="p-2.5 rounded-xl bg-[#F8F7F2] border border-[#DEDDD5] text-[#171714]">
                  {selectedHorizon} ({selectedHorizon.replace('d', '')} days forward)
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="opening-balance-input" className="text-[#171714] font-semibold">
                  Opening Bank Balance (Optional)
                </label>
                <input
                  id="opening-balance-input"
                  type="number"
                  step="0.01"
                  placeholder="e.g. 15000.00"
                  value={inputOpeningBalance}
                  onChange={(e) => setInputOpeningBalance(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#DEDDD5] text-[#171714] text-xs font-mono focus:outline-none focus:border-[#171714]"
                />
                <p className="text-[11px] text-[#66645C]">
                  Leave blank to project estimated net cash movement only without computing closing
                  balances.
                </p>
              </div>

              {forecastError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
                  {forecastError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E8E7E2]">
              <button
                onClick={() => setIsForecastModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-[#66645C] hover:text-[#171714]"
              >
                Cancel
              </button>
              <button
                onClick={handleRunForecast}
                disabled={forecastMutation.isPending}
                className="px-5 py-2 bg-[#171714] hover:bg-[#0D0D0B] text-white font-semibold rounded-xl text-xs shadow-2xs"
              >
                {forecastMutation.isPending ? 'Calculating...' : 'Start Projection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. Save Scenario Modal */}
      {isSaveModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-scenario-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs"
        >
          <div className="bg-white border border-[#DEDDD5] rounded-2xl max-w-md w-full p-4 sm:p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-[#E8E7E2] pb-3">
              <h3
                id="save-scenario-modal-title"
                className="text-base font-serif font-bold text-[#171714]"
              >
                Save Hypothetical Scenario
              </h3>
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="w-10 h-10 flex items-center justify-center text-[#66645C] hover:text-[#171714] rounded-lg transition"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label htmlFor="scenario-name-input" className="text-[#171714] font-semibold">
                  Scenario Name
                </label>
                <input
                  id="scenario-name-input"
                  type="text"
                  placeholder="e.g. Q3 Worst-Case Revenue Slump"
                  value={scenarioNameInput}
                  onChange={(e) => setScenarioNameInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-[#DEDDD5] text-[#171714] text-xs focus:outline-none focus:border-[#171714]"
                />
              </div>

              <div className="p-3 bg-[#F8F7F2] rounded-xl border border-[#DEDDD5] space-y-1">
                <span className="font-semibold text-[#171714] block">Summary of Assumptions:</span>
                <p className="text-[11px] text-[#66645C]">
                  Revenue Adjustment: {revenueChange > 0 ? `+${revenueChange}` : revenueChange}%
                  <br />
                  Operating Expenses Adjustment:{' '}
                  {expenseChange > 0 ? `+${expenseChange}` : expenseChange}%
                  <br />
                  One-Time Events: {oneTimeEvents.length} event(s)
                </p>
              </div>

              {saveError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
                  {saveError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E8E7E2]">
              <button
                onClick={() => setIsSaveModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-[#66645C] hover:text-[#171714]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveScenarioSubmit}
                disabled={createScenarioMutation.isPending}
                className="px-5 py-2 bg-[#171714] hover:bg-[#0D0D0B] text-[#E5BB45] font-semibold rounded-xl text-xs shadow-2xs"
              >
                {createScenarioMutation.isPending ? 'Saving...' : 'Save Scenario'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (!inShell) {
    return <div className="space-y-6">{bodyContent}</div>;
  }

  return (
    <Layout pageTitle="Cash Flow Forecast" headerActions={headerActions}>
      {bodyContent}
    </Layout>
  );
};
