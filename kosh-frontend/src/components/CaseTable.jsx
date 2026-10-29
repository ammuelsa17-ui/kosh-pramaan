import React, { useState, useEffect } from 'react';
import { Search, Filter, RefreshCw, AlertTriangle, CheckCircle2, ShieldAlert, Eye, Database, Info, FileText, Clock, FilePlus, BellRing } from 'lucide-react';
import { fetchCases, fetchCaseDetail, fetchMaturityAlerts } from '../api/casesApi';
import CaseDetailModal from './CaseDetailModal';
import SubmitFdrModal from './SubmitFdrModal';

export default function CaseTable({ initialFilter = 'ALL', initialCaseId = null, onClearTargetCase = null }) {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataSource, setDataSource] = useState(null);
  const [dbError, setDbError] = useState(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [maturityAlerts, setMaturityAlerts] = useState([]);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialFilter || 'ALL');

  // Selected case for detailed modal view
  const [selectedCase, setSelectedCase] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (initialFilter) {
      setStatusFilter(initialFilter);
    }
  }, [initialFilter]);

  const loadCases = async () => {
    setLoading(true);
    setError(null);
    const [result, alertsRes] = await Promise.all([
      fetchCases(),
      fetchMaturityAlerts(90)
    ]);
    if (result.ok) {
      setCases(result.data);
      setDataSource(result.source);
      setDbError(result.dbError);
    } else {
      setError(result.error);
    }
    if (alertsRes && alertsRes.ok) {
      setMaturityAlerts(alertsRes.alerts || alertsRes.data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCases();
  }, []);

  useEffect(() => {
    if (initialCaseId && cases.length > 0) {
      handleOpenDetail(initialCaseId);
      if (typeof onClearTargetCase === 'function') {
        onClearTargetCase();
      }
    }
  }, [initialCaseId, cases]);

  const handleOpenDetail = async (caseId) => {
    setDetailLoading(true);
    const res = await fetchCaseDetail(caseId);
    if (res.ok && res.data) {
      setSelectedCase(res.data);
    } else {
      // Fallback to table item if detail fetch fails
      const fallback = cases.find((c) => c.id === caseId);
      setSelectedCase(fallback || null);
    }
    setDetailLoading(false);
  };

  const formatCurrency = (amt) => {
    if (!amt) return '₹0.00';
    const num = parseFloat(amt);
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Filter cases based on search term and status
  const filteredCases = cases.filter((c) => {
    const matchesSearch =
      c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.institution_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.fdr_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.issuing_bank.toLowerCase().includes(searchTerm.toLowerCase());

    let matchesStatus = true;
    if (statusFilter === 'ALL') {
      matchesStatus = true;
    } else if (statusFilter === 'ATTENTION') {
      matchesStatus = c.status === 'MISMATCH_FLAGGED' || c.status === 'CLEARANCE_BLOCKED' || (c.blocked_tasks && c.blocked_tasks > 0) || (c.active_objections && c.active_objections > 0);
    } else if (statusFilter === 'PENDING_CLEARANCES') {
      matchesStatus = Boolean(c.pending_tasks && c.pending_tasks > 0);
    } else if (statusFilter === 'DEMO_APPROVED') {
      matchesStatus = c.status === 'DEMO_APPROVED' || c.status === 'APPROVED';
    } else {
      matchesStatus = c.status === statusFilter;
    }

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="case-inventory-wrapper">
      {/* Data Source Transparency Banner */}
      {dataSource === 'SEEDED_FALLBACK' && (
        <div className="source-banner fallback-banner">
          <div className="banner-content">
            <AlertTriangle size={18} />
            <div>
              <strong>DEMO MODE: Serving Seeded Fallback Cases — Not Confirmed Database Data</strong>
              <div className="banner-subtext">
                PostgreSQL socket unavailable: {dbError || 'Restricted environment socket'}. Displaying verified local demo fixtures.
              </div>
            </div>
          </div>
          <button className="banner-action-btn" onClick={loadCases}>
            <RefreshCw size={13} />
            <span>Retry PostgreSQL</span>
          </button>
        </div>
      )}

      {dataSource === 'POSTGRESQL' && (
        <div className="source-banner pg-banner">
          <div className="banner-content">
            <Database size={18} />
            <div>
              <strong>Data Source: Live PostgreSQL Database</strong>
              <div className="banner-subtext">
                Connected to local PostgreSQL service. All {cases.length} records retrieved from relational tables.
              </div>
            </div>
          </div>
          <span className="live-pill">Live Relational Data</span>
        </div>
      )}

      {/* Maturity Surveillance Banner */}
      {maturityAlerts && maturityAlerts.length > 0 && (
        <div className="source-banner" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: '1.25rem' }}>
          <div className="banner-content">
            <BellRing size={18} color="#d97706" />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <strong>FDR Maturity Surveillance: {maturityAlerts.length} Deposit(s) Within 90-Day Window</strong>
                <span style={{ fontSize: '0.72rem', background: '#fef3c7', border: '1px solid #fde68a', padding: '0.1rem 0.45rem', borderRadius: '4px', fontWeight: 600 }}>
                  Implemented: In-App Surveillance &amp; Alerts API &bull; Planned: 5-Stage Automated External Dispatcher (SMS/Email)
                </span>
              </div>
              <div className="banner-subtext" style={{ color: '#b45309', marginTop: '0.2rem' }}>
                {maturityAlerts.filter(a => a.alert_level === 'CRITICAL' || a.alert_level === 'EXPIRED').length > 0
                  ? `Critical Attention: ${maturityAlerts.filter(a => a.alert_level === 'CRITICAL' || a.alert_level === 'EXPIRED').length} deposit(s) expired or expiring within 15 days require renewal.`
                  : 'All tracked deposits are actively monitored in the AICTE APH §6.46 maturity surveillance lifecycle.'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {maturityAlerts.map(a => (
              <span
                key={a.id}
                style={{
                  background: a.alert_level === 'EXPIRED' ? '#fee2e2' : (a.alert_level === 'CRITICAL' ? '#fef3c7' : '#f1f5f9'),
                  color: a.alert_level === 'EXPIRED' ? '#b91c1c' : (a.alert_level === 'CRITICAL' ? '#92400e' : '#475569'),
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  border: '1px solid rgba(0,0,0,0.06)'
                }}
                onClick={() => handleOpenDetail(a.id)}
                title={`Click to view case ${a.id} (Maturing in ${a.days_to_maturity} days)`}
              >
                {a.fdr_number || a.id} ({a.days_to_maturity < 0 ? 'EXPIRED' : `${a.days_to_maturity}d`})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 4 Summary Metric Cards (Step 7 - Task 2) */}
      <div className="kpi-grid">
        <div
          className="kpi-card"
          onClick={() => setStatusFilter('ALL')}
          title="Click to view all cases"
          style={{ cursor: 'pointer' }}
        >
          <div className="kpi-icon blue">
            <FileText size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-value">{totalCases}</span>
            <span className="kpi-label">Total FDR Cases</span>
            <span className="kpi-desc">Registered Guarantees</span>
          </div>
        </div>

        <div
          className="kpi-card"
          onClick={() => setStatusFilter('ATTENTION')}
          title="Click to view cases requiring officer attention"
          style={{ cursor: 'pointer' }}
        >
          <div className="kpi-icon red">
            <ShieldAlert size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-value">{casesRequiringAttention}</span>
            <span className="kpi-label">Cases Requiring Attention</span>
            <span className="kpi-desc">Discrepancies / Active Blockers</span>
          </div>
        </div>

        <div
          className="kpi-card"
          onClick={() => setStatusFilter('PENDING_CLEARANCES')}
          title="Click to view cases with pending clearances"
          style={{ cursor: 'pointer' }}
        >
          <div className="kpi-icon amber">
            <Clock size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-value">{pendingClearances}</span>
            <span className="kpi-label">Pending Clearances</span>
            <span className="kpi-desc">Incomplete Departmental Tasks</span>
          </div>
        </div>

        <div
          className="kpi-card"
          onClick={() => setStatusFilter('MISMATCH_FLAGGED')}
          title="Click to view amount/data mismatches"
          style={{ cursor: 'pointer' }}
        >
          <div className="kpi-icon amber">
            <AlertTriangle size={20} />
          </div>
          <div className="kpi-content">
            <span className="kpi-value">{amountMismatches}</span>
            <span className="kpi-label">Amount Mismatches</span>
            <span className="kpi-desc">Submitted vs Bank Ledger</span>
          </div>
        </div>
      </div>

      {/* Control Bar: Search, Filter, and Refresh */}
      <div className="table-controls">
        <div className="search-box">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search by Case ID, Institution, FDR Number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="clear-search-btn" onClick={() => setSearchTerm('')}>
              &times;
            </button>
          )}
        </div>

        <div className="filter-group">
          <Filter size={16} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">All Statuses ({cases.length})</option>
            <option value="ATTENTION">Requiring Attention ({casesRequiringAttention})</option>
            <option value="PENDING_CLEARANCES">Pending Clearances ({cases.filter(c => c.pending_tasks > 0).length})</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="MISMATCH_FLAGGED">Mismatch Flagged</option>
            <option value="CLEARANCE_BLOCKED">Clearance Blocked</option>
            <option value="SUBMITTED">Submitted / Intake</option>
            <option value="DEMO_APPROVED">Demo Approved / Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>

          <button className="refresh-table-btn" onClick={loadCases} disabled={loading} title="Refresh case list">
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Reload</span>
          </button>

          <button className="btn-primary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }} onClick={() => setShowSubmitModal(true)}>
            <FilePlus size={14} />
            <span>Submit New FDR</span>
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="table-status-box">
          <RefreshCw size={24} className="spin" />
          <p>Loading FDR cases from API...</p>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="table-status-box error-box">
          <AlertTriangle size={24} />
          <p><strong>Failed to load cases:</strong> {error}</p>
          <button className="retry-btn" style={{ marginTop: '0.75rem' }} onClick={loadCases}>
            Retry Request
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredCases.length === 0 && (
        <div className="table-status-box empty-box">
          <Info size={24} />
          <p>No FDR cases matched your filter criteria.</p>
          <button className="clear-filter-btn" onClick={() => { setSearchTerm(''); setStatusFilter('ALL'); }}>
            Reset Filters
          </button>
        </div>
      )}

      {/* Data Table */}
      {!loading && !error && filteredCases.length > 0 && (
        <div className="table-container">
          <table className="gov-data-table">
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Institution &amp; Depositor</th>
                <th>FDR Number</th>
                <th>Submitted Amount</th>
                <th>Status</th>
                <th>Pending Tasks</th>
                <th>Discrepancy Indicator</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCases.map((c) => {
                const hasAmountMismatch = c.amount_matched === false;
                const hasBlocker = c.blocked_tasks > 0;

                return (
                  <tr key={c.id}>
                    <td>
                      <span className="case-id-tag">{c.id}</span>
                    </td>
                    <td>
                      <div className="cell-institution">{c.institution_name}</div>
                      <div className="cell-depositor">{c.depositor_name}</div>
                    </td>
                    <td>
                      <div className="cell-fdr-number">{c.fdr_number}</div>
                      <div className="cell-bank">{c.issuing_bank.replace('(Simulated Core Banking)', '').trim()}</div>
                    </td>
                    <td className="amount-cell">
                      {formatCurrency(c.submitted_amount)}
                    </td>
                    <td>
                      <span className={`status-pill status-${c.status.toLowerCase()}`}>
                        {c.status === 'UNDER_REVIEW' && 'Under Review'}
                        {c.status === 'MISMATCH_FLAGGED' && 'Mismatch Flagged'}
                        {c.status === 'CLEARANCE_BLOCKED' && 'Clearance Blocked'}
                        {c.status === 'SUBMITTED' && 'Intake Submitted'}
                        {c.status === 'DEMO_APPROVED' && 'Demo Approved (Simulated)'}
                        {c.status === 'APPROVED' && 'Approved (Official)'}
                        {c.status === 'RELEASE_REQUESTED' && 'Release Requested'}
                        {c.status === 'RELEASE_SANCTIONED' && 'Release Sanctioned'}
                        {c.status === 'REFUNDED' && 'Refunded / Closed'}
                        {c.status === 'REJECTED' && 'Rejected'}
                        {!['UNDER_REVIEW', 'MISMATCH_FLAGGED', 'CLEARANCE_BLOCKED', 'SUBMITTED', 'DEMO_APPROVED', 'APPROVED', 'RELEASE_REQUESTED', 'RELEASE_SANCTIONED', 'REFUNDED', 'REJECTED'].includes(c.status) && c.status.replace(/_/g, ' ')}
                      </span>
                      {c.status === 'CLEARANCE_BLOCKED' && (
                        <div className="status-subtext-blocked">Pending Legal / Admin Clearance</div>
                      )}
                      {c.status === 'MISMATCH_FLAGGED' && (
                        <div className="status-subtext-mismatch">Discrepancy Flagged</div>
                      )}
                      {c.status === 'DEMO_APPROVED' && (
                        <div className="status-subtext-demo" style={{ color: '#166534', fontSize: '0.7rem', marginTop: '0.2rem', fontWeight: 500 }}>
                          &bull; Simulated Demo Approval (Not Official Release)
                        </div>
                      )}
                    </td>
                    <td>
                      {c.pending_tasks > 0 ? (
                        <div>
                          <span className={`task-badge ${hasBlocker ? 'task-blocked' : 'task-pending'}`}>
                            {c.pending_tasks} {c.pending_tasks === 1 ? 'Clearance' : 'Clearances'} Pending
                          </span>
                          {hasBlocker && (
                            <div className="task-blocker-note">&bull; {c.blocked_tasks} task(s) flagged blocked</div>
                          )}
                        </div>
                      ) : (
                        <span className="task-badge task-clear">&check; All Clearances Completed</span>
                      )}
                    </td>
                    <td>
                      {hasAmountMismatch ? (
                        <span className="discrepancy-tag tag-mismatch" title="Simulated bank amount does not match submitted value">
                          <AlertTriangle size={12} />
                          <span>Amount Mismatch</span>
                        </span>
                      ) : c.amount_matched === true ? (
                        <span className="discrepancy-tag tag-matched" title="Submitted amount matches simulated bank ledger">
                          <CheckCircle2 size={12} />
                          <span>Matched</span>
                        </span>
                      ) : (
                        <span className="discrepancy-tag tag-unverified" title="Simulation verification pending">
                          &bull; Unverified
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        className="view-btn"
                        onClick={() => handleOpenDetail(c.id)}
                        disabled={detailLoading}
                      >
                        <Eye size={13} />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Case Detail Modal View */}
      {selectedCase && (
        <CaseDetailModal
          caseItem={selectedCase}
          onClose={() => setSelectedCase(null)}
          onCaseUpdated={() => loadCases()}
        />
      )}

      {/* New FDR Application Modal */}
      {showSubmitModal && (
        <SubmitFdrModal
          onClose={() => setShowSubmitModal(false)}
          onCaseSubmitted={() => {
            loadCases();
          }}
        />
      )}
    </div>
  );
}
