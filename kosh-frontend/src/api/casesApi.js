const BACKEND_BASE_URL = typeof import.meta !== 'undefined' && import.meta.env
  ? (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '' : 'http://localhost:5001'))
  : 'http://localhost:5001';

// Local in-memory / session storage for active authenticated user
let activeToken = typeof window !== 'undefined' ? (window.sessionStorage.getItem('kosh_auth_token') || null) : null;
let activeUser = typeof window !== 'undefined' ? JSON.parse(window.sessionStorage.getItem('kosh_auth_user') || 'null') : null;

export function getAuthToken() {
  return activeToken;
}

export function getActiveUser() {
  return activeUser;
}

export function setActiveAuth(token, user) {
  activeToken = token;
  activeUser = user;
  if (typeof window !== 'undefined') {
    if (token) window.sessionStorage.setItem('kosh_auth_token', token);
    else window.sessionStorage.removeItem('kosh_auth_token');
    if (user) window.sessionStorage.setItem('kosh_auth_user', JSON.stringify(user));
    else window.sessionStorage.removeItem('kosh_auth_user');
    window.dispatchEvent(new Event('kosh_auth_changed'));
  }
}

function getHeaders(extra = {}) {
  const h = { 'Accept': 'application/json', ...extra };
  if (activeToken) {
    h['Authorization'] = `Bearer ${activeToken}`;
  }
  return h;
}

/**
 * Fetch available demo user accounts with pre-signed tokens
 */
export async function fetchDemoUsers() {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/auth/demo-users`, {
      method: 'GET',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { ok: true, users: data.users || [] };
  } catch (err) {
    return { ok: false, error: err.message, users: [] };
  }
}

/**
 * Log in as a demo user or role
 */
export async function loginAsDemoUser(userOrRole) {
  try {
    const body = typeof userOrRole === 'string' ? { role: userOrRole } : { username: userOrRole.username };
    const res = await fetch(`${BACKEND_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    });
    const payload = await res.json();
    if (!res.ok) {
      return { ok: false, error: payload.error || payload.message };
    }
    setActiveAuth(payload.token, payload.user);
    return { ok: true, token: payload.token, user: payload.user };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Submit a new FDR Application (Institutional Portal)
 */
export async function submitNewFdrCase(formData) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/cases`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(formData)
    });

    const payload = await res.json();

    if (res.status === 403) {
      return {
        ok: false,
        isForbidden: true,
        error: payload.message || 'Access Denied: Your active role cannot submit FDR applications.'
      };
    }

    if (res.status === 401) {
      return {
        ok: false,
        isUnauthorized: true,
        error: 'Authentication Required: Please log in with a valid user role.'
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        error: payload.error || payload.message || `HTTP ${res.status}`
      };
    }

    return { ok: true, caseId: payload.case_id, data: payload.data };
  } catch (err) {
    return { ok: false, error: err.message || 'Failed to submit FDR application' };
  }
}

/**
 * Fetch all FDR cases from the backend.
 */
export async function fetchCases() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${BACKEND_BASE_URL}/api/cases`, {
      method: 'GET',
      headers: getHeaders(),
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
      headers: getHeaders(),
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
export async function runSimulatedVerification(caseId) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/cases/${encodeURIComponent(caseId)}/simulate-verify`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({})
    });

    const payload = await res.json();
    if (res.status === 403) {
      return { ok: false, isForbidden: true, error: payload.message || 'Access Denied: Insufficient role permissions.' };
    }
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
export async function updateClearanceTask(caseId, taskId, { status, blocker_reason, remarks }) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/cases/${encodeURIComponent(caseId)}/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PUT',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        status,
        blocker_reason,
        remarks
      })
    });

    const payload = await res.json();
    if (res.status === 403) {
      return { ok: false, isForbidden: true, error: payload.message || 'Access Denied: Insufficient role permissions.' };
    }
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
export async function submitDecision(caseId, { decision, rationale }) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/cases/${encodeURIComponent(caseId)}/decision`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        decision,
        rationale
      })
    });

    const payload = await res.json();

    if (res.status === 403) {
      return {
        ok: false,
        isForbidden: true,
        error: payload.message || 'Access Denied: Only an authorized AICTE Sanctioning Authority can record final decisions.'
      };
    }

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
      headers: getHeaders()
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
export async function resolveObjection(caseId, objId, { status = 'RESOLVED', resolution_remarks }) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/cases/${encodeURIComponent(caseId)}/objections/${encodeURIComponent(objId)}`, {
      method: 'PUT',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        status,
        resolution_remarks
      })
    });

    const payload = await res.json();
    if (res.status === 403) {
      return { ok: false, isForbidden: true, error: payload.message || 'Access Denied: Insufficient role permissions.' };
    }
    if (!res.ok) {
      return { ok: false, error: payload.error || `HTTP ${res.status}` };
    }
    return { ok: true, data: payload };
  } catch (err) {
    return { ok: false, error: err.message || 'Objection resolution request failed' };
  }
}

/**
 * Fetch maturity alerts (upcoming, critical, expired FDRs).
 */
export async function fetchMaturityAlerts(daysAhead = 90) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/cases/alerts/maturity?days_ahead=${daysAhead}`, {
      method: 'GET',
      headers: getHeaders()
    });
    const payload = await res.json();
    if (!res.ok) {
      return { ok: false, error: payload.error || `HTTP ${res.status}` };
    }
    return { ok: true, summary: payload.summary, alerts: payload.data || [] };
  } catch (err) {
    return { ok: false, error: err.message || 'Failed to fetch maturity alerts', alerts: [] };
  }
}

/**
 * Fetch document versions and cryptographic checksums for a case.
 */
export async function fetchCaseDocuments(caseId) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/cases/${encodeURIComponent(caseId)}/documents`, {
      method: 'GET',
      headers: getHeaders()
    });
    const payload = await res.json();
    if (!res.ok) {
      return { ok: false, error: payload.error || `HTTP ${res.status}` };
    }
    return { ok: true, data: payload.data || [] };
  } catch (err) {
    return { ok: false, error: err.message || 'Failed to fetch documents', data: [] };
  }
}

/**
 * Verify document checksum against stored raw file bytes on the server.
 */
export async function verifyDocumentChecksum(caseId, docId) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(docId)}/verify`, {
      method: 'GET',
      headers: getHeaders()
    });
    const payload = await res.json();
    if (!res.ok) {
      return { ok: false, error: payload.error || `HTTP ${res.status}` };
    }
    return { ok: true, ...payload };
  } catch (err) {
    return { ok: false, error: err.message || 'Checksum validation failed' };
  }
}

/**
 * Fetch renewal history for an FDR case.
 */
export async function fetchCaseRenewals(caseId) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/cases/${encodeURIComponent(caseId)}/renewals`, {
      method: 'GET',
      headers: getHeaders()
    });
    const payload = await res.json();
    if (!res.ok) {
      return { ok: false, error: payload.error || `HTTP ${res.status}` };
    }
    return { ok: true, data: payload.data || [] };
  } catch (err) {
    return { ok: false, error: err.message || 'Failed to fetch renewals', data: [] };
  }
}

/**
 * Submit an FDR renewal or replacement.
 */
export async function renewFdrCase(caseId, renewalData) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/cases/${encodeURIComponent(caseId)}/renew`, {
      method: 'POST',
      headers: getHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(renewalData)
    });
    const payload = await res.json();
    if (res.status === 403) {
      return { ok: false, isForbidden: true, error: payload.message || 'Access Denied: Insufficient role permissions.' };
    }
    if (!res.ok) {
      return { ok: false, error: payload.error || `HTTP ${res.status}` };
    }
    return { ok: true, data: payload };
  } catch (err) {
    return { ok: false, error: err.message || 'Renewal request failed' };
  }
}

/**
 * Fetch recent cross-case administrative audit events for dashboard activity feeds.
 */
export async function fetchRecentAuditActivity(limit = 8) {
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/cases/audit/recent?limit=${limit}`, {
      method: 'GET',
      headers: getHeaders()
    });
    const payload = await res.json();
    if (!res.ok) {
      return { ok: false, error: payload.error || `HTTP ${res.status}`, data: [] };
    }
    return { ok: true, count: payload.count || 0, data: payload.data || [] };
  } catch (err) {
    return { ok: false, error: err.message || 'Failed to fetch recent audit activity', data: [] };
  }
}
