import crypto from 'node:crypto';

const DEV_TEST_FALLBACK_SECRET = 'kosh-pramaan-sih26265-dev-test-secret-minimum-32chars!';

/**
 * Validates and retrieves the JWT secret.
 * In production mode, JWT_SECRET is MANDATORY and must have at least 32 characters (256 bits).
 */
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    if (!secret || secret.trim() === '' || secret === DEV_TEST_FALLBACK_SECRET) {
      throw new Error(
        '[SECURITY VIOLATION] JWT_SECRET must be configured via environment variables in production mode. Fallback secret is strictly prohibited.'
      );
    }
    if (secret.length < 32) {
      throw new Error(
        `[SECURITY VIOLATION] JWT_SECRET must have at least 32 characters for cryptographic safety. Current length: ${secret.length}`
      );
    }
    const trivialPatterns = ['12345678901234567890123456789012', 'change-me', 'default-secret'];
    if (trivialPatterns.some(p => secret.toLowerCase().includes(p))) {
      throw new Error(
        '[SECURITY VIOLATION] JWT_SECRET contains an insecure, predictable pattern. Use a high-entropy cryptographically secure string.'
      );
    }
    return secret;
  }

  return secret || DEV_TEST_FALLBACK_SECRET;
}

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Sign a payload with HMAC-SHA256 and return a valid standard JWT string
 * @param {object} payload 
 * @param {number} expiresInSeconds Defaults to 3600 (1 hour). Demo tokens default to max 86400 (24 hours).
 */
export function signToken(payload, expiresInSeconds = 3600) {
  const secret = getJwtSecret();
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  
  // Cap expiration to 24 hours maximum to prevent indefinite tokens
  const ttl = Math.min(Math.max(expiresInSeconds, 60), 86400);

  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + ttl
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(signatureInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${signatureInput}.${signature}`;
}

/**
 * Verify and decode an HMAC-SHA256 JWT
 * Validates header, payload structure, signature timing, and expiration time.
 * @param {string} token 
 * @returns {{ valid: boolean, payload?: object, error?: string }}
 */
export function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token is missing or invalid' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false, error: 'Malformed token structure' };
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  let secret;
  try {
    secret = getJwtSecret();
  } catch (err) {
    return { valid: false, error: err.message };
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signatureInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const expectedBuf = Buffer.from(expectedSignature);
  const actualBuf = Buffer.from(signature);

  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    return { valid: false, error: 'Cryptographic token signature verification failed' };
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);

    if (!payload.exp || typeof payload.exp !== 'number') {
      return { valid: false, error: 'Token missing expiration claim (exp)' };
    }

    if (payload.exp < now) {
      return { valid: false, error: `Token expired at ${new Date(payload.exp * 1000).toISOString()} (current: ${new Date(now * 1000).toISOString()})` };
    }

    if (payload.iat && payload.iat > now + 60) {
      return { valid: false, error: 'Token issued in the future (clock skew violation)' };
    }

    return { valid: true, payload };
  } catch (err) {
    return { valid: false, error: `Invalid token payload: ${err.message}` };
  }
}
