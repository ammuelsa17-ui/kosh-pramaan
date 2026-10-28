import React, { useState, useEffect } from 'react';
import { Search, Filter, RefreshCw, AlertTriangle, CheckCircle2, ShieldAlert, Eye, Database, Info, FileText, Clock } from 'lucide-react';
import { fetchCases, fetchCaseDetail } from '../api/casesApi';
import CaseDetailModal from './CaseDetailModal';

export default function CaseTable() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dataSource, setDataSource] = useState(null);
  const [dbError, setDbError] = useState(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Selected case for detailed modal view
  const [selectedCase, setSelectedCase] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadCases = async () => {
    setLoading(true);
    setError(null);
    const result = await fetchCases();
    if (result.ok) {
      setCases(result.data);
      setDataSource(result.source);
      setDbError(result.dbError);
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCases();
  }, []);

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

    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;

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

      {/* 4 Summary Metric Cards (Step 7 - Task 2) */}
      <div className="kpi-grid">
        <div
          className="kpi-card"
          onClick={() => setStatusFilter('ALL')}
          title="Click to view all cases"
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
          onClick={() => {
            // Filter to mismatch or blocked cases
            setStatusFilter(amountMismatches > 0 ? 'MISMATCH_FLAGGED' : 'CLEARANCE_BLOCKED');
          }}
          title="Click to view cases requiring officer attention"
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
          onClick={() => setStatusFilter('CLEARANCE_BLOCKED')}
          title="Click to view clearance blocked cases"
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
          title="Click to view amount mismatches"
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
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="MISMATCH_FLAGGED">Mismatch Flagged</option>
            <option value="CLEARANCE_BLOCKED">Clearance Blocked</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="APPROVED">Approved</option>
          </select>

          <button className="refresh-table-btn" onClick={loadCases} disabled={loading} title="Refresh case list">
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Reload</span>
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
                        {c.status === 'APPROVED' && 'Approved'}
                        {c.status === 'REJECTED' && 'Rejected'}
                        {!['UNDER_REVIEW', 'MISMATCH_FLAGGED', 'CLEARANCE_BLOCKED', 'SUBMITTED', 'APPROVED', 'REJECTED'].includes(c.status) && c.status.replace(/_/g, ' ')}
                      </span>
                      {c.status === 'CLEARANCE_BLOCKED' && (
                        <div className="status-subtext-blocked">Pending Legal / Admin Clearance</div>
                      )}
                      {c.status === 'MISMATCH_FLAGGED' && (
                        <div className="status-subtext-mismatch">Amount Discrepancy Flagged</div>
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
    </div>
  );
}
