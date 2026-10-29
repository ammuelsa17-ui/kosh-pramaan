# KOSH-PRAMAAN (SIH26265)

**Next-Generation AICTE Security Deposit & FDR Lifecycle Management Portal**

Comprehensive, tamper-evident FDR verification, multi-queue statutory clearance gating, discrepancy auditing, and immutable append-only chronological ledger for government departments and institutional applications.

---

## Technical Stack & Architecture

* **Frontend:** React 19 + Vite 8 + Lucide Icons + CSS Variables (Clean, mobile-responsive Government Portal UI).
* **Backend:** Node.js 20+ (ESM) + Express.js 4.21 (Modular Monolith REST API).
* **Database:** PostgreSQL (`pg` 8.13.3) with parameterized queries, connection pooling, and row-level locking (`SELECT ... FOR UPDATE`).
* **Security & RBAC:** Cryptographic HMAC-SHA256 JWT tokens with role-based guards (`INSTITUTION`, `VERIFICATION_OFFICER`, `CLEARANCE_OFFICER`, `AICTE_OFFICER`, `AUDITOR`) and strict record-level institution tenant data isolation.
* **Concurrency Safety:** PostgreSQL atomic sequence `fdr_case_seq` generating non-colliding Case IDs (`FDR-2026-XXXX`).
* **Audit Integrity:** Append-only chronological event ledger protected by PostgreSQL `ON DELETE RESTRICT`.

---

## Implemented Workflows & Features

1. **Authentication & RBAC:** Verified JWT authentication required on all sensitive routes. Rejects forged roles or unauthenticated calls with HTTP 401/403. Institutions are isolated strictly to their own cases, documents, renewals, and audit trails.
2. **Independent 4-Parameter FDR Verification:** Compares submitted FDR parameters with server-controlled bank ledger across:
   - Deposit Amount (`amount_matched`)
   - Branch IFSC Code (`ifsc_matched`)
   - Maturity Date (`maturity_matched`)
   - Government Lien Status (`lien_matched`)
   Each mismatch is independently evaluated, reported, and raised as a blocking objection.
3. **Simulated vs Genuine Bank Authentication Separation:**
   - Synthetic ledger comparisons are prominently stamped with `"SIMULATED — NOT LIVE BANK VERIFICATION"`.
   - In demonstration workflows, eligible approvals yield **`DEMO_APPROVED`** status.
   - Official financial release or statutory NOC issuance remains disabled without independently authenticated bank verification.
4. **AICTE APH §6.46 4-Queue Clearance Workflows:** Automatic initialization of statutory clearance checkpoints:
   - `PGRC_QUEUE`: Faculty/Staff salary arrears & student grievance verification.
   - `VIGILANCE_QUEUE`: Anti-corruption inquiries & court injunction checks.
   - `GRANTS_QUEUE`: AICTE project grant settlement audit.
   - `ACCOUNTS_QUEUE`: Physical FDR certificate & bank branch lien inspection.
5. **Transactional Server-Side Decision Gate:** Evaluates all blockers, active objections, and mandatory clearances under `SELECT ... FOR UPDATE` row locks before sanctioning.
6. **Evidentiary Document Management:** Base64 PDF uploads with document versioning (`version INT DEFAULT 1`) and cryptographic SHA-256 integrity hash verification (`case_documents`).
7. **Proactive Maturity Monitoring:** Configurable alerts API (`GET /api/cases/alerts/maturity?days_ahead=30`) tracking upcoming, critical (≤ 15 days), and expired deposits.
8. **Renewal & Replacement History:** Deposit renewal tracking (`POST /api/cases/:id/renew`, `GET /api/cases/:id/renewals`) logging tenure extensions and parameter changes into `fdr_renewals`.
9. **Fail-Safe Database Outage Handling:** Write mutations return HTTP 503 Service Unavailable with a secure UUID correlation ID when PostgreSQL is unreachable. Zero silent in-memory fallback writes in production.

---

## Implementation Status (Implemented vs Planned)

| Capability | Status | Description |
| :--- | :---: | :--- |
| **HMAC-SHA256 JWT RBAC & Tenant Isolation** | **IMPLEMENTED** | Server-enforced role and institution-level access control. |
| **Independent 4-Field FDR Verification** | **IMPLEMENTED** | Amount, IFSC, maturity date, and lien status verification. |
| **Decision Gate Row Locking** | **IMPLEMENTED** | Atomic blocker evaluation with PostgreSQL row locks. |
| **Demo Approval (`DEMO_APPROVED`) Distinction** | **IMPLEMENTED** | Simulated verification produces `DEMO_APPROVED`; official release disabled. |
| **AICTE APH §6.46 4-Queue Clearance** | **IMPLEMENTED** | PGRC, Vigilance, Grants, and Accounts bureau clearance tasks. |
| **Document Versioning & SHA-256 Hashes** | **IMPLEMENTED** | Cryptographic integrity verification for uploaded FDR certificates. |
| **Maturity Monitoring & Alerts API** | **IMPLEMENTED** | Configurable lookahead queries categorizing critical & upcoming tenures. |
| **FDR Renewal & Replacement Ledger** | **IMPLEMENTED** | Persistent historical log of deposit tenure extensions in `fdr_renewals`. |
| **Real Bank CBS / SFMS Core-Banking API Gateway** | **PLANNED** | Production integration requiring formal bank MOUs and SFMS connectivity. |
| **RBI Account Aggregator (AA) Integration** | **PLANNED** | Consent-driven automated bank deposit discovery framework. |
| **NeSL Digital Document Execution (DDE)** | **PLANNED** | Digital stamp duty and e-lien marking with national information utility. |
| **Automated Computer Vision Seal & Stamp OCR**| **PLANNED** | Automated visual detection of bank seals; currently handled via Accounts queue. |
| **Automated 5-Stage Reminder Dispatcher (SMS/Email)** | **PLANNED** | Background cron dispatcher at 90, 60, 30, 15, 7 days; alerts surfaced via API and UI. |

---

## Local Development & Testing

### Prerequisites
* Node.js v20+ (ESM)
* PostgreSQL 14+ (Local instance or cloud connection string via `DATABASE_URL`)

### 1. Backend Setup & Tests
```bash
cd kosh-backend
npm install

# Run the 65 automated backend unit, security, and lifecycle tests:
npm test

# Start the backend server on http://localhost:5001:
NODE_ENV=development JWT_SECRET="your-development-jwt-secret-min-32-chars" ENABLE_DEMO_AUTH=true npm start
```

### 2. Frontend Setup & Build
```bash
cd kosh-frontend
npm install

# Run the 9 automated frontend contract tests:
npm test

# Build production bundle:
npm run build

# Start Vite dev server on http://localhost:5173:
npm run dev
```

---

## Environment Variables Reference

| Variable Name | Required | Default / Format | Description |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | `production` / `development` / `test` | Runtime environment mode. |
| `JWT_SECRET` | **Yes (Prod)** | Min 32 chars | High-entropy HMAC-SHA256 secret. Fatal startup error if absent in production. |
| `DATABASE_URL` | Optional | `postgresql://...` | Connection URI for managed cloud PostgreSQL (e.g., Neon, Supabase, RDS). |
| `PGDATABASE` | Optional | `kosh_pramaan_preview` | Local PostgreSQL database name. |
| `PGUSER` | Optional | Current OS user | Local PostgreSQL user. |
| `ENABLE_DEMO_AUTH` | Optional | `false` in prod (`true` in dev) | Enables demo role switcher profiles for evaluators. |
| `STRICT_PERSISTENCE` | Optional | `false` | When `true`, database failures abort with HTTP 503 instead of read-only fallback. |
| `PORT` | Optional | `5001` | Express backend HTTP port. |
| `VITE_API_URL` / `VITE_API_BASE_URL` | Optional | `http://localhost:5001` | Frontend API target URL (supports both variable names). |
