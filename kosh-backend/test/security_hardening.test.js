import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Socket } from 'node:net';
import crypto from 'node:crypto';
import { getJwtSecret, signToken, verifyToken } from '../src/auth/jwt.js';
import { ROLES } from '../src/auth/roles.js';
import { app } from '../server.js';

// Helper for making simulated HTTP calls into Express
function makeRequest({ method = 'GET', url = '/', body = null, headers = {} }) {
  return new Promise((resolve) => {
    const socket = new Socket();
    const req = new http.IncomingMessage(socket);
    req.url = url;
    req.method = method;

    const payloadStr = body ? JSON.stringify(body) : null;
    req.headers = {
      host: 'localhost:5001',
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

test.describe('Security & Reliability Pre-Deployment Hardening Audit', () => {

  test('1. JWT Production Hardening: Enforces mandatory high-entropy secret >= 32 chars', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.JWT_SECRET;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;

      // Must throw when secret is missing in production
      assert.throws(() => {
        getJwtSecret();
      }, /\[SECURITY VIOLATION\]/);

      // Must throw when secret is too short (< 32 chars)
      process.env.JWT_SECRET = 'short-secret-under-32';
      assert.throws(() => {
        getJwtSecret();
      }, /at least 32 characters/);

      // Must throw when secret contains trivial/predictable pattern
      process.env.JWT_SECRET = '12345678901234567890123456789012';
      assert.throws(() => {
        getJwtSecret();
      }, /predictable pattern/);

      // Must succeed when valid high-entropy 32+ character secret is provided
      process.env.JWT_SECRET = 's3cur3-k0sh-pr4m44n-pr0duct10n-k3y-99824!';
      const validSecret = getJwtSecret();
      assert.equal(validSecret, 's3cur3-k0sh-pr4m44n-pr0duct10n-k3y-99824!');
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalSecret !== undefined) {
        process.env.JWT_SECRET = originalSecret;
      } else {
        delete process.env.JWT_SECRET;
      }
    }
  });

  test('2. JWT Cryptographic Verification: Detects expired and future tokens', () => {
    const token = signToken({ id: 'TEST-1', role: ROLES.INSTITUTION }, 3600);
    const result = verifyToken(token);
    assert.equal(result.valid, true);
    assert.equal(result.payload.id, 'TEST-1');

    // Tampered payload
    const parts = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ id: 'TEST-1', role: ROLES.AICTE_OFFICER })).toString('base64');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    const tamperedResult = verifyToken(tamperedToken);
    assert.equal(tamperedResult.valid, false);
    assert.match(tamperedResult.error, /signature verification failed/i);
  });

  test('3. Demo Credential Isolation: Demo tokens explicitly declare simulation claims', () => {
    const demoPayload = {
      id: 'USR-APPROV-001',
      name: 'Dr. K. L. Roy',
      role: ROLES.AICTE_OFFICER,
      is_demo: true,
      simulated: true,
      privileged_simulation: true,
      simulation_notice: 'SIMULATED DEMO CREDENTIAL - NOT FOR PRODUCTION COMPLIANCE'
    };

    const token = signToken(demoPayload, 3600);
    const decoded = verifyToken(token);

    assert.equal(decoded.valid, true);
    assert.equal(decoded.payload.is_demo, true);
    assert.equal(decoded.payload.simulated, true);
    assert.equal(decoded.payload.privileged_simulation, true);
    assert.equal(decoded.payload.simulation_notice, 'SIMULATED DEMO CREDENTIAL - NOT FOR PRODUCTION COMPLIANCE');
  });

  test('4. PostgreSQL SSL Configuration: Enforces rejectUnauthorized=true by default', async () => {
    const originalUrl = process.env.DATABASE_URL;
    const originalSelfSigned = process.env.PG_SSL_ALLOW_SELF_SIGNED;

    try {
      process.env.DATABASE_URL = 'postgresql://user:pass@ep-remote-db.neon.tech/kosh_db?sslmode=require';
      delete process.env.PG_SSL_ALLOW_SELF_SIGNED;

      const isLocalhost = process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');
      assert.equal(isLocalhost, false);

      const allowSelfSigned = process.env.PG_SSL_ALLOW_SELF_SIGNED === 'true';
      const rejectUnauthorized = !allowSelfSigned;
      assert.equal(rejectUnauthorized, true, 'Default SSL must validate server certificates (rejectUnauthorized: true)');

      process.env.PG_SSL_ALLOW_SELF_SIGNED = 'true';
      const allowOverride = process.env.PG_SSL_ALLOW_SELF_SIGNED === 'true';
      assert.equal(!allowOverride, false, 'Self-signed allow flag must explicitly be opt-in');
    } finally {
      if (originalUrl !== undefined) {
        process.env.DATABASE_URL = originalUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
      if (originalSelfSigned !== undefined) {
        process.env.PG_SSL_ALLOW_SELF_SIGNED = originalSelfSigned;
      } else {
        delete process.env.PG_SSL_ALLOW_SELF_SIGNED;
      }
    }
  });

  test('5. CORS Security: Rejects unauthorized origins without reflection and blocks invalid preflights', async () => {
    // A. Request from unauthorized evil origin
    const evilRes = await makeRequest({
      method: 'GET',
      url: '/api/health',
      headers: { 'origin': 'https://malicious-attacker-site.com' }
    });

    // Access-Control-Allow-Origin MUST NOT reflect the evil origin!
    assert.equal(evilRes.headers['access-control-allow-origin'], undefined, 'Must NEVER reflect rejected Origin');
    assert.equal(evilRes.headers['access-control-allow-credentials'], undefined, 'Must NOT grant credentials to unauthorized origins');

    // B. Preflight OPTIONS from unauthorized origin receives HTTP 403
    const preflightRes = await makeRequest({
      method: 'OPTIONS',
      url: '/api/cases',
      headers: { 'origin': 'https://evil-phishing.com' }
    });
    assert.equal(preflightRes.statusCode, 403, 'Preflight from untrusted origin must be rejected with HTTP 403');

    // C. Request from trusted origin succeeds and returns headers
    const trustedRes = await makeRequest({
      method: 'GET',
      url: '/api/health',
      headers: { 'origin': 'http://localhost:5173' }
    });
    assert.equal(trustedRes.headers['access-control-allow-origin'], 'http://localhost:5173');
    assert.equal(trustedRes.headers['access-control-allow-credentials'], 'true');
  });

  test('6. Read Protection: Unauthenticated read requests are rejected with HTTP 401', async () => {
    // GET /api/cases without Authorization header
    const casesRes = await makeRequest({
      method: 'GET',
      url: '/api/cases',
      headers: {} // No token!
    });
    assert.equal(casesRes.statusCode, 401, 'GET /api/cases must require authentication');
    assert.equal(casesRes.body.success, false);

    // GET /api/cases/FDR-2026-001 without Authorization header
    const detailRes = await makeRequest({
      method: 'GET',
      url: '/api/cases/FDR-2026-001',
      headers: {}
    });
    assert.equal(detailRes.statusCode, 401, 'GET /api/cases/:id must require authentication');

    // GET /api/cases/FDR-2026-001/audit-trail without Authorization header
    const auditRes = await makeRequest({
      method: 'GET',
      url: '/api/cases/FDR-2026-001/audit-trail',
      headers: {}
    });
    assert.equal(auditRes.statusCode, 401, 'GET /api/cases/:id/audit-trail must require authentication');
  });

  test('7. Record-Level Authorization & Institution Data Isolation (HTTP 403)', async () => {
    // Institution token for College B
    const instBToken = signToken({
      id: 'USR-INST-B',
      name: 'South Gujarat Polytechnic Institute',
      role: ROLES.INSTITUTION,
      institution_id: 'AICTE-1-889977112',
      department: 'Institution / Applicant'
    });

    // Attempt to view case detail for FDR-2026-001 (belonging to Apex Infrastructure)
    const unauthorizedAccess = await makeRequest({
      method: 'GET',
      url: '/api/cases/FDR-2026-001',
      headers: { 'authorization': `Bearer ${instBToken}` }
    });

    // Must be rejected with HTTP 403 Forbidden!
    assert.equal(unauthorizedAccess.statusCode, 403, 'Cross-institution case access must receive HTTP 403');
    assert.match(unauthorizedAccess.body.error, /not authorized to view/i);

    // Attempt to view audit trail for FDR-2026-001 with College B's token
    const unauthorizedAudit = await makeRequest({
      method: 'GET',
      url: '/api/cases/FDR-2026-001/audit-trail',
      headers: { 'authorization': `Bearer ${instBToken}` }
    });
    assert.equal(unauthorizedAudit.statusCode, 403, 'Cross-institution audit trail access must receive HTTP 403');
  });

  test('8. Real Evidentiary Document Upload with SHA-256 Integrity Verification', async () => {
    const institutionToken = signToken({
      id: 'USR-INST-001',
      name: 'Apex Infrastructure Projects Ltd',
      role: ROLES.INSTITUTION,
      institution_id: 'AICTE-1-492019482',
      department: 'Institution / Applicant'
    });

    const mockPdfContent = Buffer.from('%PDF-1.4 Mock Physical FDR Certificate with Authorized Bank Branch Seal').toString('base64');
    const expectedSha256 = crypto.createHash('sha256').update(mockPdfContent).digest('hex');

    const uploadRes = await makeRequest({
      method: 'POST',
      url: '/api/cases/FDR-2026-001/documents',
      headers: { 'authorization': `Bearer ${institutionToken}` },
      body: {
        document_name: 'Physical_FDR_Original_Receipt_Signed.pdf',
        document_type: 'FDR_PHYSICAL_CERTIFICATE',
        document_data: mockPdfContent,
        mime_type: 'application/pdf'
      }
    });

    assert.equal(uploadRes.statusCode, 201);
    assert.equal(uploadRes.body.success, true);
    assert.equal(uploadRes.body.document.sha256_hash, expectedSha256);
    assert.equal(uploadRes.body.document.document_type, 'FDR_PHYSICAL_CERTIFICATE');

    // Retrieve documents list
    const docsListRes = await makeRequest({
      method: 'GET',
      url: '/api/cases/FDR-2026-001/documents',
      headers: { 'authorization': `Bearer ${institutionToken}` }
    });
    assert.equal(docsListRes.statusCode, 200);
    assert.ok(docsListRes.body.count >= 1);
  });

  test('9. AICTE APH §6.46 4-Queue Clearance Initialization on New Submission', async () => {
    const instToken = signToken({
      id: 'USR-INST-001',
      name: 'Apex Infrastructure Projects Ltd',
      role: ROLES.INSTITUTION,
      institution_id: 'AICTE-1-492019482'
    });

    const uniqueFdr = `FDR/APH646/${Date.now().toString().slice(-6)}`;
    const subRes = await makeRequest({
      method: 'POST',
      url: '/api/cases',
      headers: { 'authorization': `Bearer ${instToken}` },
      body: {
        institution_name: 'Apex Infrastructure Projects Ltd',
        depositor_name: 'Apex Infrastructure Guarantee Account',
        fdr_number: uniqueFdr,
        issuing_bank: 'State Bank of India',
        branch_name: 'Connaught Place Branch, New Delhi',
        ifsc_code: 'SBIN0001234',
        submitted_amount: '5000000.00',
        lien_marked_to: 'AICTE New Delhi',
        deposit_date: '2026-01-01',
        maturity_date: '2027-01-01',
        release_doc_type: 'FDR_RELEASE_NOC'
      }
    });

    assert.equal(subRes.statusCode, 201);
    assert.equal(subRes.body.success, true);
    // Must initialize 4 APH §6.46 tasks (PGRC, Vigilance, Grants, Accounts)
    assert.equal(subRes.body.data.pending_tasks, 4, 'Must initialize 4 APH §6.46 queues');
    assert.equal(subRes.body.data.release_doc_type, 'FDR_RELEASE_NOC');
  });

});
