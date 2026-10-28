import React, { useState, useEffect } from 'react';
import { ShieldCheck, UserCheck, ChevronDown, ShieldAlert, Key } from 'lucide-react';
import { fetchDemoUsers, getActiveUser, setActiveAuth } from '../api/casesApi';

export default function Header() {
  const [users, setUsers] = useState([]);
  const [activeUser, setActiveUserState] = useState(getActiveUser());

  useEffect(() => {
    fetchDemoUsers().then((res) => {
      if (res.ok && res.users.length > 0) {
        setUsers(res.users);
        // If no user is logged in, default to AICTE Sanctioning Authority for demo readiness
        const current = getActiveUser();
        if (!current) {
          const defaultUser = res.users.find(u => u.role === 'AICTE_OFFICER') || res.users[0];
          setActiveAuth(defaultUser.token, defaultUser);
          setActiveUserState(defaultUser);
        } else {
          setActiveUserState(current);
        }
      }
    });

    const onAuthChanged = () => {
      setActiveUserState(getActiveUser());
    };
    window.addEventListener('kosh_auth_changed', onAuthChanged);
    return () => window.removeEventListener('kosh_auth_changed', onAuthChanged);
  }, []);

  const handleRoleChange = (e) => {
    const selectedUsername = e.target.value;
    const user = users.find(u => u.username === selectedUsername);
    if (user) {
      setActiveAuth(user.token, user);
      setActiveUserState(user);
    }
  };

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'AICTE_OFFICER': return 'role-badge-approver';
      case 'CLEARANCE_OFFICER': return 'role-badge-clearance';
      case 'VERIFICATION_OFFICER': return 'role-badge-verification';
      case 'INSTITUTION': return 'role-badge-institution';
      case 'AUDITOR': return 'role-badge-auditor';
      default: return 'role-badge-default';
    }
  };

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
          {/* Real RBAC Role Switcher */}
          <div className="rbac-role-switcher" title="Active Authenticated Role Context (Server-Enforced JWT)">
            <div className="rbac-label">
              <Key size={13} color="#64748b" />
              <span>Active Role:</span>
            </div>
            <select
              className={`rbac-select ${activeUser ? getRoleBadgeClass(activeUser.role) : ''}`}
              value={activeUser ? activeUser.username : ''}
              onChange={handleRoleChange}
              aria-label="Switch Authenticated User Role"
            >
              {users.map((u) => (
                <option key={u.id} value={u.username}>
                  {u.role === 'AICTE_OFFICER' && '🛡️ '}
                  {u.role === 'CLEARANCE_OFFICER' && '📋 '}
                  {u.role === 'VERIFICATION_OFFICER' && '🔍 '}
                  {u.role === 'INSTITUTION' && '🎓 '}
                  {u.role === 'AUDITOR' && '⚖️ '}
                  {u.role.replace(/_/g, ' ')}: {u.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </header>
  );
}
