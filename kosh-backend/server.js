import express from 'express';
import healthRouter from './src/routes/health.routes.js';
import authRouter from './src/routes/auth.routes.js';
import casesRouter from './src/routes/cases.routes.js';

const app = express();
const PORT = process.env.PORT || 5001;

// Built-in body parsing
app.use(express.json());

// CORS configuration for local Vite development origin and Vercel deployments
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isAllowed = !origin || 
    origin === 'http://localhost:5173' || 
    origin === 'http://localhost:3000' ||
    origin.endsWith('.vercel.app') ||
    origin.includes('localhost') ||
    (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL);

  if (isAllowed) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  } else {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
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
