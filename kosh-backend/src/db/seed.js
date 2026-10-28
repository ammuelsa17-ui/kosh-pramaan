import { query } from '../config/db.js';

export const SEED_CASES = [
  {
    id: 'FDR-2026-001',
    institution_name: 'Apex Infrastructure Projects Ltd',
    depositor_name: 'Apex Infrastructure Guarantee Account',
    fdr_number: 'FDR/SBI/2026/894102',
    issuing_bank: 'State Bank of India (Simulated Core Banking)',
    branch_name: 'Connaught Place Branch, New Delhi',
    ifsc_code: 'SBIN0001234',
    submitted_amount: 5000000.00, // ₹50 Lakhs
    lien_marked_to: 'Ministry of Road Transport & Highways, New Delhi',
    deposit_date: '2026-01-15',
    maturity_date: '2027-01-15',
    status: 'UNDER_REVIEW',
    department_queue: 'ACCOUNTS_QUEUE',
    document_filename: 'Apex_Infra_FDR_894102.pdf',
    // Simulated bank comparison
    simulated: {
      simulated_bank_name: 'State Bank of India (Simulated Core Banking)',
      simulated_branch_ifsc: 'SBIN0001234',
      simulated_amount: 5000000.00,
      simulated_lien_status: 'LIEN_CONFIRMED_TO_GOVERNMENT',
      simulated_maturity_date: '2027-01-15',
      amount_matched: true,
      ifsc_matched: true,
      maturity_matched: true,
      lien_matched: true
    },
    tasks: [
      { id: 'TSK-101', name: 'Original Physical Certificate Verification', queue: 'ACCOUNTS_QUEUE', is_mandatory: true, status: 'COMPLETED', completed_by: 'officer.accounts@gov.in' },
      { id: 'TSK-102', name: 'Technical Tender Security Assessment', queue: 'TECHNICAL_QUEUE', is_mandatory: true, status: 'COMPLETED', completed_by: 'eng.technical@gov.in' },
      { id: 'TSK-103', name: 'Bank Branch Confirmation Review', queue: 'LEGAL_QUEUE', is_mandatory: true, status: 'IN_PROGRESS', completed_by: null }
    ],
    objections: [],
    audit_events: [
      {
        id: 1,
        case_id: 'FDR-2026-001',
        action: 'SYSTEM_INITIAL_SEED',
        actor: 'system-initializer',
        actor_role: 'System Administrator',
        rationale: 'Fictional demo FDR case ingested into platform ledger',
        previous_state: null,
        new_state: 'UNDER_REVIEW',
        event_timestamp: new Date(Date.now() - 7200000).toISOString(),
        metadata: { fdr_number: 'FDR/SBI/2026/894102', submitted_amount: 5000000.00 }
      },
      {
        id: 2,
        case_id: 'FDR-2026-001',
        action: 'CLEARANCE_TASK_STATUS_UPDATED',
        actor: 'officer.accounts@gov.in',
        actor_role: 'CLEARANCE_OFFICER',
        rationale: 'Original Physical Certificate verified against physical security register',
        previous_state: 'PENDING',
        new_state: 'COMPLETED',
        event_timestamp: new Date(Date.now() - 3600000).toISOString(),
        metadata: { taskId: 'TSK-101' }
      },
      {
        id: 3,
        case_id: 'FDR-2026-001',
        action: 'CLEARANCE_TASK_STATUS_UPDATED',
        actor: 'eng.technical@gov.in',
        actor_role: 'CLEARANCE_OFFICER',
        rationale: 'Technical Tender Security Assessment completed per norms',
        previous_state: 'PENDING',
        new_state: 'COMPLETED',
        event_timestamp: new Date(Date.now() - 1800000).toISOString(),
        metadata: { taskId: 'TSK-102' }
      }
    ]
  },
  {
    id: 'FDR-2026-002',
    institution_name: 'Vanguard Solar Power Tech',
    depositor_name: 'Vanguard Energy Performance Deposit',
    fdr_number: 'FDR/PNB/2026/447812',
    issuing_bank: 'Punjab National Bank (Simulated Core Banking)',
    branch_name: 'Sector 18, Noida',
    ifsc_code: 'PUNB0145200',
    submitted_amount: 2500000.00, // ₹25 Lakhs submitted
    lien_marked_to: 'Solar Energy Corporation of India',
    deposit_date: '2026-02-10',
    maturity_date: '2027-02-10',
    status: 'MISMATCH_FLAGGED', // Amount mismatch flagged
    department_queue: 'VERIFICATION_QUEUE',
    document_filename: 'Vanguard_Solar_FDR_447812.pdf',
    // Simulated bank comparison shows discrepancy
    simulated: {
      simulated_bank_name: 'Punjab National Bank (Simulated Core Banking)',
      simulated_branch_ifsc: 'PUNB0145200',
      simulated_amount: 2000000.00, // Discrepancy: ₹20 Lakhs in mock bank records!
      simulated_lien_status: 'LIEN_CONFIRMED_TO_GOVERNMENT',
      simulated_maturity_date: '2027-02-10',
      amount_matched: false,
      ifsc_matched: true,
      maturity_matched: true,
      lien_matched: true
    },
    tasks: [
      { id: 'TSK-201', name: 'Accounts Amount Cross-check', queue: 'ACCOUNTS_QUEUE', is_mandatory: true, status: 'BLOCKED', blocker_reason: 'Discrepancy: Submitted amount ₹25,00,000 exceeds simulated bank ledger ₹20,00,000' }
    ],
    objections: [
      {
        id: 'OBJ-201',
        raised_by_role: 'Accounts Verification Officer',
        category: 'AMOUNT_MISMATCH',
        description: 'Amount mismatch detected: Submitted ₹25,00,000.00 vs Simulated Bank Ledger ₹20,00,000.00 (SIMULATED — NOT LIVE BANK VERIFICATION). Clarification required from depositor.',
        is_blocking: true,
        status: 'ACTIVE'
      }
    ],
    audit_events: [
      {
        id: 1,
        case_id: 'FDR-2026-002',
        action: 'SYSTEM_INITIAL_SEED',
        actor: 'system-initializer',
        actor_role: 'System Administrator',
        rationale: 'Fictional demo FDR case ingested into platform ledger',
        previous_state: null,
        new_state: 'MISMATCH_FLAGGED',
        event_timestamp: new Date(Date.now() - 3600000).toISOString(),
        metadata: { fdr_number: 'FDR/PNB/2026/447812', submitted_amount: 2500000.00 }
      }
    ]
  },
  {
    id: 'FDR-2026-003',
    institution_name: 'National Highway Developers Consortium',
    depositor_name: 'NHDC EMD Guarantee Fund',
    fdr_number: 'FDR/HDFC/2026/663914',
    issuing_bank: 'HDFC Bank (Simulated Core Banking)',
    branch_name: 'Bandra Kurla Complex, Mumbai',
    ifsc_code: 'HDFC0000456',
    submitted_amount: 15000000.00, // ₹1.5 Crore
    lien_marked_to: 'National Highways Authority of India',
    deposit_date: '2025-11-01',
    maturity_date: '2027-11-01',
    status: 'CLEARANCE_BLOCKED', // Blocked by mandatory clearance
    department_queue: 'LEGAL_QUEUE',
    document_filename: 'NHDC_Highway_FDR_663914.pdf',
    simulated: {
      simulated_bank_name: 'HDFC Bank (Simulated Core Banking)',
      simulated_branch_ifsc: 'HDFC0000456',
      simulated_amount: 15000000.00,
      simulated_lien_status: 'LIEN_CONFIRMED_TO_GOVERNMENT',
      simulated_maturity_date: '2027-11-01',
      amount_matched: true,
      ifsc_matched: true,
      maturity_matched: true,
      lien_matched: true
    },
    tasks: [
      { id: 'TSK-301', name: 'Finance Committee Audit Check', queue: 'ACCOUNTS_QUEUE', is_mandatory: true, status: 'COMPLETED', completed_by: 'auditor.fin@gov.in' },
      { id: 'TSK-302', name: 'Legal Lien Discharge Endorsement', queue: 'LEGAL_QUEUE', is_mandatory: true, status: 'BLOCKED', blocker_reason: 'Physical FDR original deposit receipt lacks official authorized bank officer seal and stamp' },
      { id: 'TSK-303', name: 'Chief Vigilance Officer Clearance', queue: 'VIGILANCE_QUEUE', is_mandatory: true, status: 'PENDING', blocker_reason: null }
    ],
    objections: [
      {
        id: 'OBJ-301',
        raised_by_role: 'Legal Officer',
        category: 'MISSING_ENDORSEMENT',
        description: 'Endorsement stamp absent on physical FDR certificate copy. Clearance withheld pending original authenticated copy.',
        is_blocking: true,
        status: 'ACTIVE'
      }
    ],
    audit_events: [
      {
        id: 1,
        case_id: 'FDR-2026-003',
        action: 'SYSTEM_INITIAL_SEED',
        actor: 'system-initializer',
        actor_role: 'System Administrator',
        rationale: 'Fictional demo FDR case ingested into platform ledger',
        previous_state: null,
        new_state: 'CLEARANCE_BLOCKED',
        event_timestamp: new Date(Date.now() - 3600000).toISOString(),
        metadata: { fdr_number: 'FDR/HDFC/2026/771920', submitted_amount: 10000000.00 }
      }
    ]
  },
  {
    id: 'FDR-2026-004',
    institution_name: 'CyberTech Global Solutions',
    depositor_name: 'CyberTech IT Infrastructure Security',
    fdr_number: 'FDR/BOB/2026/119283',
    issuing_bank: 'Bank of Baroda (Simulated Core Banking)',
    branch_name: 'MG Road Branch, Bengaluru',
    ifsc_code: 'BARB0SUBASH',
    submitted_amount: 3500000.00, // ₹35 Lakhs
    lien_marked_to: 'Digital India Corporation',
    deposit_date: '2026-03-01',
    maturity_date: '2027-03-01',
    status: 'SUBMITTED',
    department_queue: 'INTAKE_QUEUE',
    document_filename: 'CyberTech_FDR_119283.pdf',
    simulated: null, // Not yet verified in simulation
    tasks: [
      { id: 'TSK-401', name: 'Document Ingestion & File Legibility', queue: 'INTAKE_QUEUE', is_mandatory: true, status: 'PENDING' },
      { id: 'TSK-402', name: 'Core Deposit Verification', queue: 'ACCOUNTS_QUEUE', is_mandatory: true, status: 'PENDING' }
    ],
    objections: [],
    audit_events: [
      {
        id: 1,
        case_id: 'FDR-2026-004',
        action: 'SYSTEM_INITIAL_SEED',
        actor: 'system-initializer',
        actor_role: 'System Administrator',
        rationale: 'Fictional demo FDR case ingested into platform ledger',
        previous_state: null,
        new_state: 'SUBMITTED',
        event_timestamp: new Date(Date.now() - 3600000).toISOString(),
        metadata: { fdr_number: 'FDR/BOB/2026/119283', submitted_amount: 3500000.00 }
      }
    ]
  }
];

const SNAPSHOT_CASES = JSON.stringify(SEED_CASES);

/**
 * Resets SEED_CASES in-memory array to original fixtures
 */
export function resetInMemorySeed() {
  const fresh = JSON.parse(SNAPSHOT_CASES);
  SEED_CASES.splice(0, SEED_CASES.length, ...fresh);
  return SEED_CASES;
}

/**
 * Idempotently seed the fictional FDR cases.
 * Uses ON CONFLICT to prevent duplicates on repeated execution.
 */
export async function seedDatabase() {
  console.log('[KOSH-PRAMAAN] Seeding fictional demo FDR cases into PostgreSQL...');
  // Clean up any extraneous cases not belonging to the standard 4 seed cases
  await query("DELETE FROM fdr_cases WHERE id NOT IN ('FDR-2026-001', 'FDR-2026-002', 'FDR-2026-003', 'FDR-2026-004')");

  for (const c of SEED_CASES) {
    // 1. Insert/Update FDR Case
    await query(
      `INSERT INTO fdr_cases (
        id, institution_name, depositor_name, fdr_number, issuing_bank, branch_name, ifsc_code,
        submitted_amount, lien_marked_to, deposit_date, maturity_date, status, department_queue, document_filename
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (id) DO UPDATE SET
        institution_name = EXCLUDED.institution_name,
        depositor_name = EXCLUDED.depositor_name,
        fdr_number = EXCLUDED.fdr_number,
        issuing_bank = EXCLUDED.issuing_bank,
        branch_name = EXCLUDED.branch_name,
        ifsc_code = EXCLUDED.ifsc_code,
        submitted_amount = EXCLUDED.submitted_amount,
        lien_marked_to = EXCLUDED.lien_marked_to,
        deposit_date = EXCLUDED.deposit_date,
        maturity_date = EXCLUDED.maturity_date,
        status = EXCLUDED.status,
        department_queue = EXCLUDED.department_queue,
        document_filename = EXCLUDED.document_filename,
        updated_at = NOW()`,
      [
        c.id, c.institution_name, c.depositor_name, c.fdr_number, c.issuing_bank, c.branch_name, c.ifsc_code,
        c.submitted_amount, c.lien_marked_to, c.deposit_date, c.maturity_date, c.status, c.department_queue, c.document_filename
      ]
    );

    // 2. Insert/Update Simulated Bank Record if present
    if (c.simulated) {
      await query(
        `INSERT INTO simulated_bank_records (
          case_id, fdr_number, simulated_bank_name, simulated_branch_ifsc, simulated_amount,
          simulated_lien_status, simulated_maturity_date, amount_matched, ifsc_matched, maturity_matched,
          lien_matched, simulation_disclaimer
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (case_id) DO UPDATE SET
          fdr_number = EXCLUDED.fdr_number,
          simulated_bank_name = EXCLUDED.simulated_bank_name,
          simulated_branch_ifsc = EXCLUDED.simulated_branch_ifsc,
          simulated_amount = EXCLUDED.simulated_amount,
          simulated_lien_status = EXCLUDED.simulated_lien_status,
          simulated_maturity_date = EXCLUDED.simulated_maturity_date,
          amount_matched = EXCLUDED.amount_matched,
          ifsc_matched = EXCLUDED.ifsc_matched,
          maturity_matched = EXCLUDED.maturity_matched,
          lien_matched = EXCLUDED.lien_matched,
          simulation_disclaimer = EXCLUDED.simulation_disclaimer,
          simulated_at = NOW()`,
        [
          c.id, c.fdr_number, c.simulated.simulated_bank_name, c.simulated.simulated_branch_ifsc,
          c.simulated.simulated_amount, c.simulated.simulated_lien_status, c.simulated.simulated_maturity_date,
          c.simulated.amount_matched, c.simulated.ifsc_matched, c.simulated.maturity_matched,
          c.simulated.lien_matched, 'SIMULATED — NOT LIVE BANK VERIFICATION'
        ]
      );
    }

    // 3. Insert/Update Clearance Tasks
    for (const t of c.tasks) {
      await query(
        `INSERT INTO clearance_tasks (id, case_id, task_name, queue_name, is_mandatory, status, blocker_reason, completed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           task_name = EXCLUDED.task_name,
           queue_name = EXCLUDED.queue_name,
           is_mandatory = EXCLUDED.is_mandatory,
           status = EXCLUDED.status,
           blocker_reason = EXCLUDED.blocker_reason,
           completed_by = EXCLUDED.completed_by`,
        [t.id, c.id, t.name, t.queue, t.is_mandatory, t.status, t.blocker_reason || null, t.completed_by || null]
      );
    }

    // 4. Insert/Update Objections
    for (const o of c.objections) {
      await query(
        `INSERT INTO objections (id, case_id, raised_by_role, category, description, is_blocking, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           description = EXCLUDED.description,
           category = EXCLUDED.category,
           is_blocking = EXCLUDED.is_blocking,
           status = EXCLUDED.status`,
        [o.id, c.id, o.raised_by_role, o.category, o.description, o.is_blocking, o.status]
      );
    }

    // 5. Initial Audit Log Entry for seed ingestion
    await query(
      `INSERT INTO audit_events (case_id, action, actor, actor_role, rationale, previous_state, new_state, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        c.id,
        'SYSTEM_INITIAL_SEED',
        'system-initializer',
        'System Administrator',
        'Fictional demo FDR case seeded into database for hackathon simulation evaluation',
        null,
        c.status,
        JSON.stringify({ fdr_number: c.fdr_number, submitted_amount: c.submitted_amount })
      ]
    );
  }

  console.log('[KOSH-PRAMAAN] Fictional seed data loaded successfully.');
  return { success: true, count: SEED_CASES.length };
}
