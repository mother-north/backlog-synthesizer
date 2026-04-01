import { Router, Response } from 'express';
import { query } from '../config/database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

const router = Router();
router.use(authenticateToken);

// Search knowledge base (proxies to FastAPI for vector search, falls back to text search)
router.get('/search', async (req: AuthRequest, res: Response) => {
  const { q, types, limit: limitParam } = req.query;

  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  const searchLimit = parseInt(limitParam as string) || 20;
  const contentTypes = types ? (types as string).split(',') : null;

  try {
    // Try FastAPI vector search first
    try {
      const params = new URLSearchParams({
        q,
        limit: searchLimit.toString(),
      });
      if (contentTypes) {
        params.append('types', contentTypes.join(','));
      }

      const agentsResponse = await fetch(
        `${config.agentsUrl}/kb/search?${params.toString()}`
      );

      if (agentsResponse.ok) {
        const data = await agentsResponse.json();
        return res.json(data);
      }
    } catch {
      // FastAPI not available, fall back to text search
      logger.debug('KB vector search unavailable, falling back to text search');
    }

    // Fallback: full-text search on meetings + text search on KB embeddings
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (contentTypes && contentTypes.length > 0) {
      conditions.push(`content_type = ANY($${paramIdx++})`);
      params.push(contentTypes);
    }

    const typeFilter = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

    // Search KB embeddings by text similarity (trigram)
    const kbResults = await query(
      `SELECT id, content_type, content_id, content_text, metadata,
              similarity(content_text, $1) as score
       FROM kb_embeddings
       WHERE content_text % $1 ${typeFilter}
       ORDER BY score DESC
       LIMIT $${paramIdx}`,
      [q, ...params, searchLimit]
    );

    // Also search meetings by full-text
    const meetingResults = await query(
      `SELECT id, title, LEFT(transcript, 200) as snippet, created_at,
              ts_rank(transcript_tsvector, plainto_tsquery('english', $1)) as score
       FROM meetings
       WHERE transcript_tsvector @@ plainto_tsquery('english', $1)
       ORDER BY score DESC
       LIMIT $2`,
      [q, searchLimit]
    );

    // Combine results
    const results = [
      ...kbResults.rows.map((r: any) => ({
        type: r.content_type,
        id: r.content_id,
        text: r.content_text,
        metadata: r.metadata,
        score: r.score,
        source: 'kb_embeddings',
      })),
      ...meetingResults.rows.map((r: any) => ({
        type: 'meeting',
        id: r.id,
        text: r.snippet,
        metadata: { title: r.title, created_at: r.created_at },
        score: r.score,
        source: 'meetings',
      })),
    ].sort((a, b) => b.score - a.score).slice(0, searchLimit);

    res.json({ results, total: results.length });
  } catch (error) {
    logger.error('KB search error:', error);
    res.status(500).json({ error: 'Failed to search knowledge base' });
  }
});

// Browse KB entries
router.get('/entries', async (req, res) => {
  try {
    const { content_type, limit: limitParam, offset: offsetParam } = req.query;
    const searchLimit = parseInt(limitParam as string) || 50;
    const searchOffset = parseInt(offsetParam as string) || 0;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (content_type) {
      conditions.push(`content_type = $${paramIdx++}`);
      params.push(content_type);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT id, content_type, content_id, LEFT(content_text, 300) as content_text, metadata, created_at
       FROM kb_embeddings
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, searchLimit, searchOffset]
    );

    const countResult = await query(
      `SELECT COUNT(*) as total FROM kb_embeddings ${whereClause}`,
      params
    );

    res.json({ rows: result.rows, total: parseInt(countResult.rows[0].total) });
  } catch (error) {
    logger.error('KB entries error:', error);
    res.status(500).json({ error: 'Failed to get KB entries' });
  }
});

export default router;
