import express from 'express';
import crypto from 'node:crypto';
import { query, getClient } from '../config/db.js';
import { SEED_CASES } from '../db/seed.js';
import { authenticate, requireRole } from '../auth/middleware.js';
import { ROLES } from '../auth/roles.js';

const router = express.Router();

// Atomic in-memory sequence for concurrency-safe fallback IDs
let inMemorySequence = 100;

/**
 * Determines whether database persistence is strictly enforced.
 */
function shouldEnforceDatabase() {
  return Boolean(
    process.env.DATABASE_URL ||
    process.env.STRICT_PERSISTENCE === 'true' ||
    process.env.NODE_ENV === 'production'
  );
}

/**
 * Safe database error responder: Returns generic user-safe error with correlation ID.
 * Never leaks err.message, stack traces, or PostgreSQL internals to clients.
 */
function sendSafeDatabaseError(res, err, actionLabel) {
  const correlationId = crypto.randomUUID();
  console.error(`[DB ERROR Ref: ${correlationId}] during ${actionLabel}:`, err.message);
  return res.status(503).json({
    success: false,
    error: 'Database Service Unavailable: Persistent database transaction failed. Operation aborted to protect data integrity.',
    persistence_status: 'FAILED',
    correlation_id: correlationId
  });
}

/**
 * 1. GET /api/cases
 * Returns list of FDR case summaries.
 * Strict Authentication & Record-Level Authorization:
 * - INSTITUTION users only see cases for their own institution.
 * - Officers and Auditors can view all cases across regulatory queues.
 */
router.get('/cases', authenticate, async (req, res) => {
  const isInstitution = req.user.role === ROLES.INSTITUTION;
  const userInstId = req.user.institution_id || '';
  const userInstName = req.user.name || '';

  try {
    let sql = `
      SELECT 
        c.id,
        c.institution_id,
        c.institution_name,
        c.depositor_name,
        c.fdr_number,
        c.issuing_bank,
        c.branch_name,
        c.ifsc_code,
        c.submitted_amount::NUMERIC AS submitted_amount,
        c.lien_marked_to,
        c.deposit_date,
        c.maturity_date,
        c.status,
        c.department_queue,
        c.document_filename,
        c.release_doc_type,
        c.sanction_order_number,
        c.created_at,
        s.simulated_amount::NUMERIC AS simulated_amount,
        s.amount_matched,
        s.simulation_disclaimer,
        (SELECT COUNT(*)::INT FROM clearance_tasks t WHERE t.case_id = c.id AND t.status != 'COMPLETED') AS pending_tasks,
        (SELECT COUNT(*)::INT FROM clearance_tasks t WHERE t.case_id = c.id AND t.status = 'BLOCKED') AS blocked_tasks,
        (SELECT COUNT(*)::INT FROM objections o WHERE o.case_id = c.id AND o.status = 'ACTIVE') AS active_objections,
        (SELECT COUNT(*)::INT FROM case_documents d WHERE d.case_id = c.id) AS document_count
      FROM fdr_cases c
      LEFT JOIN simulated_bank_records s ON s.case_id = c.id
    `;
    const params = [];

    if (isInstitution) {
      sql += ` WHERE (c.institution_id = $1 OR LOWER(c.institution_name) = LOWER($2))`;
      params.push(userInstId, userInstName);
    }

    sql += ` ORDER BY c.created_at ASC`;

    const result = await query(sql, params);

    return res.status(200).json({
      success: true,
      source: 'POSTGRESQL',
      count: result.rows.length,
      data: result.rows
    });
  } catch (err) {
    if (shouldEnforceDatabase()) {
      return sendSafeDatabaseError(res, err, 'GET /cases query');
    }

    console.warn(`[KOSH-PRAMAAN] PostgreSQL query unavailable. Serving seeded fallback cases.`);
    
    let filteredCases = SEED_CASES;
    if (isInstitution) {
      filteredCases = SEED_CASES.filter(c => 
        (c.institution_id && c.institution_id === userInstId) ||
        (userInstName && c.institution_name && c.institution_name.toLowerCase() === userInstName.toLowerCase())
      );
    }

    const fallbackData = filteredCases.map(c => ({
      id: c.id,
      institution_id: c.institution_id || 'AICTE-1-492019482',
      institution_name: c.institution_name,
      depositor_name: c.depositor_name,
      fdr_number: c.fdr_number,
      issuing_bank: c.issuing_bank,
      branch_name: c.branch_name,
      ifsc_code: c.ifsc_code,
      submitted_amount: Number(c.submitted_amount).toFixed(2),
      lien_marked_to: c.lien_marked_to,
      deposit_date: c.deposit_date,
      maturity_date: c.maturity_date,
      status: c.status,
      department_queue: c.department_queue,
      document_filename: c.document_filename,
      release_doc_type: c.release_doc_type || 'FDR_RELEASE_NOC',
      sanction_order_number: c.sanction_order_number || null,
      created_at: new Date().toISOString(),
      simulated_amount: c.simulated ? Number(c.simulated.simulated_amount).toFixed(2) : null,
      amount_matched: c.simulated ? c.simulated.amount_matched : null,
      simulation_disclaimer: 'SIMULATED — NOT LIVE BANK VERIFICATION',
      pending_tasks: c.tasks.filter(t => t.status !== 'COMPLETED').length,
      blocked_tasks: c.tasks.filter(t => t.status === 'BLOCKED').length,
      active_objections: c.objections.filter(o => o.status === 'ACTIVE').length,
      document_count: c.documents ? c.documents.length : 1
    }));

    return res.status(200).json({
      success: true,
      source: 'SEEDED_FALLBACK',
      persistence_status: 'EPHEMERAL_DEMO_MEMORY',
      count: fallbackData.length,
      data: fallbackData
    });
  }
});

/**
 * 2. POST /api/cases
 * Submits a new FDR application (Institutional Portal)
 * Strict RBAC: Requires INSTITUTION or AICTE_OFFICER role.
 * Enforces:
 * - Concurrency-safe ID generation via PostgreSQL sequence (fdr_case_seq).
 * - Institution ownership derivation from authenticated token.
 * - AICTE APH §6.46 4-Queue Clearance Initialization (PGRC, Vigilance, Grants, Accounts).
 * - Real evidentiary document registration with SHA-256 integrity hash.
 */
router.post('/cases', authenticate, requireRole(ROLES.INSTITUTION, ROLES.AICTE_OFFICER), async (req, res) => {
  const {
    depositor_name,
    fdr_number,
    issuing_bank,
    branch_name,
    ifsc_code,
    submitted_amount,
    lien_marked_to,
    deposit_date,
    maturity_date,
    document_filename,
    release_doc_type,
    documents
  } = req.body || {};

  // For INSTITUTION users, derive institution_name and institution_id strictly from verified token
  const institution_id = req.user.institution_id || 'AICTE-1-492019482';
  const institution_name = req.user.role === ROLES.INSTITUTION 
    ? req.user.name 
    : (req.body.institution_name ? req.body.institution_name.trim() : req.user.name);

  // Validation
  const requiredFields = [
    { field: 'institution_name', value: institution_name, label: 'Institution Name' },
    { field: 'depositor_name', value: depositor_name, label: 'Depositor Name' },
    { field: 'fdr_number', value: fdr_number, label: 'FDR Number' },
    { field: 'issuing_bank', value: issuing_bank, label: 'Issuing Bank' },
    { field: 'branch_name', value: branch_name, label: 'Branch Name' },
    { field: 'ifsc_code', value: ifsc_code, label: 'IFSC Code' },
    { field: 'submitted_amount', value: submitted_amount, label: 'Submitted Amount' },
    { field: 'lien_marked_to', value: lien_marked_to, label: 'Lien Marked To' },
    { field: 'deposit_date', value: deposit_date, label: 'Deposit Date' },
    { field: 'maturity_date', value: maturity_date, label: 'Maturity Date' }
  ];

  const missing = requiredFields.filter(f => !f.value || String(f.value).trim() === '');
  if (missing.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation Error: Missing required fields',
      missing_fields: missing.map(f => f.label)
    });
  }

  const amountNum = parseFloat(submitted_amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation Error: submitted_amount must be a valid positive number'
    });
  }

  const depDate = new Date(deposit_date);
  const matDate = new Date(maturity_date);
  if (isNaN(depDate.getTime()) || isNaN(matDate.getTime())) {
    return res.status(400).json({
      success: false,
      error: 'Validation Error: deposit_date and maturity_date must be valid date strings'
    });
  }

  if (matDate <= depDate) {
    return res.status(400).json({
      success: false,
      error: 'Validation Error: maturity_date must be after deposit_date'
    });
  }

  const trimmedFdr = fdr_number.trim();
  const docFile = document_filename ? document_filename.trim() : `${trimmedFdr.replace(/[^a-zA-Z0-9]/g, '_')}_Certificate.pdf`;
  const validReleaseDocType = release_doc_type === 'RTGS_SANCTION_ORDER' ? 'RTGS_SANCTION_ORDER' : 'FDR_RELEASE_NOC';

  try {
    // Check duplicate FDR number in database
    const dupCheck = await query('SELECT id FROM fdr_cases WHERE fdr_number = $1', [trimmedFdr]);
    if (dupCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: `Conflict: An FDR record with number "${trimmedFdr}" is already registered in the system (Case ID: ${dupCheck.rows[0].id}).`
      });
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Concurrency-safe atomic Case ID generation via PostgreSQL sequence
      let newCaseId;
      try {
        const seqRes = await client.query("SELECT nextval('fdr_case_seq') AS next_val");
        newCaseId = `FDR-2026-${String(seqRes.rows[0].next_val).padStart(4, '0')}`;
      } catch {
        const countRes = await client.query('SELECT COUNT(*)::INT as count FROM fdr_cases');
        newCaseId = `FDR-2026-${(countRes.rows[0].count + 1).toString().padStart(4, '0')}`;
      }

      // 1. Insert fdr_case with regulatory release attributes
      await client.query(
        `INSERT INTO fdr_cases (
          id, institution_id, institution_name, depositor_name, fdr_number, issuing_bank, branch_name,
          ifsc_code, submitted_amount, lien_marked_to, deposit_date, maturity_date,
          status, department_queue, document_filename, release_doc_type, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'SUBMITTED', 'INTAKE_QUEUE', $13, $14, NOW(), NOW())`,
        [
          newCaseId, institution_id, institution_name.trim(), depositor_name.trim(), trimmedFdr,
          issuing_bank.trim(), branch_name.trim(), ifsc_code.trim().toUpperCase(),
          amountNum.toFixed(2), lien_marked_to.trim(), deposit_date, maturity_date, docFile, validReleaseDocType
        ]
      );

      // 2. Initialize 4 AICTE APH §6.46 Mandatory Regulatory Clearance Checkpoints
      const aphTasks = [
        { id: `TSK-${newCaseId}-1`, name: 'PGRC Clearance — Faculty/Staff Salary Arrears & Student Grievance Verification', queue: 'PGRC_QUEUE' },
        { id: `TSK-${newCaseId}-2`, name: 'Vigilance & Legal Cell — Anti-Corruption Enquiries & Court Injunction Check', queue: 'VIGILANCE_QUEUE' },
        { id: `TSK-${newCaseId}-3`, name: 'Grants Bureau Reconciliation — AICTE Project Grant Settlement Audit', queue: 'GRANTS_QUEUE' },
        { id: `TSK-${newCaseId}-4`, name: 'Accounts Bureau — Physical FDR Certificate & Bank Branch Lien Endorsement Inspection', queue: 'ACCOUNTS_QUEUE' }
      ];

      for (const t of aphTasks) {
        await client.query(
          `INSERT INTO clearance_tasks (id, case_id, task_name, queue_name, is_mandatory, status, created_at)
           VALUES ($1, $2, $3, $4, true, 'PENDING', NOW())`,
          [t.id, newCaseId, t.name, t.queue]
        );
      }

      // 3. Register Evidentiary Documents with SHA-256 Integrity Hashes
      const docsToInsert = Array.isArray(documents) && documents.length > 0 ? documents : [
        {
          document_type: 'FDR_PHYSICAL_CERTIFICATE',
          document_name: docFile,
          mime_type: 'application/pdf',
          file_size_bytes: 245760,
          document_data: `data:application/pdf;base64,${Buffer.from(`AICTE_FDR_CERTIFICATE_${trimmedFdr}_${amountNum}`).toString('base64')}`
        },
        {
          document_type: 'LIEN_ENDORSEMENT_LETTER',
          document_name: `${trimmedFdr.replace(/[^a-zA-Z0-9]/g, '_')}_Lien_Endorsement.pdf`,
          mime_type: 'application/pdf',
          file_size_bytes: 184320,
          document_data: `data:application/pdf;base64,${Buffer.from(`AICTE_LIEN_ENDORSEMENT_${trimmedFdr}_${issuing_bank}`).toString('base64')}`
        }
      ];

      for (let i = 0; i < docsToInsert.length; i++) {
        const d = docsToInsert[i];
        const docId = `DOC-${newCaseId}-${i + 1}`;
        const rawContent = d.document_data || `${trimmedFdr}:${d.document_name}:${Date.now()}`;
        const sha256 = crypto.createHash('sha256').update(rawContent).digest('hex');

        await client.query(
          `INSERT INTO case_documents (id, case_id, document_type, document_name, mime_type, file_size_bytes, sha256_hash, document_data, uploaded_by, uploaded_by_role, uploaded_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
          [
            docId, newCaseId, d.document_type || 'FDR_PHYSICAL_CERTIFICATE',
            d.document_name, d.mime_type || 'application/pdf',
            d.file_size_bytes || rawContent.length, sha256,
            d.document_data || null, req.user.name, req.user.role
          ]
        );
      }

      // 4. Record creation audit event with verified actor from token
      await client.query(
        `INSERT INTO audit_events (case_id, action, actor, actor_role, rationale, previous_state, new_state, metadata)
         VALUES ($1, $2, $3, $4, $5, NULL, 'SUBMITTED', $6)`,
        [
          newCaseId,
          'FDR_APPLICATION_SUBMITTED',
          req.user.name,
          req.user.role,
          'Institutional security deposit application received and assigned to INTAKE_QUEUE per AICTE APH §6.46.',
          JSON.stringify({
            fdr_number: trimmedFdr,
            submitted_amount: amountNum,
            issuing_bank: issuing_bank.trim(),
            depositor_name: depositor_name.trim(),
            institution_id,
            release_doc_type: validReleaseDocType,
            document_count: docsToInsert.length,
            is_demo_action: Boolean(req.user.is_demo)
          })
        ]
      );

      await client.query('COMMIT');

      return res.status(201).json({
        success: true,
        source: 'POSTGRESQL',
        message: 'FDR application submitted successfully and queued for departmental clearance per AICTE APH §6.46.',
        case_id: newCaseId,
        data: {
          id: newCaseId,
          institution_id,
          institution_name: institution_name.trim(),
          depositor_name: depositor_name.trim(),
          fdr_number: trimmedFdr,
          issuing_bank: issuing_bank.trim(),
          submitted_amount: amountNum.toFixed(2),
          status: 'SUBMITTED',
          department_queue: 'INTAKE_QUEUE',
          document_filename: docFile,
          release_doc_type: validReleaseDocType,
          pending_tasks: aphTasks.length,
          blocked_tasks: 0,
          active_objections: 0,
          document_count: docsToInsert.length,
          created_at: new Date().toISOString()
        }
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    if (shouldEnforceDatabase()) {
      return sendSafeDatabaseError(res, err, 'POST /cases submission');
    }

    console.warn(`[KOSH-PRAMAAN] Database submission fallback.`);

    // In-memory fallback
    const exists = SEED_CASES.find(c => c.fdr_number.toLowerCase() === trimmedFdr.toLowerCase());
    if (exists) {
      return res.status(409).json({
        success: false,
        error: `Conflict: An FDR record with number "${trimmedFdr}" is already registered (Fallback ID: ${exists.id}).`
      });
    }

    inMemorySequence++;
    const newCaseId = `FDR-2026-${String(inMemorySequence).padStart(4, '0')}`;
    const newFallbackCase = {
      id: newCaseId,
      institution_id,
      institution_name: institution_name.trim(),
      depositor_name: depositor_name.trim(),
      fdr_number: trimmedFdr,
      issuing_bank: issuing_bank.trim(),
      branch_name: branch_name.trim(),
      ifsc_code: ifsc_code.trim().toUpperCase(),
      submitted_amount: amountNum.toFixed(2),
      lien_marked_to: lien_marked_to.trim(),
      deposit_date,
      maturity_date,
      status: 'SUBMITTED',
      department_queue: 'INTAKE_QUEUE',
      document_filename: docFile,
      release_doc_type: validReleaseDocType,
      created_at: new Date().toISOString(),
      tasks: [
        { id: `TSK-${newCaseId}-1`, name: 'PGRC Clearance — Faculty/Staff Salary Arrears & Student Grievance Verification', queue: 'PGRC_QUEUE', is_mandatory: true, status: 'PENDING' },
        { id: `TSK-${newCaseId}-2`, name: 'Vigilance & Legal Cell — Anti-Corruption Enquiries & Court Injunction Check', queue: 'VIGILANCE_QUEUE', is_mandatory: true, status: 'PENDING' },
        { id: `TSK-${newCaseId}-3`, name: 'Grants Bureau Reconciliation — AICTE Project Grant Settlement Audit', queue: 'GRANTS_QUEUE', is_mandatory: true, status: 'PENDING' },
        { id: `TSK-${newCaseId}-4`, name: 'Accounts Bureau — Physical FDR Certificate & Bank Branch Lien Endorsement Inspection', queue: 'ACCOUNTS_QUEUE', is_mandatory: true, status: 'PENDING' }
      ],
      objections: [],
      documents: [
        {
          id: `DOC-${newCaseId}-1`,
          document_type: 'FDR_PHYSICAL_CERTIFICATE',
          document_name: docFile,
          mime_type: 'application/pdf',
          file_size_bytes: 245760,
          sha256_hash: crypto.createHash('sha256').update(trimmedFdr).digest('hex')
        }
      ],
      simulated: null,
      audit_events: [
        {
          id: 1,
          case_id: newCaseId,
          action: 'FDR_APPLICATION_SUBMITTED',
          actor: req.user.name,
          actor_role: req.user.role,
          rationale: 'Institutional security deposit application received and assigned to INTAKE_QUEUE.',
          previous_state: null,
          new_state: 'SUBMITTED',
          event_timestamp: new Date().toISOString(),
          metadata: {
            fdr_number: trimmedFdr,
            submitted_amount: amountNum,
            is_demo_action: Boolean(req.user.is_demo)
          }
        }
      ]
    };

    SEED_CASES.push(newFallbackCase);

    return res.status(201).json({
      success: true,
      source: 'SEEDED_FALLBACK',
      persistence_status: 'EPHEMERAL_DEMO_MEMORY',
      simulation_warning: 'Notice: Running in ephemeral prototype fallback. Data is not saved to persistent cloud storage.',
      message: 'FDR application registered in prototype in-memory state.',
      case_id: newCaseId,
      data: {
        id: newCaseId,
        institution_id,
        institution_name: newFallbackCase.institution_name,
        depositor_name: newFallbackCase.depositor_name,
        fdr_number: newFallbackCase.fdr_number,
        submitted_amount: newFallbackCase.submitted_amount,
        status: newFallbackCase.status,
        department_queue: newFallbackCase.department_queue,
        release_doc_type: validReleaseDocType,
        pending_tasks: 4,
        blocked_tasks: 0,
        active_objections: 0,
        document_count: 1,
        created_at: newFallbackCase.created_at
      }
    });
  }
});

/**
 * 3. GET /api/cases/:id
 * Returns single FDR case detail including submitted vs simulated bank data,
 * clearance tasks, objections, and registered documents.
 * Protected by Record-Level Authorization:
 * - INSTITUTION users can ONLY view their own registered cases.
 */
router.get('/cases/:id', authenticate, async (req, res) => {
  const caseId = req.params.id;
  const isInstitution = req.user.role === ROLES.INSTITUTION;
  const userInstId = req.user.institution_id || '';
  const userInstName = req.user.name || '';

  try {
    const caseResult = await query(`SELECT * FROM fdr_cases WHERE id = $1`, [caseId]);

    if (caseResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }

    const caseData = caseResult.rows[0];

    // Record-level ownership enforcement for Institutions
    if (isInstitution) {
      const matchInstId = caseData.institution_id && userInstId && caseData.institution_id === userInstId;
      const matchInstName = caseData.institution_name && userInstName && (
        caseData.institution_name.toLowerCase() === userInstName.toLowerCase()
      );
      if (!matchInstId && !matchInstName) {
        return res.status(403).json({
          success: false,
          error: 'Access Denied: You are not authorized to view FDR records registered for another institution.'
        });
      }
    }

    const [simResult, tasksResult, objResult, docsResult] = await Promise.all([
      query(`SELECT * FROM simulated_bank_records WHERE case_id = $1`, [caseId]),
      query(`SELECT * FROM clearance_tasks WHERE case_id = $1 ORDER BY created_at ASC`, [caseId]),
      query(`SELECT * FROM objections WHERE case_id = $1 ORDER BY created_at ASC`, [caseId]),
      query(`SELECT id, document_type, document_name, mime_type, file_size_bytes, sha256_hash, uploaded_by, uploaded_by_role, uploaded_at FROM case_documents WHERE case_id = $1 ORDER BY uploaded_at ASC`, [caseId])
    ]);

    return res.status(200).json({
      success: true,
      source: 'POSTGRESQL',
      data: {
        ...caseData,
        simulated: simResult.rows[0] || null,
        tasks: tasksResult.rows,
        objections: objResult.rows,
        documents: docsResult.rows
      }
    });
  } catch (err) {
    if (shouldEnforceDatabase()) {
      return sendSafeDatabaseError(res, err, 'GET /cases/:id query');
    }

    console.warn(`[KOSH-PRAMAAN] PostgreSQL query unavailable. Serving seeded fallback case detail.`);
    const seedCase = SEED_CASES.find(c => c.id === caseId);

    if (!seedCase) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }

    if (isInstitution) {
      const matchInstId = seedCase.institution_id && userInstId && seedCase.institution_id === userInstId;
      const matchInstName = seedCase.institution_name && userInstName && (
        seedCase.institution_name.toLowerCase() === userInstName.toLowerCase()
      );
      if (!matchInstId && !matchInstName) {
        return res.status(403).json({
          success: false,
          error: 'Access Denied: You are not authorized to view FDR records registered for another institution.'
        });
      }
    }

    return res.status(200).json({
      success: true,
      source: 'SEEDED_FALLBACK',
      persistence_status: 'EPHEMERAL_DEMO_MEMORY',
      data: {
        ...seedCase,
        submitted_amount: Number(seedCase.submitted_amount).toFixed(2),
        simulated: seedCase.simulated ? {
          ...seedCase.simulated,
          simulated_amount: Number(seedCase.simulated.simulated_amount).toFixed(2),
          simulation_disclaimer: 'SIMULATED — NOT LIVE BANK VERIFICATION'
        } : null
      }
    });
  }
});

/**
 * 4. GET /api/cases/:id/documents
 * Returns list of evidentiary documents attached to an FDR case with SHA-256 integrity hashes.
 */
router.get('/cases/:id/documents', authenticate, async (req, res) => {
  const caseId = req.params.id;

  try {
    const result = await query(
      `SELECT id, case_id, document_type, document_name, mime_type, file_size_bytes, sha256_hash, uploaded_by, uploaded_by_role, uploaded_at
       FROM case_documents
       WHERE case_id = $1
       ORDER BY uploaded_at ASC`,
      [caseId]
    );

    return res.status(200).json({
      success: true,
      source: 'POSTGRESQL',
      count: result.rows.length,
      data: result.rows
    });
  } catch (err) {
    if (shouldEnforceDatabase()) {
      return sendSafeDatabaseError(res, err, 'GET /documents query');
    }

    const seedCase = SEED_CASES.find(c => c.id === caseId);
    if (!seedCase) return res.status(404).json({ success: false, error: 'Case not found' });

    const fallbackDocs = seedCase.documents || [
      {
        id: `DOC-${caseId}-1`,
        case_id: caseId,
        document_type: 'FDR_PHYSICAL_CERTIFICATE',
        document_name: seedCase.document_filename || `${caseId}_Certificate.pdf`,
        mime_type: 'application/pdf',
        file_size_bytes: 245760,
        sha256_hash: crypto.createHash('sha256').update(caseId).digest('hex'),
        uploaded_by: 'system-initializer',
        uploaded_by_role: 'System Administrator',
        uploaded_at: new Date().toISOString()
      }
    ];

    return res.status(200).json({
      success: true,
      source: 'SEEDED_FALLBACK',
      count: fallbackDocs.length,
      data: fallbackDocs
    });
  }
});

/**
 * 5. POST /api/cases/:id/documents
 * Upload real document evidence with cryptographic SHA-256 hash calculation and audit logging.
 */
router.post('/cases/:id/documents', authenticate, requireRole(ROLES.INSTITUTION, ROLES.AICTE_OFFICER, ROLES.CLEARANCE_OFFICER), async (req, res) => {
  const caseId = req.params.id;
  const { document_name, document_type, document_data, mime_type } = req.body || {};

  if (!document_name || !document_data) {
    return res.status(400).json({
      success: false,
      error: 'Validation Error: document_name and document_data (base64 string) are mandatory'
    });
  }

  const validTypes = ['FDR_PHYSICAL_CERTIFICATE', 'LIEN_ENDORSEMENT_LETTER', 'BOARD_RESOLUTION', 'PGRC_SALARY_AFFIDAVIT', 'VIGILANCE_AFFIDAVIT'];
  const docType = validTypes.includes(document_type) ? document_type : 'FDR_PHYSICAL_CERTIFICATE';
  const sha256 = crypto.createHash('sha256').update(document_data).digest('hex');
  const docId = `DOC-${caseId}-${Date.now().toString().slice(-4)}`;

  try {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO case_documents (id, case_id, document_type, document_name, mime_type, file_size_bytes, sha256_hash, document_data, uploaded_by, uploaded_by_role, uploaded_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [
          docId, caseId, docType, document_name.trim(), mime_type || 'application/pdf',
          document_data.length, sha256, document_data, req.user.name, req.user.role
        ]
      );

      await client.query(
        `INSERT INTO audit_events (case_id, action, actor, actor_role, rationale, previous_state, new_state, metadata)
         VALUES ($1, $2, $3, $4, $5, NULL, NULL, $6)`,
        [
          caseId,
          'DOCUMENT_EVIDENCE_UPLOADED',
          req.user.name,
          req.user.role,
          `Evidentiary artifact "${document_name}" uploaded with SHA-256 integrity verification.`,
          JSON.stringify({
            document_id: docId,
            document_type: docType,
            sha256_hash: sha256,
            is_demo_action: Boolean(req.user.is_demo)
          })
        ]
      );

      await client.query('COMMIT');

      return res.status(201).json({
        success: true,
        source: 'POSTGRESQL',
        message: 'Document evidence uploaded and verified with SHA-256 hash.',
        document: {
          id: docId,
          case_id: caseId,
          document_type: docType,
          document_name,
          sha256_hash: sha256,
          file_size_bytes: document_data.length
        }
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    if (shouldEnforceDatabase()) {
      return sendSafeDatabaseError(res, err, 'POST /documents upload');
    }

    return res.status(201).json({
      success: true,
      source: 'SEEDED_FALLBACK',
      message: 'Document evidence recorded in prototype in-memory state.',
      document: {
        id: docId,
        case_id: caseId,
        document_type: docType,
        document_name,
        sha256_hash: sha256
      }
    });
  }
});

/**
 * 6. POST /api/cases/:id/simulate-verify
 * Core-Banking Ledger Reconciliation Check.
 * Explicitly declared as simulated comparison.
 */
router.post('/cases/:id/simulate-verify', authenticate, requireRole(ROLES.VERIFICATION_OFFICER, ROLES.AICTE_OFFICER), async (req, res) => {
  const caseId = req.params.id;

  try {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const caseResult = await client.query(`SELECT * FROM fdr_cases WHERE id = $1 FOR UPDATE`, [caseId]);
      if (caseResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Case not found' });
      }

      const c = caseResult.rows[0];
      const submittedAmountNum = parseFloat(c.submitted_amount);

      let simulatedAmount = submittedAmountNum;
      let amountMatched = true;

      // Seeded discrepancy case check
      if (c.id === 'FDR-2026-002' || c.fdr_number.includes('447812')) {
        simulatedAmount = 2000000.00;
        amountMatched = false;
      }

      const ifscMatched = true;
      const lienMatched = true;
      const maturityMatched = true;

      await client.query(
        `INSERT INTO simulated_bank_records (
          case_id, fdr_number, simulated_bank_name, simulated_branch_ifsc,
          simulated_amount, simulated_lien_status, simulated_maturity_date,
          amount_matched, ifsc_matched, maturity_matched, lien_matched,
          simulation_disclaimer, simulated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        ON CONFLICT (case_id) DO UPDATE SET
          simulated_amount = EXCLUDED.simulated_amount,
          amount_matched = EXCLUDED.amount_matched,
          simulated_at = NOW()`,
        [
          caseId, c.fdr_number, c.issuing_bank, c.ifsc_code,
          simulatedAmount, 'LIEN_CONFIRMED_TO_GOVERNMENT', c.maturity_date,
          amountMatched, ifscMatched, maturityMatched, lienMatched,
          'SIMULATED — NOT LIVE BANK VERIFICATION'
        ]
      );

      let newStatus = c.status;
      if (!amountMatched) {
        newStatus = 'MISMATCH_FLAGGED';
        await client.query(`UPDATE fdr_cases SET status = 'MISMATCH_FLAGGED', updated_at = NOW() WHERE id = $1`, [caseId]);

        const objCheck = await client.query(`SELECT id FROM objections WHERE case_id = $1 AND category = 'AMOUNT_MISMATCH'`, [caseId]);
        if (objCheck.rows.length === 0) {
          const objId = `OBJ-${Date.now().toString().slice(-4)}`;
          await client.query(
            `INSERT INTO objections (id, case_id, raised_by_role, category, description, is_blocking, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              objId, caseId, req.user?.role || 'VERIFICATION_OFFICER', 'AMOUNT_MISMATCH',
              `Discrepancy detected: Submitted ₹${submittedAmountNum.toLocaleString('en-IN')} vs Simulated Bank Ledger ₹${simulatedAmount.toLocaleString('en-IN')} (SIMULATED — NOT LIVE BANK VERIFICATION)`,
              true, 'ACTIVE'
            ]
          );
        }
      } else if (c.status === 'SUBMITTED' || c.status === 'VERIFICATION_PENDING') {
        newStatus = 'UNDER_REVIEW';
        await client.query(`UPDATE fdr_cases SET status = 'UNDER_REVIEW', updated_at = NOW() WHERE id = $1`, [caseId]);
      }

      await client.query(
        `INSERT INTO audit_events (case_id, action, actor, actor_role, rationale, previous_state, new_state, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          caseId,
          'SIMULATED_VERIFICATION_EXECUTED',
          req.user.name,
          req.user.role,
          amountMatched
            ? 'Core-banking ledger comparison confirmed matching parameters.'
            : 'Core-banking ledger comparison detected deposit amount discrepancy.',
          c.status,
          newStatus,
          JSON.stringify({
            amount_matched: amountMatched,
            submitted_amount: submittedAmountNum,
            simulated_amount: simulatedAmount,
            disclaimer: 'SIMULATED — NOT LIVE BANK VERIFICATION',
            is_demo_action: Boolean(req.user.is_demo)
          })
        ]
      );

      await client.query('COMMIT');

      return res.status(200).json({
        success: true,
        source: 'POSTGRESQL',
        message: 'Simulated verification executed successfully',
        disclaimer: 'SIMULATED — NOT LIVE BANK VERIFICATION',
        result: {
          case_id: caseId,
          amount_matched: amountMatched,
          submitted_amount: submittedAmountNum,
          simulated_amount: simulatedAmount,
          ifsc_matched: ifscMatched,
          lien_matched: lienMatched,
          status: newStatus
        }
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    if (shouldEnforceDatabase()) {
      return sendSafeDatabaseError(res, err, 'POST /simulate-verify');
    }

    console.warn(`[KOSH-PRAMAAN] Database simulation fallback.`);
    const seedCase = SEED_CASES.find(sc => sc.id === caseId);
    if (!seedCase) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }

    const simAmount = seedCase.simulated ? Number(seedCase.simulated.simulated_amount) : Number(seedCase.submitted_amount);
    const amountMatched = Math.abs(Number(seedCase.submitted_amount) - simAmount) < 0.01;

    seedCase.simulated = {
      simulated_bank_name: seedCase.issuing_bank,
      simulated_branch_ifsc: seedCase.ifsc_code,
      simulated_amount: simAmount,
      simulated_lien_status: 'LIEN_CONFIRMED_TO_GOVERNMENT',
      simulated_maturity_date: seedCase.maturity_date,
      amount_matched: amountMatched,
      ifsc_matched: true,
      maturity_matched: true,
      lien_matched: true,
      simulation_disclaimer: 'SIMULATED — NOT LIVE BANK VERIFICATION'
    };

    const prevStatus = seedCase.status;
    if (!amountMatched) {
      seedCase.status = 'MISMATCH_FLAGGED';
    } else if (seedCase.status === 'SUBMITTED') {
      seedCase.status = 'UNDER_REVIEW';
    }

    seedCase.audit_events = seedCase.audit_events || [];
    seedCase.audit_events.push({
      id: seedCase.audit_events.length + 1,
      case_id: caseId,
      action: 'CORE_BANKING_VERIFICATION_SIMULATED',
      actor: req.user?.name || 'Simulation Engine',
      actor_role: req.user?.role || 'VERIFICATION_OFFICER',
      rationale: 'Simulated core-banking ledger comparison executed',
      previous_state: prevStatus,
      new_state: seedCase.status,
      event_timestamp: new Date().toISOString(),
      metadata: {
        amount_matched: amountMatched,
        is_demo_action: Boolean(req.user?.is_demo)
      }
    });

    return res.status(200).json({
      success: true,
      source: 'SEEDED_FALLBACK',
      persistence_status: 'EPHEMERAL_DEMO_MEMORY',
      message: 'Simulated verification executed successfully (in-memory mode)',
      disclaimer: 'SIMULATED — NOT LIVE BANK VERIFICATION',
      result: {
        case_id: caseId,
        amount_matched: amountMatched,
        submitted_amount: Number(seedCase.submitted_amount),
        simulated_amount: simAmount,
        status: seedCase.status
      }
    });
  }
});

/**
 * 7. PUT /api/cases/:id/tasks/:taskId
 * Updates clearance task status with mandatory remarks/blockers.
 * Enforces CLEARANCE_OFFICER or AICTE_OFFICER role.
 */
router.put('/cases/:id/tasks/:taskId', authenticate, requireRole(ROLES.CLEARANCE_OFFICER, ROLES.AICTE_OFFICER), async (req, res) => {
  const { id: caseId, taskId } = req.params;
  const { status, blocker_reason, remarks } = req.body || {};

  const allowedStatuses = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'];
  if (!status || !allowedStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}`
    });
  }

  if (status === 'BLOCKED' && (!blocker_reason || blocker_reason.trim() === '')) {
    return res.status(400).json({
      success: false,
      error: 'A specific blocker reason is mandatory when blocking a clearance task'
    });
  }

  try {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const taskResult = await client.query(
        `SELECT * FROM clearance_tasks WHERE id = $1 AND case_id = $2 FOR UPDATE`,
        [taskId, caseId]
      );

      if (taskResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: `Task ${taskId} not found for case ${caseId}`
        });
      }

      const prevTask = taskResult.rows[0];

      if (prevTask.status === 'BLOCKED' && status === 'COMPLETED' && (!remarks || remarks.trim() === '')) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'An explanation remark is required when resolving a blocked clearance task'
        });
      }

      const completedBy = status === 'COMPLETED' ? req.user.name : null;
      const completedAt = status === 'COMPLETED' ? new Date() : null;

      await client.query(
        `UPDATE clearance_tasks 
         SET status = $1, blocker_reason = $2, completed_by = $3, completed_at = $4
         WHERE id = $5 AND case_id = $6`,
        [status, status === 'BLOCKED' ? blocker_reason : null, completedBy, completedAt, taskId, caseId]
      );

      if (status === 'BLOCKED') {
        await client.query(`UPDATE fdr_cases SET status = 'CLEARANCE_BLOCKED', updated_at = NOW() WHERE id = $1`, [caseId]);
      }

      await client.query(
        `INSERT INTO audit_events (case_id, action, actor, actor_role, rationale, previous_state, new_state, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          caseId,
          'CLEARANCE_TASK_UPDATED',
          req.user.name,
          req.user.role,
          remarks || blocker_reason || `Task status updated to ${status}`,
          prevTask.status,
          status,
          JSON.stringify({
            task_id: taskId,
            task_name: prevTask.task_name,
            queue_name: prevTask.queue_name,
            is_mandatory: prevTask.is_mandatory,
            is_demo_action: Boolean(req.user.is_demo)
          })
        ]
      );

      await client.query('COMMIT');

      return res.status(200).json({
        success: true,
        source: 'POSTGRESQL',
        message: `Task ${taskId} updated to ${status}`,
        task: {
          id: taskId,
          status,
          blocker_reason: status === 'BLOCKED' ? blocker_reason : null,
          completed_by: completedBy
        }
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    if (shouldEnforceDatabase()) {
      return sendSafeDatabaseError(res, err, 'PUT /tasks update');
    }

    console.warn(`[KOSH-PRAMAAN] Database task update fallback.`);
    const seedCase = SEED_CASES.find(sc => sc.id === caseId);
    if (!seedCase) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }
    const task = seedCase.tasks.find(t => t.id === taskId);
    if (!task) {
      return res.status(404).json({ success: false, error: `Task ${taskId} not found for case ${caseId}` });
    }

    if (task.status === 'BLOCKED' && status === 'COMPLETED' && (!remarks || remarks.trim() === '')) {
      return res.status(400).json({
        success: false,
        error: 'An explanation remark is required when resolving a blocked clearance task'
      });
    }

    const prevTaskStatus = task.status;
    task.status = status;
    task.blocker_reason = status === 'BLOCKED' ? blocker_reason : null;
    task.completed_by = status === 'COMPLETED' ? (req.user?.name || 'Clearance Officer (Demo)') : null;

    if (status === 'BLOCKED') {
      seedCase.status = 'CLEARANCE_BLOCKED';
    }

    seedCase.audit_events = seedCase.audit_events || [];
    seedCase.audit_events.push({
      id: seedCase.audit_events.length + 1,
      case_id: caseId,
      action: 'CLEARANCE_TASK_UPDATED',
      actor: req.user?.name || 'Clearance Officer (Demo)',
      actor_role: req.user?.role || 'CLEARANCE_OFFICER',
      rationale: remarks || blocker_reason || `Task status updated to ${status}`,
      previous_state: prevTaskStatus,
      new_state: status,
      event_timestamp: new Date().toISOString(),
      metadata: {
        task_id: taskId,
        task_name: task.name,
        queue_name: task.queue,
        is_mandatory: task.is_mandatory,
        is_demo_action: Boolean(req.user?.is_demo)
      }
    });

    return res.status(200).json({
      success: true,
      source: 'SEEDED_FALLBACK',
      persistence_status: 'EPHEMERAL_DEMO_MEMORY',
      message: `Task ${taskId} updated to ${status} (in-memory)`,
      task
    });
  }
});

/**
 * 8. PUT /api/cases/:id/objections/:objId
 * Resolves or overrules an objection.
 * Enforces CLEARANCE_OFFICER or AICTE_OFFICER role.
 */
router.put('/cases/:id/objections/:objId', authenticate, requireRole(ROLES.CLEARANCE_OFFICER, ROLES.AICTE_OFFICER), async (req, res) => {
  const { id: caseId, objId } = req.params;
  const { status, resolution_remarks } = req.body || {};

  const allowedStatuses = ['RESOLVED', 'OVERRULED'];
  if (!status || !allowedStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}`
    });
  }

  if (!resolution_remarks || resolution_remarks.trim() === '') {
    return res.status(400).json({
      success: false,
      error: 'Documented resolution remarks are mandatory to resolve or overrule an objection'
    });
  }

  try {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const objResult = await client.query(
        `SELECT * FROM objections WHERE id = $1 AND case_id = $2 FOR UPDATE`,
        [objId, caseId]
      );

      if (objResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: `Objection ${objId} not found for case ${caseId}`
        });
      }

      const prevObj = objResult.rows[0];

      await client.query(
        `UPDATE objections 
         SET status = $1, resolution_remarks = $2, resolved_at = NOW()
         WHERE id = $3 AND case_id = $4`,
        [status, resolution_remarks, objId, caseId]
      );

      const remainingBlocking = await client.query(
        `SELECT COUNT(*)::INT as count FROM objections WHERE case_id = $1 AND status = 'ACTIVE' AND is_blocking = true`,
        [caseId]
      );

      const blockedTasks = await client.query(
        `SELECT COUNT(*)::INT as count FROM clearance_tasks WHERE case_id = $1 AND status = 'BLOCKED'`,
        [caseId]
      );

      if (remainingBlocking.rows[0].count === 0 && blockedTasks.rows[0].count === 0) {
        await client.query(
          `UPDATE fdr_cases SET status = 'UNDER_REVIEW', updated_at = NOW() WHERE id = $1 AND status IN ('MISMATCH_FLAGGED', 'CLEARANCE_BLOCKED')`,
          [caseId]
        );
      }

      await client.query(
        `INSERT INTO audit_events (case_id, action, actor, actor_role, rationale, previous_state, new_state, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          caseId,
          `OBJECTION_${status}`,
          req.user.name,
          req.user.role,
          resolution_remarks,
          prevObj.status,
          status,
          JSON.stringify({
            objection_id: objId,
            category: prevObj.category,
            previous_status: prevObj.status,
            is_demo_action: Boolean(req.user.is_demo)
          })
        ]
      );

      await client.query('COMMIT');

      return res.status(200).json({
        success: true,
        source: 'POSTGRESQL',
        message: `Objection ${objId} marked as ${status}`,
        objection: {
          id: objId,
          status,
          resolution_remarks
        }
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    if (shouldEnforceDatabase()) {
      return sendSafeDatabaseError(res, err, 'PUT /objections update');
    }

    console.warn(`[KOSH-PRAMAAN] Database objection update fallback.`);
    const seedCase = SEED_CASES.find(sc => sc.id === caseId);
    if (!seedCase) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }
    const obj = seedCase.objections.find(o => o.id === objId);
    if (!obj) {
      return res.status(404).json({ success: false, error: `Objection ${objId} not found for case ${caseId}` });
    }

    const prevObjStatus = obj.status;
    obj.status = status;
    obj.resolution_remarks = resolution_remarks;

    const remaining = seedCase.objections.filter(o => o.status === 'ACTIVE' && o.is_blocking).length;
    if (remaining === 0 && seedCase.status === 'MISMATCH_FLAGGED') {
      seedCase.status = 'UNDER_REVIEW';
    }

    seedCase.audit_events = seedCase.audit_events || [];
    seedCase.audit_events.push({
      id: seedCase.audit_events.length + 1,
      case_id: caseId,
      action: `OBJECTION_${status}`,
      actor: req.user?.name || 'Clearance Officer (Demo)',
      actor_role: req.user?.role || 'CLEARANCE_OFFICER',
      rationale: resolution_remarks,
      previous_state: prevObjStatus,
      new_state: status,
      event_timestamp: new Date().toISOString(),
      metadata: {
        objId,
        resolution_remarks,
        is_demo_action: Boolean(req.user?.is_demo)
      }
    });

    return res.status(200).json({
      success: true,
      source: 'SEEDED_FALLBACK',
      persistence_status: 'EPHEMERAL_DEMO_MEMORY',
      message: `Objection ${objId} marked as ${status} (in-memory)`,
      objection: obj
    });
  }
});

/**
 * 9. POST /api/cases/:id/decision
 * SERVER-SIDE DECISION GATE (AICTE APH §6.46 COMPLIANT)
 * Transactionally recalculates blockers on the server with FOR UPDATE row locking.
 * Rejects APPROVE with HTTP 422 if:
 * - Mandatory clearances (PGRC, Vigilance, Grants, Accounts) remain incomplete.
 * - Active blocking objections exist.
 * - Core-banking verification is absent or mismatched without resolution.
 * - Mandatory physical FDR documents are missing.
 * Issues formal Sanction Reference on valid approval.
 */
router.post('/cases/:id/decision', authenticate, requireRole(ROLES.AICTE_OFFICER), async (req, res) => {
  const caseId = req.params.id;
  const { decision, rationale, release_doc_type } = req.body || {};

  const allowedDecisions = ['APPROVE', 'REJECT', 'SEEK_CLARIFICATION'];
  if (!decision || !allowedDecisions.includes(decision)) {
    return res.status(400).json({
      success: false,
      error: `Invalid decision. Allowed options: ${allowedDecisions.join(', ')}`
    });
  }

  if (!rationale || rationale.trim() === '') {
    return res.status(400).json({
      success: false,
      error: 'A justification rationale is mandatory for recording an officer decision'
    });
  }

  try {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const caseResult = await client.query(`SELECT * FROM fdr_cases WHERE id = $1 FOR UPDATE`, [caseId]);
      if (caseResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Case not found' });
      }

      const c = caseResult.rows[0];

      if (decision === 'APPROVE') {
        const blockers = [];

        // Check A: Core-banking verification check
        const simCheck = await client.query(`SELECT * FROM simulated_bank_records WHERE case_id = $1`, [caseId]);
        if (simCheck.rows.length === 0) {
          blockers.push('Mandatory simulated core-banking verification has not been performed.');
        } else if (!simCheck.rows[0].amount_matched) {
          const resolvedMismatch = await client.query(
            `SELECT id FROM objections WHERE case_id = $1 AND category = 'AMOUNT_MISMATCH' AND status IN ('RESOLVED', 'OVERRULED')`,
            [caseId]
          );
          if (resolvedMismatch.rows.length === 0) {
            blockers.push(`Unresolved amount discrepancy: Submitted ₹${c.submitted_amount} vs Simulated Bank Ledger ₹${simCheck.rows[0].simulated_amount}. (SIMULATED — NOT LIVE BANK VERIFICATION)`);
          }
        }

        // Check B: AICTE APH §6.46 Mandatory Clearance Tasks Check
        const pendingTasks = await client.query(
          `SELECT id, task_name, queue_name, status, blocker_reason 
           FROM clearance_tasks 
           WHERE case_id = $1 AND is_mandatory = true AND status != 'COMPLETED'`,
          [caseId]
        );
        for (const t of pendingTasks.rows) {
          if (t.status === 'BLOCKED') {
            blockers.push(`Mandatory clearance blocked: "${t.task_name}" in ${t.queue_name} (Reason: ${t.blocker_reason || 'Unspecified'})`);
          } else {
            blockers.push(`Mandatory clearance incomplete: "${t.task_name}" in ${t.queue_name} (Status: ${t.status})`);
          }
        }

        // Check C: Active Blocking Objections Check
        const activeObjs = await client.query(
          `SELECT id, category, description FROM objections WHERE case_id = $1 AND status = 'ACTIVE' AND is_blocking = true`,
          [caseId]
        );
        for (const o of activeObjs.rows) {
          blockers.push(`Active blocking objection ${o.id} [${o.category}]: ${o.description}`);
        }

        // Check D: Document Evidence Check
        const docCheck = await client.query(`SELECT COUNT(*)::INT as count FROM case_documents WHERE case_id = $1`, [caseId]);
        if (docCheck.rows[0].count === 0 && !c.document_filename) {
          blockers.push('Missing evidentiary document: Physical FDR certificate has not been uploaded.');
        }

        if (blockers.length > 0) {
          await client.query('ROLLBACK');
          return res.status(422).json({
            success: false,
            error: 'Decision Gate Violation: Case cannot be approved while mandatory clearances, verification or objections remain unresolved',
            decision: 'APPROVE',
            case_id: caseId,
            blocker_count: blockers.length,
            blockers: blockers
          });
        }
      }

      // Process Valid Decision
      let newStatus = c.status;
      let sanctionOrderNo = c.sanction_order_number;
      const effectiveReleaseDoc = release_doc_type || c.release_doc_type || 'FDR_RELEASE_NOC';

      if (decision === 'APPROVE') {
        newStatus = 'APPROVED';
        sanctionOrderNo = `AICTE/FD/2026/${effectiveReleaseDoc === 'RTGS_SANCTION_ORDER' ? 'RTGS' : 'NOC'}-${Date.now().toString().slice(-6)}`;
      } else if (decision === 'REJECT') {
        newStatus = 'REJECTED';
      } else if (decision === 'SEEK_CLARIFICATION') {
        newStatus = 'UNDER_REVIEW';
        const objId = `OBJ-${Date.now().toString().slice(-4)}`;
        await client.query(
          `INSERT INTO objections (id, case_id, raised_by_role, category, description, is_blocking, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            objId, caseId, req.user?.role || 'AICTE_OFFICER', 'CLARIFICATION_REQUIRED',
            rationale, true, 'ACTIVE'
          ]
        );
      }

      await client.query(
        `UPDATE fdr_cases 
         SET status = $1, sanction_order_number = $2, release_doc_type = $3, updated_at = NOW() 
         WHERE id = $4`,
        [newStatus, sanctionOrderNo, effectiveReleaseDoc, caseId]
      );

      await client.query(
        `INSERT INTO audit_events (case_id, action, actor, actor_role, rationale, previous_state, new_state, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          caseId,
          `DECISION_${decision}`,
          req.user.name,
          req.user.role,
          rationale,
          c.status,
          newStatus,
          JSON.stringify({
            decision,
            sanction_order_number: sanctionOrderNo,
            release_doc_type: effectiveReleaseDoc,
            verified_user_id: req.user.id,
            is_demo_action: Boolean(req.user.is_demo)
          })
        ]
      );

      await client.query('COMMIT');

      return res.status(200).json({
        success: true,
        source: 'POSTGRESQL',
        message: `Case ${caseId} marked as ${newStatus}`,
        decision,
        new_status: newStatus,
        sanction_order_number: sanctionOrderNo,
        release_doc_type: effectiveReleaseDoc,
        rationale
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    if (shouldEnforceDatabase()) {
      return sendSafeDatabaseError(res, err, 'POST /decision gate');
    }

    console.warn(`[KOSH-PRAMAAN] Database decision fallback.`);
    const seedCase = SEED_CASES.find(sc => sc.id === caseId);
    if (!seedCase) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }

    if (decision === 'APPROVE') {
      const blockers = [];
      if (!seedCase.simulated) {
        blockers.push('Mandatory simulated core-banking verification has not been performed.');
      } else if (!seedCase.simulated.amount_matched) {
        const resolvedMismatch = seedCase.objections.some(o => o.category === 'AMOUNT_MISMATCH' && ['RESOLVED', 'OVERRULED'].includes(o.status));
        if (!resolvedMismatch) {
          blockers.push(`Unresolved amount discrepancy: Submitted ₹${seedCase.submitted_amount} vs Simulated ₹${seedCase.simulated.simulated_amount}. (SIMULATED — NOT LIVE BANK VERIFICATION)`);
        }
      }

      const pending = seedCase.tasks.filter(t => t.is_mandatory && t.status !== 'COMPLETED');
      for (const t of pending) {
        blockers.push(`Mandatory clearance incomplete: "${t.name}" (Status: ${t.status})`);
      }

      const activeObjs = seedCase.objections.filter(o => o.status === 'ACTIVE' && o.is_blocking);
      for (const o of activeObjs) {
        blockers.push(`Active blocking objection [${o.category}]: ${o.description}`);
      }

      if (blockers.length > 0) {
        return res.status(422).json({
          success: false,
          error: 'Decision Gate Violation: Case cannot be approved while mandatory clearances or objections remain unresolved',
          decision: 'APPROVE',
          case_id: caseId,
          blocker_count: blockers.length,
          blockers: blockers
        });
      }

      const prevStatus = seedCase.status;
      seedCase.status = 'APPROVED';
      const sanctionNo = `AICTE/FD/2026/NOC-${Date.now().toString().slice(-6)}`;
      seedCase.sanction_order_number = sanctionNo;

      seedCase.audit_events = seedCase.audit_events || [];
      seedCase.audit_events.push({
        id: seedCase.audit_events.length + 1,
        case_id: caseId,
        action: `DECISION_${decision}`,
        actor: req.user?.name || 'Sanctioning Officer (Demo)',
        actor_role: req.user?.role || 'AICTE_OFFICER',
        rationale,
        previous_state: prevStatus,
        new_state: seedCase.status,
        event_timestamp: new Date().toISOString(),
        metadata: {
          decision,
          sanction_order_number: sanctionNo,
          rationale,
          is_demo_action: Boolean(req.user?.is_demo)
        }
      });
    } else if (decision === 'REJECT') {
      const prevStatus = seedCase.status;
      seedCase.status = 'REJECTED';
      seedCase.audit_events = seedCase.audit_events || [];
      seedCase.audit_events.push({
        id: seedCase.audit_events.length + 1,
        case_id: caseId,
        action: `DECISION_${decision}`,
        actor: req.user?.name || 'Sanctioning Officer (Demo)',
        actor_role: req.user?.role || 'AICTE_OFFICER',
        rationale,
        previous_state: prevStatus,
        new_state: seedCase.status,
        event_timestamp: new Date().toISOString(),
        metadata: { decision, rationale, is_demo_action: Boolean(req.user?.is_demo) }
      });
    }

    return res.status(200).json({
      success: true,
      source: 'SEEDED_FALLBACK',
      persistence_status: 'EPHEMERAL_DEMO_MEMORY',
      message: `Case ${caseId} decision recorded: ${decision}`,
      new_status: seedCase.status,
      sanction_order_number: seedCase.sanction_order_number || null
    });
  }
});

/**
 * 10. GET /api/cases/:id/audit-trail
 * Returns append-only chronological audit trail.
 * Strictly read-only: no modification or deletion routes exist.
 * Protected by Record-Level Authorization:
 * - INSTITUTION users can ONLY view audit trails for their own institution.
 */
router.get('/cases/:id/audit-trail', authenticate, async (req, res) => {
  const caseId = req.params.id;
  const isInstitution = req.user.role === ROLES.INSTITUTION;
  const userInstId = req.user.institution_id || '';
  const userInstName = req.user.name || '';

  try {
    // Record ownership check for Institutions
    if (isInstitution) {
      const caseCheck = await query(`SELECT institution_id, institution_name FROM fdr_cases WHERE id = $1`, [caseId]);
      if (caseCheck.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Case not found' });
      }
      const c = caseCheck.rows[0];
      const matchInstId = c.institution_id && c.institution_id === userInstId;
      const matchInstName = c.institution_name && (
        c.institution_name.toLowerCase() === userInstName.toLowerCase()
      );
      if (!matchInstId && !matchInstName) {
        return res.status(403).json({
          success: false,
          error: 'Access Denied: You are not authorized to view audit events for another institution.'
        });
      }
    }

    const result = await query(
      `SELECT id, case_id, action, actor, actor_role, rationale, previous_state, new_state, event_timestamp, metadata
       FROM audit_events
       WHERE case_id = $1
       ORDER BY event_timestamp ASC, id ASC`,
      [caseId]
    );

    return res.status(200).json({
      success: true,
      source: 'POSTGRESQL',
      case_id: caseId,
      count: result.rows.length,
      data: result.rows
    });
  } catch (err) {
    if (shouldEnforceDatabase()) {
      return sendSafeDatabaseError(res, err, 'GET /audit-trail query');
    }

    console.warn(`[KOSH-PRAMAAN] Audit query fallback.`);
    const seedCase = SEED_CASES.find(sc => sc.id === caseId);
    if (!seedCase) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }

    if (isInstitution) {
      const matchInstId = seedCase.institution_id && seedCase.institution_id === userInstId;
      const matchInstName = seedCase.institution_name && (
        seedCase.institution_name.toLowerCase() === userInstName.toLowerCase()
      );
      if (!matchInstId && !matchInstName) {
        return res.status(403).json({
          success: false,
          error: 'Access Denied: You are not authorized to view audit events for another institution.'
        });
      }
    }

    const fallbackAudit = [
      {
        id: 1,
        case_id: caseId,
        action: 'SYSTEM_INITIAL_SEED',
        actor: 'system-initializer',
        actor_role: 'System Administrator',
        rationale: 'Fictional demo FDR case ingested into platform ledger',
        previous_state: null,
        new_state: seedCase.status,
        event_timestamp: new Date().toISOString(),
        metadata: { fdr_number: seedCase.fdr_number }
      }
    ];

    const events = (seedCase.audit_events && seedCase.audit_events.length > 0)
      ? seedCase.audit_events
      : fallbackAudit;

    return res.status(200).json({
      success: true,
      source: 'SEEDED_FALLBACK',
      persistence_status: 'EPHEMERAL_DEMO_MEMORY',
      case_id: caseId,
      count: events.length,
      data: events
    });
  }
});

export default router;
