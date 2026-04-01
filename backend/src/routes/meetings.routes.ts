import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import { query } from '../config/database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import OpenAI from 'openai';

let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI | null {
  if (!config.openaiApiKey) return null;
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
  return openaiClient;
}

async function embedMeeting(meetingId: number, title: string, transcript: string): Promise<void> {
  const client = getOpenAI();
  if (!client) return;
  try {
    const text = `Meeting: ${title}\n\n${transcript.slice(0, 32000)}`;
    const resp = await client.embeddings.create({ model: 'text-embedding-3-small', input: text });
    await query(
      `INSERT INTO kb_embeddings (content_type, content_id, content_text, embedding, metadata)
       VALUES ('meeting_summary', $1, $2, $3::vector, $4)`,
      [meetingId, text.slice(0, 2000), JSON.stringify(resp.data[0].embedding), JSON.stringify({ title, meeting_id: meetingId })]
    );
  } catch (e) {
    logger.error(`Failed to embed meeting ${meetingId}:`, e);
  }
}

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authenticateToken);

// List all meetings
router.get('/', async (_req, res) => {
  try {
    const result = await query(
      `SELECT m.id, m.title, m.file_name, m.status, m.meeting_quality,
              m.pipeline_progress, m.uploaded_by, m.created_at,
              u.display_name as uploaded_by_name,
              (SELECT COUNT(*) FROM stories s WHERE s.meeting_id = m.id) as story_count,
              (SELECT COUNT(*) FROM stories s WHERE s.meeting_id = m.id AND s.status = 'confirmed') as confirmed_count,
              (SELECT COUNT(*) FROM checks c JOIN stories s ON c.story_id = s.id WHERE s.meeting_id = m.id AND c.status = 'open') as open_checks
       FROM meetings m
       LEFT JOIN users u ON u.id = m.uploaded_by
       ORDER BY m.created_at DESC`
    );
    res.json({ rows: result.rows, total: result.rowCount });
  } catch (error) {
    logger.error('List meetings error:', error);
    res.status(500).json({ error: 'Failed to list meetings' });
  }
});

// Get meeting by id
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT m.*, u.display_name as uploaded_by_name
       FROM meetings m
       LEFT JOIN users u ON u.id = m.uploaded_by
       WHERE m.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get meeting error:', error);
    res.status(500).json({ error: 'Failed to get meeting' });
  }
});

// Upload transcript (.md file via multer)
router.post('/upload',
  upload.single('transcript'),
  async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const title = req.body.title;
    if (!title) {
      return res.status(400).json({ error: 'Meeting title is required' });
    }

    try {
      const transcript = req.file.buffer.toString('utf-8');
      const fileName = req.file.originalname;

      const result = await query(
        `INSERT INTO meetings (title, transcript, file_name, status, uploaded_by)
         VALUES ($1, $2, $3, 'processing', $4) RETURNING *`,
        [title, transcript, fileName, req.user!.id]
      );

      const meeting = result.rows[0];

      // Write to audit log
      await query(
        `INSERT INTO audit_log (entity_type, entity_id, action, new_value, user_id)
         VALUES ('meeting', $1, 'created', $2, $3)`,
        [meeting.id, JSON.stringify({ title, fileName }), req.user!.id]
      );

      // Embed meeting transcript in background
      embedMeeting(meeting.id, title, transcript)
        .then(() => logger.info(`Embedded meeting ${meeting.id} into KB`))
        .catch(e => logger.error('Meeting embedding failed:', e));

      res.status(201).json(meeting);
    } catch (error) {
      logger.error('Upload meeting error:', error);
      res.status(500).json({ error: 'Failed to upload meeting transcript' });
    }
  }
);

// Trigger pipeline (proxy to FastAPI)
router.post('/:id/trigger', async (req: AuthRequest, res: Response) => {
  const meetingId = req.params.id;

  try {
    // Verify meeting exists
    const meetingResult = await query('SELECT id, status FROM meetings WHERE id = $1', [meetingId]);
    if (meetingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    // Reset pipeline progress
    await query(
      `UPDATE meetings SET status = 'processing', pipeline_progress = $1 WHERE id = $2`,
      [JSON.stringify([
        { agent: 'parser', status: 'pending' },
        { agent: 'retriever', status: 'pending' },
        { agent: 'crossref', status: 'pending' },
        { agent: 'synthesizer', status: 'pending' },
        { agent: 'validator', status: 'pending' },
      ]), meetingId]
    );

    // Proxy to FastAPI agents
    const agentsResponse = await fetch(`${config.agentsUrl}/pipeline/run/${meetingId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!agentsResponse.ok) {
      const errorBody = await agentsResponse.text();
      logger.error(`Pipeline trigger failed: ${agentsResponse.status} ${errorBody}`);
      return res.status(agentsResponse.status).json({
        error: 'Pipeline trigger failed',
        details: errorBody,
      });
    }

    const agentsData = await agentsResponse.json();

    // Write to audit log
    await query(
      `INSERT INTO audit_log (entity_type, entity_id, action, new_value, user_id)
       VALUES ('meeting', $1, 'pipeline_triggered', $2, $3)`,
      [meetingId, JSON.stringify({ triggered_at: new Date().toISOString() }), req.user!.id]
    );

    res.json({ message: 'Pipeline triggered', ...agentsData });
  } catch (error) {
    logger.error('Trigger pipeline error:', error);
    res.status(500).json({ error: 'Failed to trigger pipeline' });
  }
});

// Get pipeline progress (SSE proxy to FastAPI)
router.get('/:id/progress', async (req: AuthRequest, res: Response) => {
  const meetingId = req.params.id;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    // First send current stored progress
    const meetingResult = await query(
      'SELECT pipeline_progress FROM meetings WHERE id = $1',
      [meetingId]
    );

    if (meetingResult.rows.length > 0 && meetingResult.rows[0].pipeline_progress) {
      res.write(`data: ${JSON.stringify({ type: 'progress', data: meetingResult.rows[0].pipeline_progress })}\n\n`);
    }

    // Proxy SSE from FastAPI
    const abortController = new AbortController();

    req.on('close', () => {
      abortController.abort();
    });

    try {
      const agentsResponse = await fetch(
        `${config.agentsUrl}/pipeline/${meetingId}/progress`,
        { signal: abortController.signal }
      );

      if (!agentsResponse.ok || !agentsResponse.body) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to connect to pipeline' })}\n\n`);
        res.end();
        return;
      }

      const reader = agentsResponse.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }
    } catch (fetchError: any) {
      if (fetchError.name === 'AbortError') {
        // Client disconnected, normal
        return;
      }
      // FastAPI may not be running — fall back to polling DB
      logger.warn(`SSE proxy to agents failed, falling back to DB polling: ${fetchError.message}`);

      // Poll DB for progress updates
      let lastProgress = '';
      const pollInterval = setInterval(async () => {
        try {
          const result = await query(
            'SELECT pipeline_progress, status FROM meetings WHERE id = $1',
            [meetingId]
          );
          if (result.rows.length === 0) {
            clearInterval(pollInterval);
            res.write(`data: ${JSON.stringify({ type: 'error', message: 'Meeting not found' })}\n\n`);
            res.end();
            return;
          }

          const currentProgress = JSON.stringify(result.rows[0].pipeline_progress);
          if (currentProgress !== lastProgress) {
            lastProgress = currentProgress;
            res.write(`data: ${JSON.stringify({ type: 'progress', data: result.rows[0].pipeline_progress })}\n\n`);
          }

          if (result.rows[0].status !== 'processing') {
            clearInterval(pollInterval);
            res.write(`data: ${JSON.stringify({ type: 'complete', status: result.rows[0].status })}\n\n`);
            res.end();
          }
        } catch (pollError) {
          logger.error('SSE poll error:', pollError);
        }
      }, 2000);

      req.on('close', () => {
        clearInterval(pollInterval);
      });
    }
  } catch (error) {
    logger.error('SSE progress error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Internal server error' })}\n\n`);
    res.end();
  }
});

// Get memos for a meeting
router.get('/:id/memos', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM memos WHERE meeting_id = $1 ORDER BY version DESC',
      [req.params.id]
    );
    res.json({ rows: result.rows, total: result.rowCount });
  } catch (error) {
    logger.error('Get memos error:', error);
    res.status(500).json({ error: 'Failed to get memos' });
  }
});

// Generate memo for a meeting (proxy to FastAPI or create placeholder)
router.post('/:id/memos/generate', async (req: AuthRequest, res: Response) => {
  const meetingId = req.params.id;
  try {
    // Try FastAPI memo agent
    try {
      const agentsResponse = await fetch(`${config.agentsUrl}/pipeline/${meetingId}/memo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meeting_id: parseInt(meetingId) }),
      });
      if (agentsResponse.ok) {
        const data = await agentsResponse.json();
        return res.json(data);
      }
    } catch { /* FastAPI not available */ }

    // Fallback: create a summary memo from DB data
    const stories = await query(
      `SELECT title, type, status, confidence FROM stories WHERE meeting_id = $1`,
      [meetingId]
    );
    const confirmed = stories.rows.filter((s: any) => s.status === 'confirmed').length;
    const rejected = stories.rows.filter((s: any) => s.status === 'rejected').length;
    const pending = stories.rows.length - confirmed - rejected;

    const versionResult = await query(
      'SELECT COALESCE(MAX(version), 0) as max FROM memos WHERE meeting_id = $1',
      [meetingId]
    );
    const newVersion = parseInt(versionResult.rows[0].max) + 1;

    const content = `# Decision Memo (v${newVersion})\n\n` +
      `**Stories:** ${stories.rows.length} total — ${confirmed} confirmed, ${rejected} rejected, ${pending} pending\n\n` +
      stories.rows.map((s: any) => `- [${s.status}] ${s.title} (${s.type}, ${s.confidence})`).join('\n');

    const result = await query(
      'INSERT INTO memos (meeting_id, version, content) VALUES ($1, $2, $3) RETURNING *',
      [meetingId, newVersion, content]
    );
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Generate memo error:', error);
    res.status(500).json({ error: 'Failed to generate memo' });
  }
});

// Get agent traces for a meeting
router.get('/:id/traces', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM agent_traces WHERE meeting_id = $1 ORDER BY created_at',
      [req.params.id]
    );
    res.json({ rows: result.rows, total: result.rowCount });
  } catch (error) {
    logger.error('Get traces error:', error);
    res.status(500).json({ error: 'Failed to get traces' });
  }
});

// Get audit history for a meeting
router.get('/:id/audit', async (req, res) => {
  try {
    const { storyId } = req.query;
    const conditions = [`(a.entity_type = 'story' AND a.entity_id IN (SELECT id FROM stories WHERE meeting_id = $1))
      OR (a.entity_type = 'meeting' AND a.entity_id = $1)
      OR (a.entity_type = 'check' AND a.entity_id IN (SELECT c.id FROM checks c JOIN stories s ON c.story_id = s.id WHERE s.meeting_id = $1))`];
    const params: any[] = [req.params.id];

    if (storyId) {
      conditions.push(`a.entity_id = $2`);
      params.push(storyId);
    }

    const result = await query(
      `SELECT a.*, u.email as user_email
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY a.created_at DESC
       LIMIT 100`,
      params
    );
    res.json({ rows: result.rows, total: result.rowCount });
  } catch (error) {
    logger.error('Get audit history error:', error);
    res.status(500).json({ error: 'Failed to get audit history' });
  }
});

export default router;
