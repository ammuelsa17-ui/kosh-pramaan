# KOSH-PRAMAAN Backend (SIH26265)

Modular Monolith backend for KOSH-PRAMAAN FDR verification engine, built using Node.js, Express, and PostgreSQL.

## Technology Stack
- **Runtime**: Node.js v26+ (compatible with v18+)
- **Framework**: Express (Modular Monolith)
- **Database**: PostgreSQL (via `pg` connection pool with parameterized SQL)

## Environment Configuration
Copy `.env.example` to `.env` and set your PostgreSQL parameters:
```bash
cp .env.example .env
```
Default local variables:
```env
PORT=5001
NODE_ENV=development
PGHOST=localhost
PGPORT=5432
PGUSER=harshini
PGPASSWORD=
PGDATABASE=postgres
```

## Database Schema & Seeding

### 1. Initialize Schema & Load Seeded Demo Cases
Run the idempotent initialization CLI:
```bash
npm run db:init
```
This idempotently creates the 5 core tables:
1. `fdr_cases`: Institution-submitted FDR deposits (NUMERIC monetary amounts, status constraints).
2. `simulated_bank_records`: Strictly separate mock core-banking verification entries labeled `"SIMULATED — NOT LIVE BANK VERIFICATION"`.
3. `clearance_tasks`: Multi-department approval workflows and blockers (`is_mandatory`, `status`, `blocker_reason`).
4. `objections`: Discrepancy flags and resolution states.
5. `audit_events`: Chronological action replay ledger.

Running `npm run db:init` multiple times is safe and will not corrupt or duplicate records.

## Running Tests
```bash
npm test
```
Executes:
- Endpoint contracts for `GET /api/cases` and `GET /api/health`.
- CORS verification.
- Idempotent schema initialization and seed execution test.

## Running the Server
```bash
npm start
```
Server listens on `http://localhost:5001`.

## Endpoints

### 1. Health Status
- `GET http://localhost:5001/api/health`
- Decoupled from the database so the service status is always available.
- `GET http://localhost:5001/api/health/db` returns detailed PostgreSQL connection status.

### 2. FDR Case Inventory
- `GET http://localhost:5001/api/cases`
- Returns seeded FDR cases with institution submission fields, simulated bank comparison, pending task counts, and active objection flags.
