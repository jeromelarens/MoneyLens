import type {
  SupportedCurrency,
  CashFlowRiskLevel,
  ForecastDataQuality,
  CashFlowProjectionPoint,
} from '@moneylens/shared';
import type {
  ITransaction,
  IFinancialFinding,
} from '../../infrastructure/database/models/index.js';

export interface ForecastOpeningBalance {
  currency: SupportedCurrency;
  amountMinor: number;
  effectiveDate?: string;
}

export interface ForecastEngineInput {
  organizationId: string;
  currency: SupportedCurrency;
  horizonDays: number;
  forecastStartDate: Date;
  historyWindowDays: number;
  transactions: ITransaction[];
  recurringFindings: IFinancialFinding[];
  openingBalance?: ForecastOpeningBalance;
}

export interface ForecastEngineResult {
  currency: SupportedCurrency;
  horizonDays: number;
  startDate: string;
  endDate: string;
  hasReliableOpeningBalance: boolean;
  openingBalanceMinor: number | null;
  openingBalanceEffectiveDate: string | null;
  projectedInflowsMinor: number;
  projectedOutflowsMinor: number;
  expectedNetMovementMinor: number;
  projectedClosingBalanceMinor: number | null;
  lowestProjectedBalanceMinor: number | null;
  lowestBalanceDate: string | null;
  riskLevel: CashFlowRiskLevel;
  riskReason: string;
  dataQuality: ForecastDataQuality;
  historicalDailyAvgInflowMinor: number;
  historicalDailyAvgOutflowMinor: number;
  recurringOutflowsCount: number;
  recurringOutflowsTotalMinor: number;
  points: CashFlowProjectionPoint[];
  assumptions: string[];
  limitations: string[];
}

export interface ScheduledRecurringItem {
  findingId: string;
  merchant: string;
  amountMinor: number;
  cadenceDays: number;
  lastDate: Date;
}
