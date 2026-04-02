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

// SSE progress endpoint — no auth required (EventSource can't send headers)
router.get('/:id/progress', async (req, res) => {
  const meetingId = req.params.id;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Poll DB for progress
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
        res.write(`data: ${JSON.stringify(result.rows[0].pipeline_progress || [])}\n\n`);
      }
      if (result.rows[0].status !== 'processing') {
        clearInterval(pollInterval);
        res.write(`data: ${JSON.stringify({ type: 'complete', status: result.rows[0].status })}\n\n`);
        res.end();
      }
    } catch (e) {
      logger.error('SSE poll error:', e);
    }
  }, 2000);

  req.on('close', () => clearInterval(pollInterval));
});

router.use(authenticateToken);

// List all meetings
router.get('/', async (_req, res) => {
  try {
    const result = await query(
      `SELECT m.id, m.title, m.file_name, m.status, m.meeting_quality,
              m.pipeline_progress, m.uploaded_by, m.created_at,
              u.display_name as uploaded_by_name,
              COALESCE(sc.story_count, 0) as story_count,
              COALESCE(sc.confirmed_count, 0) as confirmed_count,
              COALESCE(oc.open_checks, 0) as open_checks
       FROM meetings m
       LEFT JOIN users u ON u.id = m.uploaded_by
       LEFT JOIN LATERAL (
         SELECT COUNT(*) as story_count,
                COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_count
         FROM stories WHERE meeting_id = m.id
       ) sc ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*) as open_checks
         FROM checks c JOIN stories s ON c.story_id = s.id
         WHERE s.meeting_id = m.id AND c.status = 'open'
       ) oc ON true
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
    const title = req.body.title;
    if (!title) {
      return res.status(400).json({ error: 'Meeting title is required' });
    }

    const pasteText = req.body.pasteText;
    if (!req.file && !pasteText) {
      return res.status(400).json({ error: 'No file uploaded or text provided' });
    }

    try {
      const transcript = req.file ? req.file.buffer.toString('utf-8') : pasteText;
      const fileName = req.file ? req.file.originalname : 'pasted-text.md';

      const result = await query(
        `INSERT INTO meetings (title, transcript, file_name, status, uploaded_by)
         VALUES ($1, $2, $3, 'uploaded', $4) RETURNING *`,
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

// Delete meeting and all associated data
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const meetingId = req.params.id;
  try {
    const meetingResult = await query('SELECT id, title FROM meetings WHERE id = $1', [meetingId]);
    if (meetingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    await query('DELETE FROM checks WHERE story_id IN (SELECT id FROM stories WHERE meeting_id = $1)', [meetingId]);
    await query('DELETE FROM decisions WHERE meeting_id = $1', [meetingId]);
    await query('DELETE FROM stories WHERE meeting_id = $1', [meetingId]);
    await query('DELETE FROM agent_traces WHERE meeting_id = $1', [meetingId]);
    await query('DELETE FROM epics WHERE is_proposed = true AND proposed_by_meeting = $1', [meetingId]);
    await query('DELETE FROM memos WHERE meeting_id = $1', [meetingId]);
    await query('DELETE FROM backlog_hygiene_flags WHERE meeting_id = $1', [meetingId]);
    await query('DELETE FROM audit_log WHERE entity_type = $1 AND entity_id = $2', ['meeting', meetingId]);
    await query('DELETE FROM meetings WHERE id = $1', [meetingId]);

    res.json({ message: 'Meeting deleted', meeting_id: parseInt(meetingId) });
  } catch (error) {
    logger.error('Delete meeting error:', error);
    res.status(500).json({ error: 'Failed to delete meeting' });
  }
});

// Re-evaluate: clear all stories/checks and re-trigger pipeline
router.post('/:id/reevaluate', async (req: AuthRequest, res: Response) => {
  const meetingId = req.params.id;
  try {
    // Clear all associated data
    await query('DELETE FROM checks WHERE story_id IN (SELECT id FROM stories WHERE meeting_id = $1)', [meetingId]);
    await query('DELETE FROM decisions WHERE meeting_id = $1', [meetingId]);
    await query('DELETE FROM stories WHERE meeting_id = $1', [meetingId]);
    await query('DELETE FROM agent_traces WHERE meeting_id = $1', [meetingId]);
    await query('DELETE FROM epics WHERE is_proposed = true AND proposed_by_meeting = $1', [meetingId]);
    await query('DELETE FROM memos WHERE meeting_id = $1', [meetingId]);
    await query('DELETE FROM backlog_hygiene_flags WHERE meeting_id = $1', [meetingId]);
    await query('UPDATE meetings SET status = $1, pipeline_progress = NULL, meeting_quality = NULL WHERE id = $2', ['processing', meetingId]);

    // Write to audit log
    await query(
      `INSERT INTO audit_log (entity_type, entity_id, action, new_value, user_id)
       VALUES ('meeting', $1, 'reevaluate', $2, $3)`,
      [meetingId, JSON.stringify({ cleared_at: new Date().toISOString() }), req.user!.id]
    );

    // Trigger pipeline
    const agentsResponse = await fetch(`${config.agentsUrl}/pipeline/run/${meetingId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!agentsResponse.ok) {
      return res.status(500).json({ error: 'Failed to start pipeline after clearing' });
    }

    res.json({ message: 'Re-evaluation started', meeting_id: parseInt(meetingId) });
  } catch (error) {
    logger.error('Reevaluate error:', error);
    res.status(500).json({ error: 'Failed to re-evaluate meeting' });
  }
});

// Trigger pipeline
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

// OLD progress route removed — moved before auth middleware
// (kept as comment for reference)
/*
router.get('/:id/progress_old', async (req: AuthRequest, res: Response) => {
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
*/

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
        // Store the LLM-generated memo in DB so it appears on refresh
        if (data.memo?.full_text) {
          const versionResult = await query(
            'SELECT COALESCE(MAX(version), 0) as max FROM memos WHERE meeting_id = $1',
            [meetingId]
          );
          const newVersion = parseInt(versionResult.rows[0].max) + 1;
          await query(
            'INSERT INTO memos (meeting_id, version, content) VALUES ($1, $2, $3)',
            [meetingId, newVersion, data.memo.full_text]
          );
        }
        return res.json(data);
      }
    } catch { /* FastAPI not available */ }

    // Fallback: create a rich summary memo from DB data
    const meetingResult = await query(
      `SELECT m.title, m.status, m.created_at, m.meeting_quality, left(m.transcript, 500) as transcript_start
       FROM meetings m WHERE m.id = $1`,
      [meetingId]
    );
    const meeting = meetingResult.rows[0] || {};

    const stories = await query(
      `SELECT s.title, s.type, s.status, s.confidence, s.speaker, e.title as epic_title, e.external_id as epic_ext
       FROM stories s LEFT JOIN epics e ON e.id = s.epic_id
       WHERE s.meeting_id = $1 ORDER BY s.status, s.id`,
      [meetingId]
    );

    const checks = await query(
      `SELECT c.check_type, c.status, c.resolution_notes, s.title as story_title
       FROM checks c JOIN stories s ON s.id = c.story_id WHERE s.meeting_id = $1`,
      [meetingId]
    );

    const confirmedStories = stories.rows.filter((s: any) => s.status === 'confirmed' || s.status === 'ready_to_push');
    const rejectedStories = stories.rows.filter((s: any) => s.status === 'rejected');
    const pendingStories = stories.rows.filter((s: any) => !['confirmed', 'rejected', 'ready_to_push'].includes(s.status));
    const openChecks = checks.rows.filter((c: any) => c.status === 'open');
    const resolvedChecks = checks.rows.filter((c: any) => c.status !== 'open');

    const quality = meeting.meeting_quality || {};

    const versionResult = await query(
      'SELECT COALESCE(MAX(version), 0) as max FROM memos WHERE meeting_id = $1',
      [meetingId]
    );
    const newVersion = parseInt(versionResult.rows[0].max) + 1;

    const formatStoryList = (list: any[]) => list.length === 0 ? '_None_\n' :
      list.map((s: any) => `- **${s.title}** (${s.type}) — Epic: ${s.epic_title || 'Unassigned'}${s.speaker ? `, Raised by: ${s.speaker}` : ''}`).join('\n') + '\n';

    const content = `# Decision Memo: ${meeting.title || 'Meeting'} (v${newVersion})\n\n` +
      `**Date:** ${meeting.created_at ? new Date(meeting.created_at).toLocaleDateString() : 'N/A'}\n` +
      `**Status:** ${meeting.status || 'N/A'}\n\n` +
      `## Meeting Summary\n\n` +
      `${quality.recommendation || 'This meeting produced ' + stories.rows.length + ' candidate stories across ' + new Set(stories.rows.map((s: any) => s.epic_title).filter(Boolean)).size + ' epics.'}\n\n` +
      `**Total Stories:** ${stories.rows.length} — ✅ ${confirmedStories.length} confirmed, ❌ ${rejectedStories.length} rejected, ⏳ ${pendingStories.length} in progress\n` +
      `**Checks:** ${checks.rows.length} total — ${openChecks.length} open, ${resolvedChecks.length} resolved\n\n` +
      `## Confirmed Stories (${confirmedStories.length})\n\n` +
      formatStoryList(confirmedStories) + '\n' +
      `## Rejected Stories (${rejectedStories.length})\n\n` +
      formatStoryList(rejectedStories) + '\n' +
      `## In Progress (${pendingStories.length})\n\n` +
      formatStoryList(pendingStories) + '\n' +
      (openChecks.length > 0 ? `## Open Checks (${openChecks.length})\n\n` +
        openChecks.map((c: any) => `- **${c.story_title}**: ${c.check_type}`).join('\n') + '\n\n' : '') +
      (quality.actionability ? `## Meeting Quality\n\n` +
        `- Actionability: ${quality.actionability}\n` +
        `- Requirements: ${quality.requirements || 'N/A'}\n` +
        `- Ambiguous: ${quality.ambiguous || 0}\n` : '');

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
