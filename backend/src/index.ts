import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/env.js';
import { initDatabase, cleanupExpiredTokens } from './config/database.js';
import { logger } from './utils/logger.js';
import authRoutes from './routes/auth.routes.js';
import usersRoutes from './routes/users.routes.js';
import rolesRoutes from './routes/roles.routes.js';
import menuAccessRoutes from './routes/menu-access.routes.js';
import meetingsRoutes from './routes/meetings.routes.js';
import storiesRoutes from './routes/stories.routes.js';
import checksRoutes from './routes/checks.routes.js';
import epicsRoutes from './routes/epics.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import kbRoutes from './routes/kb.routes.js';
import dataLoadRoutes from './routes/data-load.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '50mb' }));

// ── Routes ──────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/menu-access', menuAccessRoutes);
app.use('/api/meetings', meetingsRoutes);
app.use('/api/stories', storiesRoutes);
app.use('/api/checks', checksRoutes);
app.use('/api/epics', epicsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/kb', kbRoutes);
app.use('/api/data', dataLoadRoutes);

// ── Access log ──────────
import { authenticateToken } from './middleware/auth.js';
import os from 'os';

function normalizeIp(ip: string): string {
  if (ip === '::1') return '127.0.0.1';
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}
function getLanIp(): string {
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}
function getClientIp(req: any): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return normalizeIp(String(forwarded).split(',')[0].trim());
  const ip = normalizeIp(req.ip || req.socket?.remoteAddress || 'unknown');
  return ip === '127.0.0.1' ? getLanIp() : ip;
}

app.get('/api/access-log', authenticateToken, async (_req, res) => {
  try {
    const result = await (await import('./config/database.js')).query(
      `SELECT a.id, a.action, a.new_value, a.user_id, a.created_at,
              u.email as user_email
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.entity_type = 'access'
       ORDER BY a.created_at DESC
       LIMIT 500`
    );
    res.json({ rows: result.rows, total: result.rowCount });
  } catch { res.json({ rows: [], total: 0 }); }
});
app.post('/api/access-log', authenticateToken, async (req: any, res) => {
  try {
    const ip = getClientIp(req);
    const menu = req.body.l0 === req.body.l1
      ? req.body.l0
      : `${req.body.l0} > ${req.body.l1}`;
    await (await import('./config/database.js')).query(
      `INSERT INTO audit_log (entity_type, entity_id, action, new_value, user_id)
       VALUES ('access', 0, $1, $2, $3)`,
      [menu, JSON.stringify({ ip }), req.user?.id]
    );
    res.status(204).end();
  } catch { res.status(204).end(); }
});
app.delete('/api/access-log', authenticateToken, async (_req, res) => {
  try {
    await (await import('./config/database.js')).query(
      `DELETE FROM audit_log WHERE entity_type = 'access'`
    );
    res.status(204).end();
  } catch { res.status(204).end(); }
});

// ── Pipeline proxy (all /api/pipeline/* → FastAPI) ──────────
app.all('/api/pipeline/*', async (req, res) => {
  const targetPath = req.originalUrl.replace('/api/pipeline', '');
  const targetUrl = `${config.agentsUrl}/pipeline${targetPath}`;

  try {
    const fetchOptions: RequestInit = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const agentsResponse = await fetch(targetUrl, fetchOptions);
    const contentType = agentsResponse.headers.get('content-type') || '';

    res.status(agentsResponse.status);

    if (contentType.includes('text/event-stream')) {
      // SSE proxy
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      if (agentsResponse.body) {
        const reader = agentsResponse.body.getReader();
        const decoder = new TextDecoder();

        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(decoder.decode(value, { stream: true }));
          }
          res.end();
        };

        req.on('close', () => {
          reader.cancel();
        });

        pump().catch(() => res.end());
      } else {
        res.end();
      }
    } else if (contentType.includes('application/json')) {
      const data = await agentsResponse.json();
      res.json(data);
    } else {
      const text = await agentsResponse.text();
      res.send(text);
    }
  } catch (error) {
    logger.error(`Pipeline proxy error: ${req.method} ${targetUrl}`, error);
    res.status(502).json({ error: 'Failed to proxy to agent pipeline' });
  }
});

// ── Health check ────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Serve built frontend in production ──────────────────────
if (config.nodeEnv === 'production') {
  const distPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ── Error handler ───────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ───────────────────────────────────────────────────
async function startServer() {
  try {
    await initDatabase();
    setInterval(cleanupExpiredTokens, 60 * 60 * 1000);

    app.listen(config.port, () => {
      logger.info(`Backlog Synthesizer server running on http://localhost:${config.port}`);
      logger.info(`Environment: ${config.nodeEnv}`);
      logger.info(`Agents URL: ${config.agentsUrl}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
