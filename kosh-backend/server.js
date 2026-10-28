import express from 'express';
import healthRouter from './src/routes/health.routes.js';
import authRouter from './src/routes/auth.routes.js';
import casesRouter from './src/routes/cases.routes.js';

const app = express();
const PORT = process.env.PORT || 5001;

// Built-in body parsing with support for document upload payloads
app.use(express.json({ limit: '10mb' }));

// Strict CORS configuration: Explicit trusted origin allowlist (No origin reflection)
const TRUSTED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'https://kosh-pramaan.vercel.app'
]);

if (process.env.FRONTEND_URL) {
  TRUSTED_ORIGINS.add(process.env.FRONTEND_URL.replace(/\/$/, ''));
}

app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Verify against strict allowlist or authorized Vercel preview domain pattern
  const isAllowedOrigin = origin && (
    TRUSTED_ORIGINS.has(origin) ||
    /^https:\/\/kosh-pramaan(-git-[a-z0-9-]+)?(-[a-z0-9]+)?\.vercel\.app$/.test(origin)
  );

  if (isAllowedOrigin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Vary', 'Origin');
  }
  // When origin is NOT in allowlist, Access-Control-Allow-Origin is strictly withheld

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    if (!origin || isAllowedOrigin) {
      return res.sendStatus(204);
    }
    return res.status(403).json({ error: 'CORS Preflight Forbidden: Origin not permitted' });
  }
  next();
});

// Mount API routes
app.use('/api', healthRouter);
app.use('/api', authRouter);
app.use('/api', casesRouter);

import { fileURLToPath } from 'node:url';

let server = null;
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (process.env.NODE_ENV !== 'test' && isMainModule) {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[KOSH-PRAMAAN] Backend server running on http://localhost:${PORT}`);
  });
}

export { app, server };
export default app;
