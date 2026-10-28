import express from 'express';
import { checkDbConnection } from '../config/db.js';

const router = express.Router();

// Primary health check (Independent of database so service health is decoupled)
router.get('/health', async (req, res) => {
  const dbHealth = await checkDbConnection();

  res.status(200).json({
    status: 'UP',
    service: 'kosh-backend',
    system: 'KOSH-PRAMAAN FDR Verification Engine',
    timestamp: new Date().toISOString(),
    database: {
      status: dbHealth.connected ? 'CONNECTED' : 'DISCONNECTED',
      name: dbHealth.database || null
    }
  });
});

// Dedicated DB-specific health check
router.get('/health/db', async (req, res) => {
  const dbHealth = await checkDbConnection();
  if (dbHealth.connected) {
    return res.status(200).json({
      status: 'UP',
      database: dbHealth.database,
      user: dbHealth.user,
      version: dbHealth.version
    });
  } else {
    return res.status(503).json({
      status: 'DOWN',
      error: dbHealth.error,
      code: dbHealth.code
    });
  }
});

export default router;
