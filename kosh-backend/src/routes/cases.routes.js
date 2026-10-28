import express from 'express';
import { query, getClient } from '../config/db.js';
import { SEED_CASES } from '../db/seed.js';
import { authenticate, optionalAuth, requireRole } from '../auth/middleware.js';
import { ROLES } from '../auth/roles.js';

const router = express.Router();

/**
 * Determines whether database persistence is strictly enforced.
 * When true, failures in database operations abort mutations and return HTTP 503
 * rather than silently falling back to in-memory state.
 */
function shouldEnforceDatabase() {
  return Boolean(
    process.env.DATABASE_URL ||
    process.env.STRICT_PERSISTENCE === 'true' ||
    process.env.NODE_ENV === 'production'
  );
}

/**
 * GET /api/cases
 * Returns list of FDR case summaries from PostgreSQL with resilient fallback
 */
router.get('/cases', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        c.id,
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
        c.created_at,
        s.simulated_amount::NUMERIC AS simulated_amount,
        s.amount_matched,
        s.simulation_disclaimer,
        (SELECT COUNT(*)::INT FROM clearance_tasks t WHERE t.case_id = c.id AND t.status != 'COMPLETED') AS pending_tasks,
        (SELECT COUNT(*)::INT FROM clearance_tasks t WHERE t.case_id = c.id AND t.status = 'BLOCKED') AS blocked_tasks,
        (SELECT COUNT(*)::INT FROM objections o WHERE o.case_id = c.id AND o.status = 'ACTIVE') AS active_objections
      FROM fdr_cases c
      LEFT JOIN simulated_bank_records s ON s.case_id = c.id
      ORDER BY c.created_at ASC
    `);

    return res.status(200).json({
      success: true,
      source: 'POSTGRESQL',
      count: result.rows.length,
      data: result.rows
    });
  } catch (err) {
    console.warn(`[KOSH-PRAMAAN] PostgreSQL query unavailable (${err.message}). Serving seeded fallback cases.`);
    
    const fallbackData = SEED_CASES.map(c => ({
      id: c.id,
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
      created_at: new Date().toISOString(),
      simulated_amount: c.simulated ? Number(c.simulated.simulated_amount).toFixed(2) : null,
      amount_matched: c.simulated ? c.simulated.amount_matched : null,
      simulation_disclaimer: 'SIMULATED — NOT LIVE BANK VERIFICATION',
      pending_tasks: c.tasks.filter(t => t.status !== 'COMPLETED').length,
      blocked_tasks: c.tasks.filter(t => t.status === 'BLOCKED').length,
      active_objections: c.objections.filter(o => o.status === 'ACTIVE').length
    }));

    return res.status(200).json({
      success: true,
      source: 'SEEDED_FALLBACK',
      dbError: err.message,
      count: fallbackData.length,
      data: fallbackData
    });
  }
});

/**
 * POST /api/cases
 * Submits a new FDR application (Institutional Portal)
 * Strict RBAC: Requires INSTITUTION or AICTE_OFFICER role
 */
router.post('/cases', authenticate, requireRole(ROLES.INSTITUTION, ROLES.AICTE_OFFICER), async (req, res) => {
  const {
    institution_name,
    depositor_name,
    fdr_number,
    issuing_bank,
    branch_name,
    ifsc_code,
    submitted_amount,
    lien_marked_to,
    deposit_date,
    maturity_date,
    document_filename
  } = req.body || {};

  // Validation
  const requiredFields = [
    { field: 'institution_name', label: 'Institution Name' },
    { field: 'depositor_name', label: 'Depositor Name' },
    { field: 'fdr_number', label: 'FDR Number' },
    { field: 'issuing_bank', label: 'Issuing Bank' },
    { field: 'branch_name', label: 'Branch Name' },
    { field: 'ifsc_code', label: 'IFSC Code' },
    { field: 'submitted_amount', label: 'Submitted Amount' },
    { field: 'lien_marked_to', label: 'Lien Marked To' },
    { field: 'deposit_date', label: 'Deposit Date' },
    { field: 'maturity_date', label: 'Maturity Date' }
  ];

  const missing = requiredFields.filter(f => !req.body[f.field] || String(req.body[f.field]).trim() === '');
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

  try {
    // Check duplicate FDR number in database
    const dupCheck = await query('SELECT id FROM fdr_cases WHERE fdr_number = $1', [trimmedFdr]);
    if (dupCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: `Conflict: An FDR record with number "${trimmedFdr}" is already registered in the system (Case ID: ${dupCheck.rows[0].id}).`
      });
    }

    // Generate unique Case ID
    const countRes = await query('SELECT COUNT(*)::INT as count FROM fdr_cases');
    const seq = (countRes.rows[0].count + 1).toString().padStart(3, '0');
    const newCaseId = `FDR-2026-${seq}`;

    const client = await getClient();
    try {
      await client.query('BEGIN');

      // 1. Insert fdr_case
      await client.query(
        `INSERT INTO fdr_cases (
          id, institution_name, depositor_name, fdr_number, issuing_bank, branch_name,
          ifsc_code, submitted_amount, lien_marked_to, deposit_date, maturity_date,
          status, department_queue, document_filename, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'SUBMITTED', 'INTAKE_QUEUE', $12, NOW(), NOW())`,
        [
          newCaseId, institution_name.trim(), depositor_name.trim(), trimmedFdr,
          issuing_bank.trim(), branch_name.trim(), ifsc_code.trim().toUpperCase(),
          amountNum.toFixed(2), lien_marked_to.trim(), deposit_date, maturity_date, docFile
        ]
      );

      // 2. Initialize 3 mandatory departmental clearance tasks
      const defaultTasks = [
        { id: `TSK-${newCaseId}-1`, name: 'Accounts Reconciliation & Amount Cross-check', queue: 'ACCOUNTS_QUEUE' },
        { id: `TSK-${newCaseId}-2`, name: 'Bank Branch Lien Endorsement & Seal Verification', queue: 'LEGAL_QUEUE' },
        { id: `TSK-${newCaseId}-3`, name: 'AICTE Norms & Security Deposit Adequacy Audit', queue: 'TECHNICAL_QUEUE' }
      ];

      for (const t of defaultTasks) {
        await client.query(
          `INSERT INTO clearance_tasks (id, case_id, task_name, queue_name, is_mandatory, status, created_at)
           VALUES ($1, $2, $3, $4, true, 'PENDING', NOW())`,
          [t.id, newCaseId, t.name, t.queue]
        );
      }

      // 3. Record creation audit event with verified actor from token
      await client.query(
        `INSERT INTO audit_events (case_id, action, actor, actor_role, rationale, previous_state, new_state, metadata)
         VALUES ($1, $2, $3, $4, $5, NULL, 'SUBMITTED', $6)`,
        [
          newCaseId,
          'FDR_APPLICATION_SUBMITTED',
          req.user.name,
          req.user.role,
          'Institutional security deposit application received and assigned to INTAKE_QUEUE.',
          JSON.stringify({
            fdr_number: trimmedFdr,
            submitted_amount: amountNum,
            issuing_bank: issuing_bank.trim(),
            depositor_name: depositor_name.trim(),
            verified_user_id: req.user.id
          })
        ]
      );

      await client.query('COMMIT');

      return res.status(201).json({
        success: true,
        source: 'POSTGRESQL',
        message: 'FDR application submitted successfully and queued for departmental clearance.',
        case_id: newCaseId,
        data: {
          id: newCaseId,
          institution_name: institution_name.trim(),
          depositor_name: depositor_name.trim(),
          fdr_number: trimmedFdr,
          issuing_bank: issuing_bank.trim(),
          submitted_amount: amountNum.toFixed(2),
          status: 'SUBMITTED',
          department_queue: 'INTAKE_QUEUE',
          document_filename: docFile,
          pending_tasks: 3,
          blocked_tasks: 0,
          active_objections: 0,
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
      return res.status(503).json({
        success: false,
        error: 'Database Service Unavailable: Persistent database transaction failed. Submission aborted to protect data integrity.',
        persistence_status: 'FAILED',
        detail: err.message
      });
    }

    console.warn(`[KOSH-PRAMAAN] Database submission fallback (${err.message})`);

    // In-memory fallback
    const exists = SEED_CASES.find(c => c.fdr_number.toLowerCase() === trimmedFdr.toLowerCase());
    if (exists) {
      return res.status(409).json({
        success: false,
        error: `Conflict: An FDR record with number "${trimmedFdr}" is already registered (Fallback ID: ${exists.id}).`
      });
    }

    const newCaseId = `FDR-2026-${(SEED_CASES.length + 1).toString().padStart(3, '0')}`;
    const newFallbackCase = {
      id: newCaseId,
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
      created_at: new Date().toISOString(),
      tasks: [
        { id: `TSK-${newCaseId}-1`, name: 'Accounts Reconciliation & Amount Cross-check', queue: 'ACCOUNTS_QUEUE', is_mandatory: true, status: 'PENDING' },
        { id: `TSK-${newCaseId}-2`, name: 'Bank Branch Lien Endorsement & Seal Verification', queue: 'LEGAL_QUEUE', is_mandatory: true, status: 'PENDING' },
        { id: `TSK-${newCaseId}-3`, name: 'AICTE Norms & Security Deposit Adequacy Audit', queue: 'TECHNICAL_QUEUE', is_mandatory: true, status: 'PENDING' }
      ],
      objections: [],
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
            issuing_bank: issuing_bank.trim(),
            depositor_name: depositor_name.trim(),
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
        institution_name: newFallbackCase.institution_name,
        depositor_name: newFallbackCase.depositor_name,
        fdr_number: newFallbackCase.fdr_number,
        submitted_amount: newFallbackCase.submitted_amount,
        status: newFallbackCase.status,
        department_queue: newFallbackCase.department_queue,
        pending_tasks: 3,
        blocked_tasks: 0,
        active_objections: 0,
        created_at: newFallbackCase.created_at
      }
    });
  }
});

/**
 * GET /api/cases/:id
 * Returns single FDR case detail including submitted vs simulated bank data,
 * clearance tasks, and objections.
 */
router.get('/cases/:id', async (req, res) => {
  const caseId = req.params.id;

  try {
    const caseResult = await query(`SELECT * FROM fdr_cases WHERE id = $1`, [caseId]);

    if (caseResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }

    const caseData = caseResult.rows[0];

    const [simResult, tasksResult, objResult] = await Promise.all([
      query(`SELECT * FROM simulated_bank_records WHERE case_id = $1`, [caseId]),
      query(`SELECT * FROM clearance_tasks WHERE case_id = $1 ORDER BY created_at ASC`, [caseId]),
      query(`SELECT * FROM objections WHERE case_id = $1 ORDER BY created_at ASC`, [caseId])
    ]);

    return res.status(200).json({
      success: true,
      source: 'POSTGRESQL',
      data: {
        ...caseData,
        simulated: simResult.rows[0] || null,
        tasks: tasksResult.rows,
        objections: objResult.rows
      }
    });
  } catch (err) {
    console.warn(`[KOSH-PRAMAAN] PostgreSQL query unavailable (${err.message}). Serving seeded fallback case detail.`);
    const seedCase = SEED_CASES.find(c => c.id === caseId);

    if (!seedCase) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }

    return res.status(200).json({
      success: true,
      source: 'SEEDED_FALLBACK',
      dbError: err.message,
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
 * 1. POST /api/cases/:id/simulate-verify
 * Compares submitted FDR fields with the seeded simulated record.
 * Preserves submitted values. Flags mismatches.
 * Labels every result "SIMULATED — NOT LIVE BANK VERIFICATION".
 */
router.post('/cases/:id/simulate-verify', authenticate, requireRole(ROLES.VERIFICATION_OFFICER, ROLES.AICTE_OFFICER), async (req, res) => {
  const caseId = req.params.id;

  try {
    const caseResult = await query(`SELECT * FROM fdr_cases WHERE id = $1`, [caseId]);
    if (caseResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Case not found' });
    }
    const c = caseResult.rows[0];

    // Seeded simulated bank reference
    const seedRef = SEED_CASES.find(sc => sc.id === caseId);
    let simulatedAmount = Number(c.submitted_amount);
    let simulatedIfsc = c.ifsc_code;
    let simulatedMaturity = c.maturity_date;
    let simulatedLien = 'LIEN_CONFIRMED_TO_GOVERNMENT';

    if (seedRef && seedRef.simulated) {
      simulatedAmount = Number(seedRef.simulated.simulated_amount);
      simulatedIfsc = seedRef.simulated.simulated_branch_ifsc;
      simulatedMaturity = seedRef.simulated.simulated_maturity_date;
      simulatedLien = seedRef.simulated.simulated_lien_status;
    }

    const submittedAmountNum = Number(c.submitted_amount);
    const amountMatched = Math.abs(submittedAmountNum - simulatedAmount) < 0.01;
    const ifscMatched = c.ifsc_code.toUpperCase().trim() === simulatedIfsc.toUpperCase().trim();
    const lienMatched = simulatedLien.includes('CONFIRMED');
    const maturityMatched = true;

    // Transaction for simulation save & status update
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // 1. Insert or update simulated_bank_records
      await client.query(
        `INSERT INTO simulated_bank_records (
          case_id, fdr_number, simulated_bank_name, simulated_branch_ifsc, simulated_amount,
          simulated_lien_status, simulated_maturity_date, amount_matched, ifsc_matched,
          maturity_matched, lien_matched, simulation_disclaimer, simulated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        ON CONFLICT (case_id) DO UPDATE SET
          simulated_amount = EXCLUDED.simulated_amount,
          amount_matched = EXCLUDED.amount_matched,
          ifsc_matched = EXCLUDED.ifsc_matched,
          maturity_matched = EXCLUDED.maturity_matched,
          lien_matched = EXCLUDED.lien_matched,
          simulated_at = NOW()`,
        [
          caseId, c.fdr_number, c.issuing_bank, simulatedIfsc, simulatedAmount,
          simulatedLien, simulatedMaturity, amountMatched, ifscMatched,
          maturityMatched, lienMatched, 'SIMULATED — NOT LIVE BANK VERIFICATION'
        ]
      );

      // 2. If mismatch detected, flag case and create/ensure objection
      let newStatus = c.status;
      if (!amountMatched) {
        newStatus = 'MISMATCH_FLAGGED';
        await client.query(`UPDATE fdr_cases SET status = 'MISMATCH_FLAGGED', updated_at = NOW() WHERE id = $1`, [caseId]);

        // Check existing objection
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

      // 3. Record in audit_events
      await client.query(
        `INSERT INTO audit_events (case_id, action, actor, actor_role, rationale, previous_state, new_state, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          caseId,
          'SIMULATED_VERIFICATION_EXECUTED',
          req.user.name,
          req.user.role,
          amountMatched
            ? 'Simulated verification completed: submitted amount matches simulated ledger.'
            : `Simulated verification discrepancy flagged: submitted ₹${submittedAmountNum} vs simulated ₹${simulatedAmount}. Requires human review.`,
          c.status,
          newStatus,
          JSON.stringify({
            amount_matched: amountMatched,
            submitted_amount: submittedAmountNum,
            simulated_amount: simulatedAmount,
            disclaimer: 'SIMULATED — NOT LIVE BANK VERIFICATION'
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
      return res.status(503).json({
        success: false,
        error: 'Database Service Unavailable: Persistent database verification failed. State change aborted.',
        persistence_status: 'FAILED',
        detail: err.message
      });
    }

    console.warn(`[KOSH-PRAMAAN] Database simulation fallback (${err.message})`);
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

    // Maintain in-memory audit log for simulation
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
 * 2. PUT /api/cases/:id/tasks/:taskId
 * Updates clearance task status with mandatory remarks/blockers.
 * Validates task belongs to case.
 * Records state change in audit_events.
 * Does NOT resolve unrelated objections.
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
      error: 'A blocker reason is required when marking a clearance task as BLOCKED'
    });
  }

  try {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // 1. Validate task belongs to case with FOR UPDATE locking
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

      // Require explanation when unblocking / resolving
      if (prevTask.status === 'BLOCKED' && status === 'COMPLETED' && (!remarks || remarks.trim() === '')) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'An explanation remark is required when resolving a blocked clearance task'
        });
      }

      // Update task
      const completedBy = status === 'COMPLETED' ? req.user.name : null;
      const completedAt = status === 'COMPLETED' ? new Date() : null;
      await client.query(
        `UPDATE clearance_tasks 
         SET status = $1, blocker_reason = $2, completed_by = $3, completed_at = $4
         WHERE id = $5 AND case_id = $6`,
        [status, status === 'BLOCKED' ? blocker_reason : null, completedBy, completedAt, taskId, caseId]
      );

      // Check if case status should adjust
      if (status === 'BLOCKED') {
        await client.query(`UPDATE fdr_cases SET status = 'CLEARANCE_BLOCKED', updated_at = NOW() WHERE id = $1`, [caseId]);
      } else {
        // If no other tasks are blocked, check if case was blocked
        const blockedCheck = await client.query(
          `SELECT COUNT(*)::INT as count FROM clearance_tasks WHERE case_id = $1 AND status = 'BLOCKED'`,
          [caseId]
        );
        if (blockedCheck.rows[0].count === 0) {
          const objCheck = await client.query(
            `SELECT COUNT(*)::INT as count FROM objections WHERE case_id = $1 AND status = 'ACTIVE'`,
            [caseId]
          );
          const nextStatus = objCheck.rows[0].count > 0 ? 'MISMATCH_FLAGGED' : 'UNDER_REVIEW';
          await client.query(`UPDATE fdr_cases SET status = $1, updated_at = NOW() WHERE id = $2 AND status = 'CLEARANCE_BLOCKED'`, [nextStatus, caseId]);
        }
      }

      // Record in audit_events
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
            is_mandatory: prevTask.is_mandatory
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
      return res.status(503).json({
        success: false,
        error: 'Database Service Unavailable: Persistent database clearance task update failed.',
        persistence_status: 'FAILED',
        detail: err.message
      });
    }

    console.warn(`[KOSH-PRAMAAN] Database task update fallback (${err.message})`);
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

    // Maintain in-memory audit log for task updates
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
 * 3. PUT /api/cases/:id/objections/:objId
 * Resolves or overrules an objection through an explicitly supported, auditable workflow.
 * Requires resolution_remarks and records actor/action/time/reason in audit_events.
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

      // Check if all blocking objections are cleared
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

      // Record in audit_events
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
            previous_status: prevObj.status
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
      return res.status(503).json({
        success: false,
        error: 'Database Service Unavailable: Persistent database objection update failed.',
        persistence_status: 'FAILED',
        detail: err.message
      });
    }

    console.warn(`[KOSH-PRAMAAN] Database objection update fallback (${err.message})`);
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

    // Maintain in-memory audit log for objection resolution
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
 * 4. POST /api/cases/:id/decision
 * SERVER-SIDE DECISION GATE
 * Transactionally recalculates blockers on the server with FOR UPDATE row locking.
 * Rejects APPROVE with HTTP 422 if mandatory clearances remain incomplete,
 * blocking objections exist, or verification is absent.
 * Does NOT trust frontend readiness flags.
 */
router.post('/cases/:id/decision', authenticate, requireRole(ROLES.AICTE_OFFICER), async (req, res) => {
  const caseId = req.params.id;
  const { decision, rationale } = req.body || {};

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

      // 1. Lock case row for atomic evaluation and update
      const caseResult = await client.query(`SELECT * FROM fdr_cases WHERE id = $1 FOR UPDATE`, [caseId]);
      if (caseResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Case not found' });
      }
      const c = caseResult.rows[0];

      // 2. DECISION GATE VALIDATION (Server-Side Enforcement)
      if (decision === 'APPROVE') {
        const blockers = [];

        // Check A: Verification Evidence Check
        const simCheck = await client.query(`SELECT * FROM simulated_bank_records WHERE case_id = $1`, [caseId]);
        if (simCheck.rows.length === 0) {
          blockers.push('Mandatory simulated core-banking verification has not been performed.');
        } else if (!simCheck.rows[0].amount_matched) {
          // If mismatch, check if an explicit OVERRULED or RESOLVED objection exists
          const resolvedMismatch = await client.query(
            `SELECT id FROM objections WHERE case_id = $1 AND category = 'AMOUNT_MISMATCH' AND status IN ('RESOLVED', 'OVERRULED')`,
            [caseId]
          );
          if (resolvedMismatch.rows.length === 0) {
            blockers.push(`Unresolved amount discrepancy: Submitted ₹${c.submitted_amount} vs Simulated Bank Ledger ₹${simCheck.rows[0].simulated_amount}. (SIMULATED — NOT LIVE BANK VERIFICATION)`);
          }
        }

        // Check B: Mandatory Clearance Tasks Check
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

        // If any blockers exist, ROLLBACK and REJECT WITH HTTP 422
        if (blockers.length > 0) {
          await client.query('ROLLBACK');
          return res.status(422).json({
            success: false,
            error: 'Decision Gate Violation: Case cannot be approved while mandatory clearances or objections remain unresolved',
            decision: 'APPROVE',
            case_id: caseId,
            blocker_count: blockers.length,
            blockers: blockers
          });
        }
      }

      // Process Valid Decision
      let newStatus = c.status;
      if (decision === 'APPROVE') newStatus = 'APPROVED';
      if (decision === 'REJECT') newStatus = 'REJECTED';
      if (decision === 'SEEK_CLARIFICATION') {
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

      await client.query(`UPDATE fdr_cases SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, caseId]);

      // Record decision in audit_events
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
          JSON.stringify({ decision, authorized_role: req.user.role, authenticated_user_id: req.user.id })
        ]
      );

      await client.query('COMMIT');

      return res.status(200).json({
        success: true,
        source: 'POSTGRESQL',
        message: `Case ${caseId} marked as ${newStatus}`,
        decision,
        new_status: newStatus,
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
      return res.status(503).json({
        success: false,
        error: 'Database Service Unavailable: Persistent database decision gate evaluation failed.',
        persistence_status: 'FAILED',
        detail: err.message
      });
    }

    console.warn(`[KOSH-PRAMAAN] Database decision fallback (${err.message})`);
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

      // Maintain in-memory audit log for decision
      seedCase.audit_events = seedCase.audit_events || [];
      seedCase.audit_events.push({
        id: seedCase.audit_events.length + 1,
        case_id: caseId,
        action: `OFFICER_DECISION_${decision}`,
        actor: req.user?.name || 'Sanctioning Officer (Demo)',
        actor_role: req.user?.role || 'AICTE_OFFICER',
        rationale,
        previous_state: prevStatus,
        new_state: seedCase.status,
        event_timestamp: new Date().toISOString(),
        metadata: {
          decision,
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
        action: `OFFICER_DECISION_${decision}`,
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
      new_status: seedCase.status
    });
  }
});

/**
 * 5. GET /api/cases/:id/audit-trail
 * Returns append-only chronological audit trail.
 * Strictly read-only: no modification or deletion routes exist.
 */
router.get('/cases/:id/audit-trail', async (req, res) => {
  const caseId = req.params.id;

  try {
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
    if (process.env.STRICT_PERSISTENCE === 'true') {
      return res.status(503).json({
        success: false,
        error: 'Database Service Unavailable: Failed to read audit trail under strict persistence mode.',
        detail: err.message
      });
    }

    console.warn(`[KOSH-PRAMAAN] Audit query fallback (${err.message})`);
    const seedCase = SEED_CASES.find(sc => sc.id === caseId);
    if (!seedCase) {
      return res.status(404).json({ success: false, error: 'Case not found' });
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
