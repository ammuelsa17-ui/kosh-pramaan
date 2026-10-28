const BACKEND_BASE_URL = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL !== undefined
  ? import.meta.env.VITE_API_URL
  : (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PROD ? '' : 'http://localhost:5001');

/**
 * Fetch all FDR cases from the backend.
 */
export async function fetchCases() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${BACKEND_BASE_URL}/api/cases`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const payload = await res.json();
    return {
      ok: true,
      source: payload.source || 'UNKNOWN',
      dbError: payload.dbError || null,
      count: payload.count || 0,
      data: payload.data || []
    };
  } catch (err) {
    return {
      ok: false,
      error: err.name === 'AbortError' ? 'Connection timeout' : (err.message || 'Cannot fetch cases')
    };
  }
}

/**
 * Fetch complete details for a single FDR case.
 */
export async function fetchCaseDetail(caseId) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${BACKEND_BASE_URL}/api/cases/${encodeURIComponent(caseId)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const payload = await res.json();
    return {
      ok: true,
      source: payload.source || 'UNKNOWN',
      data: payload.data
    };
  } catch (err) {
    return {
      ok: false,
      error: err.name === 'AbortError' ? 'Connection timeout' : (err.message || 'Cannot fetch case detail')
    };
  }
}

/**
 * Execute simulated core-banking verification for an FDR case.
 */
export async function runSimulatedVerification(caseId, { officer_name, officer_role } = {}) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/cases/${encodeURIComponent(caseId)}/simulate-verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        officer_name: officer_name || 'Verification Officer (Demo)',
        officer_role: officer_role || 'Verification Officer'
      })
    });

    const payload = await res.json();
    if (!res.ok) {
      return { ok: false, error: payload.error || `HTTP ${res.status}` };
    }
    return { ok: true, data: payload };
  } catch (err) {
    return { ok: false, error: err.message || 'Simulated verification request failed' };
  }
}

/**
 * Update clearance task status (Complete, Block, In-Progress).
 */
export async function updateClearanceTask(caseId, taskId, { status, blocker_reason, remarks, officer_name, officer_role }) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/cases/${encodeURIComponent(caseId)}/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        status,
        blocker_reason,
        remarks,
        officer_name: officer_name || 'Clearance Officer (Demo)',
        officer_role: officer_role || 'Clearance Officer'
      })
    });

    const payload = await res.json();
    if (!res.ok) {
      return { ok: false, error: payload.error || `HTTP ${res.status}` };
    }
    return { ok: true, data: payload };
  } catch (err) {
    return { ok: false, error: err.message || 'Task update request failed' };
  }
}

/**
 * Submit an officer decision (APPROVE, REJECT, SEEK_CLARIFICATION) through the Decision Gate.
 */
export async function submitDecision(caseId, { decision, rationale, officer_name, officer_role }) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/cases/${encodeURIComponent(caseId)}/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        decision,
        rationale,
        officer_name: officer_name || 'Competent Authority (Demo)',
        officer_role: officer_role || 'Executive Approver (Demo Role)'
      })
    });

    const payload = await res.json();
    if (res.status === 422) {
      // Decision Gate Violation
      return {
        ok: false,
        isGateViolation: true,
        error: payload.error,
        blockers: payload.blockers || []
      };
    }

    if (!res.ok) {
      return { ok: false, error: payload.error || `HTTP ${res.status}` };
    }

    return { ok: true, data: payload };
  } catch (err) {
    return { ok: false, error: err.message || 'Decision submission failed' };
  }
}

/**
 * Fetch chronological audit trail for a case.
 */
export async function fetchAuditTrail(caseId) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/cases/${encodeURIComponent(caseId)}/audit-trail`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    const payload = await res.json();
    if (!res.ok) {
      return { ok: false, error: payload.error || `HTTP ${res.status}` };
    }
    return { ok: true, count: payload.count || 0, data: payload.data || [] };
  } catch (err) {
    return { ok: false, error: err.message || 'Failed to fetch audit trail' };
  }
}

/**
 * Resolve or overrule an objection with mandatory documented remarks.
 */
export async function resolveObjection(caseId, objId, { status = 'RESOLVED', resolution_remarks, officer_name, officer_role }) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/cases/${encodeURIComponent(caseId)}/objections/${encodeURIComponent(objId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        status,
        resolution_remarks,
        officer_name: officer_name || 'Nodal Officer (Demo)',
        officer_role: officer_role || 'Competent Authority'
      })
    });

    const payload = await res.json();
    if (!res.ok) {
      return { ok: false, error: payload.error || `HTTP ${res.status}` };
    }
    return { ok: true, data: payload };
  } catch (err) {
    return { ok: false, error: err.message || 'Objection resolution request failed' };
  }
}

