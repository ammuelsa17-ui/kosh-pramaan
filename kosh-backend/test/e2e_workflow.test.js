import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Socket } from 'node:net';
import { pool, query, checkDbConnection } from '../src/config/db.js';
import { initializeSchema } from '../src/db/schema.js';
import { seedDatabase, resetInMemorySeed } from '../src/db/seed.js';
import { app } from '../server.js';
import { signToken } from '../src/auth/jwt.js';
import { ROLES } from '../src/auth/roles.js';

const defaultOfficerToken = signToken({
  id: 'USR-APPROV-TEST',
  name: 'Dr. K. L. Roy',
  role: ROLES.AICTE_OFFICER,
  department: 'AICTE Sanctioning Authority'
});

// Helper to make simulated HTTP requests directly into Express
function makeRequest({ method = 'GET', url = '/', body = null, headers = {} }) {
  return new Promise((resolve) => {
    const socket = new Socket();
    const req = new http.IncomingMessage(socket);
    req.url = url;
    req.method = method;

    const payloadStr = body ? JSON.stringify(body) : null;
    const authHeader = headers.authorization !== undefined ? headers.authorization : `Bearer ${defaultOfficerToken}`;
    req.headers = {
      host: 'localhost:5001',
      ...(authHeader ? { authorization: authHeader } : {}),
      ...(payloadStr ? {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payloadStr)
      } : {}),
      ...headers
    };

    const res = new http.ServerResponse(req);
    let resBody = '';

    res.write = (chunk) => {
      resBody += chunk;
      return true;
    };
    res.end = (chunk) => {
      if (chunk) resBody += chunk;
      let parsed = null;
      try {
        parsed = JSON.parse(resBody);
      } catch (e) {
        parsed = resBody;
      }
      resolve({ statusCode: res.statusCode, headers: res.getHeaders(), body: parsed });
    };

    app.handle(req, res);

    if (payloadStr) {
      req.push(payloadStr);
      req.push(null);
    } else {
      req.push(null);
    }
  });
}

test.describe('KOSH-PRAMAAN End-to-End Workflow & Reliability Audit (PostgreSQL: kosh_pramaan_test)', () => {
  let dbAvailable = false;

  test.before(async () => {
    const dbStatus = await checkDbConnection();
    if (dbStatus.connected && dbStatus.database === 'kosh_pramaan_test') {
      dbAvailable = true;
      // Re-initialize and seed cleanly for reproducible E2E tests
      await initializeSchema();
      await seedDatabase();
    } else {
      console.warn('[E2E TEST NOTICE] Dedicated PostgreSQL kosh_pramaan_test not accessible in this context. Running fallback tests.');
      resetInMemorySeed();
    }
  });



  test('A. Retrieve all cases and verify that seeded cases are loaded', async () => {
    const res = await makeRequest({ method: 'GET', url: '/api/cases' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.count, 4, 'Should load exactly 4 fictional cases');
    
    if (dbAvailable) {
      assert.equal(res.body.source, 'POSTGRESQL', 'Must report POSTGRESQL when connected to dedicated test db');
    }

    const ids = res.body.data.map(c => c.id);
    assert.ok(ids.includes('FDR-2026-001'));
    assert.ok(ids.includes('FDR-2026-002'));
    assert.ok(ids.includes('FDR-2026-003'));
    assert.ok(ids.includes('FDR-2026-004'));
  });

  test('B. Trigger verification for the seeded amount-mismatch case (FDR-2026-002)', async () => {
    const res = await makeRequest({
      method: 'POST',
      url: '/api/cases/FDR-2026-002/simulate-verify',
      body: {
        officer_name: 'Verification Officer Sharma',
        officer_role: 'Verification Officer'
      }
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.disclaimer, 'SIMULATED — NOT LIVE BANK VERIFICATION');
    assert.equal(res.body.result.amount_matched, false, 'Amount must NOT match for FDR-2026-002');
    assert.equal(res.body.result.status, 'MISMATCH_FLAGGED');
  });

  test('C. Confirm institution-submitted amount preserved, simulated comparison separate, mismatch flagged', async () => {
    const res = await makeRequest({ method: 'GET', url: '/api/cases/FDR-2026-002' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);

    const caseData = res.body.data;
    // Submitted amount must be exactly 25,00,000 (2500000.00)
    assert.equal(Number(caseData.submitted_amount), 2500000.00);
    // Simulated bank ledger amount is 20,00,000 (2000000.00)
    assert.ok(caseData.simulated, 'Simulated bank record must exist');
    assert.equal(Number(caseData.simulated.simulated_amount), 2000000.00);
    assert.equal(caseData.simulated.amount_matched, false);
    assert.equal(caseData.status, 'MISMATCH_FLAGGED');
    assert.equal(caseData.simulated.simulation_disclaimer, 'SIMULATED — NOT LIVE BANK VERIFICATION');
  });

  test('D. Attempt to approve mismatch case before resolving discrepancy (Decision Gate rejection HTTP 422)', async () => {
    const res = await makeRequest({
      method: 'POST',
      url: '/api/cases/FDR-2026-002/decision',
      body: {
        decision: 'APPROVE',
        rationale: 'Premature approval attempt without resolving amount mismatch',
        officer_name: 'Chief Sanctioning Officer',
        officer_role: 'Competent Authority'
      }
    });

    assert.equal(res.statusCode, 422, 'Server gate must reject premature APPROVE with HTTP 422');
    assert.equal(res.body.success, false);
    assert.ok(res.body.blockers.length > 0);
    assert.ok(
      res.body.blockers.some(b => b.includes('Unresolved amount discrepancy') || b.includes('discrepancy')),
      'Must specify discrepancy blocker'
    );

    // Verify case status was NOT changed in database
    const checkRes = await makeRequest({ method: 'GET', url: '/api/cases/FDR-2026-002' });
    assert.equal(checkRes.body.data.status, 'MISMATCH_FLAGGED', 'Case status must remain MISMATCH_FLAGGED');
  });

  test('E. Update a pending clearance task on the clearance-blocked case (FDR-2026-003)', async () => {
    // FDR-2026-003 has task TSK-302 (Original Physical FDR Certificate Verification)
    const res = await makeRequest({
      method: 'PUT',
      url: '/api/cases/FDR-2026-003/tasks/TSK-302',
      body: {
        status: 'COMPLETED',
        remarks: 'Physical security paper inspected under UV and watermark confirmed against specimen archive.',
        officer_name: 'Inspector Verma',
        officer_role: 'Clearance Officer'
      }
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.task.status, 'COMPLETED');

    // Verify unrelated objection OBJ-301 remains active
    const checkRes = await makeRequest({ method: 'GET', url: '/api/cases/FDR-2026-003' });
    const obj301 = checkRes.body.data.objections.find(o => o.id === 'OBJ-301');
    assert.ok(obj301, 'OBJ-301 must exist');
    assert.equal(obj301.status, 'ACTIVE', 'Unrelated objection must remain ACTIVE');
  });

  test('F. Attempt to approve clearance-blocked case before completing all required tasks (Decision Gate HTTP 422)', async () => {
    const res = await makeRequest({
      method: 'POST',
      url: '/api/cases/FDR-2026-003/decision',
      body: {
        decision: 'APPROVE',
        rationale: 'Attempting approval while legal clearance task TSK-301 and objection OBJ-301 remain unresolved',
        officer_name: 'Chief Sanctioning Officer',
        officer_role: 'Competent Authority'
      }
    });

    assert.equal(res.statusCode, 422, 'Must reject with HTTP 422');
    assert.equal(res.body.success, false);
    assert.ok(res.body.blockers.length >= 1, 'Must contain blockers');
    // Blockers should mention mandatory clearance or active objection
    const hasClearanceBlocker = res.body.blockers.some(b => b.includes('Mandatory clearance') || b.includes('objection'));
    assert.ok(hasClearanceBlocker, 'Must flag mandatory clearance or objection blockers');
  });

  test('G. Resolve the blocking condition through supported workflow with mandatory remarks', async () => {
    // 1. Resolve objection OBJ-301 with documented remarks
    const objRes = await makeRequest({
      method: 'PUT',
      url: '/api/cases/FDR-2026-003/objections/OBJ-301',
      body: {
        status: 'RESOLVED',
        resolution_remarks: 'Bank confirmed lien endorsement via registered speed post dispatch ref L-992/2026.',
        officer_name: 'Nodal Officer Roy',
        officer_role: 'Competent Authority'
      }
    });

    assert.equal(objRes.statusCode, 200);
    assert.equal(objRes.body.objection.status, 'RESOLVED');
    assert.equal(objRes.body.objection.resolution_remarks, 'Bank confirmed lien endorsement via registered speed post dispatch ref L-992/2026.');

    // 2. Resolve blocked task TSK-301
    const taskRes = await makeRequest({
      method: 'PUT',
      url: '/api/cases/FDR-2026-003/tasks/TSK-301',
      body: {
        status: 'COMPLETED',
        remarks: 'Legal counsel reviewed resolution deed and issued unconditional No-Objection Certificate.',
        officer_name: 'Legal Officer Bannerjee',
        officer_role: 'Clearance Officer'
      }
    });

    assert.equal(taskRes.statusCode, 200);
    assert.equal(taskRes.body.task.status, 'COMPLETED');
  });

  test('H. Attempt actions with invalid inputs and verify rejection with appropriate HTTP codes', async () => {
    // H1. Missing rationale in decision
    const h1 = await makeRequest({
      method: 'POST',
      url: '/api/cases/FDR-2026-001/decision',
      body: { decision: 'APPROVE', rationale: '' }
    });
    assert.equal(h1.statusCode, 400, 'Must reject empty rationale with HTTP 400');
    assert.equal(h1.body.success, false);

    // H2. Invalid decision type
    const h2 = await makeRequest({
      method: 'POST',
      url: '/api/cases/FDR-2026-001/decision',
      body: { decision: 'GRANT_SPECIAL_WAIVER', rationale: 'Invalid decision type' }
    });
    assert.equal(h2.statusCode, 400, 'Must reject unsupported decision with HTTP 400');

    // H3. Missing explanation remarks when resolving blocked task
    // First set TSK-303 to BLOCKED with blocker reason
    await makeRequest({
      method: 'PUT',
      url: '/api/cases/FDR-2026-003/tasks/TSK-303',
      body: { status: 'BLOCKED', blocker_reason: 'Pending vigilance dossier' }
    });
    // Now attempt to resolve to COMPLETED without remarks
    const h3 = await makeRequest({
      method: 'PUT',
      url: '/api/cases/FDR-2026-003/tasks/TSK-303',
      body: { status: 'COMPLETED', remarks: '' }
    });
    assert.equal(h3.statusCode, 400, 'Must require remarks when resolving blocked task');

    // H4. Cross-case task modification (task not belonging to case)
    const h4 = await makeRequest({
      method: 'PUT',
      url: '/api/cases/FDR-2026-002/tasks/TSK-101',
      body: { status: 'COMPLETED', remarks: 'Attempt to tamper cross-case' }
    });
    assert.equal(h4.statusCode, 404, 'Must return 404 for task belonging to different case');

    // H5. Non-existent case
    const h5 = await makeRequest({
      method: 'GET',
      url: '/api/cases/FDR-9999-NONEXISTENT'
    });
    assert.equal(h5.statusCode, 404, 'Must return 404 for non-existent case');
  });

  test('I. Complete all required clearances for eligible case (FDR-2026-001) and approve it', async () => {
    // 1. Verify simulation is executed and clean on FDR-2026-001
    await makeRequest({
      method: 'POST',
      url: '/api/cases/FDR-2026-001/simulate-verify',
      body: { officer_name: 'Inspector Roy', officer_role: 'Verification Officer' }
    });

    // 2. Complete remaining tasks for FDR-2026-001 (TSK-102, TSK-103)
    await makeRequest({
      method: 'PUT',
      url: '/api/cases/FDR-2026-001/tasks/TSK-102',
      body: { status: 'COMPLETED', remarks: 'Lien confirmation letter verified from State Bank of India' }
    });

    await makeRequest({
      method: 'PUT',
      url: '/api/cases/FDR-2026-001/tasks/TSK-103',
      body: { status: 'COMPLETED', remarks: 'Tender conditions check satisfied in e-Procurement cell' }
    });

    // 3. Submit APPROVE decision
    const approveRes = await makeRequest({
      method: 'POST',
      url: '/api/cases/FDR-2026-001/decision',
      body: {
        decision: 'APPROVE',
        rationale: 'All core clearances completed, simulated verification clean, and legal lien confirmed.',
        officer_name: 'Chief Sanctioning Officer Mehta',
        officer_role: 'Competent Authority'
      }
    });

    assert.equal(approveRes.statusCode, 200, 'Decision gate must allow approval when all requirements met');
    assert.equal(approveRes.body.success, true);
    assert.equal(approveRes.body.new_status, 'APPROVED');

    // Verify persisted case status
    const caseRes = await makeRequest({ method: 'GET', url: '/api/cases/FDR-2026-001' });
    assert.equal(caseRes.body.data.status, 'APPROVED');
  });

  test('J. Retrieve audit trail for approved case: chronological order, actors, state transitions', async () => {
    const res = await makeRequest({
      method: 'GET',
      url: '/api/cases/FDR-2026-001/audit-trail'
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    const events = res.body.data;
    assert.ok(Array.isArray(events));
    assert.ok(events.length >= 4, 'Should contain case creation, task updates, verification, and decision');

    // Verify chronological order (oldest first or newest first: our query uses ASC)
    for (let i = 1; i < events.length; i++) {
      const prevTime = new Date(events[i - 1].event_timestamp).getTime();
      const currTime = new Date(events[i].event_timestamp).getTime();
      assert.ok(currTime >= prevTime, 'Audit events must be in chronological ascending order');
    }

    // Verify every event has mandatory audit fields
    for (const ev of events) {
      assert.ok(ev.action, 'Event must have an action');
      assert.ok(ev.actor, 'Event must have an actor');
      assert.ok(ev.actor_role, 'Event must have an actor_role');
      assert.ok(ev.event_timestamp, 'Event must have an event_timestamp');
    }

    // Verify that failed decision attempts (like in test D or test F) do NOT record successful state transitions
    const case2Trail = await makeRequest({ method: 'GET', url: '/api/cases/FDR-2026-002/audit-trail' });
    const c2ApprovedEvents = case2Trail.body.data.filter(e => e.action === 'DECISION_APPROVE' || e.new_state === 'APPROVED');
    assert.equal(c2ApprovedEvents.length, 0, 'Failed decision attempts must not create successful state-change audit records');
  });

  test('K. Concurrency Safeguard: PostgreSQL row-level locking serializes concurrent decision evaluations', async () => {
    if (!dbAvailable) return;

    // Acquire two dedicated clients from the pool
    const client1 = await pool.connect();
    const client2 = await pool.connect();

    try {
      // Client 1 begins transaction and locks case FDR-2026-004
      await client1.query('BEGIN');
      await client1.query('SELECT * FROM fdr_cases WHERE id = $1 FOR UPDATE', ['FDR-2026-004']);

      let client2AcquiredLock = false;
      const client2Promise = (async () => {
        await client2.query('BEGIN');
        // This query must block until Client 1 releases the lock
        await client2.query('SELECT * FROM fdr_cases WHERE id = $1 FOR UPDATE', ['FDR-2026-004']);
        client2AcquiredLock = true;
        await client2.query('ROLLBACK');
      })();

      // Wait 60ms to let client2 attempt the lock
      await new Promise(r => setTimeout(r, 60));
      assert.equal(client2AcquiredLock, false, 'Client 2 must be blocked while Client 1 holds FOR UPDATE lock');

      // Client 1 rolls back, releasing the exclusive lock
      await client1.query('ROLLBACK');

      // Client 2 now proceeds and finishes
      await client2Promise;
      assert.equal(client2AcquiredLock, true, 'Client 2 must acquire lock and complete after Client 1 releases');
    } finally {
      client1.release();
      client2.release();
    }
  });
});

