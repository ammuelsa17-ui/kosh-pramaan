import React, { useState } from 'react';
import Header from './components/Header';
import Navigation from './components/Navigation';
import HealthStatusBadge from './components/HealthStatusBadge';
import DashboardPlaceholder from './components/DashboardPlaceholder';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard'); // Start on Executive Dashboard overview

  return (
    <div className="app-container">
      <Header />
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="main-content">
        <HealthStatusBadge />
        <DashboardPlaceholder activeTab={activeTab} setActiveTab={setActiveTab} />
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
