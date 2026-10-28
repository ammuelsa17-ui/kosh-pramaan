import React, { useState } from 'react';
import { X, Send, FilePlus, AlertTriangle, CheckCircle2, ShieldAlert, Sparkles, Building2 } from 'lucide-react';
import { submitNewFdrCase, getActiveUser } from '../api/casesApi';

export default function SubmitFdrModal({ onClose, onCaseSubmitted }) {
  const activeUser = getActiveUser();
  const isAuthorized = activeUser && (activeUser.role === 'INSTITUTION' || activeUser.role === 'AICTE_OFFICER');

  const [formData, setFormData] = useState({
    institution_name: activeUser && activeUser.role === 'INSTITUTION' ? activeUser.name : 'Vellore Institute of Global Engineering',
    depositor_name: 'Vellore Educational Trust Security Guarantee A/C',
    fdr_number: `FDR/SBI/2026/${Math.floor(100000 + Math.random() * 900000)}`,
    issuing_bank: 'State Bank of India',
    branch_name: 'Main Institutional Branch, Chennai',
    ifsc_code: 'SBIN0001842',
    submitted_amount: '5000000.00',
    lien_marked_to: 'All India Council for Technical Education (AICTE), New Delhi',
    deposit_date: '2026-03-01',
    maturity_date: '2028-03-01',
    document_filename: 'Vellore_Engineering_AICTE_FDR_2026.pdf'
  });

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successCase, setSuccessCase] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePreFill = () => {
    setFormData({
      institution_name: 'Bharath University of Technology & Research',
      depositor_name: 'Bharath Educational Foundation Guarantee Fund',
      fdr_number: `FDR/PNB/2026/${Math.floor(100000 + Math.random() * 900000)}`,
      issuing_bank: 'Punjab National Bank',
      branch_name: 'Connaught Place Branch, New Delhi',
      ifsc_code: 'PUNB0145200',
      submitted_amount: '7500000.00',
      lien_marked_to: 'All India Council for Technical Education (AICTE), New Delhi',
      deposit_date: '2026-02-15',
      maturity_date: '2029-02-15',
      document_filename: 'Bharath_Tech_AICTE_Security_Deposit.pdf'
    });
    setErrorMsg(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    const res = await submitNewFdrCase(formData);
    setSubmitting(false);

    if (res.ok) {
      setSuccessCase(res.data);
      if (onCaseSubmitted) onCaseSubmitted(res.data);
    } else {
      setErrorMsg(res.error || 'Failed to submit application');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container submit-fdr-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <div className="modal-badge-row">
              <span className="case-id-badge" style={{ background: '#0284c7' }}>INTAKE PORTAL</span>
              <span className="queue-pill">SIH26265 Submission Form</span>
            </div>
            <h2 className="modal-title">New FDR Security Deposit Submission</h2>
            <p className="modal-subtitle">
              Official institutional deposit registration with automated clearance initialization
            </p>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        {/* Identity & RBAC Check Banner */}
        <div style={{ padding: '0.75rem 1.5rem', background: isAuthorized ? '#f0fdf4' : '#fef2f2', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: isAuthorized ? '#166534' : '#991b1b' }}>
            {isAuthorized ? <CheckCircle2 size={16} /> : <ShieldAlert size={16} />}
            <span>
              Submitting as: <strong>{activeUser ? activeUser.name : 'Unauthenticated'}</strong> ({activeUser ? activeUser.role : 'NO_ROLE'})
            </span>
          </div>
          <button type="button" className="btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }} onClick={handlePreFill}>
            <Sparkles size={12} />
            <span>Pre-fill Sample FDR</span>
          </button>
        </div>

        {!isAuthorized && (
          <div style={{ margin: '1rem 1.5rem', padding: '0.75rem', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '6px', color: '#be123c', fontSize: '0.85rem' }}>
            <strong>Access Denied:</strong> Your current active role ({activeUser ? activeUser.role : 'Guest'}) is not permitted to submit FDR applications. Only registered <strong>INSTITUTION</strong> applicants or AICTE officers have submission privileges. Please select <em>INSTITUTION</em> in the header role dropdown.
          </div>
        )}

        {/* Success Banner */}
        {successCase && (
          <div style={{ margin: '1.5rem', padding: '1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', textAlign: 'center' }}>
            <CheckCircle2 size={36} color="#16a34a" style={{ margin: '0 auto 0.5rem' }} />
            <h3 style={{ fontSize: '1.1rem', color: '#166534', marginBottom: '0.25rem' }}>FDR Case Registered Successfully!</h3>
            <p style={{ fontSize: '0.875rem', color: '#15803d', marginBottom: '1rem' }}>
              Assigned Case ID: <strong>{successCase.id}</strong> &bull; Department Queue: <strong>{successCase.department_queue}</strong>
            </p>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>
              Initialized 3 mandatory clearance checkpoints (Accounts, Legal, Technical) and logged in immutable audit ledger.
            </p>
            <button className="btn-primary" onClick={onClose} style={{ margin: '0 auto' }}>
              <span>Done &amp; View in Inventory</span>
            </button>
          </div>
        )}

        {!successCase && (
          <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
            {errorMsg && (
              <div style={{ padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#b91c1c', fontSize: '0.85rem', marginBottom: '1rem' }}>
                <AlertTriangle size={16} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '0.35rem' }} />
                {errorMsg}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Institution Name *</label>
                <input
                  type="text"
                  name="institution_name"
                  value={formData.institution_name}
                  onChange={handleChange}
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Depositor Name / Trust *</label>
                <input
                  type="text"
                  name="depositor_name"
                  value={formData.depositor_name}
                  onChange={handleChange}
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>FDR Certificate Number *</label>
                <input
                  type="text"
                  name="fdr_number"
                  value={formData.fdr_number}
                  onChange={handleChange}
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Issuing Bank *</label>
                <input
                  type="text"
                  name="issuing_bank"
                  value={formData.issuing_bank}
                  onChange={handleChange}
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Branch Name *</label>
                <input
                  type="text"
                  name="branch_name"
                  value={formData.branch_name}
                  onChange={handleChange}
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>IFSC Code *</label>
                <input
                  type="text"
                  name="ifsc_code"
                  value={formData.ifsc_code}
                  onChange={handleChange}
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', textTransform: 'uppercase' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Submitted Deposit Amount (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  name="submitted_amount"
                  value={formData.submitted_amount}
                  onChange={handleChange}
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Lien Marked To *</label>
                <input
                  type="text"
                  name="lien_marked_to"
                  value={formData.lien_marked_to}
                  onChange={handleChange}
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Deposit Date *</label>
                <input
                  type="date"
                  name="deposit_date"
                  value={formData.deposit_date}
                  onChange={handleChange}
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>Maturity Date *</label>
                <input
                  type="date"
                  name="maturity_date"
                  value={formData.maturity_date}
                  onChange={handleChange}
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            {/* Regulatory Disclaimer */}
            <div style={{ marginTop: '1.25rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.75rem', color: '#64748b' }}>
              <strong>AICTE Compliance Notice:</strong> Submitted FDR instruments are registered in unverified status. By submitting, the institution warrants the accuracy of deposit receipts. The platform executes automated bank reconciliation and inter-departmental clearances prior to sanctioning.
            </div>

            {/* Actions */}
            <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={submitting || !isAuthorized}>
                <Send size={14} />
                <span>{submitting ? 'Submitting Application...' : 'Register FDR Application'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
