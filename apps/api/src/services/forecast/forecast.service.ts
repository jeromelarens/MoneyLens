import { AppError } from '../../middleware/error-handler.js';
import {
  ERROR_CODES,
  FORECAST_HORIZON_DAYS,
  type CreateForecastRunRequest,
  type CreateScenarioRequest,
  type UpdateScenarioRequest,
  type SimulateScenarioRequest,
  type ForecastsFilterQuery,
  type ForecastRunListResponse,
  type CashFlowScenarioListResponse,
  type CashFlowDashboardSummary,
  type CurrencyCashFlowSummary,
  type ScenarioCalculationResult,
  type SupportedCurrency,
  type CashFlowForecast,
  type ForecastRun,
  type CashFlowScenario,
} from '@moneylens/shared';
import {
  ForecastRunModel,
  CashFlowForecastModel,
  CashFlowScenarioModel,
  TransactionModel,
  FinancialFindingModel,
  type ITransaction,
  type IFinancialFinding,
  type IForecastRun,
  type ICashFlowForecast,
  type ICashFlowScenario,
} from '../../infrastructure/database/models/index.js';
import { ForecastEngine } from './forecast-engine.js';
import { CashFlowScenarioEngine } from './scenario-engine.js';
import type { ForecastOpeningBalance } from './engine.interface.js';

export class ForecastService {
  /**
   * Orchestrates a deterministic cash flow forecast run for the authenticated organization.
   */
  public async createForecastRun(
    organizationId: string,
    request: CreateForecastRunRequest,
  ): Promise<{ run: ForecastRun; forecasts: CashFlowForecast[] }> {
    const horizonDays = FORECAST_HORIZON_DAYS[request.horizon] || 30;
    const historyWindowDays = request.historyWindowDays || 90;
    const now = new Date();

    const cutoffDate = new Date(now.getTime() - historyWindowDays * 86400000);

    // 1. Query bounded set of transactions strictly scoped to organization
    const transactions = await TransactionModel.find({
      organizationId,
      date: { $gte: cutoffDate, $lte: now },
    })
      .lean()
      .exec();

    // Determine target currencies
    let targetCurrencies: SupportedCurrency[] = [];
    if (request.currencies && request.currencies.length > 0) {
      targetCurrencies = request.currencies as SupportedCurrency[];
    } else {
      const distinctCurrencies = Array.from(
        new Set(transactions.map((tx) => tx.currency.toUpperCase())),
      ) as SupportedCurrency[];
      targetCurrencies =
        distinctCurrencies.length > 0 ? distinctCurrencies : (['USD'] as SupportedCurrency[]);
    }

    // 2. Query active recurring findings from Phase 4 (excluding dismissed findings)
    const activeFindings = await FinancialFindingModel.find({
      organizationId,
      status: { $ne: 'dismissed' },
      findingType: { $in: ['recurring_expense', 'recurring_cost_increase'] },
    })
      .lean()
      .exec();

    // 3. Create initial pending ForecastRun record
    const runDoc = new ForecastRunModel({
      organizationId,
      status: 'pending',
      horizonDays,
      methodology: 'deterministic_moving_average_v1',
      methodologyVersion: '1.0.0',
      historyWindowDays,
      transactionsEvaluated: transactions.length,
      currencies: targetCurrencies,
      warnings: [],
      errorMessages: [],
      startedAt: now,
    });
    await runDoc.save();

    const createdForecasts: CashFlowForecast[] = [];
    const runWarnings: string[] = [];

    try {
      // 4. Calculate deterministic forecast for each currency
      for (const cur of targetCurrencies) {
        // Find opening balance for this currency if provided in request
        const openingBalanceInput = request.openingBalances?.find(
          (ob) => ob.currency.toUpperCase() === cur.toUpperCase(),
        );

        let openingBalanceParam: ForecastOpeningBalance | undefined;
        if (openingBalanceInput) {
          openingBalanceParam = {
            currency: cur,
            amountMinor: openingBalanceInput.amountMinor,
            effectiveDate: openingBalanceInput.effectiveDate,
          };
        }

        const calculation = ForecastEngine.calculateForecast({
          organizationId,
          currency: cur,
          horizonDays,
          forecastStartDate: now,
          historyWindowDays,
          transactions: transactions as unknown as ITransaction[],
          recurringFindings: activeFindings as unknown as IFinancialFinding[],
          openingBalance: openingBalanceParam,
        });

        if (calculation.dataQuality === 'insufficient_history') {
          runWarnings.push(
            `Currency ${cur} has insufficient historical transactions (< 14 days) for robust run rates.`,
          );
        }

        if (!calculation.hasReliableOpeningBalance) {
          runWarnings.push(
            `No opening bank balance provided for ${cur}. Projections reflect estimated net cash movement only.`,
          );
        }

        // Persist currency-specific forecast
        const forecastDoc = new CashFlowForecastModel({
          organizationId,
          forecastRunId: runDoc._id,
          currency: calculation.currency,
          horizonDays: calculation.horizonDays,
          startDate: calculation.startDate,
          endDate: calculation.endDate,
          hasReliableOpeningBalance: calculation.hasReliableOpeningBalance,
          openingBalanceMinor: calculation.openingBalanceMinor,
          openingBalanceEffectiveDate: calculation.openingBalanceEffectiveDate,
          projectedInflowsMinor: calculation.projectedInflowsMinor,
          projectedOutflowsMinor: calculation.projectedOutflowsMinor,
          expectedNetMovementMinor: calculation.expectedNetMovementMinor,
          projectedClosingBalanceMinor: calculation.projectedClosingBalanceMinor,
          lowestProjectedBalanceMinor: calculation.lowestProjectedBalanceMinor,
          lowestBalanceDate: calculation.lowestBalanceDate,
          riskLevel: calculation.riskLevel,
          riskReason: calculation.riskReason,
          dataQuality: calculation.dataQuality,
          historicalDailyAvgInflowMinor: calculation.historicalDailyAvgInflowMinor,
          historicalDailyAvgOutflowMinor: calculation.historicalDailyAvgOutflowMinor,
          recurringOutflowsCount: calculation.recurringOutflowsCount,
          recurringOutflowsTotalMinor: calculation.recurringOutflowsTotalMinor,
          points: calculation.points,
          assumptions: calculation.assumptions,
          limitations: calculation.limitations,
        });

        await forecastDoc.save();
        createdForecasts.push(this.toForecastContract(forecastDoc));
      }

      runDoc.status = runWarnings.length > 0 ? 'completed_with_warnings' : 'completed';
      runDoc.completedAt = new Date();
      runDoc.warnings = runWarnings;
      await runDoc.save();

      return {
        run: this.toRunContract(runDoc),
        forecasts: createdForecasts,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      runDoc.status = 'failed';
      runDoc.completedAt = new Date();
      runDoc.errorMessages = [errMsg];
      await runDoc.save();
      throw err;
    }
  }

  /**
   * Retrieves a forecast run and its associated currency forecasts.
   */
  public async getForecastRun(
    organizationId: string,
    runId: string,
  ): Promise<{ run: ForecastRun; forecasts: CashFlowForecast[] }> {
    const runDoc = await ForecastRunModel.findOne({ _id: runId, organizationId }).exec();
    if (!runDoc) {
      throw new AppError(404, ERROR_CODES.FORECAST_RUN_NOT_FOUND, 'Forecast run not found');
    }

    const forecastDocs = await CashFlowForecastModel.find({
      forecastRunId: runId,
      organizationId,
    }).exec();

    return {
      run: this.toRunContract(runDoc),
      forecasts: forecastDocs.map((doc) => this.toForecastContract(doc)),
    };
  }

  /**
   * Lists paginated forecast runs for the tenant.
   */
  public async listForecastRuns(
    organizationId: string,
    query: ForecastsFilterQuery,
  ): Promise<ForecastRunListResponse> {
    const filter: Record<string, unknown> = { organizationId };
    if (query.status) {
      filter.status = query.status;
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [items, totalItems] = await Promise.all([
      ForecastRunModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      ForecastRunModel.countDocuments(filter).exec(),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items: items.map((doc) => this.toRunContract(doc)),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
      },
    };
  }

  /**
   * Retrieves executive currency-segregated cash flow summary.
   */
  public async getLatestSummary(organizationId: string): Promise<CashFlowDashboardSummary> {
    const latestRun = await ForecastRunModel.findOne({
      organizationId,
      status: { $in: ['completed', 'completed_with_warnings'] },
    })
      .sort({ createdAt: -1 })
      .exec();

    const byCurrency: Record<string, CurrencyCashFlowSummary> = {};

    if (latestRun) {
      const forecasts = await CashFlowForecastModel.find({
        forecastRunId: latestRun._id,
        organizationId,
      }).exec();

      for (const fc of forecasts) {
        byCurrency[fc.currency] = {
          currency: fc.currency as SupportedCurrency,
          latestForecastRunId: latestRun._id,
          horizonDays: fc.horizonDays,
          projectedInflowsMinor: fc.projectedInflowsMinor,
          projectedOutflowsMinor: fc.projectedOutflowsMinor,
          expectedNetMovementMinor: fc.expectedNetMovementMinor,
          hasReliableOpeningBalance: fc.hasReliableOpeningBalance,
          openingBalanceMinor: fc.openingBalanceMinor ?? null,
          projectedClosingBalanceMinor: fc.projectedClosingBalanceMinor ?? null,
          riskLevel: fc.riskLevel,
          riskReason: fc.riskReason,
          dataQuality: fc.dataQuality,
          lastCalculatedAt: fc.updatedAt.toISOString(),
        };
      }
    }

    const totalRuns = await ForecastRunModel.countDocuments({ organizationId }).exec();

    return {
      byCurrency,
      lastRunAt: latestRun?.completedAt?.toISOString() || null,
      totalForecastRuns: totalRuns,
    };
  }

  /**
   * Creates a saved cash flow hypothetical scenario.
   */
  public async createScenario(
    organizationId: string,
    request: CreateScenarioRequest,
  ): Promise<CashFlowScenario> {
    const horizonDays = FORECAST_HORIZON_DAYS[request.horizon] || 30;

    const doc = new CashFlowScenarioModel({
      organizationId,
      name: request.name,
      currency: request.currency.toUpperCase(),
      horizonDays,
      assumptions: request.assumptions,
    });

    await doc.save();
    return this.toScenarioContract(doc);
  }

  /**
   * Lists saved scenarios for tenant.
   */
  public async listScenarios(
    organizationId: string,
    page = 1,
    limit = 20,
  ): Promise<CashFlowScenarioListResponse> {
    const skip = (page - 1) * limit;

    const [items, totalItems] = await Promise.all([
      CashFlowScenarioModel.find({ organizationId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      CashFlowScenarioModel.countDocuments({ organizationId }).exec(),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items: items.map((doc) => this.toScenarioContract(doc)),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
      },
    };
  }

  /**
   * Retrieves single scenario and simulates its impact against latest baseline forecast.
   */
  public async getScenario(
    organizationId: string,
    scenarioId: string,
  ): Promise<{ scenario: CashFlowScenario; simulation: ScenarioCalculationResult }> {
    const scenarioDoc = await CashFlowScenarioModel.findOne({
      _id: scenarioId,
      organizationId,
    }).exec();

    if (!scenarioDoc) {
      throw new AppError(404, ERROR_CODES.SCENARIO_NOT_FOUND, 'Scenario not found');
    }

    // Find baseline forecast for this currency
    const baseline = await this.getOrCreateBaseline(
      organizationId,
      scenarioDoc.currency as SupportedCurrency,
      scenarioDoc.horizonDays,
    );

    const simulation = CashFlowScenarioEngine.simulate(
      baseline,
      scenarioDoc.assumptions,
      scenarioDoc._id,
      scenarioDoc.name,
    );

    return {
      scenario: this.toScenarioContract(scenarioDoc),
      simulation,
    };
  }

  /**
   * Updates an existing scenario.
   */
  public async updateScenario(
    organizationId: string,
    scenarioId: string,
    request: UpdateScenarioRequest,
  ): Promise<CashFlowScenario> {
    const doc = await CashFlowScenarioModel.findOne({ _id: scenarioId, organizationId }).exec();
    if (!doc) {
      throw new AppError(404, ERROR_CODES.SCENARIO_NOT_FOUND, 'Scenario not found');
    }

    if (request.name) doc.name = request.name;
    if (request.assumptions) doc.assumptions = request.assumptions;

    await doc.save();
    return this.toScenarioContract(doc);
  }

  /**
   * Deletes a scenario.
   */
  public async deleteScenario(organizationId: string, scenarioId: string): Promise<void> {
    const res = await CashFlowScenarioModel.deleteOne({ _id: scenarioId, organizationId }).exec();
    if (res.deletedCount === 0) {
      throw new AppError(404, ERROR_CODES.SCENARIO_NOT_FOUND, 'Scenario not found');
    }
  }

  /**
   * Ad-hoc simulation without persisting a scenario entity.
   */
  public async simulateAdHocScenario(
    organizationId: string,
    request: SimulateScenarioRequest,
  ): Promise<ScenarioCalculationResult> {
    const horizonDays = FORECAST_HORIZON_DAYS[request.horizon] || 30;

    const baseline = await this.getOrCreateBaseline(
      organizationId,
      request.currency as SupportedCurrency,
      horizonDays,
      request.openingBalanceMinor !== undefined
        ? {
            currency: request.currency as SupportedCurrency,
            amountMinor: request.openingBalanceMinor,
          }
        : undefined,
    );

    return CashFlowScenarioEngine.simulate(
      baseline,
      request.assumptions,
      'adhoc-simulation',
      'Ad-Hoc Scenario Simulation',
    );
  }

  /**
   * Internal helper to find latest baseline forecast or compute an ephemeral baseline.
   */
  private async getOrCreateBaseline(
    organizationId: string,
    currency: SupportedCurrency,
    horizonDays: number,
    openingBalanceOverride?: ForecastOpeningBalance,
  ) {
    const latestFc = await CashFlowForecastModel.findOne({
      organizationId,
      currency: currency.toUpperCase(),
      horizonDays,
    })
      .sort({ createdAt: -1 })
      .exec();

    if (latestFc && !openingBalanceOverride) {
      return {
        currency: latestFc.currency as SupportedCurrency,
        horizonDays: latestFc.horizonDays,
        startDate: latestFc.startDate,
        endDate: latestFc.endDate,
        hasReliableOpeningBalance: latestFc.hasReliableOpeningBalance,
        openingBalanceMinor: latestFc.openingBalanceMinor ?? null,
        openingBalanceEffectiveDate: latestFc.openingBalanceEffectiveDate ?? null,
        projectedInflowsMinor: latestFc.projectedInflowsMinor,
        projectedOutflowsMinor: latestFc.projectedOutflowsMinor,
        expectedNetMovementMinor: latestFc.expectedNetMovementMinor,
        projectedClosingBalanceMinor: latestFc.projectedClosingBalanceMinor ?? null,
        lowestProjectedBalanceMinor: latestFc.lowestProjectedBalanceMinor ?? null,
        lowestBalanceDate: latestFc.lowestBalanceDate ?? null,
        riskLevel: latestFc.riskLevel,
        riskReason: latestFc.riskReason,
        dataQuality: latestFc.dataQuality,
        historicalDailyAvgInflowMinor: latestFc.historicalDailyAvgInflowMinor,
        historicalDailyAvgOutflowMinor: latestFc.historicalDailyAvgOutflowMinor,
        recurringOutflowsCount: latestFc.recurringOutflowsCount,
        recurringOutflowsTotalMinor: latestFc.recurringOutflowsTotalMinor,
        points: latestFc.points,
        assumptions: latestFc.assumptions,
        limitations: latestFc.limitations,
      };
    }

    // Ephemeral baseline generation
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - 90 * 86400000);

    const [transactions, activeFindings] = await Promise.all([
      TransactionModel.find({
        organizationId,
        date: { $gte: cutoffDate, $lte: now },
      })
        .lean()
        .exec(),
      FinancialFindingModel.find({
        organizationId,
        status: { $ne: 'dismissed' },
        findingType: { $in: ['recurring_expense', 'recurring_cost_increase'] },
      })
        .lean()
        .exec(),
    ]);

    return ForecastEngine.calculateForecast({
      organizationId,
      currency,
      horizonDays,
      forecastStartDate: now,
      historyWindowDays: 90,
      transactions: transactions as unknown as ITransaction[],
      recurringFindings: activeFindings as unknown as IFinancialFinding[],
      openingBalance: openingBalanceOverride,
    });
  }

  private toRunContract(doc: IForecastRun): ForecastRun {
    return {
      id: doc._id,
      organizationId: doc.organizationId,
      status: doc.status,
      horizonDays: doc.horizonDays,
      methodology: doc.methodology,
      methodologyVersion: doc.methodologyVersion,
      historyWindowDays: doc.historyWindowDays,
      transactionsEvaluated: doc.transactionsEvaluated,
      currencies: doc.currencies as SupportedCurrency[],
      warnings: doc.warnings,
      errorMessages: doc.errorMessages,
      startedAt: doc.startedAt.toISOString(),
      completedAt: doc.completedAt?.toISOString() || null,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  private toForecastContract(doc: ICashFlowForecast): CashFlowForecast {
    return {
      id: doc._id,
      organizationId: doc.organizationId,
      forecastRunId: doc.forecastRunId,
      currency: doc.currency as SupportedCurrency,
      horizonDays: doc.horizonDays,
      startDate: doc.startDate,
      endDate: doc.endDate,
      hasReliableOpeningBalance: doc.hasReliableOpeningBalance,
      openingBalanceMinor: doc.openingBalanceMinor ?? null,
      openingBalanceEffectiveDate: doc.openingBalanceEffectiveDate ?? null,
      projectedInflowsMinor: doc.projectedInflowsMinor,
      projectedOutflowsMinor: doc.projectedOutflowsMinor,
      expectedNetMovementMinor: doc.expectedNetMovementMinor,
      projectedClosingBalanceMinor: doc.projectedClosingBalanceMinor ?? null,
      lowestProjectedBalanceMinor: doc.lowestProjectedBalanceMinor ?? null,
      lowestBalanceDate: doc.lowestBalanceDate ?? null,
      riskLevel: doc.riskLevel,
      riskReason: doc.riskReason,
      dataQuality: doc.dataQuality,
      historicalDailyAvgInflowMinor: doc.historicalDailyAvgInflowMinor,
      historicalDailyAvgOutflowMinor: doc.historicalDailyAvgOutflowMinor,
      recurringOutflowsCount: doc.recurringOutflowsCount,
      recurringOutflowsTotalMinor: doc.recurringOutflowsTotalMinor,
      points: doc.points,
      assumptions: doc.assumptions,
      limitations: doc.limitations,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  private toScenarioContract(doc: ICashFlowScenario): CashFlowScenario {
    return {
      id: doc._id,
      organizationId: doc.organizationId,
      name: doc.name,
      currency: doc.currency as SupportedCurrency,
      horizonDays: doc.horizonDays,
      assumptions: doc.assumptions,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }
}

export const forecastService = new ForecastService();
