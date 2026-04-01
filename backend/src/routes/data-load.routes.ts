import { Router, Response } from 'express';
import multer from 'multer';
import { query, transaction } from '../config/database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import OpenAI from 'openai';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(authenticateToken);

// ── Embedding helper ────────────────────────────────────────
let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI | null {
  if (!config.openaiApiKey) return null;
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
  return openaiClient;
}

async function embedAndStore(contentType: string, contentId: number, text: string, metadata: Record<string, any> = {}): Promise<void> {
  const client = getOpenAI();
  if (!client || !text) return;
  try {
    // Truncate to ~8000 tokens worth (~32000 chars)
    const truncated = text.slice(0, 32000);
    const resp = await client.embeddings.create({ model: 'text-embedding-3-small', input: truncated });
    const embedding = resp.data[0].embedding;
    await query(
      `INSERT INTO kb_embeddings (content_type, content_id, content_text, embedding, metadata)
       VALUES ($1, $2, $3, $4::vector, $5)`,
      [contentType, contentId, truncated, JSON.stringify(embedding), JSON.stringify(metadata)]
    );
  } catch (e) {
    logger.error(`Failed to embed ${contentType}/${contentId}:`, e);
  }
}

async function embedBacklogItems(): Promise<number> {
  // Remove old backlog embeddings
  await query(`DELETE FROM kb_embeddings WHERE content_type = 'backlog_item'`);
  const items = await query(`SELECT id, external_id, type, title, description, epic_id, priority FROM backlog_items`);
  let count = 0;
  // Batch: embed epics + stories with descriptions (skip items with no meaningful text)
  for (const item of items.rows) {
    const text = [item.title, item.description].filter(Boolean).join(': ');
    if (text.length < 10) continue;
    await embedAndStore('backlog_item', item.id, text, {
      external_id: item.external_id, type: item.type, epic_id: item.epic_id, priority: item.priority
    });
    count++;
  }
  return count;
}

async function embedArchitectureDoc(docId: number, content: string, fileName: string): Promise<number> {
  // Remove old architecture embeddings
  await query(`DELETE FROM kb_embeddings WHERE content_type = 'architecture'`);
  // Split into sections by headings
  const sections = content.split(/^(?=##?\s)/m).filter(s => s.trim().length > 50);
  let count = 0;
  for (const section of sections) {
    const title = section.split('\n')[0].replace(/^#+\s*/, '').trim();
    await embedAndStore('architecture', docId, section.trim(), { title, file_name: fileName });
    count++;
  }
  return count;
}

// ── Backlog Data ────────────────────────────────────────────

// Upload backlog JSON (validate, truncate+insert)
router.post('/backlog/upload', upload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  let items: any[];
  try {
    const content = req.file.buffer.toString('utf-8');
    const parsed = JSON.parse(content);
    items = Array.isArray(parsed) ? parsed : parsed.items || parsed.backlog || [parsed];
  } catch {
    return res.status(400).json({ error: 'Invalid JSON file' });
  }

  if (items.length === 0) {
    return res.status(400).json({ error: 'JSON contains no items' });
  }

  // Validate required fields
  for (let i = 0; i < items.length; i++) {
    if (!items[i].title) {
      return res.status(400).json({ error: `Item at index ${i} is missing required field "title"` });
    }
  }

  try {
    await transaction(async (client) => {
      await client.query('TRUNCATE TABLE backlog_items RESTART IDENTITY');

      const BATCH = 100;
      for (let i = 0; i < items.length; i += BATCH) {
        const batch = items.slice(i, i + BATCH);
        const valuePlaceholders: string[] = [];
        const params: unknown[] = [];
        let paramIdx = 1;

        for (const item of batch) {
          valuePlaceholders.push(
            `($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`
          );
          params.push(
            item.external_id || item.externalId || item.id || null,
            item.type || 'story',
            item.title,
            item.description || null,
            item.status || 'backlog',
            item.epic_id || item.epicId || null,
            item.priority || null,
            item.labels ? JSON.stringify(item.labels) : null,
            item.acceptance_criteria || item.acceptanceCriteria ? JSON.stringify(item.acceptance_criteria || item.acceptanceCriteria) : null,
            item.dependencies ? JSON.stringify(item.dependencies) : null
          );
        }

        await client.query(
          `INSERT INTO backlog_items (external_id, type, title, description, status, epic_id, priority, labels, acceptance_criteria, dependencies)
           VALUES ${valuePlaceholders.join(', ')}`,
          params
        );
      }
    });

    // Write to audit log
    await query(
      `INSERT INTO audit_log (entity_type, entity_id, action, new_value, user_id)
       VALUES ('backlog', 0, 'bulk_upload', $1, $2)`,
      [JSON.stringify({ count: items.length, file: req.file.originalname }), req.user!.id]
    );

    // Sync epics from backlog items
    try {
      // Remove existing non-proposed epics and re-seed from backlog
      await query(`DELETE FROM epics WHERE is_proposed = false AND id NOT IN (SELECT DISTINCT epic_id FROM stories WHERE epic_id IS NOT NULL)`);
      const epicItems = items.filter(i => (i.type || '').toLowerCase() === 'epic');
      for (const epic of epicItems) {
        const extId = epic.external_id || epic.externalId || epic.id || null;
        const existing = await query(`SELECT id FROM epics WHERE external_id = $1`, [extId]);
        if (existing.rows.length === 0) {
          await query(
            `INSERT INTO epics (external_id, title, description, status, is_proposed) VALUES ($1, $2, $3, 'active', false)`,
            [extId, epic.title, epic.description || null]
          );
        }
      }
      logger.info(`Synced ${epicItems.length} epics from backlog`);
    } catch (e) {
      logger.error('Epic sync failed:', e);
    }

    // Embed backlog items in background
    embedBacklogItems()
      .then(n => logger.info(`Embedded ${n} backlog items into KB`))
      .catch(e => logger.error('Backlog embedding failed:', e));

    res.json({ inserted: items.length });
  } catch (error) {
    logger.error('Backlog upload error:', error);
    res.status(500).json({ error: 'Failed to upload backlog data' });
  }
});

// Download current backlog as JSON
router.get('/backlog/download', async (_req, res) => {
  try {
    const result = await query('SELECT * FROM backlog_items ORDER BY id');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="backlog.json"');
    res.json(result.rows);
  } catch (error) {
    logger.error('Backlog download error:', error);
    res.status(500).json({ error: 'Failed to download backlog' });
  }
});

// Get current backlog items (paginated)
router.get('/backlog', async (req, res) => {
  try {
    const { limit: limitParam, offset: offsetParam, type, status, search } = req.query;
    const searchLimit = parseInt(limitParam as string) || 50;
    const searchOffset = parseInt(offsetParam as string) || 0;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (type) {
      conditions.push(`type = $${paramIdx++}`);
      params.push(type);
    }
    if (status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }
    if (search && typeof search === 'string') {
      conditions.push(`(title ILIKE $${paramIdx} OR external_id ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT * FROM backlog_items ${whereClause} ORDER BY id LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, searchLimit, searchOffset]
    );

    const countResult = await query(
      `SELECT COUNT(*) as total FROM backlog_items ${whereClause}`,
      params
    );

    res.json({ rows: result.rows, total: parseInt(countResult.rows[0].total) });
  } catch (error) {
    logger.error('List backlog items error:', error);
    res.status(500).json({ error: 'Failed to list backlog items' });
  }
});

// ── Architecture Doc ────────────────────────────────────────

// Upload architecture markdown
router.post('/architecture/upload', upload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const content = req.file.buffer.toString('utf-8');
    const fileName = req.file.originalname;

    // Get current max version
    const versionResult = await query(
      'SELECT COALESCE(MAX(version), 0) as max_version FROM architecture_docs'
    );
    const newVersion = parseInt(versionResult.rows[0].max_version) + 1;

    const result = await query(
      `INSERT INTO architecture_docs (file_name, content, version, uploaded_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [fileName, content, newVersion, req.user!.id]
    );

    // Write to audit log
    await query(
      `INSERT INTO audit_log (entity_type, entity_id, action, new_value, user_id)
       VALUES ('architecture_doc', $1, 'uploaded', $2, $3)`,
      [result.rows[0].id, JSON.stringify({ fileName, version: newVersion }), req.user!.id]
    );

    // Embed architecture sections in background
    embedArchitectureDoc(result.rows[0].id, content, fileName)
      .then(n => logger.info(`Embedded ${n} architecture sections into KB`))
      .catch(e => logger.error('Architecture embedding failed:', e));

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Architecture upload error:', error);
    res.status(500).json({ error: 'Failed to upload architecture document' });
  }
});

// Get current (latest) architecture doc
router.get('/architecture', async (_req, res) => {
  try {
    const result = await query(
      `SELECT ad.*, u.display_name as uploaded_by_name
       FROM architecture_docs ad
       LEFT JOIN users u ON u.id = ad.uploaded_by
       ORDER BY ad.version DESC
       LIMIT 1`
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No architecture document found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get architecture doc error:', error);
    res.status(500).json({ error: 'Failed to get architecture document' });
  }
});

// Get all architecture doc versions
router.get('/architecture/versions', async (_req, res) => {
  try {
    const result = await query(
      `SELECT id, file_name, version, uploaded_by, uploaded_at,
              u.display_name as uploaded_by_name
       FROM architecture_docs
       LEFT JOIN users u ON u.id = architecture_docs.uploaded_by
       ORDER BY version DESC`
    );
    res.json({ rows: result.rows, total: result.rowCount });
  } catch (error) {
    logger.error('List architecture versions error:', error);
    res.status(500).json({ error: 'Failed to list architecture versions' });
  }
});

export default router;
