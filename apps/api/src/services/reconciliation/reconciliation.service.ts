import {
  ReconciliationRunModel,
  ReconciliationMatchModel,
  ReconciliationAuditEventModel,
  TransactionModel,
  FinancialAccountModel,
  IReconciliationRun,
  IReconciliationMatch,
  ITransaction,
} from '../../infrastructure/database/models/index.js';
import {
  ERROR_CODES,
  type CreateReconciliationRunRequest,
  type QueryMatchesRequest,
  type QueryRunsRequest,
  type ConfirmMatchRequest,
  type RejectMatchRequest,
  type ReconciliationRun,
  type ReconciliationMatch,
} from '@moneylens/shared';
import { AppError } from '../../middleware/error-handler.js';
import { logger } from '../../infrastructure/observability/logger.js';
import { evaluateCandidate, RULES_VERSION } from './scoring.js';

export class ReconciliationService {
  /**
   * Creates and executes a deterministic reconciliation run.
   */
  async createAndExecuteRun(
    organizationId: string,
    params: CreateReconciliationRunRequest,
  ): Promise<ReconciliationRun> {
    // 1. Validate accounts if provided
    if (params.accountId) {
      const account = await FinancialAccountModel.findOne({
        _id: params.accountId,
        organizationId,
      });
      if (!account) {
        throw new AppError(404, ERROR_CODES.ACCOUNT_NOT_FOUND, 'Account not found');
      }
    }

    if (params.targetAccountId) {
      const targetAccount = await FinancialAccountModel.findOne({
        _id: params.targetAccountId,
        organizationId,
      });
      if (!targetAccount) {
        throw new AppError(404, ERROR_CODES.ACCOUNT_NOT_FOUND, 'Target account not found');
      }
    }

    const dateToleranceDays = params.dateToleranceDays ?? 3;
    const rulesVersion = params.rulesVersion ?? RULES_VERSION;

    // 2. Initialize ReconciliationRun in 'processing' status
    const run = await ReconciliationRunModel.create({
      organizationId,
      accountId: params.accountId || null,
      targetAccountId: params.targetAccountId || null,
      status: 'processing',
      rulesVersion,
      startDate: params.startDate ? new Date(params.startDate) : null,
      endDate: params.endDate ? new Date(params.endDate) : null,
      dateToleranceDays,
      totalSourceTransactions: 0,
      matchedCount: 0,
      reviewCount: 0,
      unmatchedCount: 0,
      errorCount: 0,
      startedAt: new Date(),
    });

    // 3. Record Audit Event: run_started
    await ReconciliationAuditEventModel.create({
      organizationId,
      reconciliationRunId: run._id,
      action: 'run_started',
      details: {
        accountId: params.accountId,
        targetAccountId: params.targetAccountId,
        dateToleranceDays,
        rulesVersion,
      },
      timestamp: new Date(),
    });

    try {
      // 4. Query eligible source transactions
      const sourceQuery: Record<string, unknown> = {
        organizationId,
        reconciliationStatus: { $ne: 'reconciled' },
      };

      if (params.accountId) {
        sourceQuery.accountId = params.accountId;
      }

      if (params.startDate || params.endDate) {
        const dateFilter: Record<string, Date> = {};
        if (params.startDate) dateFilter.$gte = new Date(params.startDate);
        if (params.endDate) dateFilter.$lte = new Date(params.endDate);
        sourceQuery.date = dateFilter;
      }

      // Bound source transactions to protect memory
      const sourceTransactions: ITransaction[] = await TransactionModel.find(sourceQuery)
        .sort({ date: -1, _id: 1 })
        .limit(1000)
        .exec();

      let matchedCount = 0;
      let reviewCount = 0;
      let unmatchedCount = 0;
      const matchesToInsert: Array<Partial<IReconciliationMatch>> = [];
      const pairedCandidateIds = new Set<string>();

      // 5. Evaluate matching rules for each source transaction
      for (const source of sourceTransactions) {
        // Query candidate transactions with same currency and amount in the same org
        const candidateQuery: Record<string, unknown> = {
          organizationId,
          currency: source.currency,
          amountMinor: source.amountMinor,
          _id: { $ne: source._id },
          reconciliationStatus: { $ne: 'reconciled' },
        };

        if (params.targetAccountId) {
          candidateQuery.accountId = params.targetAccountId;
        }

        // Search within date tolerance window
        const msPerDay = 24 * 60 * 60 * 1000;
        const minDate = new Date(source.date.getTime() - dateToleranceDays * msPerDay);
        const maxDate = new Date(source.date.getTime() + dateToleranceDays * msPerDay);
        candidateQuery.date = { $gte: minDate, $lte: maxDate };

        const candidates: ITransaction[] = await TransactionModel.find(candidateQuery)
          .sort({ date: -1 })
          .limit(20)
          .exec();

        // Filter out candidates already paired in this run
        const eligibleCandidates = candidates.filter((c) => !pairedCandidateIds.has(c._id));

        if (eligibleCandidates.length === 0) {
          unmatchedCount++;
          continue;
        }

        // Evaluate all candidates
        const competingCandidateIds = eligibleCandidates.map((c) => c._id);
        const evaluations = eligibleCandidates
          .map((c) =>
            evaluateCandidate(
              source,
              c,
              dateToleranceDays,
              eligibleCandidates.length,
              competingCandidateIds,
            ),
          )
          .filter((e): e is NonNullable<typeof e> => e !== null);

        if (evaluations.length === 0) {
          unmatchedCount++;
          continue;
        }

        // Sort evaluations by matchScore descending, then dateDifference ascending, with deterministic candidate._id tie-breaker
        evaluations.sort((a, b) => {
          if (b.matchScore !== a.matchScore) {
            return b.matchScore - a.matchScore;
          }
          if (a.dateDifferenceDays !== b.dateDifferenceDays) {
            return a.dateDifferenceDays - b.dateDifferenceDays;
          }
          return a.candidate._id.localeCompare(b.candidate._id);
        });

        const best = evaluations[0];
        if (!best) {
          unmatchedCount++;
          continue;
        }
        pairedCandidateIds.add(best.candidate._id);

        if (best.status === 'suggested') {
          matchedCount++;
        } else {
          reviewCount++;
        }

        matchesToInsert.push({
          organizationId,
          reconciliationRunId: run._id,
          sourceTransactionId: source._id,
          candidateTransactionId: best.candidate._id,
          participatingTransactionIds: [source._id, best.candidate._id],
          status: best.status,
          matchMethod: best.matchMethod,
          matchScore: best.matchScore,
          evidence: best.evidence,
          amountDifferenceMinor: best.amountDifferenceMinor,
          dateDifferenceDays: best.dateDifferenceDays,
          reviewReason: best.reviewReason || null,
          decisionSource: 'rule_engine',
        });
      }

      // 6. Bulk insert generated matches
      if (matchesToInsert.length > 0) {
        await ReconciliationMatchModel.insertMany(matchesToInsert, { ordered: false });
      }

      // 7. Update run status and counters
      run.status = 'completed';
      run.completedAt = new Date();
      run.totalSourceTransactions = sourceTransactions.length;
      run.matchedCount = matchedCount;
      run.reviewCount = reviewCount;
      run.unmatchedCount = unmatchedCount;
      run.errorCount = 0;
      await run.save();

      // 8. Record completion audit events
      await ReconciliationAuditEventModel.create({
        organizationId,
        reconciliationRunId: run._id,
        action: 'matches_generated',
        details: {
          generatedCount: matchesToInsert.length,
          matchedCount,
          reviewCount,
          unmatchedCount,
        },
        timestamp: new Date(),
      });

      await ReconciliationAuditEventModel.create({
        organizationId,
        reconciliationRunId: run._id,
        action: 'run_completed',
        details: {
          totalSourceTransactions: sourceTransactions.length,
          matchedCount,
          reviewCount,
          unmatchedCount,
        },
        timestamp: new Date(),
      });

      return this.formatRun(run);
    } catch (err: unknown) {
      logger.error(
        { err, runId: run._id, organizationId },
        'Reconciliation run failed unexpectedly',
      );
      run.status = 'failed';
      run.completedAt = new Date();
      run.errorMessage = err instanceof Error ? err.message : 'Unknown reconciliation error';
      await run.save();

      await ReconciliationAuditEventModel.create({
        organizationId,
        reconciliationRunId: run._id,
        action: 'run_failed',
        details: {
          error: run.errorMessage,
        },
        timestamp: new Date(),
      });

      throw err;
    }
  }

  /**
   * Lists reconciliation runs for the organization with pagination.
   */
  async listRuns(organizationId: string, query: QueryRunsRequest) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.pageSize || 25));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { organizationId };
    if (query.accountId) filter.accountId = query.accountId;
    if (query.status) filter.status = query.status;

    const [items, totalItems] = await Promise.all([
      ReconciliationRunModel.find(filter).sort({ createdAt: -1, _id: 1 }).skip(skip).limit(limit),
      ReconciliationRunModel.countDocuments(filter),
    ]);

    return {
      items: items.map((r) => this.formatRun(r)),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  /**
   * Retrieves a single reconciliation run by ID.
   */
  async getRunById(organizationId: string, runId: string): Promise<ReconciliationRun> {
    const run = await ReconciliationRunModel.findOne({ _id: runId, organizationId });
    if (!run) {
      throw new AppError(
        404,
        ERROR_CODES.RECONCILIATION_RUN_NOT_FOUND,
        'Reconciliation run not found',
      );
    }
    return this.formatRun(run);
  }

  /**
   * Lists matches with pagination and filters, populating source and candidate transactions.
   */
  async listMatches(organizationId: string, query: QueryMatchesRequest) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.pageSize || 25));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { organizationId };
    if (query.runId) filter.reconciliationRunId = query.runId;
    if (query.status) filter.status = query.status;

    const [matches, totalItems] = await Promise.all([
      ReconciliationMatchModel.find(filter)
        .sort({ createdAt: -1, _id: 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      ReconciliationMatchModel.countDocuments(filter),
    ]);

    // Populate transaction records
    const transactionIds = new Set<string>();
    for (const m of matches) {
      transactionIds.add(m.sourceTransactionId);
      if (m.candidateTransactionId) {
        transactionIds.add(m.candidateTransactionId);
      }
    }

    const transactions = await TransactionModel.find({
      _id: { $in: Array.from(transactionIds) },
      organizationId,
    }).exec();

    const txMap = new Map<string, ITransaction>();
    for (const tx of transactions) {
      txMap.set(tx._id, tx);
    }

    return {
      items: matches.map((m) =>
        this.formatMatch(
          m,
          txMap.get(m.sourceTransactionId),
          m.candidateTransactionId ? txMap.get(m.candidateTransactionId) : undefined,
        ),
      ),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  /**
   * Retrieves a single match by ID with populated transaction details.
   */
  async getMatchById(organizationId: string, matchId: string): Promise<ReconciliationMatch> {
    const match = await ReconciliationMatchModel.findOne({ _id: matchId, organizationId });
    if (!match) {
      throw new AppError(
        404,
        ERROR_CODES.RECONCILIATION_MATCH_NOT_FOUND,
        'Reconciliation match not found',
      );
    }

    const txIds = [match.sourceTransactionId];
    if (match.candidateTransactionId) txIds.push(match.candidateTransactionId);

    const txs = await TransactionModel.find({ _id: { $in: txIds }, organizationId }).exec();
    const sourceTx = txs.find((t) => t._id === match.sourceTransactionId);
    const candidateTx = match.candidateTransactionId
      ? txs.find((t) => t._id === match.candidateTransactionId)
      : undefined;

    return this.formatMatch(match, sourceTx, candidateTx);
  }

  /**
   * Confirms a suggested or needs_review match.
   * Enforces that neither source nor candidate is already confirmed in an incompatible relationship (reciprocal or cross-match).
   * Employs atomic conditional locks and compensation rollback to guarantee consistency even on standalone MongoDB.
   */
  async confirmMatch(
    organizationId: string,
    matchId: string,
    params?: ConfirmMatchRequest,
  ): Promise<ReconciliationMatch> {
    const match = await ReconciliationMatchModel.findOne({ _id: matchId, organizationId });
    if (!match) {
      throw new AppError(
        404,
        ERROR_CODES.RECONCILIATION_MATCH_NOT_FOUND,
        'Reconciliation match not found',
      );
    }

    if (match.status === 'confirmed') {
      throw new AppError(409, ERROR_CODES.MATCH_ALREADY_CONFIRMED, 'Match is already confirmed');
    }

    if (match.status === 'rejected') {
      throw new AppError(
        400,
        ERROR_CODES.INVALID_RECONCILIATION_STATUS,
        'Cannot confirm a previously rejected match without re-evaluation',
      );
    }

    const participatingIds = [match.sourceTransactionId, match.candidateTransactionId].filter(
      (id): id is string => Boolean(id),
    );

    // 1. Atomic conditional lock on source transaction
    const sourceLockRes = await TransactionModel.updateOne(
      {
        _id: match.sourceTransactionId,
        organizationId,
        reconciliationStatus: { $ne: 'reconciled' },
      },
      { $set: { reconciliationStatus: 'reconciled' } },
    );

    if (sourceLockRes.matchedCount === 0) {
      const sourceExists = await TransactionModel.exists({
        _id: match.sourceTransactionId,
        organizationId,
      });
      if (!sourceExists) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Source transaction not found');
      }
      throw new AppError(
        409,
        ERROR_CODES.TRANSACTION_ALREADY_RECONCILED,
        'Source transaction is already reconciled in another confirmed match',
      );
    }

    // 2. Atomic conditional lock on candidate transaction (if present)
    if (match.candidateTransactionId) {
      const candLockRes = await TransactionModel.updateOne(
        {
          _id: match.candidateTransactionId,
          organizationId,
          reconciliationStatus: { $ne: 'reconciled' },
        },
        { $set: { reconciliationStatus: 'reconciled' } },
      );

      if (candLockRes.matchedCount === 0) {
        // Roll back source transaction lock
        await TransactionModel.updateOne(
          { _id: match.sourceTransactionId, organizationId },
          { $set: { reconciliationStatus: 'unreconciled' } },
        );

        const candExists = await TransactionModel.exists({
          _id: match.candidateTransactionId,
          organizationId,
        });
        if (!candExists) {
          throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Candidate transaction not found');
        }
        throw new AppError(
          409,
          ERROR_CODES.TRANSACTION_ALREADY_RECONCILED,
          'Candidate transaction is already reconciled in another confirmed match',
        );
      }
    }

    const previousStatus = match.status;
    let updatedMatch: IReconciliationMatch | null = null;

    // 3. Atomically update match to confirmed
    try {
      updatedMatch = await ReconciliationMatchModel.findOneAndUpdate(
        {
          _id: matchId,
          organizationId,
          status: { $in: ['suggested', 'needs_review'] },
        },
        {
          $set: {
            status: 'confirmed',
            confirmedAt: new Date(),
            decisionSource: 'manual_review',
            participatingTransactionIds: participatingIds,
          },
        },
        { new: true },
      );

      if (!updatedMatch) {
        throw new AppError(409, ERROR_CODES.MATCH_ALREADY_CONFIRMED, 'Match is already confirmed');
      }
    } catch (err: unknown) {
      // Roll back transaction locks on failure
      await TransactionModel.updateOne(
        { _id: match.sourceTransactionId, organizationId },
        { $set: { reconciliationStatus: 'unreconciled' } },
      );
      if (match.candidateTransactionId) {
        await TransactionModel.updateOne(
          { _id: match.candidateTransactionId, organizationId },
          { $set: { reconciliationStatus: 'unreconciled' } },
        );
      }

      const isDuplicate =
        err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000;
      if (isDuplicate) {
        throw new AppError(
          409,
          ERROR_CODES.TRANSACTION_ALREADY_RECONCILED,
          'A conflicting confirmed match already exists for this transaction (reciprocal or cross-match)',
        );
      }
      throw err;
    }

    // 4. Update run counters atomically without double-counting suggested matches
    if (match.reconciliationRunId && previousStatus === 'needs_review') {
      await ReconciliationRunModel.updateOne(
        { _id: match.reconciliationRunId, organizationId },
        { $inc: { matchedCount: 1, reviewCount: -1 } },
      );
    }

    // 5. Record Audit Event: match_confirmed
    await ReconciliationAuditEventModel.create({
      organizationId,
      reconciliationRunId: match.reconciliationRunId,
      matchId: match._id,
      action: 'match_confirmed',
      details: {
        sourceTransactionId: match.sourceTransactionId,
        candidateTransactionId: match.candidateTransactionId,
        notes: params?.notes,
      },
      timestamp: new Date(),
    });

    const txs = await TransactionModel.find({
      _id: { $in: participatingIds },
      organizationId,
    }).exec();

    const sourceTx = txs.find((t) => t._id === match.sourceTransactionId);
    const candidateTx = match.candidateTransactionId
      ? txs.find((t) => t._id === match.candidateTransactionId)
      : undefined;

    return this.formatMatch(updatedMatch, sourceTx, candidateTx);
  }

  /**
   * Rejects a suggested or needs_review match with a documented reason.
   */
  async rejectMatch(
    organizationId: string,
    matchId: string,
    params: RejectMatchRequest,
  ): Promise<ReconciliationMatch> {
    const match = await ReconciliationMatchModel.findOne({ _id: matchId, organizationId });
    if (!match) {
      throw new AppError(
        404,
        ERROR_CODES.RECONCILIATION_MATCH_NOT_FOUND,
        'Reconciliation match not found',
      );
    }

    if (match.status === 'confirmed') {
      throw new AppError(
        400,
        ERROR_CODES.INVALID_RECONCILIATION_STATUS,
        'Cannot reject an already confirmed match',
      );
    }

    if (match.status === 'rejected') {
      throw new AppError(409, ERROR_CODES.MATCH_ALREADY_REJECTED, 'Match is already rejected');
    }

    const previousStatus = match.status;

    const updatedMatch = await ReconciliationMatchModel.findOneAndUpdate(
      {
        _id: matchId,
        organizationId,
        status: { $in: ['suggested', 'needs_review'] },
      },
      {
        $set: {
          status: 'rejected',
          rejectedAt: new Date(),
          rejectionReason: params.reason,
          decisionSource: 'manual_review',
        },
      },
      { new: true },
    );

    if (!updatedMatch) {
      throw new AppError(409, ERROR_CODES.MATCH_ALREADY_REJECTED, 'Match is already rejected');
    }

    // Update run counters atomically preserving sum invariant
    if (match.reconciliationRunId) {
      if (previousStatus === 'suggested') {
        await ReconciliationRunModel.updateOne(
          { _id: match.reconciliationRunId, organizationId },
          { $inc: { matchedCount: -1, unmatchedCount: 1 } },
        );
      } else if (previousStatus === 'needs_review') {
        await ReconciliationRunModel.updateOne(
          { _id: match.reconciliationRunId, organizationId },
          { $inc: { reviewCount: -1, unmatchedCount: 1 } },
        );
      }
    }

    // Record Audit Event: match_rejected
    await ReconciliationAuditEventModel.create({
      organizationId,
      reconciliationRunId: match.reconciliationRunId,
      matchId: match._id,
      action: 'match_rejected',
      details: {
        reason: params.reason,
        sourceTransactionId: match.sourceTransactionId,
        candidateTransactionId: match.candidateTransactionId,
      },
      timestamp: new Date(),
    });

    const txs = await TransactionModel.find({
      _id: { $in: [match.sourceTransactionId, match.candidateTransactionId].filter(Boolean) },
      organizationId,
    });

    return this.formatMatch(
      updatedMatch,
      txs.find((t) => t._id === match.sourceTransactionId),
      txs.find((t) => t._id === match.candidateTransactionId),
    );
  }

  /**
   * Retrieves audit trail events for a reconciliation run.
   * Validates organization ownership of the run.
   */
  async listAuditEvents(organizationId: string, runId: string) {
    const run = await ReconciliationRunModel.findOne({ _id: runId, organizationId });
    if (!run) {
      throw new AppError(
        404,
        ERROR_CODES.RECONCILIATION_RUN_NOT_FOUND,
        'Reconciliation run not found',
      );
    }

    const events = await ReconciliationAuditEventModel.find({
      organizationId,
      reconciliationRunId: runId,
    })
      .sort({ timestamp: 1, _id: 1 })
      .exec();

    return {
      items: events.map((e) => ({
        id: e._id,
        organizationId: e.organizationId,
        reconciliationRunId: e.reconciliationRunId,
        matchId: e.matchId,
        action: e.action,
        details: e.details,
        timestamp: e.timestamp.toISOString(),
      })),
      pagination: {
        page: 1,
        limit: events.length,
        totalItems: events.length,
        totalPages: 1,
      },
    };
  }

  private formatRun(run: IReconciliationRun): ReconciliationRun {
    return {
      id: run._id,
      organizationId: run.organizationId,
      accountId: run.accountId || null,
      targetAccountId: run.targetAccountId || null,
      status: run.status,
      rulesVersion: run.rulesVersion,
      startDate: run.startDate ? run.startDate.toISOString() : null,
      endDate: run.endDate ? run.endDate.toISOString() : null,
      dateToleranceDays: run.dateToleranceDays,
      totalSourceTransactions: run.totalSourceTransactions,
      matchedCount: run.matchedCount,
      reviewCount: run.reviewCount,
      unmatchedCount: run.unmatchedCount,
      errorCount: run.errorCount,
      summary: run.summary || null,
      startedAt: run.startedAt ? run.startedAt.toISOString() : null,
      completedAt: run.completedAt ? run.completedAt.toISOString() : null,
      errorMessage: run.errorMessage || null,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    };
  }

  private formatMatch(
    match: IReconciliationMatch,
    sourceTx?: ITransaction,
    candidateTx?: ITransaction,
  ): ReconciliationMatch {
    return {
      id: match._id,
      organizationId: match.organizationId,
      reconciliationRunId: match.reconciliationRunId,
      sourceTransactionId: match.sourceTransactionId,
      candidateTransactionId: match.candidateTransactionId || null,
      participatingTransactionIds: match.participatingTransactionIds || [],
      status: match.status,
      matchMethod: match.matchMethod,
      matchScore: match.matchScore,
      evidence: match.evidence as ReconciliationMatch['evidence'],
      amountDifferenceMinor: match.amountDifferenceMinor,
      dateDifferenceDays: match.dateDifferenceDays,
      reviewReason: match.reviewReason || null,
      rejectionReason: match.rejectionReason || null,
      decisionSource: match.decisionSource,
      confirmedAt: match.confirmedAt ? match.confirmedAt.toISOString() : null,
      rejectedAt: match.rejectedAt ? match.rejectedAt.toISOString() : null,
      createdAt: match.createdAt.toISOString(),
      updatedAt: match.updatedAt.toISOString(),
      sourceTransaction: sourceTx
        ? {
            id: sourceTx._id,
            organizationId: sourceTx.organizationId,
            accountId: sourceTx.accountId,
            importJobId: sourceTx.importJobId,
            date: sourceTx.date.toISOString(),
            description: sourceTx.description,
            direction: sourceTx.direction,
            amountMinor: sourceTx.amountMinor,
            amountDecimal: sourceTx.amountDecimal,
            currency: sourceTx.currency,
            sourceReference: sourceTx.sourceReference || null,
            fingerprint: sourceTx.fingerprint,
            rawSourceData: sourceTx.rawSourceData || null,
            createdAt: sourceTx.createdAt.toISOString(),
            updatedAt: sourceTx.updatedAt.toISOString(),
          }
        : undefined,
      candidateTransaction: candidateTx
        ? {
            id: candidateTx._id,
            organizationId: candidateTx.organizationId,
            accountId: candidateTx.accountId,
            importJobId: candidateTx.importJobId,
            date: candidateTx.date.toISOString(),
            description: candidateTx.description,
            direction: candidateTx.direction,
            amountMinor: candidateTx.amountMinor,
            amountDecimal: candidateTx.amountDecimal,
            currency: candidateTx.currency,
            sourceReference: candidateTx.sourceReference || null,
            fingerprint: candidateTx.fingerprint,
            rawSourceData: candidateTx.rawSourceData || null,
            createdAt: candidateTx.createdAt.toISOString(),
            updatedAt: candidateTx.updatedAt.toISOString(),
          }
        : null,
    };
  }
}

export const reconciliationService = new ReconciliationService();
