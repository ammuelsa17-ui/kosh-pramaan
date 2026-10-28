# KOSH-PRAMAAN (SIH26265)

**Automated FDR & Security Deposit Lifecycle Management Platform**

Comprehensive, tamper-evident FDR verification, clearance task gating, mismatch auditing, and immutable chronological ledger for government departments and institutional tenders.

---

## Repository Structure

* [`kosh-backend/`](./kosh-backend): Modular Monolith built with **Node.js + Express + PostgreSQL**.
  * Parameterized SQL queries & PostgreSQL row-level locking (`SELECT ... FOR UPDATE`).
  * Server-side Decision Gate rejecting invalid approvals (HTTP 422).
  * Vercel Serverless Function adapter (`api/index.js`, `vercel.json`).
  * Dual-mode resiliency (`POSTGRESQL` or `SEEDED_FALLBACK`).
* [`kosh-frontend/`](./kosh-frontend): Modern executive dashboard built with **React 19 + Vite 8 + Lucide Icons**.
  * Real-time backend connectivity monitor.
  * Interactive FDR inventory with search, status filters, and discrepancy badges.
  * Side-by-side mismatch comparison modal with mandatory disclaimers.
  * Interactive clearance task updates, objection resolutions, and chronological audit trail.

---

## Quick Start (Local Development)

### 1. Backend
```bash
cd kosh-backend
npm install
npm test
npm start # Runs on http://localhost:5001
```

### 2. Frontend
```bash
cd kosh-frontend
npm install
npm test
npm run dev # Runs on http://localhost:5173
```

---

## Vercel Deployment

1. Go to [vercel.com/new](https://vercel.com/new) and select **`kosh-pramaan`**.
2. **Deploy Backend**:
   * Root Directory: `kosh-backend`
   * Click Deploy.
3. **Deploy Frontend**:
   * Root Directory: `kosh-frontend`
   * Environment Variable: `VITE_API_URL` = `<your-backend-vercel-url>`
   * Click Deploy.
