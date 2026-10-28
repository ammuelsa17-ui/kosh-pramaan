import React from 'react';
import { ShieldCheck, AlertCircle } from 'lucide-react';

export default function Header() {
  return (
    <header>
      <div className="top-tricolor-stripe" />
      <div className="gov-header">
        <div className="gov-brand">
          <div className="emblem-icon">
            <ShieldCheck size={26} />
          </div>
          <div className="brand-text">
            <h1>
              KOSH-PRAMAAN
              <span className="sih-tag">SIH26265</span>
            </h1>
            <p>FDR &amp; Security Deposit Lifecycle Management Platform</p>
          </div>
        </div>
        <div className="header-right">
          <div className="demo-prototype-badge">
            <AlertCircle size={14} />
            <span>Prototype / Demo Build</span>
          </div>
        </div>
      </div>
    </header>
  );
}
