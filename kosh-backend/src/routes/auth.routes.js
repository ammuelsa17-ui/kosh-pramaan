import express from 'express';
import { DEMO_USERS, ROLES, ROLE_PERMISSIONS } from '../auth/roles.js';
import { signToken } from '../auth/jwt.js';
import { authenticate } from '../auth/middleware.js';

const router = express.Router();

/**
 * Middleware: Verify demo authentication endpoint availability.
 * In production mode, demo endpoints are strictly disabled unless ENABLE_DEMO_AUTH=true.
 */
function guardDemoAuth(req, res, next) {
  const isProd = process.env.NODE_ENV === 'production';
  const demoAllowed = process.env.ENABLE_DEMO_AUTH === 'true';

  if (isProd && !demoAllowed) {
    return res.status(403).json({
      success: false,
      error: 'Demo Authentication Prohibited in Production',
      message: 'Simulated demo credential issuance is disabled in production environment. Configure production Identity Provider (IdP/SSO) or set ENABLE_DEMO_AUTH=true for supervised evaluation.'
    });
  }
  next();
}

/**
 * GET /api/auth/demo-users
 * Returns list of available demo profiles with pre-signed demo tokens for evaluation
 */
router.get('/auth/demo-users', guardDemoAuth, (req, res) => {
  const usersWithTokens = DEMO_USERS.map(user => {
    const isPrivileged = user.role === ROLES.AICTE_OFFICER;
    return {
      ...user,
      is_demo: true,
      simulated: true,
      simulation_notice: 'SIMULATED DEMO CREDENTIAL - NOT FOR PRODUCTION COMPLIANCE',
      privileged_simulation: isPrivileged,
      token: signToken({
        id: user.id,
        name: user.name,
        role: user.role,
        department: user.department,
        institution_id: user.institution_id || null,
        is_demo: true,
        simulated: true,
        privileged_simulation: isPrivileged,
        simulation_notice: 'SIMULATED DEMO CREDENTIAL - NOT FOR PRODUCTION COMPLIANCE'
      }, 86400 * 7),
      permissions: ROLE_PERMISSIONS[user.role] || []
    };
  });

  return res.status(200).json({
    success: true,
    is_simulation_mode: true,
    notice: 'Demo profiles are intended solely for Hackathon demonstration and evaluation.',
    count: usersWithTokens.length,
    users: usersWithTokens
  });
});

/**
 * POST /api/auth/login
 * Log in as a demo user or by role
 */
router.post('/auth/login', guardDemoAuth, (req, res) => {
  const { username, role } = req.body || {};

  let matchedUser = null;
  if (username) {
    matchedUser = DEMO_USERS.find(u => u.username.toLowerCase() === username.toLowerCase());
  } else if (role) {
    matchedUser = DEMO_USERS.find(u => u.role === role);
  }

  if (!matchedUser) {
    return res.status(401).json({
      success: false,
      error: 'Invalid Credentials',
      message: `No active user found matching criteria. Available demo roles: ${Object.values(ROLES).join(', ')}`
    });
  }

  const isPrivileged = matchedUser.role === ROLES.AICTE_OFFICER;
  if (isPrivileged) {
    console.warn(`[SECURITY AUDIT] Privileged AICTE_OFFICER demo token requested for user: ${matchedUser.name} (${matchedUser.id})`);
  }

  const token = signToken({
    id: matchedUser.id,
    name: matchedUser.name,
    role: matchedUser.role,
    department: matchedUser.department,
    institution_id: matchedUser.institution_id || null,
    is_demo: true,
    simulated: true,
    privileged_simulation: isPrivileged,
    simulation_notice: 'SIMULATED DEMO CREDENTIAL - NOT FOR PRODUCTION COMPLIANCE'
  });

  return res.status(200).json({
    success: true,
    message: `Logged in as ${matchedUser.name} (${matchedUser.role}) [SIMULATED DEMO]`,
    is_demo: true,
    simulated: true,
    simulation_notice: 'SIMULATED DEMO CREDENTIAL - NOT FOR PRODUCTION COMPLIANCE',
    privileged_simulation: isPrivileged,
    token,
    user: {
      id: matchedUser.id,
      name: matchedUser.name,
      role: matchedUser.role,
      department: matchedUser.department,
      institution_id: matchedUser.institution_id || null,
      is_demo: true,
      simulated: true,
      privileged_simulation: isPrivileged,
      permissions: ROLE_PERMISSIONS[matchedUser.role] || []
    }
  });
});

/**
 * GET /api/auth/me
 * Returns current authenticated user and permissions
 */
router.get('/auth/me', authenticate, (req, res) => {
  return res.status(200).json({
    success: true,
    user: {
      ...req.user,
      permissions: ROLE_PERMISSIONS[req.user.role] || []
    }
  });
});

export default router;
