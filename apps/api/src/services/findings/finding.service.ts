import crypto from 'node:crypto';
import type {
  FinancialFinding,
  FindingListResponse,
  FindingHistory,
  DetectionRun,
  FinancialExposureSummary,
  FindingsFilterQuery,
  ReviewFindingRequest,
  CreateDetectionRunRequest,
  SupportedCurrency,
  PerRuleRunResult,
  AiExplanation,
} from '@moneylens/shared';
import { ERROR_CODES } from '@moneylens/shared';
import {
  FinancialFindingModel,
  FindingHistoryModel,
  DetectionRunModel,
  TransactionModel,
  type IFinancialFinding,
  type IFindingHistory,
  type IDetectionRun,
  type ITransaction,
} from '../../infrastructure/database/models/index.js';
import { AppError } from '../../middleware/error-handler.js';
import { createDefaultDetectionRules } from './rules/index.js';
import type { IDetectionRule } from './rule.interface.js';
import { GeminiExplainerAdapter } from './ai/gemini-explainer.js';
import type { IFinancialExplainer } from './ai/explainer.interface.js';

export const ENGINE_VERSION = 'v1.0.0';

export class FindingService {
  private readonly rules: IDetectionRule[];
  private readonly explainer: IFinancialExplainer;

  constructor(rules?: IDetectionRule[], explainer?: IFinancialExplainer) {
    this.rules = rules || createDefaultDetectionRules();
    this.explainer = explainer || new GeminiExplainerAdapter();
  }

  /**
   * Executes a bounded, repeatable detection run for the specified organization.
   */
  public async runDetection(
    organizationId: string,
    request?: CreateDetectionRunRequest,
  ): Promise<DetectionRun> {
    const scope = request?.observationScope;

    // Create persistent detection run in processing state
    const runDoc = await DetectionRunModel.create({
      _id: crypto.randomUUID(),
      organizationId,
      ruleVersion: ENGINE_VERSION,
      status: 'processing',
      observationScope: scope,
      startedAt: new Date(),
      transactionsEvaluated: 0,
      findingsCreated: 0,
      findingsUpdated: 0,
      findingsUnchanged: 0,
      errorMessages: [],
      perRuleResults: {},
    });

    try {
      // Query bounded set of transactions scoped strictly to authenticated organization
      const txQuery: Record<string, unknown> = { organizationId };

      if (scope?.startDate || scope?.endDate) {
        const dateFilter: Record<string, Date> = {};
        if (scope.startDate) {
          dateFilter.$gte = new Date(`${scope.startDate}T00:00:00.000Z`);
        }
        if (scope.endDate) {
          dateFilter.$lte = new Date(`${scope.endDate}T23:59:59.999Z`);
        }
        txQuery.date = dateFilter;
      }

      if (scope?.currencies && scope.currencies.length > 0) {
        txQuery.currency = { $in: scope.currencies };
      }

      // Bound query to avoid unbounded memory allocation (max 5,000 transactions per run)
      const transactions = await TransactionModel.find(txQuery)
        .sort({ date: -1 })
        .limit(5000)
        .exec();

      let createdCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;
      const errors: string[] = [];
      const perRuleResults: Record<string, PerRuleRunResult> = {};

      // Execute each detection rule
      for (const rule of this.rules) {
        try {
          const candidates = await rule.execute({
            organizationId,
            transactions,
            observationScope: scope,
          });

          let ruleFindingsCount = 0;

          for (const candidate of candidates) {
            // Check for existing finding by fingerprint within organization
            const existing = await FinancialFindingModel.findOne({
              organizationId,
              fingerprint: candidate.fingerprint,
            });

            if (!existing) {
              // Create new finding
              const newFinding = await FinancialFindingModel.create({
                _id: crypto.randomUUID(),
                organizationId,
                findingType: candidate.findingType,
                status: 'open',
                severity: candidate.severity,
                title: candidate.title,
                summary: candidate.summary,
                primaryTransactionIds: candidate.primaryTransactionIds,
                relatedTransactionIds: candidate.relatedTransactionIds,
                evidence: candidate.evidence,
                estimatedAmountMinor: candidate.estimatedAmountMinor,
                currency: candidate.currency,
                ruleId: candidate.ruleId,
                ruleVersion: candidate.ruleVersion,
                detectedAt: new Date(),
                lastEvaluatedAt: new Date(),
                fingerprint: candidate.fingerprint,
              });

              try {
                await newFinding.save();

                // Record creation in append-only history
                await FindingHistoryModel.create({
                  _id: crypto.randomUUID(),
                  findingId: newFinding._id,
                  organizationId,
                  action: 'created',
                  newStatus: 'open',
                  notes: `Finding detected by rule ${candidate.ruleId} (${candidate.ruleVersion})`,
                });

                createdCount++;
                ruleFindingsCount++;
              } catch (saveErr: unknown) {
                const err = saveErr as { code?: number; message?: string };
                if (err?.code === 11000 || err?.message?.includes('E11000')) {
                  // Concurrent detection run already created this finding
                  unchangedCount++;
                  ruleFindingsCount++;
                } else {
                  throw saveErr;
                }
              }
            } else {
              // If already dismissed, confirmed, or resolved: preserve user review state
              if (
                existing.status === 'dismissed' ||
                existing.status === 'confirmed_issue' ||
                existing.status === 'resolved'
              ) {
                existing.lastEvaluatedAt = new Date();
                await existing.save();
                unchangedCount++;
              } else {
                // For open or under_review, refresh evidence and lastEvaluatedAt
                existing.lastEvaluatedAt = new Date();
                existing.severity = candidate.severity;
                existing.summary = candidate.summary;
                existing.evidence = candidate.evidence;
                existing.estimatedAmountMinor = candidate.estimatedAmountMinor;
                await existing.save();

                await FindingHistoryModel.create({
                  _id: crypto.randomUUID(),
                  findingId: existing._id,
                  organizationId,
                  action: 're_evaluated',
                  previousStatus: existing.status,
                  newStatus: existing.status,
                  notes: 'Evidence refreshed during detection run re-evaluation',
                });

                updatedCount++;
                ruleFindingsCount++;
              }
            }
          }

          perRuleResults[rule.ruleId] = {
            ruleId: rule.ruleId,
            ruleVersion: rule.ruleVersion,
            evaluatedCount: transactions.length,
            findingsCount: ruleFindingsCount,
          };
        } catch (ruleErr: unknown) {
          const ruleErrMsg = ruleErr instanceof Error ? ruleErr.message : String(ruleErr);
          const errMsg = `Rule ${rule.ruleId} failed: ${ruleErrMsg}`;
          errors.push(errMsg);
          perRuleResults[rule.ruleId] = {
            ruleId: rule.ruleId,
            ruleVersion: rule.ruleVersion,
            evaluatedCount: transactions.length,
            findingsCount: 0,
            error: errMsg,
          };
        }
      }

      runDoc.status = errors.length > 0 ? 'completed_with_errors' : 'completed';
      runDoc.completedAt = new Date();
      runDoc.transactionsEvaluated = transactions.length;
      runDoc.findingsCreated = createdCount;
      runDoc.findingsUpdated = updatedCount;
      runDoc.findingsUnchanged = unchangedCount;
      runDoc.errorMessages = errors;
      runDoc.perRuleResults = perRuleResults;
      await runDoc.save();

      return this.toDetectionRunContract(runDoc);
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
   * Retrieves paginated findings matching optional filters for the authenticated organization.
   */
  public async listFindings(
    organizationId: string,
    filter: FindingsFilterQuery,
  ): Promise<FindingListResponse> {
    const query: Record<string, unknown> = { organizationId };

    if (filter.findingType) query.findingType = filter.findingType;
    if (filter.status) query.status = filter.status;
    if (filter.severity) query.severity = filter.severity;
    if (filter.currency) query.currency = filter.currency;

    if (filter.startDate || filter.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (filter.startDate) {
        dateFilter.$gte = new Date(`${filter.startDate}T00:00:00.000Z`);
      }
      if (filter.endDate) {
        dateFilter.$lte = new Date(`${filter.endDate}T23:59:59.999Z`);
      }
      query.detectedAt = dateFilter;
    }

    const sortField =
      filter.sortBy === 'estimatedAmountMinor'
        ? 'estimatedAmountMinor'
        : filter.sortBy === 'severity'
          ? 'severity'
          : 'detectedAt';
    const sortOrder = filter.sortOrder === 'asc' ? 1 : -1;

    const page = filter.page || 1;
    const limit = Math.min(filter.limit || 20, 100);
    const skip = (page - 1) * limit;

    const [items, totalItems] = await Promise.all([
      FinancialFindingModel.find(query)
        .sort({ [sortField]: sortOrder, _id: 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      FinancialFindingModel.countDocuments(query).exec(),
    ]);

    const totalPages = Math.ceil(totalItems / limit) || 1;

    return {
      items: items.map((doc) => this.toFindingContract(doc)),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
      },
    };
  }

  /**
   * Retrieves single finding detail along with relevant transactions and history.
   */
  public async getFindingById(
    organizationId: string,
    findingId: string,
  ): Promise<{
    finding: FinancialFinding;
    transactions: ITransaction[];
    history: FindingHistory[];
  }> {
    const finding = await FinancialFindingModel.findOne({
      _id: findingId,
      organizationId,
    }).exec();

    if (!finding) {
      throw new AppError(404, ERROR_CODES.FINDING_NOT_FOUND, 'Financial finding not found');
    }

    const allTxIds = [...finding.primaryTransactionIds, ...(finding.relatedTransactionIds || [])];

    const [transactions, historyDocs] = await Promise.all([
      TransactionModel.find({
        _id: { $in: allTxIds },
        organizationId,
      }).exec(),
      FindingHistoryModel.find({
        findingId,
        organizationId,
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .exec(),
    ]);

    return {
      finding: this.toFindingContract(finding),
      transactions,
      history: historyDocs.map((h) => this.toFindingHistoryContract(h)),
    };
  }

  /**
   * Processes a validated lifecycle transition for a finding.
   */
  public async reviewFinding(
    organizationId: string,
    findingId: string,
    request: ReviewFindingRequest,
    actorId = 'user',
  ): Promise<FinancialFinding> {
    const finding = await FinancialFindingModel.findOne({
      _id: findingId,
      organizationId,
    }).exec();

    if (!finding) {
      throw new AppError(404, ERROR_CODES.FINDING_NOT_FOUND, 'Financial finding not found');
    }

    const previousStatus = finding.status;
    let newStatus: typeof previousStatus;
    let historyAction: FindingHistory['action'];

    switch (request.action) {
      case 'open_review':
        if (finding.status !== 'open') {
          throw new AppError(
            400,
            ERROR_CODES.INVALID_FINDING_STATUS,
            `Cannot move to under_review from status '${finding.status}'`,
          );
        }
        newStatus = 'under_review';
        historyAction = 'opened_for_review';
        break;

      case 'confirm_issue':
        if (finding.status !== 'open' && finding.status !== 'under_review') {
          throw new AppError(
            400,
            ERROR_CODES.INVALID_FINDING_STATUS,
            `Cannot confirm finding from status '${finding.status}'`,
          );
        }
        newStatus = 'confirmed_issue';
        historyAction = 'confirmed';
        break;

      case 'dismiss':
        if (finding.status !== 'open' && finding.status !== 'under_review') {
          throw new AppError(
            400,
            ERROR_CODES.INVALID_FINDING_STATUS,
            `Cannot dismiss finding from status '${finding.status}'`,
          );
        }
        if (!request.reason || request.reason.trim().length === 0) {
          throw new AppError(
            400,
            ERROR_CODES.VALIDATION_ERROR,
            'A dismissal reason is required when dismissing a finding',
          );
        }
        newStatus = 'dismissed';
        historyAction = 'dismissed';
        finding.dismissalReason = request.reason.trim();
        break;

      case 'resolve':
        if (finding.status !== 'confirmed_issue' && finding.status !== 'under_review') {
          throw new AppError(
            400,
            ERROR_CODES.INVALID_FINDING_STATUS,
            `Cannot mark finding resolved from status '${finding.status}'`,
          );
        }
        newStatus = 'resolved';
        historyAction = 'resolved';
        break;

      default:
        throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Invalid review action');
    }

    finding.status = newStatus;
    finding.reviewedAt = new Date();
    if (request.notes) {
      finding.resolutionNotes = request.notes.trim();
    }
    await finding.save();

    await FindingHistoryModel.create({
      _id: crypto.randomUUID(),
      findingId,
      organizationId,
      action: historyAction,
      actorId,
      previousStatus,
      newStatus,
      reason: request.reason || null,
      notes: request.notes || null,
    });

    return this.toFindingContract(finding);
  }

  /**
   * Retrieves append-only review history for a finding.
   */
  public async getFindingHistory(
    organizationId: string,
    findingId: string,
  ): Promise<FindingHistory[]> {
    const finding = await FinancialFindingModel.findOne({
      _id: findingId,
      organizationId,
    }).exec();

    if (!finding) {
      throw new AppError(404, ERROR_CODES.FINDING_NOT_FOUND, 'Financial finding not found');
    }

    const historyDocs = await FindingHistoryModel.find({
      findingId,
      organizationId,
    })
      .sort({ createdAt: -1 })
      .exec();

    return historyDocs.map((doc) => this.toFindingHistoryContract(doc));
  }

  /**
   * Generates or retrieves an explainable AI analysis for a finding.
   */
  public async explainFinding(organizationId: string, findingId: string): Promise<AiExplanation> {
    const findingDoc = await FinancialFindingModel.findOne({
      _id: findingId,
      organizationId,
    }).exec();

    if (!findingDoc) {
      throw new AppError(404, ERROR_CODES.FINDING_NOT_FOUND, 'Financial finding not found');
    }

    const finding = this.toFindingContract(findingDoc);
    const explanation = await this.explainer.explain(finding);

    await FindingHistoryModel.create({
      _id: crypto.randomUUID(),
      findingId,
      organizationId,
      action: 'explanation_generated',
      notes: `Explanation produced by ${explanation.provider}`,
    });

    return explanation;
  }

  /**
   * Retrieves segregated exposure and leakage metrics strictly partitioned by currency.
   */
  public async getExposureSummary(organizationId: string): Promise<FinancialExposureSummary> {
    const findings = await FinancialFindingModel.find({ organizationId }).exec();

    const byCurrency: FinancialExposureSummary['byCurrency'] = {};
    let highCount = 0;
    let medCount = 0;
    let lowCount = 0;

    for (const f of findings) {
      if (f.severity === 'high') highCount++;
      else if (f.severity === 'medium') medCount++;
      else if (f.severity === 'low') lowCount++;

      const curr = f.currency as SupportedCurrency;
      if (!byCurrency[curr]) {
        byCurrency[curr] = {
          currency: curr,
          potentialExposureMinor: 0,
          confirmedExposureMinor: 0,
          openFindingCount: 0,
          underReviewFindingCount: 0,
          confirmedFindingCount: 0,
          dismissedFindingCount: 0,
          resolvedFindingCount: 0,
        };
      }

      const entry = byCurrency[curr];

      if (f.status === 'open') {
        entry.openFindingCount++;
        entry.potentialExposureMinor += f.estimatedAmountMinor;
      } else if (f.status === 'under_review') {
        entry.underReviewFindingCount++;
        entry.potentialExposureMinor += f.estimatedAmountMinor;
      } else if (f.status === 'confirmed_issue') {
        entry.confirmedFindingCount++;
        entry.confirmedExposureMinor += f.estimatedAmountMinor;
      } else if (f.status === 'dismissed') {
        entry.dismissedFindingCount++;
      } else if (f.status === 'resolved') {
        entry.resolvedFindingCount++;
      }
    }

    const lastRun = await DetectionRunModel.findOne({ organizationId })
      .sort({ createdAt: -1 })
      .exec();

    return {
      byCurrency,
      totalFindingsCount: findings.length,
      highSeverityCount: highCount,
      mediumSeverityCount: medCount,
      lowSeverityCount: lowCount,
      lastDetectionRunAt: lastRun?.completedAt ? lastRun.completedAt.toISOString() : null,
    };
  }

  /**
   * Retrieves status and statistics of a detection run.
   */
  public async getDetectionRun(organizationId: string, runId: string): Promise<DetectionRun> {
    const run = await DetectionRunModel.findOne({
      _id: runId,
      organizationId,
    }).exec();

    if (!run) {
      throw new AppError(404, ERROR_CODES.DETECTION_RUN_NOT_FOUND, 'Detection run not found');
    }

    return this.toDetectionRunContract(run);
  }

  // --- Mappers ---

  private toFindingContract(doc: IFinancialFinding): FinancialFinding {
    return {
      id: doc._id,
      organizationId: doc.organizationId,
      findingType: doc.findingType,
      status: doc.status,
      severity: doc.severity,
      title: doc.title,
      summary: doc.summary,
      primaryTransactionIds: doc.primaryTransactionIds,
      relatedTransactionIds: doc.relatedTransactionIds || [],
      evidence: doc.evidence,
      estimatedAmountMinor: doc.estimatedAmountMinor,
      currency: doc.currency as SupportedCurrency,
      ruleId: doc.ruleId,
      ruleVersion: doc.ruleVersion,
      detectedAt: doc.detectedAt.toISOString(),
      lastEvaluatedAt: doc.lastEvaluatedAt.toISOString(),
      reviewedAt: doc.reviewedAt ? doc.reviewedAt.toISOString() : null,
      dismissalReason: doc.dismissalReason || null,
      resolutionNotes: doc.resolutionNotes || null,
      fingerprint: doc.fingerprint,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  private toDetectionRunContract(doc: IDetectionRun): DetectionRun {
    return {
      id: doc._id,
      organizationId: doc.organizationId,
      ruleVersion: doc.ruleVersion,
      status: doc.status,
      observationScope: doc.observationScope
        ? {
            ...doc.observationScope,
            currencies: doc.observationScope.currencies as SupportedCurrency[] | undefined,
          }
        : undefined,
      startedAt: doc.startedAt.toISOString(),
      completedAt: doc.completedAt ? doc.completedAt.toISOString() : null,
      transactionsEvaluated: doc.transactionsEvaluated,
      findingsCreated: doc.findingsCreated,
      findingsUpdated: doc.findingsUpdated,
      findingsUnchanged: doc.findingsUnchanged,
      errors: doc.errorMessages || [],
      perRuleResults: doc.perRuleResults,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  private toFindingHistoryContract(doc: IFindingHistory): FindingHistory {
    return {
      id: doc._id,
      findingId: doc.findingId,
      organizationId: doc.organizationId,
      action: doc.action,
      actorId: doc.actorId,
      previousStatus: doc.previousStatus,
      newStatus: doc.newStatus,
      reason: doc.reason || null,
      notes: doc.notes || null,
      createdAt: doc.createdAt.toISOString(),
    };
  }
}

export const findingService = new FindingService();
