/**
 * Supported User Roles in KOSH-PRAMAAN
 */
export const ROLES = {
  INSTITUTION: 'INSTITUTION',                      // College / Applicant / Contractor
  VERIFICATION_OFFICER: 'VERIFICATION_OFFICER',    // In-house Inspection & Core-Banking Check Officer
  CLEARANCE_OFFICER: 'CLEARANCE_OFFICER',          // Departmental Desk Officer (Accounts, Legal, Tech)
  AICTE_OFFICER: 'AICTE_OFFICER',                  // Competent Sanctioning Authority / Approver
  AUDITOR: 'AUDITOR'                               // Read-only Vigilance / CAG Audit
};

/**
 * Predefined Demo Users for Hackathon Evaluation & Testing
 */
export const DEMO_USERS = [
  {
    id: 'USR-INST-001',
    username: 'institution_apex',
    name: 'Apex Engineering & Technology Institute',
    role: ROLES.INSTITUTION,
    department: 'Institution / Applicant',
    institution_id: 'AICTE-1-492019482',
    description: 'Permitted to submit FDR performance security deposits and track review status.'
  },
  {
    id: 'USR-VERIF-001',
    username: 'officer_verma',
    name: 'Inspector Rajesh Verma',
    role: ROLES.VERIFICATION_OFFICER,
    department: 'FDR Inward & Bank Reconciliation Desk',
    description: 'Permitted to trigger simulated core-banking comparison and review discrepancy flags.'
  },
  {
    id: 'USR-CLEAR-001',
    username: 'officer_sharma',
    name: 'Nodal Officer Priya Sharma',
    role: ROLES.CLEARANCE_OFFICER,
    department: 'Accounts & Legal Clearance Directorate',
    description: 'Permitted to update task queue statuses, record blocker reasons, and resolve objections.'
  },
  {
    id: 'USR-APPROV-001',
    username: 'director_roy',
    name: 'Dr. K. L. Roy (Director / Member Secretary)',
    role: ROLES.AICTE_OFFICER,
    department: 'AICTE Competent Sanctioning Authority',
    description: 'High-privilege role: Sole authority permitted to record final APPROVE / REJECT decisions via Decision Gate.'
  },
  {
    id: 'USR-AUDIT-001',
    username: 'cag_auditor',
    name: 'CAG / Vigilance Oversight Team',
    role: ROLES.AUDITOR,
    department: 'Chief Vigilance Commission (CVC) Audit Wing',
    description: 'Read-only audit inspector: Complete access to immutable chronological audit logs and case files.'
  }
];

/**
 * Role permissions map
 */
export const ROLE_PERMISSIONS = {
  [ROLES.INSTITUTION]: ['cases:create', 'cases:read'],
  [ROLES.VERIFICATION_OFFICER]: ['cases:read', 'cases:verify'],
  [ROLES.CLEARANCE_OFFICER]: ['cases:read', 'tasks:update', 'objections:resolve'],
  [ROLES.AICTE_OFFICER]: ['cases:create', 'cases:read', 'cases:verify', 'tasks:update', 'objections:resolve', 'cases:decide'],
  [ROLES.AUDITOR]: ['cases:read', 'audit:read']
};
