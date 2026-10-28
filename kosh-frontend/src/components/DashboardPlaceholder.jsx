import React, { useState, useEffect } from 'react';
import { Database, ShieldCheck, Activity, ArrowRight, FileText, Clock, AlertTriangle, CheckCircle2, ShieldAlert, CheckSquare } from 'lucide-react';
import CaseTable from './CaseTable';
import { fetchCases } from '../api/casesApi';

export default function DashboardPlaceholder({ activeTab, setActiveTab }) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    if (activeTab === 'dashboard') {
      fetchCases().then((res) => {
        if (isMounted && res.ok && res.data) {
          setCases(res.data);
        }
        if (isMounted) setLoading(false);
      });
    }
    return () => { isMounted = false; };
  }, [activeTab]);

  if (activeTab === 'cases') {
    return <CaseTable />;
  }

  // Calculate live summary stats from actual cases
  const totalCases = cases.length;
  const casesRequiringAttention = cases.filter(
    (c) => c.status === 'MISMATCH_FLAGGED' || c.status === 'CLEARANCE_BLOCKED' || (c.blocked_tasks && c.blocked_tasks > 0) || (c.active_objections && c.active_objections > 0)
  ).length;
  const pendingClearances = cases.reduce((sum, c) => sum + (c.pending_tasks || 0), 0);
  const amountMismatches = cases.filter((c) => c.amount_matched === false || c.status === 'MISMATCH_FLAGGED').length;

  if (activeTab === 'verification') {
    return (
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Dual-Column Simulated Verification</div>
            <div className="card-subtitle">Transparent Reconciliation &bull; Explicit Simulation Disclaimer</div>
          </div>
          <span className="live-pill" style={{ background: '#fef3c7', color: '#b45309' }}>
            SIMULATED — NOT LIVE BANK VERIFICATION
          </span>
        </div>
        <div className="card-placeholder-content">
          <p>
            KOSH-PRAMAAN isolates institution-submitted FDR certificates from simulated core-banking comparison ledgers.
            Mismatches are flagged for administrative scrutiny and never treated as automatic proof of fraud.
          </p>
          <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <h4 style={{ fontSize: '0.9rem', marginBottom: '0.35rem', color: '#1e3a5f' }}>Recommended Demo Case:</h4>
            <p style={{ fontSize: '0.85rem', color: '#475569' }}>
              Inspect <strong>FDR-2026-002</strong> (Vanguard Solar Power Tech): Submitted amount ₹25,00,000 vs Simulated Bank Ledger ₹20,00,000.
            </p>
          </div>
          <button className="btn-primary" style={{ marginTop: '1.25rem' }} onClick={() => setActiveTab('cases')}>
            <span>Inspect Verification Cases</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  if (activeTab === 'clearances') {
    return (
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Clearance Workflow &amp; Blocker Tracker</div>
            <div className="card-subtitle">Inter-Departmental Hand-offs &bull; Immutable Blocker Logging</div>
          </div>
          <CheckSquare size={20} color="#1e3a5f" />
        </div>
        <div className="card-placeholder-content">
          <p>
            Every FDR case passes through mandatory departmental review queues (Accounts, Technical, Legal).
            If an issue arises, clearance officers can mark tasks as BLOCKED with mandatory documented reasons.
          </p>
          <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <h4 style={{ fontSize: '0.9rem', marginBottom: '0.35rem', color: '#1e3a5f' }}>Recommended Demo Case:</h4>
            <p style={{ fontSize: '0.85rem', color: '#475569' }}>
              Inspect <strong>FDR-2026-003</strong> (Apex Metro Rail Concession): Blocked in Legal Queue due to missing bank branch endorsement seal.
            </p>
          </div>
          <button className="btn-primary" style={{ marginTop: '1.25rem' }} onClick={() => setActiveTab('cases')}>
            <span>Open Clearance Queue</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  if (activeTab === 'audit') {
    return (
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Audit Replay &amp; Traceability Timeline</div>
            <div className="card-subtitle">Immutable Relational Activity Ledger &bull; Complete Chain of Custody</div>
          </div>
          <Clock size={20} color="#1e3a5f" />
        </div>
        <div className="card-placeholder-content">
          <p>
            Every administrative action—verification execution, task status changes, objection resolutions, and decision attempts—is recorded
            chronologically in the PostgreSQL <code>audit_events</code> table with actor identity, timestamp, and mandatory justification rationale.
          </p>
          <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <h4 style={{ fontSize: '0.9rem', marginBottom: '0.35rem', color: '#1e3a5f' }}>Audit Integrity Safeguard:</h4>
            <p style={{ fontSize: '0.85rem', color: '#475569' }}>
              Failed decision attempts rejected by the server-side Decision Gate do NOT record successful state-change entries, preserving ledger truth.
            </p>
          </div>
          <button className="btn-primary" style={{ marginTop: '1.25rem' }} onClick={() => setActiveTab('cases')}>
            <span>View Case Audit Trails</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* 4 Summary Metric Cards (Step 7 - Task 2) */}
      <div className="kpi-grid">
        <div className="kpi-card" onClick={() => setActiveTab('cases')} title="View all FDR cases">
          <div className="kpi-icon blue">
            <FileText size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-value">{loading ? '...' : totalCases}</span>
            <span className="kpi-label">Total FDR Cases</span>
            <span className="kpi-desc">Fictional Guarantees Seeded</span>
          </div>
        </div>

        <div className="kpi-card" onClick={() => setActiveTab('cases')} title="View cases requiring attention">
          <div className="kpi-icon red">
            <ShieldAlert size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-value">{loading ? '...' : casesRequiringAttention}</span>
            <span className="kpi-label">Cases Requiring Attention</span>
            <span className="kpi-desc">Discrepancies / Active Blockers</span>
          </div>
        </div>

        <div className="kpi-card" onClick={() => setActiveTab('cases')} title="View pending clearances">
          <div className="kpi-icon amber">
            <Clock size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-value">{loading ? '...' : pendingClearances}</span>
            <span className="kpi-label">Pending Clearances</span>
            <span className="kpi-desc">Mandatory Departmental Tasks</span>
          </div>
        </div>

        <div className="kpi-card" onClick={() => setActiveTab('cases')} title="View amount mismatches">
          <div className="kpi-icon amber">
            <AlertTriangle size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-value">{loading ? '...' : amountMismatches}</span>
            <span className="kpi-label">Amount Mismatches</span>
            <span className="kpi-desc">Submitted vs Bank Ledger</span>
          </div>
        </div>
      </div>

      {/* Guided Hackathon Demonstration Scenarios */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <div>
            <div className="card-title">3-Minute Hackathon Demonstration Scenarios</div>
            <div className="card-subtitle">Pre-configured fictional evaluation cases showcasing core platform capabilities</div>
          </div>
          <Activity size={20} color="#1e3a5f" />
        </div>

        <div className="demo-scenarios-grid">
          {/* Scenario 1 */}
          <div className="demo-scenario-card">
            <div>
              <div className="scenario-header">
                <span className="scenario-tag green">Decision Gate Success</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>FDR-2026-001</span>
              </div>
              <div className="scenario-title">Clean Review &amp; Full Approval</div>
              <div className="scenario-desc">
                State Bank of India ₹50,00,000. Clean reconciliation. Once all clearances are completed, the Decision Gate allows case approval.
              </div>
            </div>
            <button className="scenario-btn" onClick={() => setActiveTab('cases')}>
              <span>Inspect Case</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {/* Scenario 2 */}
          <div className="demo-scenario-card">
            <div>
              <div className="scenario-header">
                <span className="scenario-tag amber">Mismatch Flagged</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>FDR-2026-002</span>
              </div>
              <div className="scenario-title">Amount Discrepancy &amp; Gate Rejection</div>
              <div className="scenario-desc">
                PNB ₹25,00,000 submitted vs ₹20,00,000 bank ledger. Decision Gate strictly rejects premature approval with HTTP 422.
              </div>
            </div>
            <button className="scenario-btn" onClick={() => setActiveTab('cases')}>
              <span>Inspect Discrepancy</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {/* Scenario 3 */}
          <div className="demo-scenario-card">
            <div>
              <div className="scenario-header">
                <span className="scenario-tag red">Clearance Blocked</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>FDR-2026-003</span>
              </div>
              <div className="scenario-title">Departmental Blocker &amp; Resolution</div>
              <div className="scenario-desc">
                HDFC ₹1,50,00,000 blocked in Legal Queue. Demonstrates resolving blockers with mandatory remarks before approval is unlocked.
              </div>
            </div>
            <button className="scenario-btn" onClick={() => setActiveTab('cases')}>
              <span>Inspect Blocker</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {/* Scenario 4 */}
          <div className="demo-scenario-card">
            <div>
              <div className="scenario-header">
                <span className="scenario-tag blue">Fresh Intake</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>FDR-2026-004</span>
              </div>
              <div className="scenario-title">Intake Queue &amp; Verification Run</div>
              <div className="scenario-desc">
                Bank of Baroda ₹35,00,000 unverified submission. Demonstrates 1-click simulated verification and audit log initiation.
              </div>
            </div>
            <button className="scenario-btn" onClick={() => setActiveTab('cases')}>
              <span>Inspect Intake</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Architecture & Safeguards Grid */}
      <div className="dashboard-grid">
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Prototype Architecture Overview</div>
              <div className="card-subtitle">SIH26265 Smart India Hackathon Architecture</div>
            </div>
            <Database size={20} color="#1e3a5f" />
          </div>
          <table className="tech-spec-table">
            <tbody>
              <tr>
                <td>Frontend</td>
                <td>React + Vite (Port 5173)</td>
              </tr>
              <tr>
                <td>Backend</td>
                <td>Node.js + Express (Port 5001)</td>
              </tr>
              <tr>
                <td>Database</td>
                <td>PostgreSQL (5 Relational Tables)</td>
              </tr>
              <tr>
                <td>Storage</td>
                <td>Private local file storage</td>
              </tr>
              <tr>
                <td>Architecture</td>
                <td>Modular Monolith</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Evaluation Safeguards Enforced</div>
              <div className="card-subtitle">Integrity &amp; compliance rules enforced</div>
            </div>
            <ShieldCheck size={20} color="#059669" />
          </div>
          <div style={{ fontSize: '0.85rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div>
              <strong>1. Strict Data Segregation:</strong> Submitted FDR values and simulated bank records are maintained in separate tables.
            </div>
            <div>
              <strong>2. Transparent Simulation:</strong> Every comparison ledger is labeled <em>"SIMULATED — NOT LIVE BANK VERIFICATION"</em>.
            </div>
            <div>
              <strong>3. Backend Decision Gate:</strong> Server-side logic blocks approvals if clearances or objections are unresolved.
            </div>
            <div>
              <strong>4. Immutable Audit Trail:</strong> Chronological actions, actors, and justification rationale stored in PostgreSQL.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
