import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { UPLOAD_DIR } from './controllers/uploadController.js';
import { tenantMiddleware, ensureControlSchema } from './services/tenantService.js';

const app = express();
app.set('trust proxy', 1);

app.use(cors({
  origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map((s) => s.trim()),
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

// EventSource cannot send Authorization headers — allow ?token= for the SSE endpoint only.
app.use('/api/events', (req, _res, next) => {
  if (!req.headers.authorization && req.query.token) {
    try {
      jwt.verify(String(req.query.token), env.jwtSecret);
      req.headers.authorization = `Bearer ${req.query.token}`;
    } catch { /* authenticate middleware will reject */ }
  }
  next();
});

// Global soft rate limit
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false }));

// Serve uploaded product images
app.use('/api/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', immutable: true }));

app.get('/api/health', (_req, res) => res.json({ success: true, status: 'ok', multiTenant: env.multiTenant, time: new Date().toISOString() }));
app.use('/api', tenantMiddleware());
app.use('/api', routes);

// Desktop / single-server mode: serve the built frontend with SPA fallback.
// Set FRONTEND_DIST to the frontend's dist directory.
if (process.env.FRONTEND_DIST && fs.existsSync(process.env.FRONTEND_DIST)) {
  const dist = process.env.FRONTEND_DIST;
  app.use(express.static(dist, { maxAge: '1d' }));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  console.log(`✔ Serving frontend from ${dist}`);
}

app.use(notFoundHandler);
app.use(errorHandler);

async function start() {
  if (env.multiTenant) {
    await ensureControlSchema();
    console.log('✔ Multi-tenant mode: control schema ready');
  }
  app.listen(env.port, '0.0.0.0', () => {
    console.log(`✔ POS API server running on port ${env.port} (${env.nodeEnv})${env.multiTenant ? ' [multi-tenant]' : ''}`);
  });
}
start();
