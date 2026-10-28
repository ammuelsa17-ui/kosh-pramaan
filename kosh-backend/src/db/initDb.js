import { initializeSchema } from './schema.js';
import { seedDatabase } from './seed.js';
import { pool, checkDbConnection } from '../config/db.js';

async function run() {
  try {
    console.log('[KOSH-PRAMAAN] Checking PostgreSQL connection...');
    const conn = await checkDbConnection();
    if (!conn.connected) {
      console.error('[KOSH-PRAMAAN] Database connection failed:', conn.error);
      console.error('Ensure PostgreSQL is running on host:', process.env.PGHOST || 'localhost', 'port:', process.env.PGPORT || 5432);
      process.exit(1);
    }
    console.log(`[KOSH-PRAMAAN] Connected to PostgreSQL: database="${conn.database}", user="${conn.user}"`);

    await initializeSchema();
    await seedDatabase();

    console.log('[KOSH-PRAMAAN] Database initialization and seed completed successfully.');
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('[KOSH-PRAMAAN] Migration error:', err.message);
    await pool.end();
    process.exit(1);
  }
}

run();
