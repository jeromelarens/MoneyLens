import type {
  FindingType,
  FindingSeverity,
  FindingEvidence,
  SupportedCurrency,
} from '@moneylens/shared';
import type { ITransaction } from '../../infrastructure/database/models/index.js';

export interface DetectionCandidateFinding {
  ruleId: string;
  ruleVersion: string;
  findingType: FindingType;
  severity: FindingSeverity;
  title: string;
  summary: string;
  primaryTransactionIds: string[];
  relatedTransactionIds: string[];
  currency: SupportedCurrency;
  estimatedAmountMinor: number;
  evidence: FindingEvidence;
  fingerprint: string;
}

export interface DetectionRuleContext {
  organizationId: string;
  transactions: ITransaction[];
  observationScope?: {
    startDate?: string;
    endDate?: string;
    currencies?: string[];
  };
}

export interface IDetectionRule {
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly findingType: FindingType;
  readonly name: string;
  readonly description: string;

  execute(context: DetectionRuleContext): Promise<DetectionCandidateFinding[]>;
}
