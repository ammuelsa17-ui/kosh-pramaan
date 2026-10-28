import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeSchema } from '../src/db/schema.js';
import { seedDatabase, SEED_CASES } from '../src/db/seed.js';
import { pool } from '../src/config/db.js';

test('Schema and Seed idempotency: multiple runs succeed without duplication', async () => {
  const originalPoolQuery = pool.query.bind(pool);
  const executedStatements = [];

  // Track queries executed
  pool.query = async (text, params) => {
    executedStatements.push({ text, params });
    return { rows: [] };
  };

  try {
    // Run 1: Init schema
    const schemaRes1 = await initializeSchema();
    assert.equal(schemaRes1.success, true);

    // Run 1: Seed
    const seedRes1 = await seedDatabase();
    assert.equal(seedRes1.success, true);
    assert.equal(seedRes1.count, SEED_CASES.length);

    // Run 2: Init schema again (idempotent test)
    const schemaRes2 = await initializeSchema();
    assert.equal(schemaRes2.success, true);

    // Run 2: Seed again (idempotent test)
    const seedRes2 = await seedDatabase();
    assert.equal(seedRes2.success, true);
    assert.equal(seedRes2.count, SEED_CASES.length);

    // Verify all INSERTs use ON CONFLICT clauses
    const insertStatements = executedStatements.filter(s => s.text.includes('INSERT INTO'));
    assert.ok(insertStatements.length > 0);
    for (const stmt of insertStatements) {
      if (stmt.text.includes('audit_events')) {
        // Audit events are append-only ledger entries
        continue;
      }
      assert.ok(
        stmt.text.includes('ON CONFLICT'),
        `Statement missing ON CONFLICT for idempotency: ${stmt.text}`
      );
    }
  } finally {
    pool.query = originalPoolQuery;
  }
});
