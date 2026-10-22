import type {
  ActionType,
  ActionCategory,
  ActionPriority,
  ActionSeverity,
  ActionEvidenceQuality,
  ActionFinancialImpact,
  ActionRecommendedStep,
  SupportedCurrency,
} from '@moneylens/shared';
import type {
  IFinancialFinding,
  ICashFlowForecast,
  IForecastRun,
} from '../../infrastructure/database/models/index.js';

export interface ActionRuleContext {
  organizationId: string;
  findings: IFinancialFinding[];
  latestForecasts: ICashFlowForecast[];
  latestForecastRun: IForecastRun | null;
  transactionsCount: number;
  accountsCount: number;
}

export interface GeneratedActionCandidate {
  actionType: ActionType;
  category: ActionCategory;
  title: string;
  explanation: string;
  severity: ActionSeverity;
  evidenceQuality: ActionEvidenceQuality;
  evidence: Record<string, unknown>;
  sourceFindingIds: string[];
  sourceForecastRunId?: string | null;
  currency?: SupportedCurrency | null;
  financialImpact: ActionFinancialImpact;
  recommendedSteps: ActionRecommendedStep[];
  ruleId: string;
  ruleVersion: string;
  fingerprint: string;
  initialPriorityScore: number;
  initialPriority: ActionPriority;
}

export interface ActionRecommendationRule {
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly actionType: ActionType;
  readonly category: ActionCategory;

  evaluate(context: ActionRuleContext): GeneratedActionCandidate[];
}
