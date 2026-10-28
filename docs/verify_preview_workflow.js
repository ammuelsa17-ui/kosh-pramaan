import http from 'node:http';
import pg from '../kosh-backend/node_modules/pg/lib/index.js';

const { Pool } = pg;
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'harshini',
  database: 'kosh_pramaan_preview'
});

async function apiRequest({ method = 'GET', path = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      host: '127.0.0.1',
      port: 5001,
      path,
      method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runValidation() {
  console.log('================================================================');
  console.log('  KOSH-PRAMAAN PREVIEW DEPLOYMENT WORKFLOW & PERSISTENCE TEST   ');
  console.log('================================================================\n');

  // STEP 1: Verify health & DB connection
  console.log('[STEP 1] Checking API health and PostgreSQL connection...');
  const healthRes = await apiRequest({ path: '/api/health' });
  console.log(`  Health Status: ${healthRes.status} -> DB Status: ${healthRes.data?.database?.status}`);
  if (healthRes.data?.database?.status !== 'CONNECTED') {
    throw new Error('Database is not connected on port 5001!');
  }

  // STEP 2: Demo Authentication & Login
  console.log('\n[STEP 2] Authenticating as Institution...');
  const loginRes = await apiRequest({
    method: 'POST',
    path: '/api/auth/login',
    body: { username: 'institution_apex' }
  });
  console.log(`  Login Status: ${loginRes.status} -> Role: ${loginRes.data?.user?.role}`);
  console.log(`  Simulation Notice: ${loginRes.data?.simulation_notice}`);
  const instToken = loginRes.data?.token;

  // STEP 3: Submit New FDR Application
  const uniqueFdr = 'FDR/PREVIEW/' + Date.now().toString().slice(-6);
  console.log(`\n[STEP 3] Submitting new FDR Application (${uniqueFdr})...`);
  const submitRes = await apiRequest({
    method: 'POST',
    path: '/api/cases',
    headers: { 'Authorization': `Bearer ${instToken}` },
    body: {
      institution_name: 'National Institute of Technology Preview Campus',
      depositor_name: 'NIT Performance Security Deposit',
      fdr_number: uniqueFdr,
      issuing_bank: 'State Bank of India',
      branch_name: 'Connaught Place Branch, New Delhi',
      ifsc_code: 'SBIN0001234',
      submitted_amount: 5000000.00,
      lien_marked_to: 'AICTE New Delhi',
      deposit_date: '2026-05-01',
      maturity_date: '2027-05-01',
      document_filename: 'NIT_Preview_FDR_2026.pdf'
    }
  });
  console.log(`  Submit Status: ${submitRes.status} -> Source: ${submitRes.data?.source}`);
  console.log(`  Created Case ID: ${submitRes.data?.case_id} (Status: ${submitRes.data?.data?.status})`);
  const caseId = submitRes.data?.case_id;

  // Verify PostgreSQL row
  const dbCase = await pool.query('SELECT id, fdr_number, status, submitted_amount FROM fdr_cases WHERE id = $1', [caseId]);
  console.log(`  [PostgreSQL Confirmation] Row persisted in fdr_cases: ID=${dbCase.rows[0]?.id}, Amount=₹${dbCase.rows[0]?.submitted_amount}`);

  // STEP 4: Login as Verification Officer & Simulate Verification
  console.log('\n[STEP 4] Logging in as Verification Officer & Running Core-Banking Ledger Verification...');
  const verifLogin = await apiRequest({
    method: 'POST',
    path: '/api/auth/login',
    body: { username: 'officer_verma' }
  });
  const verifToken = verifLogin.data?.token;

  const verifRes = await apiRequest({
    method: 'POST',
    path: `/api/cases/${caseId}/simulate-verify`,
    headers: { 'Authorization': `Bearer ${verifToken}` }
  });
  console.log(`  Simulate-Verify Status: ${verifRes.status} -> Amount Matched: ${verifRes.data?.result?.amount_matched}`);
  console.log(`  Disclaimer: "${verifRes.data?.disclaimer}"`);
  console.log(`  Case Status after Verification: ${verifRes.data?.result?.status}`);

  // STEP 5: Test Decision Gate Rejection Before Clearances
  console.log('\n[STEP 5] Testing Decision Gate Rejection (Pre-Clearance Approval Attempt)...');
  const aicteLogin = await apiRequest({
    method: 'POST',
    path: '/api/auth/login',
    body: { username: 'director_roy' }
  });
  const aicteToken = aicteLogin.data?.token;

  const prematureApprove = await apiRequest({
    method: 'POST',
    path: `/api/cases/${caseId}/decision`,
    headers: { 'Authorization': `Bearer ${aicteToken}` },
    body: { decision: 'APPROVE', rationale: 'Premature approval attempt before clearances' }
  });
  console.log(`  Decision Gate Result: HTTP ${prematureApprove.status} (Expected: 422 Unprocessable Entity)`);
  console.log(`  Blocked Count: ${prematureApprove.data?.blocker_count}`);
  prematureApprove.data?.blockers?.forEach((b, i) => console.log(`   - Blocker ${i + 1}: ${b}`));

  // STEP 6: Clearance Officer Resolves Departmental Tasks
  console.log('\n[STEP 6] Logging in as Clearance Officer & Completing Mandatory Checkpoints...');
  const clearLogin = await apiRequest({
    method: 'POST',
    path: '/api/auth/login',
    body: { username: 'officer_sharma' }
  });
  const clearToken = clearLogin.data?.token;

  // Fetch tasks
  const caseDetail = await apiRequest({
    path: `/api/cases/${caseId}`,
    headers: { 'Authorization': `Bearer ${clearToken}` }
  });
  const tasks = caseDetail.data?.data?.tasks || caseDetail.data?.tasks || [];
  console.log(`  Found ${tasks.length} departmental tasks for case ${caseId} (APH §6.46 queues)`);

  for (const t of tasks) {
    const taskUpdate = await apiRequest({
      method: 'PUT',
      path: `/api/cases/${caseId}/tasks/${t.id}`,
      headers: { 'Authorization': `Bearer ${clearToken}` },
      body: { status: 'COMPLETED', remarks: `Verification confirmed per departmental protocol: ${t.task_name}` }
    });
    console.log(`   -> Task "${t.task_name}": Updated to ${taskUpdate.data?.task?.status}`);
  }

  // STEP 6B: Upload Evidentiary FDR Document with SHA-256 Hash
  console.log('\n[STEP 6B] Uploading Physical FDR Certificate Evidence (SHA-256 Hashed)...');
  const docPayload = Buffer.from('%PDF-1.4 Mock Physical FDR Certificate Signed by SBI Connaught Place').toString('base64');
  const uploadRes = await apiRequest({
    method: 'POST',
    path: `/api/cases/${caseId}/documents`,
    headers: { 'Authorization': `Bearer ${instToken}` },
    body: {
      document_type: 'ORIGINAL_FDR_CERTIFICATE',
      document_name: 'NIT_Preview_FDR_2026.pdf',
      document_data: docPayload
    }
  });
  console.log(`  Document Upload Status: HTTP ${uploadRes.status} -> SHA-256: ${(uploadRes.data?.document?.sha256_hash || uploadRes.data?.sha256_hash)?.slice(0, 16)}...`);

  // STEP 7: Authorized AICTE Approval via Decision Gate
  console.log('\n[STEP 7] Submitting Authorized AICTE Sanctioning Decision (Director Roy)...');
  const finalDecision = await apiRequest({
    method: 'POST',
    path: `/api/cases/${caseId}/decision`,
    headers: { 'Authorization': `Bearer ${aicteToken}` },
    body: { decision: 'APPROVE', rationale: 'All mandatory clearances completed, core-banking verification confirmed, and physical FDR certificate validated. Sanctioned.' }
  });
  console.log(`  Final Decision Status: HTTP ${finalDecision.status} -> New Case Status: ${finalDecision.data?.new_status}`);
  console.log(`  Sanction Order / Release Document: ${finalDecision.data?.release_doc_type} -> ${finalDecision.data?.sanction_order_number}`);

  // STEP 8: Immutable Audit Trail Retrieval
  console.log('\n[STEP 8] Retrieving Immutable Chronological Audit Trail...');
  const auditRes = await apiRequest({
    path: `/api/cases/${caseId}/audit-trail`,
    headers: { 'Authorization': `Bearer ${aicteToken}` }
  });
  console.log(`  Audit Trail Event Count: ${auditRes.data?.count}`);
  auditRes.data?.data?.forEach((ev, idx) => {
    console.log(`   ${idx + 1}. [${ev.event_timestamp}] ${ev.action} by ${ev.actor} (${ev.actor_role}) -> New State: ${ev.new_state}`);
  });

  // STEP 9: Database Persistence Verification Across Sessions
  console.log('\n[STEP 9] Confirming Persistent Storage directly in PostgreSQL...');
  const dbFinal = await pool.query('SELECT status, sanction_order_number, release_doc_type, updated_at FROM fdr_cases WHERE id = $1', [caseId]);
  const dbTasks = await pool.query('SELECT COUNT(*)::INT as count FROM clearance_tasks WHERE case_id = $1 AND status = \'COMPLETED\'', [caseId]);
  const dbAudit = await pool.query('SELECT COUNT(*)::INT as count FROM audit_events WHERE case_id = $1', [caseId]);
  const dbDocs = await pool.query('SELECT COUNT(*)::INT as count FROM case_documents WHERE case_id = $1', [caseId]);
  
  console.log(`  PostgreSQL fdr_cases status: ${dbFinal.rows[0]?.status}`);
  console.log(`  PostgreSQL sanction order: ${dbFinal.rows[0]?.sanction_order_number} (${dbFinal.rows[0]?.release_doc_type})`);
  console.log(`  PostgreSQL clearance_tasks completed: ${dbTasks.rows[0]?.count} / 4`);
  console.log(`  PostgreSQL audit_events count: ${dbAudit.rows[0]?.count}`);
  console.log(`  PostgreSQL case_documents count: ${dbDocs.rows[0]?.count}`);

  if (dbFinal.rows[0]?.status === 'APPROVED' && dbTasks.rows[0]?.count === 4 && dbAudit.rows[0]?.count >= 6 && dbDocs.rows[0]?.count >= 1) {
    console.log('\n>>> SUCCESS: Complete End-to-End Workflow & Database Persistence Confirmed! <<<');
  } else {
    throw new Error('Database state did not match expected persistence conditions!');
  }

  await pool.end();
}

runValidation().catch(async (err) => {
  console.error('\n[VALIDATION FAILED]:', err);
  await pool.end();
  process.exit(1);
});
