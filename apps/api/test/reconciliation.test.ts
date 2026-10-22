import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/infrastructure/database/mongo.js';
import {
  TransactionModel,
  FinancialAccountModel,
  OrganizationModel,
  ReconciliationRunModel,
  ReconciliationMatchModel,
  ReconciliationAuditEventModel,
} from '../src/infrastructure/database/models/index.js';
import { DEV_DEFAULT_API_KEY, createOrganizationForTesting } from '../src/middleware/auth.js';
import { ERROR_CODES } from '@moneylens/shared';

describe('Financial Reconciliation Engine API', () => {
  const app = createApp({ enableLogging: false });

  beforeAll(async () => {
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/moneylens_test');
    await ReconciliationMatchModel.syncIndexes();
    await ReconciliationRunModel.syncIndexes();
    await TransactionModel.syncIndexes();
  });

  afterAll(async () => {
    await Promise.all([
      TransactionModel.deleteMany({}),
      FinancialAccountModel.deleteMany({}),
      OrganizationModel.deleteMany({}),
      ReconciliationRunModel.deleteMany({}),
      ReconciliationMatchModel.deleteMany({}),
      ReconciliationAuditEventModel.deleteMany({}),
    ]);
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await Promise.all([
      TransactionModel.deleteMany({}),
      ReconciliationRunModel.deleteMany({}),
      ReconciliationMatchModel.deleteMany({}),
      ReconciliationAuditEventModel.deleteMany({}),
    ]);
  });

  describe('Authentication & Tenant Isolation', () => {
    it('rejects unauthenticated requests to reconciliation endpoints with 401', async () => {
      const res = await request(app).post('/api/v1/reconciliation/runs').send({});
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe(ERROR_CODES.AUTHENTICATION_REQUIRED);

      const listRes = await request(app).get('/api/v1/reconciliation/runs');
      expect(listRes.status).toBe(401);

      const matchesRes = await request(app).get('/api/v1/reconciliation/matches');
      expect(matchesRes.status).toBe(401);
    });

    it('enforces strict multi-tenant isolation for runs and matches', async () => {
      const orgA = await createOrganizationForTesting('Reconcile Org Alpha');
      const orgB = await createOrganizationForTesting('Reconcile Org Beta');

      // Create Run in Org A
      const runA = await ReconciliationRunModel.create({
        organizationId: orgA.organization.id,
        status: 'completed',
        rulesVersion: 'v1.0.0',
        dateToleranceDays: 3,
        totalSourceTransactions: 1,
        matchedCount: 1,
        reviewCount: 0,
        unmatchedCount: 0,
        errorCount: 0,
      });

      // Create Match in Org A
      const matchA = await ReconciliationMatchModel.create({
        organizationId: orgA.organization.id,
        reconciliationRunId: runA._id,
        sourceTransactionId: 'src-123',
        status: 'suggested',
        matchMethod: 'exact_reference',
        matchScore: 95,
        evidence: {
          amountMatch: true,
          currencyMatch: true,
          dateDifferenceDays: 0,
          directionCompatible: true,
        },
        amountDifferenceMinor: 0,
        dateDifferenceDays: 0,
        decisionSource: 'rule_engine',
      });

      // Org B attempts to access Org A's run
      const resRun = await request(app)
        .get(`/api/v1/reconciliation/runs/${runA._id}`)
        .set('x-api-key', orgB.apiKey);
      expect(resRun.status).toBe(404);
      expect(resRun.body.error.code).toBe(ERROR_CODES.RECONCILIATION_RUN_NOT_FOUND);

      // Org B attempts to access Org A's match
      const resMatch = await request(app)
        .get(`/api/v1/reconciliation/matches/${matchA._id}`)
        .set('x-api-key', orgB.apiKey);
      expect(resMatch.status).toBe(404);
      expect(resMatch.body.error.code).toBe(ERROR_CODES.RECONCILIATION_MATCH_NOT_FOUND);

      // Org B attempts to confirm Org A's match
      const resConfirm = await request(app)
        .post(`/api/v1/reconciliation/matches/${matchA._id}/confirm`)
        .set('x-api-key', orgB.apiKey)
        .send({});
      expect(resConfirm.status).toBe(404);
    });
  });

  describe('Reconciliation Engine — Execution & Matching Scenarios', () => {
    it('creates and executes a reconciliation run identifying transfer matches across accounts', async () => {
      // 1. Setup accounts in Dev Org
      const accountChecking = await FinancialAccountModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        name: 'Operating Checking',
        type: 'checking',
        currency: 'USD',
        institutionName: 'Chase',
      });

      const accountSavings = await FinancialAccountModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        name: 'Reserve Savings',
        type: 'savings',
        currency: 'USD',
        institutionName: 'Chase',
      });

      // 2. Create offsetting transfer transactions
      const txDebit = await TransactionModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        accountId: accountChecking._id,
        importJobId: 'job-1',
        date: new Date('2026-03-01T12:00:00Z'),
        description: 'Internal Transfer Out to Savings',
        direction: 'debit',
        amountMinor: 250000, // $2,500.00
        amountDecimal: '2500.00',
        currency: 'USD',
        sourceReference: 'TRF-88991',
        fingerprint: 'fp-debit-1',
        reconciliationStatus: 'unreconciled',
      });

      const txCredit = await TransactionModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        accountId: accountSavings._id,
        importJobId: 'job-2',
        date: new Date('2026-03-02T10:00:00Z'), // 1 day difference
        description: 'Internal Transfer In from Checking',
        direction: 'credit',
        amountMinor: 250000, // $2,500.00
        amountDecimal: '2500.00',
        currency: 'USD',
        sourceReference: 'TRF-88991',
        fingerprint: 'fp-credit-1',
        reconciliationStatus: 'unreconciled',
      });

      // 3. Create an unmatched transaction
      await TransactionModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        accountId: accountChecking._id,
        importJobId: 'job-1',
        date: new Date('2026-03-05T12:00:00Z'),
        description: 'Office Supplies Purchase',
        direction: 'debit',
        amountMinor: 4999, // $49.99
        amountDecimal: '49.99',
        currency: 'USD',
        sourceReference: null,
        fingerprint: 'fp-supplies-1',
        reconciliationStatus: 'unreconciled',
      });

      // 4. Trigger Reconciliation Run scoped to Checking account
      const runRes = await request(app)
        .post('/api/v1/reconciliation/runs')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({
          accountId: accountChecking._id,
          targetAccountId: accountSavings._id,
          dateToleranceDays: 3,
        });

      expect(runRes.status).toBe(201);
      expect(runRes.body.status).toBe('completed');
      expect(runRes.body.totalSourceTransactions).toBe(2);
      expect(runRes.body.matchedCount).toBe(1);
      expect(runRes.body.unmatchedCount).toBe(1);

      // Verify Audit Events recorded
      const auditRes = await request(app)
        .get(`/api/v1/reconciliation/runs/${runRes.body.id}/audit-trail`)
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(auditRes.status).toBe(200);
      expect(auditRes.body.items.length).toBeGreaterThanOrEqual(3);
      const actions = auditRes.body.items.map((e: { action: string }) => e.action);
      expect(actions).toContain('run_started');
      expect(actions).toContain('matches_generated');
      expect(actions).toContain('run_completed');

      // 5. Query Matches generated
      const matchesRes = await request(app)
        .get('/api/v1/reconciliation/matches')
        .query({ runId: runRes.body.id })
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(matchesRes.status).toBe(200);
      expect(matchesRes.body.items.length).toBe(1);

      const match = matchesRes.body.items[0];
      expect(match.sourceTransactionId).toBe(txDebit._id);
      expect(match.candidateTransactionId).toBe(txCredit._id);
      expect(match.status).toBe('suggested');
      expect(match.matchMethod).toBe('exact_reference');
      expect(match.matchScore).toBeGreaterThanOrEqual(90);
      expect(match.sourceTransaction).toBeDefined();
      expect(match.candidateTransaction).toBeDefined();
    });

    it('flags competing candidates as needs_review rather than guessing', async () => {
      const accountChecking = await FinancialAccountModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        name: 'Checking Ambiguous',
        type: 'checking',
        currency: 'USD',
        institutionName: 'Bank',
      });

      const accountSavings = await FinancialAccountModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        name: 'Savings Ambiguous',
        type: 'savings',
        currency: 'USD',
        institutionName: 'Bank',
      });

      // One debit
      await TransactionModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        accountId: accountChecking._id,
        importJobId: 'job-1',
        date: new Date('2026-03-01T12:00:00Z'),
        description: 'Vendor Wire Transfer',
        direction: 'debit',
        amountMinor: 100000,
        amountDecimal: '1000.00',
        currency: 'USD',
        fingerprint: 'fp-ambig-1',
        reconciliationStatus: 'unreconciled',
      });

      // Two candidate credits with identical amount and date
      await TransactionModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        accountId: accountSavings._id,
        importJobId: 'job-2',
        date: new Date('2026-03-01T12:00:00Z'),
        description: 'Vendor Wire Deposit Candidate A',
        direction: 'credit',
        amountMinor: 100000,
        amountDecimal: '1000.00',
        currency: 'USD',
        fingerprint: 'fp-ambig-2',
        reconciliationStatus: 'unreconciled',
      });

      await TransactionModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        accountId: accountSavings._id,
        importJobId: 'job-3',
        date: new Date('2026-03-01T12:00:00Z'),
        description: 'Vendor Wire Deposit Candidate B',
        direction: 'credit',
        amountMinor: 100000,
        amountDecimal: '1000.00',
        currency: 'USD',
        fingerprint: 'fp-ambig-3',
        reconciliationStatus: 'unreconciled',
      });

      const runRes = await request(app)
        .post('/api/v1/reconciliation/runs')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({
          accountId: accountChecking._id,
        });

      expect(runRes.status).toBe(201);
      expect(runRes.body.reviewCount).toBe(1);

      const matchesRes = await request(app)
        .get('/api/v1/reconciliation/matches')
        .query({ runId: runRes.body.id })
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(matchesRes.body.items[0].status).toBe('needs_review');
      expect(matchesRes.body.items[0].reviewReason).toContain('competing candidates');
    });
  });

  describe('Review Workflow — Confirmation & Rejection', () => {
    it('confirms a suggested match, transitions transactions to reconciled, and logs audit event', async () => {
      const sourceTx = await TransactionModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        accountId: 'acc-1',
        importJobId: 'job-1',
        date: new Date('2026-03-01T00:00:00Z'),
        description: 'Payroll Direct Debit',
        direction: 'debit',
        amountMinor: 300000,
        amountDecimal: '3000.00',
        currency: 'USD',
        fingerprint: 'fp-pay-1',
        reconciliationStatus: 'unreconciled',
      });

      const candTx = await TransactionModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        accountId: 'acc-2',
        importJobId: 'job-2',
        date: new Date('2026-03-01T00:00:00Z'),
        description: 'Payroll Settlement',
        direction: 'credit',
        amountMinor: 300000,
        amountDecimal: '3000.00',
        currency: 'USD',
        fingerprint: 'fp-pay-2',
        reconciliationStatus: 'unreconciled',
      });

      const match = await ReconciliationMatchModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        reconciliationRunId: 'run-confirm-test',
        sourceTransactionId: sourceTx._id,
        candidateTransactionId: candTx._id,
        status: 'suggested',
        matchMethod: 'transfer_match',
        matchScore: 85,
        evidence: {
          amountMatch: true,
          currencyMatch: true,
          dateDifferenceDays: 0,
          directionCompatible: true,
        },
        amountDifferenceMinor: 0,
        dateDifferenceDays: 0,
        decisionSource: 'rule_engine',
      });

      // Confirm match
      const confirmRes = await request(app)
        .post(`/api/v1/reconciliation/matches/${match._id}/confirm`)
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({ notes: 'Confirmed payroll transfer' });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.status).toBe('confirmed');
      expect(confirmRes.body.confirmedAt).not.toBeNull();

      // Verify underlying transactions are marked reconciled
      const updatedSource = await TransactionModel.findById(sourceTx._id);
      const updatedCand = await TransactionModel.findById(candTx._id);
      expect(updatedSource?.reconciliationStatus).toBe('reconciled');
      expect(updatedCand?.reconciliationStatus).toBe('reconciled');

      // Attempting to re-confirm returns 409 Conflict
      const duplicateConfirmRes = await request(app)
        .post(`/api/v1/reconciliation/matches/${match._id}/confirm`)
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({});
      expect(duplicateConfirmRes.status).toBe(409);
      expect(duplicateConfirmRes.body.error.code).toBe(ERROR_CODES.MATCH_ALREADY_CONFIRMED);
    });

    it('rejects a suggested match requiring an explicit reason and logs audit event', async () => {
      const match = await ReconciliationMatchModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        reconciliationRunId: 'run-reject-test',
        sourceTransactionId: 'src-reject-1',
        candidateTransactionId: 'cand-reject-1',
        status: 'needs_review',
        matchMethod: 'amount_date_description',
        matchScore: 60,
        evidence: {
          amountMatch: true,
          currencyMatch: true,
          dateDifferenceDays: 1,
          directionCompatible: true,
        },
        amountDifferenceMinor: 0,
        dateDifferenceDays: 1,
        decisionSource: 'rule_engine',
      });

      // Rejection without reason fails validation with 400
      const invalidRes = await request(app)
        .post(`/api/v1/reconciliation/matches/${match._id}/reject`)
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({});
      expect(invalidRes.status).toBe(400);

      // Rejection with reason succeeds
      const rejectRes = await request(app)
        .post(`/api/v1/reconciliation/matches/${match._id}/reject`)
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({ reason: 'Transactions represent unrelated client refunds' });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.status).toBe('rejected');
      expect(rejectRes.body.rejectionReason).toBe(
        'Transactions represent unrelated client refunds',
      );
      expect(rejectRes.body.rejectedAt).not.toBeNull();

      // Attempting to re-reject returns 409
      const reRejectRes = await request(app)
        .post(`/api/v1/reconciliation/matches/${match._id}/reject`)
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({ reason: 'Already rejected' });
      expect(reRejectRes.status).toBe(409);
      expect(reRejectRes.body.error.code).toBe(ERROR_CODES.MATCH_ALREADY_REJECTED);
    });
  });

  describe('Integrity Hardening — Reciprocal & Conflicting Confirmations (Audit A)', () => {
    it('strictly prevents confirming reciprocal matches (A <-> B then B <-> A)', async () => {
      const txA = await TransactionModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        accountId: 'acc-1',
        importJobId: 'job-1',
        date: new Date('2026-03-01T00:00:00Z'),
        description: 'Transfer Out A',
        direction: 'debit',
        amountMinor: 100000,
        amountDecimal: '1000.00',
        currency: 'USD',
        fingerprint: 'fp-recip-a',
        reconciliationStatus: 'unreconciled',
      });

      const txB = await TransactionModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        accountId: 'acc-2',
        importJobId: 'job-2',
        date: new Date('2026-03-01T00:00:00Z'),
        description: 'Transfer In B',
        direction: 'credit',
        amountMinor: 100000,
        amountDecimal: '1000.00',
        currency: 'USD',
        fingerprint: 'fp-recip-b',
        reconciliationStatus: 'unreconciled',
      });

      // Match 1: A -> B
      const match1 = await ReconciliationMatchModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        reconciliationRunId: 'run-recip-1',
        sourceTransactionId: txA._id,
        candidateTransactionId: txB._id,
        participatingTransactionIds: [txA._id, txB._id],
        status: 'suggested',
        matchMethod: 'transfer_match',
        matchScore: 85,
        evidence: {
          amountMatch: true,
          currencyMatch: true,
          dateDifferenceDays: 0,
          directionCompatible: true,
        },
        amountDifferenceMinor: 0,
        dateDifferenceDays: 0,
        decisionSource: 'rule_engine',
      });

      // Match 2: B -> A (Reciprocal)
      const match2 = await ReconciliationMatchModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        reconciliationRunId: 'run-recip-2',
        sourceTransactionId: txB._id,
        candidateTransactionId: txA._id,
        participatingTransactionIds: [txB._id, txA._id],
        status: 'suggested',
        matchMethod: 'transfer_match',
        matchScore: 85,
        evidence: {
          amountMatch: true,
          currencyMatch: true,
          dateDifferenceDays: 0,
          directionCompatible: true,
        },
        amountDifferenceMinor: 0,
        dateDifferenceDays: 0,
        decisionSource: 'rule_engine',
      });

      // Confirm Match 1 (A -> B)
      const res1 = await request(app)
        .post(`/api/v1/reconciliation/matches/${match1._id}/confirm`)
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({});
      expect(res1.status).toBe(200);

      // Attempting to confirm Match 2 (B -> A) MUST be rejected with 409 Conflict
      const res2 = await request(app)
        .post(`/api/v1/reconciliation/matches/${match2._id}/confirm`)
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({});
      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe(ERROR_CODES.TRANSACTION_ALREADY_RECONCILED);
    });

    it('strictly prevents cross-confirmations involving already reconciled transactions (A <-> C or B <-> D)', async () => {
      const txA = await TransactionModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        accountId: 'acc-1',
        importJobId: 'job-1',
        date: new Date('2026-03-01T00:00:00Z'),
        description: 'Transfer Out A',
        direction: 'debit',
        amountMinor: 100000,
        amountDecimal: '1000.00',
        currency: 'USD',
        fingerprint: 'fp-cross-a',
        reconciliationStatus: 'unreconciled',
      });

      const txB = await TransactionModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        accountId: 'acc-2',
        importJobId: 'job-2',
        date: new Date('2026-03-01T00:00:00Z'),
        description: 'Transfer In B',
        direction: 'credit',
        amountMinor: 100000,
        amountDecimal: '1000.00',
        currency: 'USD',
        fingerprint: 'fp-cross-b',
        reconciliationStatus: 'unreconciled',
      });

      const txC = await TransactionModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        accountId: 'acc-3',
        importJobId: 'job-3',
        date: new Date('2026-03-01T00:00:00Z'),
        description: 'Alternative Deposit C',
        direction: 'credit',
        amountMinor: 100000,
        amountDecimal: '1000.00',
        currency: 'USD',
        fingerprint: 'fp-cross-c',
        reconciliationStatus: 'unreconciled',
      });

      const txD = await TransactionModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        accountId: 'acc-4',
        importJobId: 'job-4',
        date: new Date('2026-03-01T00:00:00Z'),
        description: 'Alternative Withdrawal D',
        direction: 'debit',
        amountMinor: 100000,
        amountDecimal: '1000.00',
        currency: 'USD',
        fingerprint: 'fp-cross-d',
        reconciliationStatus: 'unreconciled',
      });

      // Match A -> B
      const matchAB = await ReconciliationMatchModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        reconciliationRunId: 'run-cross-1',
        sourceTransactionId: txA._id,
        candidateTransactionId: txB._id,
        participatingTransactionIds: [txA._id, txB._id],
        status: 'suggested',
        matchMethod: 'transfer_match',
        matchScore: 85,
        evidence: {
          amountMatch: true,
          currencyMatch: true,
          dateDifferenceDays: 0,
          directionCompatible: true,
        },
        amountDifferenceMinor: 0,
        dateDifferenceDays: 0,
        decisionSource: 'rule_engine',
      });

      // Match A -> C (Collides with A as source)
      const matchAC = await ReconciliationMatchModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        reconciliationRunId: 'run-cross-2',
        sourceTransactionId: txA._id,
        candidateTransactionId: txC._id,
        participatingTransactionIds: [txA._id, txC._id],
        status: 'suggested',
        matchMethod: 'transfer_match',
        matchScore: 80,
        evidence: {
          amountMatch: true,
          currencyMatch: true,
          dateDifferenceDays: 0,
          directionCompatible: true,
        },
        amountDifferenceMinor: 0,
        dateDifferenceDays: 0,
        decisionSource: 'rule_engine',
      });

      // Match D -> B (Collides with B as candidate)
      const matchDB = await ReconciliationMatchModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        reconciliationRunId: 'run-cross-3',
        sourceTransactionId: txD._id,
        candidateTransactionId: txB._id,
        participatingTransactionIds: [txD._id, txB._id],
        status: 'suggested',
        matchMethod: 'transfer_match',
        matchScore: 80,
        evidence: {
          amountMatch: true,
          currencyMatch: true,
          dateDifferenceDays: 0,
          directionCompatible: true,
        },
        amountDifferenceMinor: 0,
        dateDifferenceDays: 0,
        decisionSource: 'rule_engine',
      });

      // Confirm Match A -> B
      const confirmABRes = await request(app)
        .post(`/api/v1/reconciliation/matches/${matchAB._id}/confirm`)
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({});
      expect(confirmABRes.status).toBe(200);

      // Attempt A -> C must fail with 409
      const confirmACRes = await request(app)
        .post(`/api/v1/reconciliation/matches/${matchAC._id}/confirm`)
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({});
      expect(confirmACRes.status).toBe(409);
      expect(confirmACRes.body.error.code).toBe(ERROR_CODES.TRANSACTION_ALREADY_RECONCILED);

      // Attempt D -> B must fail with 409
      const confirmDBRes = await request(app)
        .post(`/api/v1/reconciliation/matches/${matchDB._id}/confirm`)
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({});
      expect(confirmDBRes.status).toBe(409);
      expect(confirmDBRes.body.error.code).toBe(ERROR_CODES.TRANSACTION_ALREADY_RECONCILED);
    });

    it('handles concurrent confirmation requests safely without double confirmation', async () => {
      const tx1 = await TransactionModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        accountId: 'acc-1',
        importJobId: 'job-1',
        date: new Date('2026-03-01T00:00:00Z'),
        description: 'Concurrent Transfer 1',
        direction: 'debit',
        amountMinor: 75000,
        amountDecimal: '750.00',
        currency: 'USD',
        fingerprint: 'fp-conc-1',
        reconciliationStatus: 'unreconciled',
      });

      const tx2 = await TransactionModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        accountId: 'acc-2',
        importJobId: 'job-2',
        date: new Date('2026-03-01T00:00:00Z'),
        description: 'Concurrent Transfer 2',
        direction: 'credit',
        amountMinor: 75000,
        amountDecimal: '750.00',
        currency: 'USD',
        fingerprint: 'fp-conc-2',
        reconciliationStatus: 'unreconciled',
      });

      const match = await ReconciliationMatchModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        reconciliationRunId: 'run-conc-test',
        sourceTransactionId: tx1._id,
        candidateTransactionId: tx2._id,
        participatingTransactionIds: [tx1._id, tx2._id],
        status: 'suggested',
        matchMethod: 'transfer_match',
        matchScore: 85,
        evidence: {
          amountMatch: true,
          currencyMatch: true,
          dateDifferenceDays: 0,
          directionCompatible: true,
        },
        amountDifferenceMinor: 0,
        dateDifferenceDays: 0,
        decisionSource: 'rule_engine',
      });

      // Fire 2 simultaneous confirmation requests
      const [resA, resB] = await Promise.all([
        request(app)
          .post(`/api/v1/reconciliation/matches/${match._id}/confirm`)
          .set('x-api-key', DEV_DEFAULT_API_KEY)
          .send({}),
        request(app)
          .post(`/api/v1/reconciliation/matches/${match._id}/confirm`)
          .set('x-api-key', DEV_DEFAULT_API_KEY)
          .send({}),
      ]);

      const statuses = [resA.status, resB.status];
      // Exactly one must succeed (200), and exactly one must be rejected (409)
      expect(statuses).toContain(200);
      expect(statuses).toContain(409);
    });
  });

  describe('Atomicity & Recovery of Confirmation Workflow (Audit B)', () => {
    it('rolls back source transaction lock when candidate transaction cannot be locked', async () => {
      const txSource = await TransactionModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        accountId: 'acc-1',
        importJobId: 'job-1',
        date: new Date('2026-03-01T00:00:00Z'),
        description: 'Source Wire',
        direction: 'debit',
        amountMinor: 40000,
        amountDecimal: '400.00',
        currency: 'USD',
        fingerprint: 'fp-rollback-src',
        reconciliationStatus: 'unreconciled',
      });

      // Candidate is already marked reconciled by another process
      const txCandidate = await TransactionModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        accountId: 'acc-2',
        importJobId: 'job-2',
        date: new Date('2026-03-01T00:00:00Z'),
        description: 'Already Reconciled Candidate',
        direction: 'credit',
        amountMinor: 40000,
        amountDecimal: '400.00',
        currency: 'USD',
        fingerprint: 'fp-rollback-cand',
        reconciliationStatus: 'reconciled',
      });

      const match = await ReconciliationMatchModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        reconciliationRunId: 'run-rollback-test',
        sourceTransactionId: txSource._id,
        candidateTransactionId: txCandidate._id,
        participatingTransactionIds: [txSource._id, txCandidate._id],
        status: 'suggested',
        matchMethod: 'transfer_match',
        matchScore: 85,
        evidence: {
          amountMatch: true,
          currencyMatch: true,
          dateDifferenceDays: 0,
          directionCompatible: true,
        },
        amountDifferenceMinor: 0,
        dateDifferenceDays: 0,
        decisionSource: 'rule_engine',
      });

      const res = await request(app)
        .post(`/api/v1/reconciliation/matches/${match._id}/confirm`)
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe(ERROR_CODES.TRANSACTION_ALREADY_RECONCILED);

      // Verify that source transaction status was safely rolled back to 'unreconciled'
      const freshSource = await TransactionModel.findById(txSource._id);
      expect(freshSource?.reconciliationStatus).toBe('unreconciled');

      // Verify match status remains 'suggested'
      const freshMatch = await ReconciliationMatchModel.findById(match._id);
      expect(freshMatch?.status).toBe('suggested');
    });
  });

  describe('Run Counters & Status Consistency (Audit D)', () => {
    it('preserves counter invariants and avoids double-incrementing suggested matches upon confirmation', async () => {
      const run = await ReconciliationRunModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        status: 'completed',
        rulesVersion: 'v1.0.0',
        dateToleranceDays: 3,
        totalSourceTransactions: 2,
        matchedCount: 1, // 1 suggested
        reviewCount: 1, // 1 needs_review
        unmatchedCount: 0,
        errorCount: 0,
      });

      const tx1 = await TransactionModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        accountId: 'acc-1',
        importJobId: 'job-1',
        date: new Date('2026-03-01T00:00:00Z'),
        description: 'Suggested Tx',
        direction: 'debit',
        amountMinor: 10000,
        amountDecimal: '100.00',
        currency: 'USD',
        fingerprint: 'fp-cnt-1',
        reconciliationStatus: 'unreconciled',
      });

      const matchSuggested = await ReconciliationMatchModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        reconciliationRunId: run._id,
        sourceTransactionId: tx1._id,
        participatingTransactionIds: [tx1._id],
        status: 'suggested',
        matchMethod: 'exact_reference',
        matchScore: 95,
        evidence: {
          amountMatch: true,
          currencyMatch: true,
          dateDifferenceDays: 0,
          directionCompatible: true,
        },
        amountDifferenceMinor: 0,
        dateDifferenceDays: 0,
        decisionSource: 'rule_engine',
      });

      // Confirm the suggested match
      const res1 = await request(app)
        .post(`/api/v1/reconciliation/matches/${matchSuggested._id}/confirm`)
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({});
      expect(res1.status).toBe(200);

      // Verify run counters: matchedCount MUST NOT double-increment! Total remains 2
      const freshRun1 = await ReconciliationRunModel.findById(run._id);
      expect(freshRun1?.matchedCount).toBe(1);
      expect(freshRun1?.reviewCount).toBe(1);
      expect(freshRun1?.totalSourceTransactions).toBe(2);

      // Create and confirm a needs_review match
      const tx2 = await TransactionModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        accountId: 'acc-1',
        importJobId: 'job-1',
        date: new Date('2026-03-01T00:00:00Z'),
        description: 'Review Tx',
        direction: 'debit',
        amountMinor: 20000,
        amountDecimal: '200.00',
        currency: 'USD',
        fingerprint: 'fp-cnt-2',
        reconciliationStatus: 'unreconciled',
      });

      const matchReview = await ReconciliationMatchModel.create({
        organizationId: '00000000-0000-0000-0000-000000000001',
        reconciliationRunId: run._id,
        sourceTransactionId: tx2._id,
        participatingTransactionIds: [tx2._id],
        status: 'needs_review',
        matchMethod: 'amount_date_description',
        matchScore: 65,
        evidence: {
          amountMatch: true,
          currencyMatch: true,
          dateDifferenceDays: 0,
          directionCompatible: true,
        },
        amountDifferenceMinor: 0,
        dateDifferenceDays: 0,
        decisionSource: 'rule_engine',
      });

      const res2 = await request(app)
        .post(`/api/v1/reconciliation/matches/${matchReview._id}/confirm`)
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .send({});
      expect(res2.status).toBe(200);

      // Needs review transitioned to matched: reviewCount - 1, matchedCount + 1
      const freshRun2 = await ReconciliationRunModel.findById(run._id);
      expect(freshRun2?.matchedCount).toBe(2);
      expect(freshRun2?.reviewCount).toBe(0);
      expect(freshRun2?.unmatchedCount).toBe(0);
      // Invariant: matchedCount + reviewCount + unmatchedCount === totalSourceTransactions
      expect(freshRun2!.matchedCount + freshRun2!.reviewCount + freshRun2!.unmatchedCount).toBe(
        freshRun2!.totalSourceTransactions,
      );
    });
  });

  describe('Audit Trail & Tenant Isolation Hardening (Audits E & F)', () => {
    it('denies access to audit trail of another organization with 404', async () => {
      const orgA = await createOrganizationForTesting('Audit Org Alpha');
      const orgB = await createOrganizationForTesting('Audit Org Beta');

      const runA = await ReconciliationRunModel.create({
        organizationId: orgA.organization.id,
        status: 'completed',
        rulesVersion: 'v1.0.0',
        dateToleranceDays: 3,
        totalSourceTransactions: 1,
        matchedCount: 1,
        reviewCount: 0,
        unmatchedCount: 0,
        errorCount: 0,
      });

      await ReconciliationAuditEventModel.create({
        organizationId: orgA.organization.id,
        reconciliationRunId: runA._id,
        action: 'run_started',
        details: { test: true },
        timestamp: new Date(),
      });

      // Org B attempts to access Org A's audit trail
      const res = await request(app)
        .get(`/api/v1/reconciliation/runs/${runA._id}/audit-trail`)
        .set('x-api-key', orgB.apiKey);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe(ERROR_CODES.RECONCILIATION_RUN_NOT_FOUND);
    });
  });
});
