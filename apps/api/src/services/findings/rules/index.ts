import type { IDetectionRule } from '../rule.interface.js';
import { DuplicatePaymentRule } from './duplicate-payment.rule.js';
import { UnusualExpenseRule } from './unusual-expense.rule.js';
import { RecurringExpenseRule } from './recurring-expense.rule.js';
import { RecurringCostIncreaseRule } from './recurring-cost-increase.rule.js';
import { SupplierPriceVarianceRule } from './supplier-price-variance.rule.js';
import { ReconciliationInconsistencyRule } from './reconciliation-inconsistency.rule.js';

export * from './duplicate-payment.rule.js';
export * from './unusual-expense.rule.js';
export * from './recurring-expense.rule.js';
export * from './recurring-cost-increase.rule.js';
export * from './supplier-price-variance.rule.js';
export * from './reconciliation-inconsistency.rule.js';

export function createDefaultDetectionRules(): IDetectionRule[] {
  return [
    new DuplicatePaymentRule(),
    new UnusualExpenseRule(),
    new RecurringExpenseRule(),
    new RecurringCostIncreaseRule(),
    new SupplierPriceVarianceRule(),
    new ReconciliationInconsistencyRule(),
  ];
}
