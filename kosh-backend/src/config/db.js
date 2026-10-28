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

const poolConfig = {
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || undefined,
  database: process.env.PGDATABASE || 'postgres',
  max: 10,
  idleTimeoutMillis: process.env.NODE_ENV === 'test' ? 500 : 30000,
  connectionTimeoutMillis: 3000
};

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[KOSH-PRAMAAN DB Pool Error]:', err.message);
});

/**
 * Execute parameterized query safely using the pool
 */
export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV !== 'test') {
    console.log(`[DB Query] ${text.slice(0, 60)}... (${duration}ms)`);
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
      version: res.rows[0].version
    };
  } catch (err) {
    return {
      connected: false,
      error: err.message,
      code: err.code
    };
  }
}
