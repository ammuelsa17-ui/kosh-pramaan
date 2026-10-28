import { query } from '../config/db.js';

export const SCHEMA_SQL = `
-- Concurrency-Safe Sequence for Atomic, Non-Colliding FDR Case IDs
CREATE SEQUENCE IF NOT EXISTS fdr_case_seq START WITH 100 INCREMENT BY 1;

-- 1. FDR Cases (Institution-submitted details with regulatory release attributes)
CREATE TABLE IF NOT EXISTS fdr_cases (
  id VARCHAR(32) PRIMARY KEY,
  institution_id VARCHAR(64) NOT NULL DEFAULT 'AICTE-1-492019482',
  institution_name VARCHAR(255) NOT NULL,
  depositor_name VARCHAR(255) NOT NULL,
  fdr_number VARCHAR(64) NOT NULL UNIQUE,
  issuing_bank VARCHAR(128) NOT NULL,
  branch_name VARCHAR(128) NOT NULL,
  ifsc_code VARCHAR(16) NOT NULL,
  submitted_amount NUMERIC(15, 2) NOT NULL,
  lien_marked_to VARCHAR(255) NOT NULL,
  deposit_date DATE NOT NULL,
  maturity_date DATE NOT NULL,
  status VARCHAR(32) NOT NULL CHECK (status IN ('SUBMITTED', 'UNDER_REVIEW', 'VERIFICATION_PENDING', 'MISMATCH_FLAGGED', 'CLEARANCE_BLOCKED', 'APPROVED', 'REJECTED')),
  department_queue VARCHAR(64) NOT NULL,
  document_filename VARCHAR(255),
  release_doc_type VARCHAR(64) DEFAULT 'FDR_RELEASE_NOC' CHECK (release_doc_type IN ('FDR_RELEASE_NOC', 'RTGS_SANCTION_ORDER')),
  sanction_order_number VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backward compatibility columns for existing tables
ALTER TABLE fdr_cases ADD COLUMN IF NOT EXISTS institution_id VARCHAR(64) DEFAULT 'AICTE-1-492019482';
ALTER TABLE fdr_cases ADD COLUMN IF NOT EXISTS release_doc_type VARCHAR(64) DEFAULT 'FDR_RELEASE_NOC';
ALTER TABLE fdr_cases ADD COLUMN IF NOT EXISTS sanction_order_number VARCHAR(128);

-- 2. Simulated Bank Records (Strictly separate from submitted data, clearly marked as simulated)
CREATE TABLE IF NOT EXISTS simulated_bank_records (
  id SERIAL PRIMARY KEY,
  case_id VARCHAR(32) NOT NULL REFERENCES fdr_cases(id) ON DELETE CASCADE,
  fdr_number VARCHAR(64) NOT NULL,
  simulated_bank_name VARCHAR(128) NOT NULL,
  simulated_branch_ifsc VARCHAR(16) NOT NULL,
  simulated_amount NUMERIC(15, 2) NOT NULL,
  simulated_lien_status VARCHAR(64) NOT NULL,
  simulated_maturity_date DATE NOT NULL,
  amount_matched BOOLEAN NOT NULL,
  ifsc_matched BOOLEAN NOT NULL,
  maturity_matched BOOLEAN NOT NULL,
  lien_matched BOOLEAN NOT NULL,
  simulation_disclaimer VARCHAR(255) NOT NULL DEFAULT 'SIMULATED — NOT LIVE BANK VERIFICATION',
  simulated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_simulated_case UNIQUE (case_id)
);

-- 3. Clearance Tasks (AICTE APH §6.46: PGRC, Vigilance, Grants, and Accounts queues)
CREATE TABLE IF NOT EXISTS clearance_tasks (
  id VARCHAR(32) PRIMARY KEY,
  case_id VARCHAR(32) NOT NULL REFERENCES fdr_cases(id) ON DELETE CASCADE,
  task_name VARCHAR(255) NOT NULL,
  queue_name VARCHAR(64) NOT NULL,
  is_mandatory BOOLEAN NOT NULL DEFAULT true,
  status VARCHAR(32) NOT NULL CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED')),
  blocker_reason TEXT,
  completed_by VARCHAR(128),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Objections (Discrepancy flags, remarks, resolution status)
CREATE TABLE IF NOT EXISTS objections (
  id VARCHAR(32) PRIMARY KEY,
  case_id VARCHAR(32) NOT NULL REFERENCES fdr_cases(id) ON DELETE CASCADE,
  raised_by_role VARCHAR(64) NOT NULL,
  category VARCHAR(64) NOT NULL,
  description TEXT NOT NULL,
  is_blocking BOOLEAN NOT NULL DEFAULT true,
  status VARCHAR(32) NOT NULL CHECK (status IN ('ACTIVE', 'RESOLVED', 'OVERRULED')),
  resolution_remarks TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Case Documents (Real evidentiary artifact storage with SHA-256 integrity hashes)
CREATE TABLE IF NOT EXISTS case_documents (
  id VARCHAR(64) PRIMARY KEY,
  case_id VARCHAR(32) NOT NULL REFERENCES fdr_cases(id) ON DELETE CASCADE,
  document_type VARCHAR(64) NOT NULL,
  document_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(64) NOT NULL DEFAULT 'application/pdf',
  file_size_bytes INT NOT NULL,
  sha256_hash VARCHAR(64) NOT NULL,
  document_data TEXT,
  uploaded_by VARCHAR(128) NOT NULL,
  uploaded_by_role VARCHAR(64) NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Audit Events (Immutable chronological activity ledger)
CREATE TABLE IF NOT EXISTS audit_events (
  id SERIAL PRIMARY KEY,
  case_id VARCHAR(32) NOT NULL REFERENCES fdr_cases(id) ON DELETE CASCADE,
  action VARCHAR(64) NOT NULL,
  actor VARCHAR(128) NOT NULL,
  actor_role VARCHAR(64) NOT NULL,
  rationale TEXT,
  previous_state VARCHAR(64),
  new_state VARCHAR(64),
  event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB
);

-- Indexes for high-performance parameterized queries
CREATE INDEX IF NOT EXISTS idx_fdr_cases_status ON fdr_cases(status);
CREATE INDEX IF NOT EXISTS idx_fdr_cases_inst ON fdr_cases(institution_id);
CREATE INDEX IF NOT EXISTS idx_clearance_tasks_case ON clearance_tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_objections_case ON objections(case_id);
CREATE INDEX IF NOT EXISTS idx_case_documents_case ON case_documents(case_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_case ON audit_events(case_id);
`;

/**
 * Idempotently initialize the PostgreSQL tables, sequences, and indexes.
 * Safe to execute multiple times without error or data loss.
 */
export async function initializeSchema() {
  console.log('[KOSH-PRAMAAN] Initializing PostgreSQL database schema (APH §6.46 compliant)...');
  await query(SCHEMA_SQL);
  console.log('[KOSH-PRAMAAN] Database schema initialized successfully.');
  return { success: true, message: 'Schema tables and sequences ready' };
}
