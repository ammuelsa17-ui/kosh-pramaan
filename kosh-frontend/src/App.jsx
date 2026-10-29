import React, { useState } from 'react';
import Header from './components/Header';
import Navigation from './components/Navigation';
import HealthStatusBadge from './components/HealthStatusBadge';
import DashboardPlaceholder from './components/DashboardPlaceholder';
import CaseTable from './components/CaseTable';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [caseFilter, setCaseFilter] = useState('ALL');
  const [targetCaseId, setTargetCaseId] = useState(null);

  const handleNavigateToCases = (filter = 'ALL', caseId = null) => {
    setCaseFilter(filter);
    setTargetCaseId(caseId);
    setActiveTab('cases');
  };

  return (
    <div className="app-container">
      <Header />
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="main-content">
        <HealthStatusBadge />
        {activeTab === 'cases' ? (
          <CaseTable
            initialFilter={caseFilter}
            initialCaseId={targetCaseId}
            onClearTargetCase={() => setTargetCaseId(null)}
          />
        ) : (
          <DashboardPlaceholder
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onNavigateToCases={handleNavigateToCases}
          />
        )}
      </main>

      <footer className="gov-footer">
        <p>
          KOSH-PRAMAAN &bull; Smart India Hackathon Problem SIH26265 &bull; Prototype Build for Rapid Evaluation
        </p>
        <p style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#94a3b8' }}>
          Simulated Demonstration Platform &bull; No live bank, RBI or NeSL API connections &bull; PostgreSQL Relational Monolith
        </p>
      </footer>
    </div>
  );
}
