import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchCases,
  fetchCaseDetail,
  runSimulatedVerification,
  updateClearanceTask,
  submitDecision,
  fetchAuditTrail,
  resolveObjection
} from './casesApi.js';

test('fetchCases returns cases list and marks source accurately', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      source: 'POSTGRESQL',
      count: 1,
      data: [{ id: 'FDR-2026-001', submitted_amount: '5000000.00', status: 'UNDER_REVIEW' }]
    })
  });

  try {
    const res = await fetchCases();
    assert.equal(res.ok, true);
    assert.equal(res.source, 'POSTGRESQL');
    assert.equal(res.count, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runSimulatedVerification calls API and returns verification result', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.ok(url.includes('/simulate-verify'));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        disclaimer: 'SIMULATED — NOT LIVE BANK VERIFICATION',
        result: { case_id: 'FDR-2026-001', amount_matched: true }
      })
    };
  };

  try {
    const res = await runSimulatedVerification('FDR-2026-001');
    assert.equal(res.ok, true);
    assert.equal(res.data.disclaimer, 'SIMULATED — NOT LIVE BANK VERIFICATION');
    assert.equal(res.data.result.amount_matched, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('submitDecision handles Decision Gate 422 blocker response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.ok(url.includes('/decision'));
    return {
      ok: false,
      status: 422,
      json: async () => ({
        success: false,
        error: 'Decision Gate Violation',
        blockers: ['Mandatory clearance incomplete: Task 1']
      })
    };
  };

  try {
    const res = await submitDecision('FDR-2026-001', { decision: 'APPROVE', rationale: 'Fast approval test' });
    assert.equal(res.ok, false);
    assert.equal(res.isGateViolation, true);
    assert.equal(res.blockers.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchAuditTrail retrieves chronological events', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.ok(url.includes('/audit-trail'));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        count: 2,
        data: [{ id: 1, action: 'SYSTEM_INITIAL_SEED' }, { id: 2, action: 'DECISION_APPROVED' }]
      })
    };
  };

  try {
    const res = await fetchAuditTrail('FDR-2026-001');
    assert.equal(res.ok, true);
    assert.equal(res.count, 2);
    assert.equal(res.data[0].action, 'SYSTEM_INITIAL_SEED');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolveObjection sends resolution remarks and returns updated objection', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.ok(url.includes('/objections/OBJ-301'));
    assert.equal(options.method, 'PUT');
    const body = JSON.parse(options.body);
    assert.equal(body.status, 'RESOLVED');
    assert.equal(body.resolution_remarks, 'Bank endorsement verified');

    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        message: 'Objection OBJ-301 marked as RESOLVED',
        objection: { id: 'OBJ-301', status: 'RESOLVED' }
      })
    };
  };

  try {
    const res = await resolveObjection('FDR-2026-003', 'OBJ-301', {
      status: 'RESOLVED',
      resolution_remarks: 'Bank endorsement verified'
    });
    assert.equal(res.ok, true);
    assert.equal(res.data.objection.status, 'RESOLVED');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

