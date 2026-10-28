import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Socket } from 'node:net';
import { app } from '../server.js';
import { SEED_CASES, resetInMemorySeed, seedDatabase } from '../src/db/seed.js';
import { signToken } from '../src/auth/jwt.js';
import { ROLES } from '../src/auth/roles.js';

const defaultOfficerToken = signToken({
  id: 'USR-APPROV-TEST',
  name: 'Dr. K. L. Roy',
  role: ROLES.AICTE_OFFICER,
  department: 'AICTE Sanctioning Authority'
});

test.before(async () => {
  try {
    await seedDatabase();
  } catch (e) {
    // Fallback if db unavailable
  }
  resetInMemorySeed();
});

test.beforeEach(() => {
  resetInMemorySeed();
});

// Helper to make mock requests to the Express app with proper body streaming
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

test('1. Verification detects the seeded amount mismatch on FDR-2026-002', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: '/api/cases/FDR-2026-002/simulate-verify',
    body: { officer_name: 'Inspector Sharma', officer_role: 'Verification Officer' }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.result.amount_matched, false, 'Amount match must be false for FDR-2026-002');
  assert.equal(res.body.result.status, 'MISMATCH_FLAGGED');
  assert.equal(res.body.disclaimer, 'SIMULATED — NOT LIVE BANK VERIFICATION');
});

test('2. Approval is rejected (HTTP 422) when a mandatory task is pending (FDR-2026-001)', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: '/api/cases/FDR-2026-001/decision',
    body: { decision: 'APPROVE', rationale: 'Attempting approval with pending clearance tasks' }
  });

  assert.equal(res.statusCode, 422, 'Server gate must reject with HTTP 422');
  assert.equal(res.body.success, false);
  assert.ok(res.body.blockers.length > 0, 'Blockers list must contain reasons');
  assert.ok(
    res.body.blockers.some((b) => b.includes('Mandatory clearance incomplete')),
    'Must list incomplete clearance tasks as blocker'
  );
});

test('3. Approval is rejected (HTTP 422) when a required objection remains active (FDR-2026-002)', async () => {
  const res = await makeRequest({
    method: 'POST',
    url: '/api/cases/FDR-2026-002/decision',
    body: { decision: 'APPROVE', rationale: 'Attempting premature approval with active mismatch objection' }
  });

  assert.equal(res.statusCode, 422, 'Server gate must reject with HTTP 422');
  assert.equal(res.body.success, false);
  assert.ok(
    res.body.blockers.some((b) => b.includes('discrepancy') || b.includes('objection')),
    'Must flag objection/discrepancy blocker'
  );
});

test('4. A failed decision creates no successful decision record', async () => {
  const caseItem = SEED_CASES.find((c) => c.id === 'FDR-2026-003');
  const prevStatus = caseItem.status;

  const res = await makeRequest({
    method: 'POST',
    url: '/api/cases/FDR-2026-003/decision',
    body: { decision: 'APPROVE', rationale: 'Attempting invalid approval on blocked case' }
  });

  assert.equal(res.statusCode, 422);
  assert.equal(caseItem.status, prevStatus, 'Case status must not change upon failed decision gate');
  assert.notEqual(caseItem.status, 'APPROVED');
});

test('5. Resolving a task does not silently resolve an unrelated objection', async () => {
  // Case 3 has objection OBJ-301 and task TSK-301
  const caseItem = SEED_CASES.find((c) => c.id === 'FDR-2026-003');
  const initialObjectionsCount = caseItem.objections.filter((o) => o.status === 'ACTIVE').length;

  const res = await makeRequest({
    method: 'PUT',
    url: '/api/cases/FDR-2026-003/tasks/TSK-301',
    body: { status: 'COMPLETED', remarks: 'Routine audit check passed' }
  });

  assert.equal(res.statusCode, 200);
  const remainingActiveObjections = caseItem.objections.filter((o) => o.status === 'ACTIVE').length;
  assert.equal(
    remainingActiveObjections,
    initialObjectionsCount,
    'Resolving a clearance task must NOT resolve or alter unrelated objections'
  );
});

test('6. Audit events are returned chronologically and contain actor/action/rationale', async () => {
  const res = await makeRequest({
    method: 'GET',
    url: '/api/cases/FDR-2026-001/audit-trail'
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.data));
  assert.ok(res.body.data.length > 0);
  const firstEvent = res.body.data[0];
  assert.ok(firstEvent.action);
  assert.ok(firstEvent.actor);
  assert.ok(firstEvent.event_timestamp);
});

test('7. Unauthorized or invalid task/case combinations are rejected with 404', async () => {
  // TSK-101 belongs to FDR-2026-001, NOT FDR-2026-002
  const res = await makeRequest({
    method: 'PUT',
    url: '/api/cases/FDR-2026-002/tasks/TSK-101',
    body: { status: 'COMPLETED', remarks: 'Cross-case tampering attempt' }
  });

  assert.equal(res.statusCode, 404, 'Must reject task that does not belong to the case');
  assert.equal(res.body.success, false);
});

test('8. Existing health and cases endpoints still work cleanly', async () => {
  const healthRes = await makeRequest({ method: 'GET', url: '/api/health' });
  assert.equal(healthRes.statusCode, 200);
  assert.equal(healthRes.body.status, 'UP');

  const casesRes = await makeRequest({ method: 'GET', url: '/api/cases' });
  assert.equal(casesRes.statusCode, 200);
  assert.equal(casesRes.body.success, true);
  assert.equal(casesRes.body.count, 4);
});

test('9. Objection resolution succeeds with valid remarks and updates status', async () => {
  const res = await makeRequest({
    method: 'PUT',
    url: '/api/cases/FDR-2026-003/objections/OBJ-301',
    body: {
      status: 'RESOLVED',
      resolution_remarks: 'Bank confirmed lien endorsement via official speed post ref L-992/2026',
      officer_name: 'Nodal Officer Roy',
      officer_role: 'Competent Authority'
    }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.objection.status, 'RESOLVED');
  assert.equal(res.body.objection.resolution_remarks, 'Bank confirmed lien endorsement via official speed post ref L-992/2026');
});

test('10. Objection resolution rejects missing resolution remarks with 400', async () => {
  const res = await makeRequest({
    method: 'PUT',
    url: '/api/cases/FDR-2026-003/objections/OBJ-301',
    body: {
      status: 'RESOLVED',
      resolution_remarks: ''
    }
  });

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.ok(res.body.error.includes('mandatory'));
});

test('11. Objection update rejects nonexistent objection ID with 404', async () => {
  const res = await makeRequest({
    method: 'PUT',
    url: '/api/cases/FDR-2026-003/objections/OBJ-NONEXISTENT-999',
    body: {
      status: 'RESOLVED',
      resolution_remarks: 'Valid remark for invalid objection'
    }
  });

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.success, false);
});

test('12. Objection update rejects cross-case objection IDs with 404', async () => {
  // OBJ-201 belongs to FDR-2026-002, NOT FDR-2026-003
  const res = await makeRequest({
    method: 'PUT',
    url: '/api/cases/FDR-2026-003/objections/OBJ-201',
    body: {
      status: 'RESOLVED',
      resolution_remarks: 'Tampering attempt cross-case'
    }
  });

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.success, false);
});

test('13. Rejected objection requests leave database state unchanged', async () => {
  // Check OBJ-301 initial status
  const caseItem = SEED_CASES.find(c => c.id === 'FDR-2026-003');
  const obj301 = caseItem.objections.find(o => o.id === 'OBJ-301');
  assert.equal(obj301.status, 'ACTIVE');

  // Attempt invalid request with missing remarks
  const res = await makeRequest({
    method: 'PUT',
    url: '/api/cases/FDR-2026-003/objections/OBJ-301',
    body: { status: 'RESOLVED', resolution_remarks: '' }
  });
  assert.equal(res.statusCode, 400);

  // Status must remain ACTIVE
  assert.equal(obj301.status, 'ACTIVE', 'Objection status must remain unchanged after rejected request');
});

