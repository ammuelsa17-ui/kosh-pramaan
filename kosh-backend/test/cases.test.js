import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Socket } from 'node:net';
import { app } from '../server.js';
import { pool } from '../src/config/db.js';
import { signToken } from '../src/auth/jwt.js';

test('GET /api/cases returns case list when DB is populated', async () => {
  // Save original pool.query
  const originalPoolQuery = pool.query.bind(pool);

  // Stub pool.query to test route mapping and response contract
  pool.query = async () => {
    return {
      rows: [
        {
          id: 'FDR-2026-001',
          institution_name: 'Apex Infrastructure Projects Ltd',
          fdr_number: 'FDR/SBI/2026/894102',
          submitted_amount: '5000000.00',
          status: 'UNDER_REVIEW',
          simulated_amount: '5000000.00',
          amount_matched: true,
          simulation_disclaimer: 'SIMULATED — NOT LIVE BANK VERIFICATION',
          pending_tasks: 1,
          blocked_tasks: 0,
          active_objections: 0
        },
        {
          id: 'FDR-2026-002',
          institution_name: 'Vanguard Solar Power Tech',
          fdr_number: 'FDR/PNB/2026/447812',
          submitted_amount: '2500000.00',
          status: 'MISMATCH_FLAGGED',
          simulated_amount: '2000000.00',
          amount_matched: false,
          simulation_disclaimer: 'SIMULATED — NOT LIVE BANK VERIFICATION',
          pending_tasks: 1,
          blocked_tasks: 1,
          active_objections: 1
        }
      ]
    };
  };

  try {
    const socket = new Socket();
    const req = new http.IncomingMessage(socket);
    req.url = '/api/cases';
    req.method = 'GET';
    const token = signToken({
      sub: 'officer-test',
      name: 'Test Officer',
      role: 'AICTE_OFFICER',
      department: 'Approvals'
    });
    req.headers = { host: 'localhost:5001', authorization: `Bearer ${token}` };

    const res = new http.ServerResponse(req);
    let body = '';

    const finished = new Promise((resolve) => {
      res.write = (chunk) => { body += chunk; return true; };
      res.end = (chunk) => { if (chunk) body += chunk; resolve(); };
    });

    app.handle(req, res);
    await finished;

    assert.equal(res.statusCode, 200);
    const parsed = JSON.parse(body);
    assert.equal(parsed.success, true);
    assert.equal(parsed.count, 2);
    assert.equal(parsed.data[0].id, 'FDR-2026-001');
    assert.equal(parsed.data[0].simulation_disclaimer, 'SIMULATED — NOT LIVE BANK VERIFICATION');
    assert.equal(parsed.data[1].amount_matched, false);
  } finally {
    pool.query = originalPoolQuery;
  }
});

test('GET /api/health still returns 200 with decoupled DB info', async () => {
  const socket = new Socket();
  const req = new http.IncomingMessage(socket);
  req.url = '/api/health';
  req.method = 'GET';
  req.headers = { host: 'localhost:5001' };

  const res = new http.ServerResponse(req);
  let body = '';

  const finished = new Promise((resolve) => {
    res.write = (chunk) => { body += chunk; return true; };
    res.end = (chunk) => { if (chunk) body += chunk; resolve(); };
  });

  app.handle(req, res);
  await finished;

  assert.equal(res.statusCode, 200);
  const parsed = JSON.parse(body);
  assert.equal(parsed.status, 'UP');
  assert.equal(parsed.service, 'kosh-backend');
  assert.ok(parsed.database);
});
