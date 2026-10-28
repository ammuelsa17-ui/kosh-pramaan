import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { app } from '../server.js';
import { signToken } from '../src/auth/jwt.js';
import { ROLES, DEMO_USERS } from '../src/auth/roles.js';
import { pool } from '../src/config/db.js';

test.after(async () => {
  try {
    await pool.query("DELETE FROM fdr_cases WHERE id NOT IN ('FDR-2026-001', 'FDR-2026-002', 'FDR-2026-003', 'FDR-2026-004')");
  } catch (err) {}
  await pool.end().catch(() => {});
});

// Supertest-like in-memory HTTP dispatcher
function makeRequest({ method = 'GET', url = '/', body = null, headers = {} }) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    const lowerHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      lowerHeaders[k.toLowerCase()] = v;
    }
    req.headers = lowerHeaders;
    if (body) {
      req.headers['content-type'] = 'application/json';
      req.body = body;
    }

    const res = {
      statusCode: 200,
      headers: {},
      body: '',
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      header(k, v) { this.setHeader(k, v); },
      status(c) { this.statusCode = c; return this; },
      sendStatus(c) { this.statusCode = c; resolve(this); },
      json(data) {
        this.setHeader('content-type', 'application/json');
        this.body = data;
        resolve(this);
      },
      send(data) {
        this.body = data;
        resolve(this);
      },
      end() { resolve(this); }
    };

    app(req, res);
  });
}

test('PHASE 1: Authentication & Role-Based Access Control (RBAC)', async (t) => {
  const institutionToken = signToken({
    id: 'USR-INST-TEST',
    name: 'Apex Test College',
    role: ROLES.INSTITUTION,
    department: 'Institution'
  });

  const clearanceToken = signToken({
    id: 'USR-CLEAR-TEST',
    name: 'Officer Sharma',
    role: ROLES.CLEARANCE_OFFICER,
    department: 'Clearances'
  });

  const aicteToken = signToken({
    id: 'USR-APPROV-TEST',
    name: 'Director Roy',
    role: ROLES.AICTE_OFFICER,
    department: 'AICTE Executive'
  });

  const auditorToken = signToken({
    id: 'USR-AUDIT-TEST',
    name: 'Auditor CAG',
    role: ROLES.AUDITOR,
    department: 'Vigilance'
  });

  await t.test('1. GET /api/auth/demo-users returns available profiles with signed JWTs', async () => {
    const res = await makeRequest({ method: 'GET', url: '/api/auth/demo-users' });
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body.users));
    assert.equal(res.body.users.length, 5);
    for (const u of res.body.users) {
      assert.ok(u.token, 'Demo user must have a pre-signed JWT');
      assert.ok(u.role, 'Demo user must have a declared role');
    }
  });

  await t.test('2. POST /api/auth/login authenticates demo credentials', async () => {
    const res = await makeRequest({
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'institution_apex' }
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.role, ROLES.INSTITUTION);
  });

  await t.test('3. Unauthenticated requests with strict auth header are rejected with HTTP 401', async () => {
    const res = await makeRequest({
      method: 'POST',
      url: '/api/cases',
      headers: { 'x-strict-auth': 'true' },
      body: { fdr_number: 'TEST' }
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error, 'Authentication Required');
  });

  await t.test('4. Tampered / invalid JWT signature is rejected with HTTP 401', async () => {
    const res = await makeRequest({
      method: 'POST',
      url: '/api/cases',
      headers: {
        'x-strict-auth': 'true',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiQUlDVEVfT0ZGSUNFUiJ9.INVALID_TAMPERED_SIG'
      },
      body: { fdr_number: 'TEST' }
    });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
    assert.ok(res.body.message.includes('signature verification failed'));
  });

  await t.test('5. Role Spoofing Prevention: INSTITUTION cannot approve applications (HTTP 403 Forbidden)', async () => {
    const res = await makeRequest({
      method: 'POST',
      url: '/api/cases/FDR-2026-001/decision',
      headers: { 'Authorization': `Bearer ${institutionToken}` },
      body: {
        decision: 'APPROVE',
        rationale: 'Institution attempting unauthorized approval bypass'
      }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.user_role, ROLES.INSTITUTION);
    assert.ok(res.body.required_roles.includes(ROLES.AICTE_OFFICER));
  });

  await t.test('6. Role Spoofing Prevention: CLEARANCE_OFFICER cannot approve applications (HTTP 403 Forbidden)', async () => {
    const res = await makeRequest({
      method: 'POST',
      url: '/api/cases/FDR-2026-001/decision',
      headers: { 'Authorization': `Bearer ${clearanceToken}` },
      body: {
        decision: 'APPROVE',
        rationale: 'Clearance officer attempting approval'
      }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.user_role, ROLES.CLEARANCE_OFFICER);
  });

  await t.test('7. Role Spoofing Prevention: AUDITOR cannot mutate tasks or cases (HTTP 403 Forbidden)', async () => {
    const res = await makeRequest({
      method: 'PUT',
      url: '/api/cases/FDR-2026-001/tasks/TSK-101',
      headers: { 'Authorization': `Bearer ${auditorToken}` },
      body: { status: 'COMPLETED', remarks: 'Auditor attempting mutation' }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.user_role, ROLES.AUDITOR);
  });
});

test('PHASE 3: Authenticated FDR Application Submission (POST /api/cases)', async (t) => {
  const institutionToken = signToken({
    id: 'USR-INST-001',
    name: 'Apex Engineering College',
    role: ROLES.INSTITUTION,
    department: 'Institution'
  });

  const clearanceToken = signToken({
    id: 'USR-CLEAR-001',
    name: 'Priya Sharma',
    role: ROLES.CLEARANCE_OFFICER,
    department: 'Clearances'
  });

  await t.test('1. Rejects unauthorized submission attempt from CLEARANCE_OFFICER (HTTP 403)', async () => {
    const res = await makeRequest({
      method: 'POST',
      url: '/api/cases',
      headers: { 'Authorization': `Bearer ${clearanceToken}` },
      body: {
        institution_name: 'Test College',
        depositor_name: 'Test Depositor',
        fdr_number: 'FDR/TEST/9999',
        issuing_bank: 'State Bank of India',
        branch_name: 'CP, New Delhi',
        ifsc_code: 'SBIN0001234',
        submitted_amount: '5000000',
        lien_marked_to: 'AICTE',
        deposit_date: '2026-01-01',
        maturity_date: '2027-01-01'
      }
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.success, false);
  });

  await t.test('2. Rejects submission with missing mandatory fields (HTTP 400)', async () => {
    const res = await makeRequest({
      method: 'POST',
      url: '/api/cases',
      headers: { 'Authorization': `Bearer ${institutionToken}` },
      body: {
        institution_name: 'Apex Engineering College'
        // Missing fdr_number, amount, dates, etc.
      }
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.ok(res.body.missing_fields.length > 0);
  });

  await t.test('3. Rejects invalid monetary amount (<= 0 or non-numeric) (HTTP 400)', async () => {
    const res = await makeRequest({
      method: 'POST',
      url: '/api/cases',
      headers: { 'Authorization': `Bearer ${institutionToken}` },
      body: {
        institution_name: 'Apex Engineering College',
        depositor_name: 'Apex Trust',
        fdr_number: 'FDR/TEST/NEG',
        issuing_bank: 'State Bank of India',
        branch_name: 'CP, New Delhi',
        ifsc_code: 'SBIN0001234',
        submitted_amount: '-50000',
        lien_marked_to: 'AICTE',
        deposit_date: '2026-01-01',
        maturity_date: '2027-01-01'
      }
    });
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.error.includes('positive number'));
  });

  await t.test('4. Rejects invalid maturity date earlier than deposit date (HTTP 400)', async () => {
    const res = await makeRequest({
      method: 'POST',
      url: '/api/cases',
      headers: { 'Authorization': `Bearer ${institutionToken}` },
      body: {
        institution_name: 'Apex Engineering College',
        depositor_name: 'Apex Trust',
        fdr_number: 'FDR/TEST/DATE',
        issuing_bank: 'State Bank of India',
        branch_name: 'CP, New Delhi',
        ifsc_code: 'SBIN0001234',
        submitted_amount: '5000000',
        lien_marked_to: 'AICTE',
        deposit_date: '2026-06-01',
        maturity_date: '2026-01-01' // Before deposit date!
      }
    });
    assert.equal(res.statusCode, 400);
    assert.ok(res.body.error.includes('maturity_date must be after deposit_date'));
  });

  const uniqueFdrNumber = `FDR/SIH/TEST/${Date.now().toString().slice(-6)}`;

  await t.test('5. Successfully creates new FDR application when submitted by authorized INSTITUTION (HTTP 201)', async () => {
    const res = await makeRequest({
      method: 'POST',
      url: '/api/cases',
      headers: { 'Authorization': `Bearer ${institutionToken}` },
      body: {
        institution_name: 'Apex Engineering College',
        depositor_name: 'Apex Educational Trust Security Guarantee',
        fdr_number: uniqueFdrNumber,
        issuing_bank: 'State Bank of India',
        branch_name: 'Connaught Place Branch, New Delhi',
        ifsc_code: 'SBIN0001234',
        submitted_amount: '7500000.00',
        lien_marked_to: 'All India Council for Technical Education (AICTE), New Delhi',
        deposit_date: '2026-01-15',
        maturity_date: '2028-01-15',
        document_filename: 'Apex_AICTE_Security_Deposit_75L.pdf'
      }
    });

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.case_id);
    assert.equal(res.body.data.fdr_number, uniqueFdrNumber);
    assert.equal(res.body.data.status, 'SUBMITTED');
    assert.equal(res.body.data.department_queue, 'INTAKE_QUEUE');
    assert.ok(res.body.data.pending_tasks >= 3, 'Must initialize mandatory clearance tasks (APH §6.46)');
  });

  await t.test('6. Rejects duplicate FDR number submission with HTTP 409 Conflict', async () => {
    const res = await makeRequest({
      method: 'POST',
      url: '/api/cases',
      headers: { 'Authorization': `Bearer ${institutionToken}` },
      body: {
        institution_name: 'Another Institution',
        depositor_name: 'Duplicate Depositor',
        fdr_number: uniqueFdrNumber, // Same FDR Number!
        issuing_bank: 'State Bank of India',
        branch_name: 'Connaught Place Branch',
        ifsc_code: 'SBIN0001234',
        submitted_amount: '7500000.00',
        lien_marked_to: 'AICTE',
        deposit_date: '2026-01-15',
        maturity_date: '2028-01-15'
      }
    });

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.success, false);
    assert.ok(res.body.error.includes('Conflict'));
  });
});
