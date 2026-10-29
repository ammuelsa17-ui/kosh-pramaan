import React, { useState, useEffect } from 'react';
import {
  Database,
  ShieldCheck,
  Activity,
  ArrowRight,
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  CheckSquare,
  BellRing,
  History,
  Eye
} from 'lucide-react';
import { fetchCases, fetchMaturityAlerts, fetchRecentAuditActivity } from '../api/casesApi';

export default function DashboardPlaceholder({ activeTab, setActiveTab, onNavigateToCases }) {
  const [cases, setCases] = useState([]);
  const [maturityAlerts, setMaturityAlerts] = useState([]);
  const [recentAudits, setRecentAudits] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fallback if onNavigateToCases not passed
  const navigateTo = (filter = 'ALL', caseId = null) => {
    if (typeof onNavigateToCases === 'function') {
      onNavigateToCases(filter, caseId);
    } else {
      setActiveTab('cases');
    }
  };

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      fetchCases(),
      fetchMaturityAlerts(90),
      fetchRecentAuditActivity(6)
    ]).then(([casesRes, alertsRes, auditRes]) => {
      if (!isMounted) return;
      if (casesRes.ok && casesRes.data) {
        setCases(casesRes.data);
      }
      if (alertsRes && alertsRes.ok) {
        setMaturityAlerts(alertsRes.alerts || alertsRes.data || []);
      }
      if (auditRes && auditRes.ok) {
        setRecentAudits(auditRes.data || []);
      }
      setLoading(false);
    }).catch(() => {
      if (isMounted) setLoading(false);
    });

    return () => { isMounted = false; };
  }, [activeTab]);

  // Live stats from actual cases
  const totalCases = cases.length;
  const casesRequiringAttention = cases.filter(
    (c) => c.status === 'MISMATCH_FLAGGED' || c.status === 'CLEARANCE_BLOCKED' || (c.blocked_tasks && c.blocked_tasks > 0) || (c.active_objections && c.active_objections > 0)
  ).length;
  const pendingClearances = cases.reduce((sum, c) => sum + (c.pending_tasks || 0), 0);
  const amountMismatches = cases.filter((c) => c.amount_matched === false || c.status === 'MISMATCH_FLAGGED').length;
  const totalMaturityAlerts = maturityAlerts.length;

  if (activeTab === 'verification') {
    return (
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Dual-Column Simulated Verification</div>
            <div className="card-subtitle">Transparent Simulated FDR Comparison &bull; Explicit Simulation Disclaimer</div>
          </div>
          <span className="live-pill" style={{ background: '#fef3c7', color: '#b45309' }}>
            SIMULATED — NOT LIVE BANK VERIFICATION
          </span>
        </div>
        <div className="card-placeholder-content">
          <p>
            KOSH-PRAMAAN isolates institution-submitted FDR certificates from simulated core-banking comparison ledgers.
            Mismatches across Amount, IFSC, Maturity Date, and Lien Status are independently flagged for administrative scrutiny.
          </p>
          <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <h4 style={{ fontSize: '0.9rem', marginBottom: '0.35rem', color: '#1e3a5f' }}>Recommended Demonstration Case:</h4>
            <p style={{ fontSize: '0.85rem', color: '#475569' }}>
              Inspect <strong>FDR-2026-002</strong> (Vanguard Solar Power Tech): Submitted amount ₹25,00,000 vs Simulated Bank Ledger ₹20,00,000.
            </p>
          </div>
          <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={() => navigateTo('MISMATCH_FLAGGED', 'FDR-2026-002')}>
              <Eye size={14} />
              <span>Inspect FDR-2026-002 Discrepancy</span>
            </button>
            <button className="btn-secondary" onClick={() => navigateTo('MISMATCH_FLAGGED')}>
              <span>View All Flagged Cases</span>
              <ArrowRight size={14} />
            </button>
          </div>
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
            <div className="card-subtitle">Inter-Departmental Hand-offs &bull; Relational Blocker Logging</div>
          </div>
          <CheckSquare size={20} color="#1e3a5f" />
        </div>
        <div className="card-placeholder-content">
          <p>
            Every FDR case passes through mandatory departmental review queues (Finance, Affiliation, Legal, Regional Office).
            If an issue arises, clearance officers can mark tasks as BLOCKED with mandatory documented reasons.
          </p>
          <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <h4 style={{ fontSize: '0.9rem', marginBottom: '0.35rem', color: '#1e3a5f' }}>Recommended Demonstration Case:</h4>
            <p style={{ fontSize: '0.85rem', color: '#475569' }}>
              Inspect <strong>FDR-2026-003</strong> (Apex Metro Rail Concession): Blocked in Legal Queue due to missing bank branch endorsement seal.
            </p>
          </div>
          <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={() => navigateTo('CLEARANCE_BLOCKED', 'FDR-2026-003')}>
              <Eye size={14} />
              <span>Inspect FDR-2026-003 Clearance Blocker</span>
            </button>
            <button className="btn-secondary" onClick={() => navigateTo('PENDING_CLEARANCES')}>
              <span>View All Pending Clearances</span>
              <ArrowRight size={14} />
            </button>
          </div>
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
            <div className="card-subtitle">Append-Only Relational Activity Ledger &bull; Server-Enforced Retention</div>
          </div>
          <Clock size={20} color="#1e3a5f" />
        </div>
        <div className="card-placeholder-content">
          <p>
            Every administrative action—verification execution, task status changes, objection resolutions, and decision attempts—is recorded
            chronologically in the PostgreSQL <code>audit_events</code> table with actor identity, timestamp, and mandatory justification rationale.
          </p>

          <div style={{ marginTop: '1.25rem' }}>
            <h4 style={{ fontSize: '0.95rem', color: '#0f172a', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <History size={16} color="#1e3a5f" />
              <span>Recent Administrative Event Log (Live PostgreSQL)</span>
            </h4>

            {recentAudits && recentAudits.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {recentAudits.map((evt, idx) => (
                  <div key={evt.id || idx} style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.75rem 1rem', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 600, color: '#1e3a5f', fontSize: '0.85rem' }}>
                          {evt.case_id}
                        </span>
                        <span style={{ background: '#e2e8f0', color: '#334155', fontSize: '0.72rem', fontWeight: 600, padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                          {evt.action}
                        </span>
                        {evt.institution_name && (
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            ({evt.institution_name})
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.25rem' }}>
                        <strong>Actor:</strong> {evt.actor} ({evt.actor_role}) &bull; <em>"{evt.rationale || 'Administrative action'}"</em>
                      </div>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                      {new Date(evt.event_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '6px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                No recent administrative activity recorded in current session.
              </div>
            )}
          </div>

          <div style={{ marginTop: '1.25rem' }}>
            <button className="btn-primary" onClick={() => navigateTo('ALL')}>
              <span>View Case-Specific Audit Trails</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* 5 Summary Metric Cards (Priority 1) */}
      <div className="kpi-grid">
        <div
          className="kpi-card"
          onClick={() => navigateTo('ALL')}
          title="Click to view all FDR cases"
          style={{ cursor: 'pointer' }}
        >
          <div className="kpi-icon blue">
            <FileText size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-value">{loading ? '...' : totalCases}</span>
            <span className="kpi-label">Total FDR Cases</span>
            <span className="kpi-desc">All Registered Deposits</span>
          </div>
        </div>

        <div
          className="kpi-card"
          onClick={() => navigateTo('ATTENTION')}
          title="Click to filter cases requiring attention"
          style={{ cursor: 'pointer' }}
        >
          <div className="kpi-icon red">
            <ShieldAlert size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-value">{loading ? '...' : casesRequiringAttention}</span>
            <span className="kpi-label">Cases Requiring Attention</span>
            <span className="kpi-desc">Discrepancies / Active Blockers</span>
          </div>
        </div>

        <div
          className="kpi-card"
          onClick={() => navigateTo('PENDING_CLEARANCES')}
          title="Click to filter cases with pending clearances"
          style={{ cursor: 'pointer' }}
        >
          <div className="kpi-icon amber">
            <Clock size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-value">{loading ? '...' : pendingClearances}</span>
            <span className="kpi-label">Pending Clearances</span>
            <span className="kpi-desc">Mandatory Queue Tasks</span>
          </div>
        </div>

        <div
          className="kpi-card"
          onClick={() => navigateTo('MISMATCH_FLAGGED')}
          title="Click to filter cases with amount/data discrepancies"
          style={{ cursor: 'pointer' }}
        >
          <div className="kpi-icon amber">
            <AlertTriangle size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-value">{loading ? '...' : amountMismatches}</span>
            <span className="kpi-label">Flagged Discrepancies</span>
            <span className="kpi-desc">Submitted vs Bank Ledger</span>
          </div>
        </div>

        <div
          className="kpi-card"
          onClick={() => navigateTo('ALL')}
          title="Click to review maturity surveillance alerts"
          style={{ cursor: 'pointer' }}
        >
          <div className="kpi-icon blue" style={{ background: '#e0f2fe', color: '#0369a1' }}>
            <BellRing size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-value">{loading ? '...' : totalMaturityAlerts}</span>
            <span className="kpi-label">Maturity Alerts (&lt;90d)</span>
            <span className="kpi-desc">Surveillance Queue</span>
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
          <div className="demo-scenario-card" onClick={() => navigateTo('ALL', 'FDR-2026-001')} style={{ cursor: 'pointer' }}>
            <div>
              <div className="scenario-header">
                <span className="scenario-tag green">Decision Gate Success</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>FDR-2026-001</span>
              </div>
              <div className="scenario-title">Clean Review &amp; Full Approval</div>
              <div className="scenario-desc">
                State Bank of India ₹50,00,000. Clean simulated comparison. Once all clearances are completed, the Decision Gate allows case approval.
              </div>
            </div>
            <button className="scenario-btn" onClick={(e) => { e.stopPropagation(); navigateTo('ALL', 'FDR-2026-001'); }}>
              <span>Inspect Case</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {/* Scenario 2 */}
          <div className="demo-scenario-card" onClick={() => navigateTo('MISMATCH_FLAGGED', 'FDR-2026-002')} style={{ cursor: 'pointer' }}>
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
            <button className="scenario-btn" onClick={(e) => { e.stopPropagation(); navigateTo('MISMATCH_FLAGGED', 'FDR-2026-002'); }}>
              <span>Inspect Discrepancy</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {/* Scenario 3 */}
          <div className="demo-scenario-card" onClick={() => navigateTo('CLEARANCE_BLOCKED', 'FDR-2026-003')} style={{ cursor: 'pointer' }}>
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
            <button className="scenario-btn" onClick={(e) => { e.stopPropagation(); navigateTo('CLEARANCE_BLOCKED', 'FDR-2026-003'); }}>
              <span>Inspect Blocker</span>
              <ArrowRight size={13} />
            </button>
          </div>

          {/* Scenario 4 */}
          <div className="demo-scenario-card" onClick={() => navigateTo('ALL', 'FDR-2026-004')} style={{ cursor: 'pointer' }}>
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
            <button className="scenario-btn" onClick={(e) => { e.stopPropagation(); navigateTo('ALL', 'FDR-2026-004'); }}>
              <span>Inspect Intake</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Recent Administrative Activity Feed (Priority 1) */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Recent Administrative Activity Feed</div>
            <div className="card-subtitle">Real-time audit events dispatched to PostgreSQL with strict relational retention</div>
          </div>
          <History size={20} color="#1e3a5f" />
        </div>

        {recentAudits && recentAudits.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {recentAudits.map((evt, idx) => (
              <div
                key={evt.id || idx}
                onClick={() => navigateTo('ALL', evt.case_id)}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '0.75rem 1rem',
                  background: '#ffffff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
                title="Click to inspect this case"
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                    <span style={{ fontWeight: 600, color: '#1e3a5f', fontSize: '0.85rem' }}>
                      {evt.case_id}
                    </span>
                    <span style={{
                      background: evt.action.includes('REJECT') ? '#fee2e2' : (evt.action.includes('APPROV') ? '#dcfce7' : '#e0f2fe'),
                      color: evt.action.includes('REJECT') ? '#b91c1c' : (evt.action.includes('APPROV') ? '#15803d' : '#0369a1'),
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '0.15rem 0.45rem',
                      borderRadius: '4px'
                    }}>
                      {evt.action}
                    </span>
                    {evt.institution_name && (
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        &bull; {evt.institution_name}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                    <strong>{evt.actor}</strong> ({evt.actor_role}) &bull; <em>"{evt.rationale || 'Administrative action recorded'}"</em>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                    {new Date(evt.event_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <ArrowRight size={14} color="#94a3b8" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '6px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
            No recent administrative activity recorded in current session.
          </div>
        )}
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
                <td>React 19 + Vite 8 (Port 5173)</td>
              </tr>
              <tr>
                <td>Backend</td>
                <td>Node.js 20+ + Express (Port 5001)</td>
              </tr>
              <tr>
                <td>Database</td>
                <td>PostgreSQL (7 Relational Tables + RESTRICT Keys)</td>
              </tr>
              <tr>
                <td>Storage</td>
                <td>Private local file storage with SHA-256</td>
              </tr>
              <tr>
                <td>Architecture</td>
                <td>Modular Monolith &bull; Strict RBAC &bull; Decision Gate</td>
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
              <strong>4. Relational Audit Trail:</strong> Append-only chronological actions, authenticated actors, and justification rationale stored in PostgreSQL with ON DELETE RESTRICT retention.
            </div>
            <div>
              <strong>5. Lifecycle Distinction:</strong> In-app surveillance and alerts implemented; external multi-channel notifications planned.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
