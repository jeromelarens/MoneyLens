import type {
  ActionRecommendationRule,
  ActionRuleContext,
  GeneratedActionCandidate,
} from './rule.interface.js';
import {
  DuplicatePaymentActionRule,
  UnusualExpenseActionRule,
  RecurringCostIncreaseActionRule,
  CashFlowPressureActionRule,
  ReconciliationInconsistencyActionRule,
  MissingDataActionRule,
  RecurringExpenseReviewActionRule,
  SupplierPriceVarianceActionRule,
} from './rules/index.js';

export class ActionRecommendationEngine {
  private readonly rules: ActionRecommendationRule[] = [];

  constructor(customRules?: ActionRecommendationRule[]) {
    if (customRules && customRules.length > 0) {
      this.rules = [...customRules];
    } else {
      this.rules = [
        new DuplicatePaymentActionRule(),
        new UnusualExpenseActionRule(),
        new RecurringCostIncreaseActionRule(),
        new CashFlowPressureActionRule(),
        new ReconciliationInconsistencyActionRule(),
        new MissingDataActionRule(),
        new RecurringExpenseReviewActionRule(),
        new SupplierPriceVarianceActionRule(),
      ];
    }
  }

  public registerRule(rule: ActionRecommendationRule): void {
    this.rules.push(rule);
  }

  public getRules(): readonly ActionRecommendationRule[] {
    return this.rules;
  }

  public evaluate(context: ActionRuleContext): GeneratedActionCandidate[] {
    const candidates: GeneratedActionCandidate[] = [];

    for (const rule of this.rules) {
      try {
        const ruleCandidates = rule.evaluate(context);
        candidates.push(...ruleCandidates);
      } catch (err) {
        // Individual rule failure should not fail entire evaluation
        console.error(
          `[ActionRecommendationEngine] Rule ${rule.ruleId} failed during evaluation:`,
          err,
        );
      }
    }

    return candidates;
  }
}
