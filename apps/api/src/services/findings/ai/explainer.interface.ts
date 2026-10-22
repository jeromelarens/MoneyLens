import type { AiExplanation, FinancialFinding } from '@moneylens/shared';

export interface IFinancialExplainer {
  explain(finding: FinancialFinding): Promise<AiExplanation>;
}
