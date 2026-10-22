import type {
  ActionSeverity,
  ActionEvidenceQuality,
  ActionCategory,
  ActionPriority,
  ActionFinancialImpact,
} from '@moneylens/shared';

export interface PriorityScoreResult {
  priorityScore: number;
  priority: ActionPriority;
}

/**
 * Deterministically calculates a normalized priority score (0-100) and priority level.
 * Formula:
 *   Base Severity (10-50 pts)
 *   + Financial Exposure (0-25 pts)
 *   + Evidence Quality (0-15 pts)
 *   + Category Urgency (2-10 pts)
 * Total is clamped between 5 and 100.
 */
export function calculateActionPriority(
  severity: ActionSeverity,
  evidenceQuality: ActionEvidenceQuality,
  category: ActionCategory,
  financialImpact?: ActionFinancialImpact,
): PriorityScoreResult {
  // 1. Severity Base Points
  let severityScore = 20;
  switch (severity) {
    case 'critical':
      severityScore = 50;
      break;
    case 'high':
      severityScore = 35;
      break;
    case 'medium':
      severityScore = 20;
      break;
    case 'low':
      severityScore = 10;
      break;
  }

  // 2. Financial Magnitude Points
  let financialScore = 0;
  const exposureMinor = Math.max(
    financialImpact?.potentialExposureMinor || 0,
    financialImpact?.estimatedAvoidableCostMinor || 0,
    financialImpact?.confirmedIssueMinor || 0,
    Math.abs(financialImpact?.projectedCashFlowEffectMinor || 0),
  );

  if (exposureMinor >= 100000) {
    // >= $1,000.00
    financialScore = 25;
  } else if (exposureMinor >= 25000) {
    // >= $250.00
    financialScore = 15;
  } else if (exposureMinor >= 5000) {
    // >= $50.00
    financialScore = 8;
  } else if (exposureMinor > 0) {
    financialScore = 3;
  }

  // 3. Evidence Quality Points
  let qualityScore = 5;
  switch (evidenceQuality) {
    case 'high':
      qualityScore = 15;
      break;
    case 'adequate':
      qualityScore = 8;
      break;
    case 'preliminary':
      qualityScore = 0;
      break;
  }

  // 4. Category Urgency Points
  let categoryScore = 2;
  switch (category) {
    case 'cash_preservation':
      categoryScore = 10;
      break;
    case 'cost_reduction':
      categoryScore = 5;
      break;
    case 'data_integrity':
      categoryScore = 5;
      break;
    case 'vendor_management':
      categoryScore = 2;
      break;
  }

  const rawScore = severityScore + financialScore + qualityScore + categoryScore;
  const priorityScore = Math.min(100, Math.max(5, rawScore));

  let priority: ActionPriority = 'medium';
  if (priorityScore >= 75) {
    priority = 'critical';
  } else if (priorityScore >= 55) {
    priority = 'high';
  } else if (priorityScore >= 35) {
    priority = 'medium';
  } else {
    priority = 'low';
  }

  return {
    priorityScore,
    priority,
  };
}
