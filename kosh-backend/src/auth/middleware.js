import { verifyToken, signToken } from './jwt.js';
import { DEMO_USERS, ROLES } from './roles.js';

/**
 * Express middleware to authenticate requests via Bearer JWT token
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;

  const isProd = process.env.NODE_ENV === 'production';
  const demoAllowed = !isProd || process.env.ENABLE_DEMO_AUTH === 'true';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (demoAllowed && req.headers['x-demo-role']) {
    const requestedRole = req.headers['x-demo-role'];
    const demoUser = DEMO_USERS.find(u => u.role === requestedRole);
    if (demoUser) {
      token = signToken({
        id: demoUser.id,
        name: demoUser.name,
        role: demoUser.role,
        department: demoUser.department,
        institution_id: demoUser.institution_id || null,
        is_demo: true,
        simulated: true
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Authentication Required',
      message: 'Missing or invalid Authorization header. Expected: Bearer <token>'
    });
  }

  const result = verifyToken(token);
  if (!result.valid) {
    return res.status(401).json({
      success: false,
      error: 'Authentication Failed',
      message: result.error
    });
  }

  // Attach verified identity to request. Client-supplied body parameters are ignored.
  req.user = result.payload;
  next();
}

/**
 * Optional authentication middleware for read routes
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const isProd = process.env.NODE_ENV === 'production';
  const demoAllowed = !isProd || process.env.ENABLE_DEMO_AUTH === 'true';

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const result = verifyToken(token);
    if (result.valid) {
      req.user = result.payload;
    }
  } else if (demoAllowed && req.headers['x-demo-role']) {
    const requestedRole = req.headers['x-demo-role'];
    const demoUser = DEMO_USERS.find(u => u.role === requestedRole);
    if (demoUser) {
      req.user = {
        id: demoUser.id,
        name: demoUser.name,
        role: demoUser.role,
        department: demoUser.department
      };
    }
  }
  next();
}

/**
 * Express middleware to enforce Role-Based Access Control (RBAC)
 * @param  {...string} allowedRoles 
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        error: 'Authentication Required',
        message: 'No verified user credentials found on request context.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Access Denied: Insufficient Permissions',
        user_role: req.user.role,
        required_roles: allowedRoles,
        message: `Your role (${req.user.role}) is not authorized to execute this action. Required permissions: ${allowedRoles.join(' or ')}.`
      });
    }

    next();
  };
}
