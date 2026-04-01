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

// ── Access log (simple audit endpoint) ──────────
import { authenticateToken } from './middleware/auth.js';
app.get('/api/access-log', authenticateToken, async (_req, res) => {
  try {
    const result = await (await import('./config/database.js')).query(
      `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ rows: result.rows, total: result.rowCount });
  } catch { res.json({ rows: [], total: 0 }); }
});
app.post('/api/access-log', authenticateToken, async (req: any, res) => {
  try {
    await (await import('./config/database.js')).query(
      `INSERT INTO audit_log (entity_type, entity_id, action, new_value, user_id) VALUES ('access', 0, 'page_view', $1, $2)`,
      [JSON.stringify(req.body), req.user?.id]
    );
    res.json({ ok: true });
  } catch { res.json({ ok: true }); }
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
