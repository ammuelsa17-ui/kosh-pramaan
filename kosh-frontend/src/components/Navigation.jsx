import React from 'react';
import { LayoutDashboard, FileText, CheckCircle2, ShieldAlert, History } from 'lucide-react';

export default function Navigation({ activeTab, setActiveTab }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'cases', label: 'FDR Cases', icon: FileText, badge: 'Seeded' },
    { id: 'verification', label: 'Verification', icon: CheckCircle2, badge: 'Simulated' },
    { id: 'clearances', label: 'Clearances', icon: ShieldAlert },
    { id: 'audit', label: 'Audit Replay', icon: History }
  ];

  return (
    <nav className="gov-nav">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
          >
            <Icon size={16} />
            <span>{item.label}</span>
            {item.badge && <span className="nav-badge">{item.badge}</span>}
          </button>
        );
      })}
    </nav>
  );
}
