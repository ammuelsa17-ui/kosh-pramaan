import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const { Pool } = pg;

// Lightweight .env reader if running without --env-file
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

function getSslConfig(databaseUrl) {
  if (!databaseUrl) return false;
  const isLocalhost = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
  if (isLocalhost) return false;

  // Strict server-certificate validation is ENABLED BY DEFAULT (rejectUnauthorized: true).
  // Disabling server certificate validation is avoided by default to prevent MitM attacks.
  // Explicit opt-in with PG_SSL_ALLOW_SELF_SIGNED=true is required only for self-signed certificates.
  const allowSelfSigned = process.env.PG_SSL_ALLOW_SELF_SIGNED === 'true';
  const sslConfig = {
    rejectUnauthorized: !allowSelfSigned
  };

  const caCertPath = process.env.PGSSLROOTCERT;
  if (caCertPath && fs.existsSync(caCertPath)) {
    sslConfig.ca = fs.readFileSync(caCertPath, 'utf8');
  } else if (process.env.PG_SSL_CA) {
    sslConfig.ca = process.env.PG_SSL_CA;
  }

  return sslConfig;
}

// Build pool configuration supporting both DATABASE_URL and granular PG* variables
function createPoolConfig() {
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl && databaseUrl.trim() !== '') {
    return {
      connectionString: databaseUrl,
      ssl: getSslConfig(databaseUrl),
      max: parseInt(process.env.PG_MAX_POOL || '10', 10),
      idleTimeoutMillis: process.env.NODE_ENV === 'test' ? 500 : 30000,
      connectionTimeoutMillis: 5000
    };
  }

  return {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432', 10),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || undefined,
    database: process.env.PGDATABASE || 'postgres',
    max: parseInt(process.env.PG_MAX_POOL || '10', 10),
    idleTimeoutMillis: process.env.NODE_ENV === 'test' ? 500 : 30000,
    connectionTimeoutMillis: 3000
  };
}

export const pool = new Pool(createPoolConfig());

pool.on('error', (err) => {
  console.error('[KOSH-PRAMAAN DB Pool Error]:', err.message);
});

/**
 * Returns current database execution mode:
 * - 'MANAGED_POSTGRESQL': Connected to cloud or dedicated PostgreSQL
 * - 'DEMONSTRATION_FALLBACK': In-memory failover for prototype reliability
 */
export function getDatabaseMode() {
  return process.env.DATABASE_URL ? 'MANAGED_POSTGRESQL' : 'DEMONSTRATION_FALLBACK';
}

/**
 * Execute parameterized query safely using the pool
 */
export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[DB Query] ${text.slice(0, 60).replace(/\n/g, ' ')}... (${duration}ms)`);
  }
  return res;
}

/**
 * Acquire a dedicated client for multi-statement transactions
 */
export async function getClient() {
  return await pool.connect();
}

/**
 * Check whether database is reachable and report details
 */
export async function checkDbConnection() {
  try {
    const res = await pool.query('SELECT current_database() AS db, current_user AS "user", version() AS version');
    return {
      connected: true,
      database: res.rows[0].db,
      user: res.rows[0].user,
      version: res.rows[0].version,
      mode: process.env.DATABASE_URL ? 'MANAGED_POSTGRESQL' : 'LOCAL_POSTGRESQL'
    };
  } catch (err) {
    return {
      connected: false,
      error: err.message,
      code: err.code,
      mode: 'DEMONSTRATION_FALLBACK'
    };
  }
}
