import React, { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle, RefreshCw, Server } from 'lucide-react';
import { fetchBackendHealth } from '../api/healthApi';

export default function HealthStatusBadge() {
  const [state, setState] = useState({
    loading: true,
    connected: false,
    data: null,
    error: null,
    lastChecked: null
  });

  const checkConnection = async () => {
    setState((prev) => ({ ...prev, loading: true }));
    const result = await fetchBackendHealth();
    if (result.ok && result.data && result.data.status === 'UP') {
      setState({
        loading: false,
        connected: true,
        data: result.data,
        error: null,
        lastChecked: new Date().toLocaleTimeString()
      });
    } else {
      setState({
        loading: false,
        connected: false,
        data: null,
        error: result.error || 'Server responded with non-UP status',
        lastChecked: new Date().toLocaleTimeString()
      });
    }
  };

  useEffect(() => {
    checkConnection();
    // Poll health status every 15 seconds
    const interval = setInterval(checkConnection, 15000);
    return () => clearInterval(interval);
  }, []);

  if (state.connected) {
    return (
      <div className="connection-banner connected">
        <div className="banner-left">
          <span className="status-dot" />
          <Server size={18} />
          <div>
            <div className="status-title">
              Backend Connected — {state.data.service} (Port 5001)
            </div>
            <div className="status-meta">
              Service: {state.data.system || 'KOSH-PRAMAAN'} | Engine Status: {state.data.status} | Checked: {state.lastChecked}
            </div>
          </div>
        </div>
        <button className="retry-btn" onClick={checkConnection} disabled={state.loading}>
          <RefreshCw size={13} className={state.loading ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>
    );
  }

  return (
    <div className="connection-banner disconnected">
      <div className="banner-left">
        <span className="status-dot" />
        <AlertTriangle size={18} />
        <div>
          <div className="status-title">
            Backend Disconnected — Cannot reach http://localhost:5001/api/health
          </div>
          <div className="status-meta">
            Error: {state.error || 'Connection failed'} | Last checked: {state.lastChecked || 'just now'}
          </div>
        </div>
      </div>
      <button className="retry-btn" onClick={checkConnection} disabled={state.loading}>
        <RefreshCw size={13} className={state.loading ? 'spin' : ''} />
        <span>Retry Connection</span>
      </button>
    </div>
  );
}
