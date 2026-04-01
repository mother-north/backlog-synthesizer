import { Router, Response } from 'express';
import multer from 'multer';
import { query, transaction } from '../config/database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(authenticateToken);

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
