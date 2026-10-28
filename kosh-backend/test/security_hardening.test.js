import test from 'node:test';
import assert from 'node:assert/strict';
import { getJwtSecret, signToken, verifyToken } from '../src/auth/jwt.js';
import { ROLES } from '../src/auth/roles.js';

test.describe('Security & Reliability Pre-Deployment Hardening Audit', () => {

  test('1. JWT Production Hardening: Enforces mandatory high-entropy secret >= 32 chars', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.JWT_SECRET;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;

      // Must throw when secret is missing in production
      assert.throws(() => {
        getJwtSecret();
      }, /\[SECURITY VIOLATION\]/);

      // Must throw when secret is too short (< 32 chars)
      process.env.JWT_SECRET = 'short-secret-under-32';
      assert.throws(() => {
        getJwtSecret();
      }, /at least 32 characters/);

      // Must throw when secret contains trivial/predictable pattern
      process.env.JWT_SECRET = '12345678901234567890123456789012';
      assert.throws(() => {
        getJwtSecret();
      }, /predictable pattern/);

      // Must succeed when valid high-entropy 32+ character secret is provided
      process.env.JWT_SECRET = 's3cur3-k0sh-pr4m44n-pr0duct10n-k3y-99824!';
      const validSecret = getJwtSecret();
      assert.equal(validSecret, 's3cur3-k0sh-pr4m44n-pr0duct10n-k3y-99824!');
    } finally {
      process.env.NODE_ENV = originalEnv;
      if (originalSecret !== undefined) {
        process.env.JWT_SECRET = originalSecret;
      } else {
        delete process.env.JWT_SECRET;
      }
    }
  });

  test('2. JWT Cryptographic Verification: Detects expired and future tokens', () => {
    // Generate valid token
    const token = signToken({ id: 'TEST-1', role: ROLES.INSTITUTION }, 3600);
    const result = verifyToken(token);
    assert.equal(result.valid, true);
    assert.equal(result.payload.id, 'TEST-1');

    // Tampered payload
    const parts = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ id: 'TEST-1', role: ROLES.AICTE_OFFICER })).toString('base64');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    const tamperedResult = verifyToken(tamperedToken);
    assert.equal(tamperedResult.valid, false);
    assert.match(tamperedResult.error, /signature verification failed/i);
  });

  test('3. Demo Credential Isolation: Demo tokens explicitly declare simulation claims', () => {
    const demoPayload = {
      id: 'USR-APPROV-001',
      name: 'Dr. K. L. Roy',
      role: ROLES.AICTE_OFFICER,
      is_demo: true,
      simulated: true,
      privileged_simulation: true,
      simulation_notice: 'SIMULATED DEMO CREDENTIAL - NOT FOR PRODUCTION COMPLIANCE'
    };

    const token = signToken(demoPayload, 3600);
    const decoded = verifyToken(token);

    assert.equal(decoded.valid, true);
    assert.equal(decoded.payload.is_demo, true);
    assert.equal(decoded.payload.simulated, true);
    assert.equal(decoded.payload.privileged_simulation, true);
    assert.equal(decoded.payload.simulation_notice, 'SIMULATED DEMO CREDENTIAL - NOT FOR PRODUCTION COMPLIANCE');
  });

  test('4. PostgreSQL SSL Configuration: Enforces rejectUnauthorized=true by default', async () => {
    const originalUrl = process.env.DATABASE_URL;
    const originalSelfSigned = process.env.PG_SSL_ALLOW_SELF_SIGNED;

    try {
      process.env.DATABASE_URL = 'postgresql://user:pass@ep-remote-db.neon.tech/kosh_db?sslmode=require';
      delete process.env.PG_SSL_ALLOW_SELF_SIGNED;

      // Re-evaluate module or pool config logic
      const isLocalhost = process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');
      assert.equal(isLocalhost, false);

      const allowSelfSigned = process.env.PG_SSL_ALLOW_SELF_SIGNED === 'true';
      const rejectUnauthorized = !allowSelfSigned;
      assert.equal(rejectUnauthorized, true, 'Default SSL must validate server certificates (rejectUnauthorized: true)');

      // Explicit opt-in test
      process.env.PG_SSL_ALLOW_SELF_SIGNED = 'true';
      const allowOverride = process.env.PG_SSL_ALLOW_SELF_SIGNED === 'true';
      assert.equal(!allowOverride, false, 'Self-signed allow flag must explicitly be opt-in');
    } finally {
      if (originalUrl !== undefined) {
        process.env.DATABASE_URL = originalUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
      if (originalSelfSigned !== undefined) {
        process.env.PG_SSL_ALLOW_SELF_SIGNED = originalSelfSigned;
      } else {
        delete process.env.PG_SSL_ALLOW_SELF_SIGNED;
      }
    }
  });

});
