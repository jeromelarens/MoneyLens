import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/infrastructure/database/mongo.js';
import {
  ImportJobModel,
  ImportRowErrorModel,
  TransactionModel,
  FinancialAccountModel,
  OrganizationModel,
} from '../src/infrastructure/database/models/index.js';
import { DEV_DEFAULT_API_KEY, createOrganizationForTesting } from '../src/middleware/auth.js';
import { ERROR_CODES } from '@moneylens/shared';

describe('Financial Ingestion & Domain Pipeline API', () => {
  const app = createApp({ enableLogging: false });

  beforeAll(async () => {
    await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/moneylens_test');
    await ImportJobModel.syncIndexes();
    await TransactionModel.syncIndexes();
  });

  afterAll(async () => {
    // Clean up test collections
    await Promise.all([
      TransactionModel.deleteMany({}),
      ImportJobModel.deleteMany({}),
      ImportRowErrorModel.deleteMany({}),
      FinancialAccountModel.deleteMany({}),
      OrganizationModel.deleteMany({}),
    ]);
    await disconnectDatabase();
  });

  beforeEach(async () => {
    // Clear transactions and jobs between tests
    await Promise.all([
      TransactionModel.deleteMany({}),
      ImportJobModel.deleteMany({}),
      ImportRowErrorModel.deleteMany({}),
    ]);
  });

  describe('Authentication & Organization Isolation', () => {
    it('rejects unauthenticated requests to financial endpoints with 401', async () => {
      const res = await request(app).get('/api/v1/transactions');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe(ERROR_CODES.AUTHENTICATION_REQUIRED);
    });

    it('rejects requests with an invalid API key with 401', async () => {
      const res = await request(app)
        .get('/api/v1/transactions')
        .set('x-api-key', 'invalid-token-1234');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe(ERROR_CODES.AUTHENTICATION_REQUIRED);
    });

    it('enforces strict organization isolation between multiple tenants', async () => {
      // 1. Setup Org A and Org B
      const orgA = await createOrganizationForTesting('Organization Alpha');
      const orgB = await createOrganizationForTesting('Organization Beta');

      // 2. Org A uploads a CSV file
      const csvA = 'Date,Description,Amount\n2026-03-01,Alpha Revenue,500.00\n';
      const uploadResA = await request(app)
        .post('/api/v1/imports')
        .set('x-api-key', orgA.apiKey)
        .attach('file', Buffer.from(csvA), 'alpha.csv');

      expect(uploadResA.status).toBe(201);
      const jobAId = uploadResA.body.id;

      // 3. Org B attempts to access Org A's import job
      const getJobByB = await request(app)
        .get(`/api/v1/imports/${jobAId}`)
        .set('x-api-key', orgB.apiKey);

      expect(getJobByB.status).toBe(404);

      // 4. Org B queries transactions -> should NOT see Org A's transactions
      const txsByB = await request(app).get('/api/v1/transactions').set('x-api-key', orgB.apiKey);

      expect(txsByB.status).toBe(200);
      expect(txsByB.body.items).toHaveLength(0);

      // 5. Org A queries transactions -> sees own transaction
      const txsByA = await request(app).get('/api/v1/transactions').set('x-api-key', orgA.apiKey);

      expect(txsByA.status).toBe(200);
      expect(txsByA.body.items).toHaveLength(1);
      expect(txsByA.body.items[0].description).toBe('Alpha Revenue');
    });
  });

  describe('CSV Statement Ingestion', () => {
    it('successfully ingests a valid CSV statement with signed amounts', async () => {
      const csvContent = [
        'Date,Description,Amount,Reference',
        '2026-03-10,Client Retainer Fee,2500.00,INV-1001',
        '2026-03-11,Cloud Hosting AWS,-145.50,TXN-9021',
        '2026-03-12,Office Cleaning Supplies,-50.25,CHQ-402',
      ].join('\n');

      const res = await request(app)
        .post('/api/v1/imports')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .attach('file', Buffer.from(csvContent), 'statement_march.csv');

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('completed');
      expect(res.body.totalRows).toBe(3);
      expect(res.body.acceptedRows).toBe(3);
      expect(res.body.rejectedRows).toBe(0);
      expect(res.body.duplicateRows).toBe(0);

      // Verify persisted transactions in ledger
      const txRes = await request(app)
        .get('/api/v1/transactions')
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(txRes.status).toBe(200);
      expect(txRes.body.items).toHaveLength(3);

      // Check minor units representation (integer cents)
      const retainer = txRes.body.items.find(
        (t: { description: string }) => t.description === 'Client Retainer Fee',
      );
      expect(retainer).toBeDefined();
      expect(retainer.amountMinor).toBe(250000); // $2,500.00 -> 250000
      expect(retainer.direction).toBe('credit');
      expect(retainer.amountDecimal).toBe('2500.00');

      const aws = txRes.body.items.find(
        (t: { description: string }) => t.description === 'Cloud Hosting AWS',
      );
      expect(aws).toBeDefined();
      expect(aws.amountMinor).toBe(14550); // $145.50 -> 14550
      expect(aws.direction).toBe('debit');
      expect(aws.amountDecimal).toBe('145.50');
    });

    it('handles separate debit and credit columns correctly', async () => {
      const csvContent = [
        'Date,Memo,Debit,Credit',
        '2026-03-01,Consulting Services,,3500.00',
        '2026-03-02,Software Subscription,79.00,',
      ].join('\n');

      const res = await request(app)
        .post('/api/v1/imports')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .attach('file', Buffer.from(csvContent), 'debit_credit.csv');

      expect(res.status).toBe(201);
      expect(res.body.acceptedRows).toBe(2);

      const txRes = await request(app)
        .get('/api/v1/transactions')
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(txRes.body.items).toHaveLength(2);
      const sub = txRes.body.items.find(
        (t: { description: string }) => t.description === 'Software Subscription',
      );
      expect(sub.direction).toBe('debit');
      expect(sub.amountMinor).toBe(7900);
    });

    it('rejects uploads missing required columns with 400', async () => {
      const badCsv = 'FirstColumn,SecondColumn\nHello,World\n';

      const res = await request(app)
        .post('/api/v1/imports')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .attach('file', Buffer.from(badCsv), 'invalid_headers.csv');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ERROR_CODES.MISSING_REQUIRED_COLUMNS);
    });

    it('handles partial failures by accepting valid rows and recording row errors', async () => {
      const mixedCsv = [
        'Date,Description,Amount',
        '2026-03-01,Valid First Transaction,100.00',
        'not-a-date,Malformed Date Row,200.00', // Invalid Date
        '2026-03-03,Malformed Amount Row,not-an-amount', // Invalid Amount
        '2026-03-04,Valid Fourth Transaction,400.00',
      ].join('\n');

      const res = await request(app)
        .post('/api/v1/imports')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .attach('file', Buffer.from(mixedCsv), 'mixed_statement.csv');

      expect(res.status).toBe(201);
      expect(res.body.totalRows).toBe(4);
      expect(res.body.acceptedRows).toBe(2);
      expect(res.body.rejectedRows).toBe(2);

      // Verify row error inspection endpoint
      const errRes = await request(app)
        .get(`/api/v1/imports/${res.body.id}/errors`)
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(errRes.status).toBe(200);
      expect(errRes.body.items).toHaveLength(2);
      expect(errRes.body.items[0].errorCode).toBe('INVALID_DATE');
      expect(errRes.body.items[1].errorCode).toBe('INVALID_AMOUNT');
    });

    it('prevents accidental duplicate file imports via SHA-256 idempotency check', async () => {
      const csv = 'Date,Description,Amount\n2026-03-01,Test Entry,10.00\n';
      const fileBuffer = Buffer.from(csv);

      // 1. Initial import
      const res1 = await request(app)
        .post('/api/v1/imports')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .attach('file', fileBuffer, 'unique_upload.csv');

      expect(res1.status).toBe(201);

      // 2. Immediate re-upload of identical file
      const res2 = await request(app)
        .post('/api/v1/imports')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .attach('file', fileBuffer, 'unique_upload.csv');

      expect(res2.status).toBe(409);
      expect(res2.body.error.code).toBe(ERROR_CODES.DUPLICATE_IMPORT_FILE);
    });

    it('tracks internal duplicate records within a single file without failing valid rows', async () => {
      const csvWithDuplicates = [
        'Date,Description,Amount',
        '2026-03-01,Store Sale,50.00',
        '2026-03-01,Store Sale,50.00', // Identical duplicate row
        '2026-03-02,Unique Sale,75.00',
      ].join('\n');

      const res = await request(app)
        .post('/api/v1/imports')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .attach('file', Buffer.from(csvWithDuplicates), 'duplicates.csv');

      expect(res.status).toBe(201);
      expect(res.body.totalRows).toBe(3);
      expect(res.body.acceptedRows).toBe(2);
      expect(res.body.duplicateRows).toBe(1);
    });
  });

  describe('Excel (.xlsx) Statement Ingestion', () => {
    it('successfully ingests a valid Excel XLSX workbook', async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Transactions');

      sheet.addRow(['Date', 'Description', 'Amount', 'Reference']);
      sheet.addRow(['2026-03-15', 'Hardware Equipment', -350.0, 'REF-9901']);
      sheet.addRow(['2026-03-16', 'Client Direct Deposit', 1200.0, 'DEP-330']);

      const buffer = (await workbook.xlsx.writeBuffer()) as Buffer;

      const res = await request(app)
        .post('/api/v1/imports')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .attach('file', buffer, 'statement.xlsx');

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('completed');
      expect(res.body.totalRows).toBe(2);
      expect(res.body.acceptedRows).toBe(2);

      const txRes = await request(app)
        .get('/api/v1/transactions')
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(txRes.body.items).toHaveLength(2);
      const deposit = txRes.body.items.find(
        (t: { description: string }) => t.description === 'Client Direct Deposit',
      );
      expect(deposit.amountMinor).toBe(120000);
      expect(deposit.direction).toBe('credit');
    });
  });

  describe('File Validation Constraints', () => {
    it('rejects unsupported file formats (.pdf)', async () => {
      const res = await request(app)
        .post('/api/v1/imports')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .attach('file', Buffer.from('fake pdf content'), 'invoice.pdf');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ERROR_CODES.INVALID_FILE_FORMAT);
    });

    it('rejects completely empty files', async () => {
      const res = await request(app)
        .post('/api/v1/imports')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .attach('file', Buffer.alloc(0), 'empty.csv');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ERROR_CODES.EMPTY_FILE);
    });
  });

  describe('Transaction Pagination & Query Filtering', () => {
    beforeEach(async () => {
      const rows = [
        'Date,Description,Amount',
        '2026-03-01,Alpha Consulting,100.00',
        '2026-03-02,Beta Supplies,-200.00',
        '2026-03-03,Gamma Equipment,-300.00',
        '2026-03-04,Delta Software,400.00',
      ].join('\n');

      await request(app)
        .post('/api/v1/imports')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .attach('file', Buffer.from(rows), 'batch_pagination.csv');
    });

    it('paginates transaction results according to limit and page', async () => {
      const page1 = await request(app)
        .get('/api/v1/transactions?page=1&limit=2')
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(page1.status).toBe(200);
      expect(page1.body.items).toHaveLength(2);
      expect(page1.body.pagination.totalItems).toBe(4);
      expect(page1.body.pagination.totalPages).toBe(2);

      const page2 = await request(app)
        .get('/api/v1/transactions?page=2&limit=2')
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(page2.status).toBe(200);
      expect(page2.body.items).toHaveLength(2);
      expect(page2.body.items[0].id).not.toBe(page1.body.items[0].id);
    });

    it('filters transactions by direction', async () => {
      const debitRes = await request(app)
        .get('/api/v1/transactions?direction=debit')
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(debitRes.status).toBe(200);
      expect(debitRes.body.items).toHaveLength(2);
      expect(debitRes.body.items.every((t: { direction: string }) => t.direction === 'debit')).toBe(
        true,
      );
    });

    it('searches transactions by description substring', async () => {
      const searchRes = await request(app)
        .get('/api/v1/transactions?search=Gamma')
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(searchRes.status).toBe(200);
      expect(searchRes.body.items).toHaveLength(1);
      expect(searchRes.body.items[0].description).toBe('Gamma Equipment');
    });

    it('safely escapes special regex characters in search query to prevent ReDoS/syntax errors', async () => {
      const regexSearchRes = await request(app)
        .get('/api/v1/transactions?search=[invalid-regex(')
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(regexSearchRes.status).toBe(200);
      expect(regexSearchRes.body.items).toEqual([]);
    });

    it('rejects invalid date range where startDate is after endDate', async () => {
      const invalidDateRes = await request(app)
        .get('/api/v1/transactions?startDate=2026-03-15&endDate=2026-03-01')
        .set('x-api-key', DEV_DEFAULT_API_KEY);

      expect(invalidDateRes.status).toBe(400);
      expect(invalidDateRes.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    });
  });

  describe('Audit B: Concurrent Import Requests & Unique-Index Conflict Handling', () => {
    it('handles concurrent identical file submissions safely without duplicate transactions', async () => {
      const org = await createOrganizationForTesting('Concurrent Org A');
      const csvContent = [
        'Date,Description,Amount',
        '2026-03-15,Concurrent Vendor A,100.00',
        '2026-03-16,Concurrent Vendor B,200.00',
      ].join('\n');

      const fileBuffer = Buffer.from(csvContent);

      // Launch 2 simultaneous uploads of the exact same file
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/imports')
          .set('x-api-key', org.apiKey)
          .attach('file', fileBuffer, 'concurrent.csv'),
        request(app)
          .post('/api/v1/imports')
          .set('x-api-key', org.apiKey)
          .attach('file', fileBuffer, 'concurrent.csv'),
      ]);

      // Exactly one must succeed with 201; the other should either receive 409 Conflict (job in progress or duplicate file)
      const statuses = [res1.status, res2.status].sort();
      expect(statuses[0]).toBe(201);
      expect(statuses[1]).toBe(409);

      // Verify that database contains exactly 2 transactions (not duplicated to 4)
      const dbTransactions = await TransactionModel.find({ organizationId: org.organization.id });
      expect(dbTransactions).toHaveLength(2);
    });

    it('handles concurrent writes with overlapping transactions across different files via E11000 conflict resolution', async () => {
      const org = await createOrganizationForTesting('Overlapping Org B');

      // Two different files that contain overlapping identical rows
      const file1 = [
        'Date,Description,Amount',
        '2026-03-15,Shared Transaction,150.00',
        '2026-03-16,File 1 Unique,250.00',
      ].join('\n');

      const file2 = [
        'Date,Description,Amount',
        '2026-03-15,Shared Transaction,150.00',
        '2026-03-17,File 2 Unique,350.00',
      ].join('\n');

      // Upload file 1 first
      const res1 = await request(app)
        .post('/api/v1/imports')
        .set('x-api-key', org.apiKey)
        .attach('file', Buffer.from(file1), 'file1.csv');

      expect(res1.status).toBe(201);
      expect(res1.body.acceptedRows).toBe(2);

      // Upload file 2 second (different file hash, but row 1 is a duplicate fingerprint)
      const res2 = await request(app)
        .post('/api/v1/imports')
        .set('x-api-key', org.apiKey)
        .attach('file', Buffer.from(file2), 'file2.csv');

      expect(res2.status).toBe(201);
      expect(res2.body.acceptedRows).toBe(1); // Only "File 2 Unique" is inserted
      expect(res2.body.duplicateRows).toBe(1); // "Shared Transaction" is recognized as duplicate

      // Total in database: 3 transactions
      const dbTransactions = await TransactionModel.find({ organizationId: org.organization.id });
      expect(dbTransactions).toHaveLength(3);
    });
  });

  describe('Audit C: Production API-Key Controls & Tenant Identity', () => {
    it('strictly forbids the development API key in production mode', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const res = await request(app)
          .get('/api/v1/transactions')
          .set('x-api-key', DEV_DEFAULT_API_KEY);

        expect(res.status).toBe(401);
        expect(res.body.error.message).toContain('Development credentials cannot be used');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('ignores client-supplied organizationId and forces authenticated identity', async () => {
      const org = await createOrganizationForTesting('Legitimate Org');
      const forgedOrgId = '00000000-0000-0000-0000-999999999999';

      const csv = 'Date,Description,Amount\n2026-03-15,Test Inflow,100.00\n';

      const res = await request(app)
        .post('/api/v1/imports')
        .set('x-api-key', org.apiKey)
        .field('organizationId', forgedOrgId) // Maliciously forged org ID in form-data
        .attach('file', Buffer.from(csv), 'test_forge.csv');

      expect(res.status).toBe(201);
      expect(res.body.organizationId).toBe(org.organization.id);
      expect(res.body.organizationId).not.toBe(forgedOrgId);

      // Verify the transaction created has the authenticated org id
      const tx = await TransactionModel.findOne({ organizationId: org.organization.id });
      expect(tx).not.toBeNull();
      expect(tx!.organizationId).toBe(org.organization.id);
    });
  });

  describe('Audit D & E: Multer File Size Bounds & Safe Errors', () => {
    it('returns a structured 400 error when file exceeds 15MB limit instead of 500', async () => {
      // 16MB buffer to exceed 15MB limit
      const bigBuffer = Buffer.alloc(16 * 1024 * 1024, 'a');

      const res = await request(app)
        .post('/api/v1/imports')
        .set('x-api-key', DEV_DEFAULT_API_KEY)
        .attach('file', bigBuffer, 'oversized.csv');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ERROR_CODES.FILE_TOO_LARGE);
    });
  });
});
