import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Building2,
  Calendar,
  Lock,
  RefreshCw,
  PlayCircle,
  CheckSquare,
  Slash,
  MessageSquare,
  History,
  Send,
  UserCheck
} from 'lucide-react';
import {
  runSimulatedVerification,
  updateClearanceTask,
  submitDecision,
  fetchAuditTrail,
  fetchCaseDetail,
  resolveObjection,
  getActiveUser
} from '../api/casesApi';

export default function CaseDetailModal({ caseItem: initialCase, onClose, onCaseUpdated }) {
  const [caseItem, setCaseItem] = useState(initialCase);
  const [activeTab, setActiveTab] = useState('verification'); // 'verification', 'tasks', 'decision', 'audit'

  const activeUser = getActiveUser();
  const canApprove = activeUser && activeUser.role === 'AICTE_OFFICER';

  // Action states
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState(null);

  // Clearance task & objection editing state
  const [taskRemarks, setTaskRemarks] = useState({});
  const [taskUpdating, setTaskUpdating] = useState(null);
  const [taskMsg, setTaskMsg] = useState(null);
  const [objRemarks, setObjRemarks] = useState({});
  const [resolvingObj, setResolvingObj] = useState(null);

  // Decision Gate state
  const [decision, setDecision] = useState('APPROVE');
  const [rationale, setRationale] = useState('');
  const [officerRole, setOfficerRole] = useState('Competent Authority (Demo Role)');
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [gateViolation, setGateViolation] = useState(null);
  const [forbiddenError, setForbiddenError] = useState(null);
  const [decisionSuccess, setDecisionSuccess] = useState(null);

  // Audit trail state
  const [auditEvents, setAuditEvents] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Reload case detail
  const refreshCurrentCase = async () => {
    const res = await fetchCaseDetail(caseItem.id);
    if (res.ok && res.data) {
      setCaseItem(res.data);
      if (onCaseUpdated) onCaseUpdated(res.data);
    }
  };

  // Load audit trail when switching to audit tab
  useEffect(() => {
    if (activeTab === 'audit') {
      loadAudit();
    }
  }, [activeTab]);

  const loadAudit = async () => {
    setLoadingAudit(true);
    const res = await fetchAuditTrail(caseItem.id);
    if (res.ok) {
      setAuditEvents(res.data);
    }
    setLoadingAudit(false);
  };

  const handleSimulateVerify = async () => {
    setVerifying(true);
    setVerifyMsg(null);
    const res = await runSimulatedVerification(caseItem.id, {
      officer_name: 'Inspector R. Verma (Demo)',
      officer_role: 'Verification Officer'
    });
    setVerifying(false);

    if (res.ok) {
      setVerifyMsg({
        type: 'success',
        text: `Simulated verification executed. Result: ${res.data.result.amount_matched ? 'Amounts Matched' : 'Discrepancy Flagged'}`
      });
      await refreshCurrentCase();
    } else {
      setVerifyMsg({ type: 'error', text: res.error });
    }
  };

  const handleUpdateTask = async (taskId, newStatus) => {
    const remarks = taskRemarks[taskId] || '';
    if (newStatus === 'BLOCKED' && !remarks.trim()) {
      setTaskMsg({ type: 'error', text: 'Please enter a blocker reason in remarks before flagging as blocked.' });
      return;
    }

    setTaskUpdating(taskId);
    setTaskMsg(null);
    const res = await updateClearanceTask(caseItem.id, taskId, {
      status: newStatus,
      blocker_reason: newStatus === 'BLOCKED' ? remarks : null,
      remarks: remarks,
      officer_name: 'Clearance Desk (Demo)',
      officer_role: 'Nodal Officer'
    });
    setTaskUpdating(null);

    if (res.ok) {
      setTaskMsg({ type: 'success', text: `Task ${taskId} status updated to ${newStatus}. Recorded in immutable audit log.` });
      setTaskRemarks((prev) => ({ ...prev, [taskId]: '' }));
      await refreshCurrentCase();
      if (activeTab === 'audit') loadAudit();
    } else {
      setTaskMsg({ type: 'error', text: res.error || 'Failed to update task' });
    }
  };

  const handleResolveObjection = async (objId) => {
    const remarks = objRemarks[objId] || '';
    if (!remarks.trim()) {
      setTaskMsg({ type: 'error', text: 'Documented resolution remarks are mandatory to resolve an objection.' });
      return;
    }

    setResolvingObj(objId);
    setTaskMsg(null);
    const res = await resolveObjection(caseItem.id, objId, {
      status: 'RESOLVED',
      resolution_remarks: remarks,
      officer_name: 'Nodal Officer (Demo)',
      officer_role: 'Competent Authority'
    });
    setResolvingObj(null);

    if (res.ok) {
      setTaskMsg({ type: 'success', text: `Objection ${objId} successfully marked as RESOLVED. Recorded in audit log.` });
      setObjRemarks((prev) => ({ ...prev, [objId]: '' }));
      await refreshCurrentCase();
      if (activeTab === 'audit') loadAudit();
    } else {
      setTaskMsg({ type: 'error', text: res.error || 'Failed to resolve objection' });
    }
  };

  const handleDecisionSubmit = async (e) => {
    e.preventDefault();
    if (!rationale.trim()) {
      alert('Please provide a justification rationale.');
      return;
    }

    setSubmittingDecision(true);
    setGateViolation(null);
    setForbiddenError(null);
    setDecisionSuccess(null);

    const res = await submitDecision(caseItem.id, {
      decision,
      rationale
    });
    setSubmittingDecision(false);

    if (res.ok) {
      setDecisionSuccess(`Decision successfully recorded: ${decision}`);
      setRationale('');
      await refreshCurrentCase();
      if (activeTab === 'audit') loadAudit();
    } else if (res.isForbidden) {
      setForbiddenError(res.error);
    } else if (res.isGateViolation) {
      setGateViolation(res.blockers);
    } else {
      alert(`Decision error: ${res.error}`);
    }
  };

  const formatCurrency = (amt) => {
    if (!amt) return '₹0.00';
    const num = parseFloat(amt);
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const sim = caseItem.simulated;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div>
            <div className="modal-badge-row">
              <span className="case-id-badge">{caseItem.id}</span>
              <span className={`status-pill status-${caseItem.status.toLowerCase()}`}>
                {caseItem.status.replace(/_/g, ' ')}
              </span>
              <span className="queue-pill">{caseItem.department_queue}</span>
            </div>
            <h2 className="modal-title">{caseItem.institution_name}</h2>
            <p className="modal-subtitle">Depositor: {caseItem.depositor_name}</p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="modal-subnav">
          <button
            className={`subnav-btn ${activeTab === 'verification' ? 'active' : ''}`}
            onClick={() => setActiveTab('verification')}
          >
            Verification &amp; Comparison
          </button>
          <button
            className={`subnav-btn ${activeTab === 'tasks' ? 'active' : ''}`}
            onClick={() => setActiveTab('tasks')}
          >
            Clearance Tasks ({caseItem.tasks ? caseItem.tasks.length : 0})
          </button>
          <button
            className={`subnav-btn ${activeTab === 'decision' ? 'active' : ''}`}
            onClick={() => setActiveTab('decision')}
          >
            Backend Decision Gate
          </button>
          <button
            className={`subnav-btn ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
          >
            Documents &amp; Versions ({caseItem.documents ? caseItem.documents.length : (caseItem.document_filename ? 1 : 0)})
          </button>
          <button
            className={`subnav-btn ${activeTab === 'renewals' ? 'active' : ''}`}
            onClick={() => setActiveTab('renewals')}
          >
            Renewals ({caseItem.renewals ? caseItem.renewals.length : 0})
          </button>
          <button
            className={`subnav-btn ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            Audit Replay
          </button>
        </div>

        <div className="modal-body">
          {/* TAB 1: VERIFICATION & RECONCILIATION */}
          {activeTab === 'verification' && (
            <div className="comparison-section">
              {/* Mandatory Prominent Simulation Disclaimer (Priority 2) */}
              <div style={{ marginBottom: '1.25rem', padding: '0.85rem 1.25rem', background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: '8px', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <AlertTriangle size={22} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ color: '#92400e', fontSize: '0.95rem', letterSpacing: '0.02em', display: 'block', marginBottom: '0.2rem' }}>
                    SIMULATED — NOT LIVE BANK VERIFICATION
                  </strong>
                  <div style={{ fontSize: '0.825rem', color: '#b45309', lineHeight: '1.4' }}>
                    Core-banking ledger comparison records below are generated by the server-side simulation sandbox for Smart India Hackathon evaluation. This system operates safely in an isolated sandbox without live connections to RBI SFMS, NeSL, or production bank hosts.
                  </div>
                </div>
              </div>

              <div className="section-header-bar">
                <h3 className="section-heading">Dual-Column Reconciliation Record</h3>
                <button
                  className="btn-primary"
                  onClick={handleSimulateVerify}
                  disabled={verifying}
                  title="Run simulated core-banking verification"
                >
                  <PlayCircle size={15} className={verifying ? 'spin' : ''} />
                  <span>{verifying ? 'Simulating Verification...' : 'Run Simulated Verification'}</span>
                </button>
              </div>

              {verifyMsg && (
                <div className={`notification-banner ${verifyMsg.type}`}>
                  {verifyMsg.text}
                </div>
              )}

              {/* Highlight Discrepancies if Detected (Priority 2) */}
              {sim && sim.amount_matched === false && (
                <div className="mismatch-highlight-box" style={{ marginBottom: '1rem' }}>
                  <div className="mismatch-header">
                    <AlertTriangle size={18} />
                    <span>SIMULATED AMOUNT MISMATCH FLAGGED FOR OFFICER REVIEW</span>
                  </div>
                  <div className="mismatch-numbers">
                    <div>
                      <span>Submitted FDR Guarantee Value:</span>
                      <strong>{formatCurrency(caseItem.submitted_amount)}</strong>
                    </div>
                    <span className="mismatch-diff">&ne;</span>
                    <div>
                      <span>Simulated Bank Ledger Value:</span>
                      <strong style={{ color: '#dc2626' }}>{formatCurrency(sim.simulated_amount)}</strong>
                    </div>
                  </div>
                  <div className="mismatch-note">
                    <strong>Important Safeguard Rule:</strong> Discrepancy is flagged for manual administrative scrutiny. In accordance with Smart India Hackathon and government evaluation norms, verification mismatches are never treated as conclusive proof of fraud.
                  </div>
                </div>
              )}

              {sim && sim.ifsc_matched === false && (
                <div className="mismatch-highlight-box" style={{ marginBottom: '1rem', borderColor: '#ea580c', background: '#fff7ed' }}>
                  <div className="mismatch-header" style={{ color: '#c2410c' }}>
                    <AlertTriangle size={18} />
                    <span>IFSC CODE MISMATCH FLAGGED FOR OFFICER REVIEW</span>
                  </div>
                  <div className="mismatch-numbers">
                    <div>
                      <span>Submitted Branch IFSC:</span>
                      <code>{caseItem.ifsc_code}</code>
                    </div>
                    <span className="mismatch-diff">&ne;</span>
                    <div>
                      <span>Simulated Core-Banking IFSC:</span>
                      <code style={{ color: '#c2410c' }}>{sim.simulated_branch_ifsc}</code>
                    </div>
                  </div>
                  <div className="mismatch-note" style={{ color: '#9a3412' }}>
                    <strong>Branch Verification Flag:</strong> Bank ledger indicates deposit was booked under a different branch code. Nodal verification officer must inspect branch endorsement.
                  </div>
                </div>
              )}

              {sim && sim.maturity_matched === false && (
                <div className="mismatch-highlight-box" style={{ marginBottom: '1rem', borderColor: '#d97706', background: '#fffbeb' }}>
                  <div className="mismatch-header" style={{ color: '#b45309' }}>
                    <AlertTriangle size={18} />
                    <span>MATURITY DATE DRIFT DETECTED</span>
                  </div>
                  <div className="mismatch-numbers">
                    <div>
                      <span>Submitted Maturity Date:</span>
                      <strong>{new Date(caseItem.maturity_date).toLocaleDateString()}</strong>
                    </div>
                    <span className="mismatch-diff">&ne;</span>
                    <div>
                      <span>Bank Ledger Maturity Date:</span>
                      <strong style={{ color: '#b45309' }}>{new Date(sim.simulated_maturity_date).toLocaleDateString()}</strong>
                    </div>
                  </div>
                  <div className="mismatch-note" style={{ color: '#92400e' }}>
                    <strong>Maturity Term Discrepancy:</strong> Fixed deposit maturity date recorded with bank differs from institutional claim. Verification officer must verify deposit tenure.
                  </div>
                </div>
              )}

              {sim && sim.lien_matched === false && (
                <div className="mismatch-highlight-box" style={{ marginBottom: '1rem', borderColor: '#dc2626', background: '#fef2f2' }}>
                  <div className="mismatch-header" style={{ color: '#b91c1c' }}>
                    <ShieldAlert size={18} />
                    <span>LIEN CONFIRMATION DISCREPANCY</span>
                  </div>
                  <div className="mismatch-numbers">
                    <div>
                      <span>Claimed Lien:</span>
                      <strong>{caseItem.lien_marked_to}</strong>
                    </div>
                    <span className="mismatch-diff">&ne;</span>
                    <div>
                      <span>Bank Lien Status:</span>
                      <strong style={{ color: '#b91c1c' }}>{sim.simulated_lien_status || 'NO_LIEN_RECORDED'}</strong>
                    </div>
                  </div>
                  <div className="mismatch-note" style={{ color: '#991b1b' }}>
                    <strong>Mandatory Statutory Blocker:</strong> AICTE APH §6.46 requires fixed deposits to be explicitly lien-marked to the Member Secretary, AICTE. Bank records do not confirm lien notation.
                  </div>
                </div>
              )}

              <div className="comparison-grid">
                {/* Left Column: Institution-Submitted Data */}
                <div className="comparison-card submitted-card">
                  <div className="card-badge-header submitted-badge">
                    <Building2 size={16} />
                    <span>INSTITUTION SUBMITTED DETAILS</span>
                  </div>
                  
                  <table className="details-table">
                    <tbody>
                      <tr>
                        <td>FDR Number</td>
                        <td><strong>{caseItem.fdr_number}</strong></td>
                      </tr>
                      <tr>
                        <td>Issuing Bank</td>
                        <td>{caseItem.issuing_bank}</td>
                      </tr>
                      <tr>
                        <td>Branch &amp; IFSC</td>
                        <td>{caseItem.branch_name} &bull; <code>{caseItem.ifsc_code}</code></td>
                      </tr>
                      <tr>
                        <td>Submitted Amount</td>
                        <td className="amount-cell submitted-amount-highlight">
                          {formatCurrency(caseItem.submitted_amount)}
                        </td>
                      </tr>
                      <tr>
                        <td>Lien Marked To</td>
                        <td>{caseItem.lien_marked_to}</td>
                      </tr>
                      <tr>
                        <td>Deposit / Maturity</td>
                        <td>
                          {new Date(caseItem.deposit_date).toLocaleDateString()} &rarr; {new Date(caseItem.maturity_date).toLocaleDateString()}
                        </td>
                      </tr>
                      <tr>
                        <td>Certificate File</td>
                        <td className="file-attachment-row">
                          <FileText size={14} />
                          <span>{caseItem.document_filename || 'Not provided'}</span>
                          <span className="private-storage-tag">Private Storage</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Right Column: Simulated Bank Record */}
                <div className="comparison-card simulated-card">
                  <div className="card-badge-header simulated-badge">
                    <ShieldAlert size={16} />
                    <span>SIMULATED CORE-BANKING LEDGER</span>
                  </div>

                  <div className="mandatory-disclaimer-box">
                    <AlertTriangle size={15} />
                    <strong>SIMULATED — NOT LIVE BANK VERIFICATION</strong>
                  </div>

                  {sim ? (
                    <table className="details-table">
                      <tbody>
                        <tr>
                          <td>Simulated Bank</td>
                          <td>{sim.simulated_bank_name}</td>
                        </tr>
                        <tr>
                          <td>Branch IFSC</td>
                          <td>
                            <code>{sim.simulated_branch_ifsc}</code>
                            {sim.ifsc_matched ? (
                              <span className="match-tag match-yes">&check; Matched</span>
                            ) : (
                              <span className="match-tag match-no">&cross; Mismatch</span>
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td>Simulated Amount</td>
                          <td className="amount-cell">
                            <strong>{formatCurrency(sim.simulated_amount)}</strong>
                            {sim.amount_matched ? (
                              <span className="match-tag match-yes">&check; Match</span>
                            ) : (
                              <span className="match-tag match-no">&cross; Discrepancy Flagged</span>
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td>Simulated Lien</td>
                          <td>
                            {sim.simulated_lien_status}
                            {sim.lien_matched ? (
                              <span className="match-tag match-yes">&check; Verified</span>
                            ) : (
                              <span className="match-tag match-no">&cross; Lien Absent</span>
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td>Simulated Maturity</td>
                          <td>
                            {new Date(sim.simulated_maturity_date).toLocaleDateString()}
                            {sim.maturity_matched ? (
                              <span className="match-tag match-yes">&check; Aligned</span>
                            ) : (
                              <span className="match-tag match-no">&cross; Date Drift</span>
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td>Verification Status</td>
                          <td style={{ color: '#64748b', fontSize: '0.8rem' }}>
                            {sim.amount_matched ? 'Verified — No discrepancies' : 'Flagged for Officer Review — Human Evaluation Required'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  ) : (
                    <div className="unsimulated-placeholder">
                      <p>No simulated bank verification run yet for this record.</p>
                      <button className="btn-secondary" style={{ marginTop: '0.75rem' }} onClick={handleSimulateVerify}>
                        Run Verification Now
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CLEARANCE TASKS & OBJECTIONS */}
          {activeTab === 'tasks' && (
            <div className="detail-section">
              <h3 className="section-heading">Multi-Department Clearance Queues</h3>
              <p className="section-subtext">
                All mandatory clearance items must be completed before the Decision Gate allows case approval.
              </p>

              {taskMsg && (
                <div className={`notification-banner ${taskMsg.type}`} style={{ marginTop: '0.75rem', marginBottom: '0.75rem' }}>
                  {taskMsg.text}
                </div>
              )}

              <div className="tasks-list" style={{ marginTop: '1rem' }}>
                {caseItem.tasks && caseItem.tasks.map((t) => (
                  <div key={t.id} className={`task-row status-${t.status.toLowerCase()}`}>
                    <div className="task-info">
                      <div className="task-title-line">
                        <span className="task-id">{t.id}</span>
                        <strong className="task-name">{t.task_name}</strong>
                        {t.is_mandatory && <span className="mandatory-badge">Mandatory</span>}
                      </div>
                      <div className="task-meta">
                        Department Queue: <strong>{t.queue_name}</strong>
                        {t.completed_by && <span> &bull; Completed by: {t.completed_by}</span>}
                      </div>
                      {t.blocker_reason && (
                        <div className="blocker-banner">
                          <AlertTriangle size={14} />
                          <span><strong>Blocker Reason:</strong> {t.blocker_reason}</span>
                        </div>
                      )}

                      {/* Task Remarks Input */}
                      <div className="task-edit-bar">
                        <input
                          type="text"
                          placeholder="Officer remarks / Blocker reason..."
                          value={taskRemarks[t.id] || ''}
                          onChange={(e) => setTaskRemarks({ ...taskRemarks, [t.id]: e.target.value })}
                        />
                        <button
                          className="btn-action btn-complete"
                          onClick={() => handleUpdateTask(t.id, 'COMPLETED')}
                          disabled={taskUpdating === t.id}
                        >
                          <CheckSquare size={13} />
                          <span>Mark Completed</span>
                        </button>
                        <button
                          className="btn-action btn-block"
                          onClick={() => handleUpdateTask(t.id, 'BLOCKED')}
                          disabled={taskUpdating === t.id}
                        >
                          <Slash size={13} />
                          <span>Flag Blocked</span>
                        </button>
                      </div>
                    </div>
                    <span className={`task-status-pill status-${t.status.toLowerCase()}`}>
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>

              {/* Active Objections */}
              {caseItem.objections && caseItem.objections.length > 0 && (
                <div style={{ marginTop: '2rem' }}>
                  <h3 className="section-heading" style={{ color: '#b91c1c' }}>
                    Departmental Objections ({caseItem.objections.length})
                  </h3>
                  <div className="objections-list">
                    {caseItem.objections.map((o) => (
                      <div key={o.id} className="objection-card">
                        <div className="objection-header">
                          <span className="objection-id">{o.id}</span>
                          <span className="objection-category">{o.category}</span>
                          {o.is_blocking && <span className="blocking-tag">Blocks Clearance</span>}
                        </div>
                        <p className="objection-desc">{o.description}</p>
                        <div className="objection-meta">
                          Raised By: <strong>{o.raised_by_role}</strong> &bull; Status: <strong>{o.status}</strong>
                        </div>
                        {o.status === 'ACTIVE' ? (
                          <div className="objection-resolve-bar">
                            <input
                              type="text"
                              placeholder="Enter mandatory documented remarks to resolve..."
                              value={objRemarks[o.id] || ''}
                              onChange={(e) => setObjRemarks({ ...objRemarks, [o.id]: e.target.value })}
                            />
                            <button
                              className="btn-resolve-obj"
                              onClick={() => handleResolveObjection(o.id)}
                              disabled={resolvingObj === o.id}
                            >
                              <CheckCircle2 size={13} />
                              <span>{resolvingObj === o.id ? 'Resolving...' : 'Resolve Objection'}</span>
                            </button>
                          </div>
                        ) : (
                          <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#047857', background: '#ecfdf5', padding: '0.4rem 0.65rem', borderRadius: '4px' }}>
                            &check; <strong>{o.status}:</strong> {o.resolution_remarks || 'Resolution confirmed by competent authority'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: BACKEND DECISION GATE */}
          {activeTab === 'decision' && (
            <div className="decision-section">
              <h3 className="section-heading">Server-Side Decision Gate Enforcement</h3>
              <p className="section-subtext">
                The backend strictly recalculates blockers at execution time. Approval will be rejected (HTTP 422)
                if mandatory clearance tasks are incomplete, verification is missing, or blocking objections remain active.
              </p>

              {/* Simulation Workflow Notice */}
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '0.825rem', color: '#166534' }}>
                <CheckCircle2 size={16} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '0.35rem' }} />
                <strong>Simulated Demonstration Workflow:</strong> Core-banking verification is simulated (<code>SIMULATED — NOT LIVE BANK VERIFICATION</code>). Approval grants <strong>DEMO_APPROVED</strong> status. Official financial release requires independently authenticated live bank verification.
              </div>

              {/* RBAC Notice */}
              {!canApprove && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '0.825rem', color: '#92400e' }}>
                  <ShieldAlert size={16} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '0.35rem' }} />
                  <strong>RBAC Security Gate:</strong> Your current active role is <strong>{activeUser ? activeUser.role : 'Guest'}</strong>. Approval decisions are restricted to the <strong>AICTE_OFFICER</strong> (Director / Sanctioning Authority). If submitted, the server will enforce HTTP 403 Forbidden.
                </div>
              )}

              {/* 403 Forbidden Banner */}
              {forbiddenError && (
                <div className="gate-rejection-card" style={{ borderLeftColor: '#dc2626', background: '#fef2f2' }}>
                  <div className="rejection-title" style={{ color: '#b91c1c' }}>
                    <ShieldAlert size={18} />
                    <strong>Server-Enforced Access Denied (HTTP 403 Forbidden)</strong>
                  </div>
                  <p className="rejection-subtitle" style={{ color: '#991b1b', marginBottom: 0 }}>{forbiddenError}</p>
                </div>
              )}

              {/* Decision Gate Violation Banner */}
              {gateViolation && (
                <div className="gate-rejection-card">
                  <div className="rejection-title">
                    <AlertTriangle size={18} />
                    <strong>Backend Decision Gate Rejection (HTTP 422 Unprocessable Entity)</strong>
                  </div>
                  <p className="rejection-subtitle">
                    The backend rejected this approval request. The following {gateViolation.length} requirements must be resolved first:
                  </p>
                  <ul className="blocker-list">
                    {gateViolation.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Decision Success Banner */}
              {decisionSuccess && (
                <div className="gate-success-card">
                  <CheckCircle2 size={18} />
                  <span>{decisionSuccess}</span>
                </div>
              )}

              {/* Pre-Flight Decision Gate Verification Matrix (Priority 3) */}
              <div style={{ marginBottom: '1.25rem', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: '#ffffff' }}>
                <div style={{ background: '#f8fafc', padding: '0.65rem 1rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e3a5f', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <ShieldCheck size={16} color="#1e3a5f" />
                    Pre-Flight Statutory Evaluation Matrix
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                    Live Server-Side Evaluation
                  </span>
                </div>

                <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {/* Item 1: Core Banking Verification */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.825rem' }}>
                    <div>
                      <strong style={{ color: '#0f172a' }}>1. Core Banking Reconciliation:</strong>
                      <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                        {!sim
                          ? 'Simulation not executed yet — Required prior to approval.'
                          : (sim.amount_matched === false
                              ? `Discrepancy: Submitted ₹${Number(caseItem.submitted_amount).toLocaleString('en-IN')} ≠ Bank Ledger ₹${Number(sim.simulated_amount).toLocaleString('en-IN')}`
                              : (sim.ifsc_matched === false
                                  ? `IFSC Mismatch: ${caseItem.ifsc_code} ≠ ${sim.simulated_branch_ifsc}`
                                  : (sim.maturity_matched === false
                                      ? `Maturity Date Drift: Submitted ${caseItem.maturity_date} ≠ Bank ${sim.simulated_maturity_date}`
                                      : (sim.lien_matched === false
                                          ? `Lien unconfirmed in bank records (${sim.simulated_lien_status || 'NO_LIEN'})`
                                          : 'Amount, IFSC, maturity date, and government lien verified.'))))}
                      </div>
                    </div>
                    {sim && sim.amount_matched !== false && sim.ifsc_matched !== false && sim.maturity_matched !== false && sim.lien_matched !== false ? (
                      <span style={{ background: '#dcfce7', color: '#15803d', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 600, fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                        <CheckCircle2 size={12} /> PASSED
                      </span>
                    ) : (
                      <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 600, fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                        <AlertTriangle size={12} /> FAILED / BLOCKER
                      </span>
                    )}
                  </div>

                  {/* Item 2: Statutory Clearances */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.825rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
                    <div>
                      <strong style={{ color: '#0f172a' }}>2. AICTE APH §6.46 Department Clearances:</strong>
                      <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                        {caseItem.tasks && caseItem.tasks.some(t => t.status === 'BLOCKED')
                          ? `Clearance Blocked: ${caseItem.tasks.find(t => t.status === 'BLOCKED')?.task_name} ("${caseItem.tasks.find(t => t.status === 'BLOCKED')?.blocker_reason}")`
                          : (caseItem.tasks && caseItem.tasks.some(t => t.status === 'PENDING' || t.status === 'IN_PROGRESS')
                              ? `${caseItem.tasks.filter(t => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length} mandatory department task(s) incomplete.`
                              : 'All 4 statutory review queues (Finance, Affiliation, Legal, Regional) approved.')}
                      </div>
                    </div>
                    {caseItem.tasks && !caseItem.tasks.some(t => t.status === 'BLOCKED' || t.status === 'PENDING' || t.status === 'IN_PROGRESS') ? (
                      <span style={{ background: '#dcfce7', color: '#15803d', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 600, fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                        <CheckCircle2 size={12} /> PASSED
                      </span>
                    ) : (
                      <span style={{ background: (caseItem.tasks && caseItem.tasks.some(t => t.status === 'BLOCKED')) ? '#fee2e2' : '#fef3c7', color: (caseItem.tasks && caseItem.tasks.some(t => t.status === 'BLOCKED')) ? '#b91c1c' : '#92400e', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 600, fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                        <Clock size={12} /> {(caseItem.tasks && caseItem.tasks.some(t => t.status === 'BLOCKED')) ? 'BLOCKED' : 'PENDING'}
                      </span>
                    )}
                  </div>

                  {/* Item 3: Legal & Procedural Objections */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.825rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
                    <div>
                      <strong style={{ color: '#0f172a' }}>3. Legal &amp; Procedural Objections:</strong>
                      <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                        {caseItem.objections && caseItem.objections.some(o => o.status === 'ACTIVE')
                          ? `Active Objection: "${caseItem.objections.find(o => o.status === 'ACTIVE')?.title}" requires resolution.`
                          : 'No active objections on record.'}
                      </div>
                    </div>
                    {caseItem.objections && !caseItem.objections.some(o => o.status === 'ACTIVE') ? (
                      <span style={{ background: '#dcfce7', color: '#15803d', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 600, fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                        <CheckCircle2 size={12} /> PASSED
                      </span>
                    ) : (
                      <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 600, fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                        <AlertTriangle size={12} /> ACTIVE OBJECTION
                      </span>
                    )}
                  </div>

                  {/* Item 4: Evidentiary Certificate Document */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.825rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
                    <div>
                      <strong style={{ color: '#0f172a' }}>4. Evidentiary Document Seal:</strong>
                      <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                        Physical certificate recorded with SHA-256 integrity seal.
                      </div>
                    </div>
                    <span style={{ background: '#dcfce7', color: '#15803d', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 600, fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                      <CheckCircle2 size={12} /> VERIFIED
                    </span>
                  </div>

                  {/* Item 5: Sanction Scope Rule */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.825rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
                    <div>
                      <strong style={{ color: '#0f172a' }}>5. Sanction Scope &amp; Legal Protection:</strong>
                      <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                        Scope limited strictly to <strong>DEMO_APPROVED</strong>. Simulated evidence cannot authorize official financial release.
                      </div>
                    </div>
                    <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 600, fontSize: '0.72rem' }}>
                      ENFORCED
                    </span>
                  </div>
                </div>
              </div>

              <form className="decision-form" onSubmit={handleDecisionSubmit}>
                <div className="form-group">
                  <label className="form-label">Decision Action</label>
                  <div className="decision-radio-group">
                    <label className={`radio-pill ${decision === 'APPROVE' ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="decision"
                        value="APPROVE"
                        checked={decision === 'APPROVE'}
                        onChange={(e) => setDecision(e.target.value)}
                      />
                      <span>Approve Guarantee</span>
                    </label>
                    <label className={`radio-pill ${decision === 'REJECT' ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="decision"
                        value="REJECT"
                        checked={decision === 'REJECT'}
                        onChange={(e) => setDecision(e.target.value)}
                      />
                      <span>Reject Guarantee</span>
                    </label>
                    <label className={`radio-pill ${decision === 'SEEK_CLARIFICATION' ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="decision"
                        value="SEEK_CLARIFICATION"
                        checked={decision === 'SEEK_CLARIFICATION'}
                        onChange={(e) => setDecision(e.target.value)}
                      />
                      <span>Seek Clarification</span>
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Sanctioning Role
                    <span className="demo-role-tag">Demo Role Selection — Not Production Authentication</span>
                  </label>
                  <select
                    className="role-select"
                    value={officerRole}
                    onChange={(e) => setOfficerRole(e.target.value)}
                  >
                    <option value="Competent Authority (Demo Role)">Competent Authority / Executive Approver</option>
                    <option value="Nodal Legal Officer (Demo Role)">Nodal Legal Officer</option>
                    <option value="Chief Accounts Officer (Demo Role)">Chief Accounts Officer</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Justification Rationale <strong style={{ color: '#dc2626' }}>*</strong>
                  </label>
                  <textarea
                    rows={3}
                    className="rationale-input"
                    placeholder="Enter formal justification rationale required for the immutable audit log..."
                    value={rationale}
                    onChange={(e) => setRationale(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center' }}
                  disabled={submittingDecision}
                >
                  <Send size={15} />
                  <span>{submittingDecision ? 'Submitting to Decision Gate...' : 'Execute Sanction Decision'}</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 4: DOCUMENTS & VERSIONING */}
          {activeTab === 'documents' && (
            <div className="detail-section">
              <div className="section-header-bar">
                <div>
                  <h3 className="section-heading">Evidentiary Document Repository &amp; Versions</h3>
                  <p className="section-subtext">
                    Multi-version physical certificate records with cryptographic SHA-256 integrity verification.
                  </p>
                </div>
              </div>

              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {caseItem.documents && caseItem.documents.length > 0 ? (
                  caseItem.documents.map((doc, idx) => (
                    <div key={doc.id || idx} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <FileText size={18} color="#1e3a5f" />
                          <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{doc.document_name}</strong>
                          <span style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '0.75rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                            Version v{doc.version || 1}
                          </span>
                        </div>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: '#dcfce7', color: '#15803d', fontSize: '0.75rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                          <ShieldCheck size={13} />
                          Integrity Verified
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#475569', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem', marginTop: '0.25rem' }}>
                        <div><strong>Type:</strong> <code>{doc.document_type || 'FDR_CERTIFICATE'}</code></div>
                        <div><strong>Size:</strong> {doc.file_size_bytes ? `${(doc.file_size_bytes / 1024).toFixed(1)} KB` : 'N/A'}</div>
                        <div><strong>Uploaded By:</strong> {doc.uploaded_by || 'Institution'} ({doc.uploaded_by_role || 'INSTITUTION'})</div>
                        <div><strong>Date:</strong> {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleString() : 'Registered at Intake'}</div>
                      </div>
                      <div style={{ marginTop: '0.35rem', background: '#f8fafc', padding: '0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '0.75rem', color: '#334155', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        <strong>SHA-256:</strong> {doc.sha256_hash || 'SHA256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileText size={18} color="#1e3a5f" />
                        <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{caseItem.document_filename || 'Original_FDR_Certificate.pdf'}</strong>
                        <span style={{ background: '#e0f2fe', color: '#0369a1', fontSize: '0.75rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                          Version v1
                        </span>
                      </div>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: '#dcfce7', color: '#15803d', fontSize: '0.75rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                        <ShieldCheck size={13} />
                        Intake Retained
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.25rem' }}>
                      Physical FDR certificate deposited at application intake. Cryptographic SHA-256 seal assigned at registration.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: RENEWALS & REPLACEMENTS */}
          {activeTab === 'renewals' && (
            <div className="detail-section">
              <div className="section-header-bar">
                <div>
                  <h3 className="section-heading">FDR Renewal &amp; Replacement Ledger</h3>
                  <p className="section-subtext">
                    Historical record of deposit extensions, FDR replacement numbers, and extended maturity dates.
                  </p>
                </div>
              </div>

              <div style={{ marginTop: '1rem' }}>
                {caseItem.renewals && caseItem.renewals.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {caseItem.renewals.map((ren, idx) => (
                      <div key={ren.id || idx} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', background: '#f8fafc' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <span style={{ fontWeight: 600, color: '#1e3a5f', fontSize: '0.9rem' }}>
                            Renewal Event #{idx + 1}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {new Date(ren.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem', fontSize: '0.825rem' }}>
                          <div>Previous FDR: <code>{ren.previous_fdr_number}</code></div>
                          <div>New Extended FDR: <code>{ren.new_fdr_number}</code></div>
                          <div>Previous Maturity: {new Date(ren.previous_maturity_date).toLocaleDateString()}</div>
                          <div>New Extended Maturity: <strong>{new Date(ren.new_maturity_date).toLocaleDateString()}</strong></div>
                          <div>Extended Amount: <strong>{formatCurrency(ren.new_amount || ren.renewal_amount)}</strong></div>
                          <div>Authorized By: <strong>{ren.renewed_by || ren.actor}</strong></div>
                        </div>
                        {(ren.renewal_notes || ren.remarks) && (
                          <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#475569', fontStyle: 'italic' }}>
                            "{ren.renewal_notes || ren.remarks}"
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="table-status-box empty-box">
                    <History size={24} style={{ color: '#94a3b8', marginBottom: '0.5rem' }} />
                    <p><strong>No Renewals Recorded</strong></p>
                    <p style={{ fontSize: '0.825rem', color: '#64748b', marginTop: '0.25rem' }}>
                      Current deposit is operating under its primary term, maturing on {new Date(caseItem.maturity_date).toLocaleDateString()}.
                    </p>
                  </div>
                )}
              </div>

              {/* Distinction between implemented and planned */}
              <div style={{ marginTop: '1.25rem', padding: '0.75rem 1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.75rem', color: '#64748b' }}>
                <strong>Lifecycle Roadmap Note:</strong> Implemented: In-App Renewals &amp; Replacement Registry with cryptographic integrity. Planned: 5-Stage Automated External Dispatcher (SMS &amp; Email alerts to institution nodal officers).
              </div>
            </div>
          )}

          {/* TAB 6: AUDIT REPLAY */}
          {activeTab === 'audit' && (
            <div className="audit-section">
              <div className="section-header-bar">
                <div>
                  <h3 className="section-heading">Chronological Audit Replay</h3>
                  <p className="section-subtext">
                    Immutable event ledger recording actor, action, timestamp, and justification rationale.
                  </p>
                </div>
                <button className="btn-secondary" onClick={loadAudit} disabled={loadingAudit}>
                  <RefreshCw size={13} className={loadingAudit ? 'spin' : ''} />
                  <span>Refresh Log</span>
                </button>
              </div>

              {loadingAudit ? (
                <div className="table-status-box">
                  <RefreshCw size={20} className="spin" />
                  <p>Loading audit timeline...</p>
                </div>
              ) : auditEvents.length === 0 ? (
                <div className="table-status-box empty-box">
                  <p>No audit events recorded for this case yet.</p>
                </div>
              ) : (
                <div className="timeline-container">
                  {auditEvents.map((evt, idx) => (
                    <div key={evt.id || idx} className="timeline-item">
                      <div className="timeline-dot" />
                      <div className="timeline-card">
                        <div className="timeline-header">
                          <strong className="timeline-action">{evt.action}</strong>
                          <span className="timeline-time">
                            {new Date(evt.event_timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div className="timeline-actor">
                          <UserCheck size={14} />
                          <span>{evt.actor} ({evt.actor_role})</span>
                        </div>
                        {evt.rationale && (
                          <div className="timeline-rationale">
                            "{evt.rationale}"
                          </div>
                        )}
                        {evt.previous_state && evt.new_state && (
                          <div className="timeline-state-change">
                            State transition: <code>{evt.previous_state}</code> &rarr; <code>{evt.new_state}</code>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <div className="footer-disclaimer">
            KOSH-PRAMAAN Automated Verification Engine &bull; Non-binding simulated decision support
          </div>
          <button className="btn-secondary" onClick={onClose}>
            Close Case View
          </button>
        </div>
      </div>
    </div>
  );
}
