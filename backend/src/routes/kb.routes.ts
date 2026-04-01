import { Router, Response } from 'express';
import { query } from '../config/database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

const router = Router();
router.use(authenticateToken);

// Search knowledge base (proxies to FastAPI for vector search, falls back to text search)
router.post('/search', async (req: AuthRequest, res: Response) => {
  const { query: q, content_types: contentTypes, limit: limitParam } = req.body;

  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Field "query" is required' });
  }

  const searchLimit = parseInt(limitParam as string) || 20;

  try {
    // Try FastAPI vector search first
    try {
      const agentsResponse = await fetch(
        `${config.agentsUrl}/kb/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, content_types: contentTypes, limit: searchLimit }),
        }
      );

      if (agentsResponse.ok) {
        const data = await agentsResponse.json();
        return res.json(data);
      }
    } catch {
      // FastAPI not available, fall back to text search
      logger.debug('KB vector search unavailable, falling back to text search');
    }

    // Fallback: search meetings by full-text + KB embeddings by ILIKE
    const results: any[] = [];

    // Search meetings by full-text search
    try {
      const meetingResults = await query(
        `SELECT id, title, LEFT(transcript, 200) as snippet, created_at,
                ts_rank(transcript_tsvector, plainto_tsquery('english', $1)) as score
         FROM meetings
         WHERE transcript_tsvector @@ plainto_tsquery('english', $1)
         ORDER BY score DESC
         LIMIT $2`,
        [q, searchLimit]
      );
      for (const r of meetingResults.rows) {
        results.push({
          type: 'meeting',
          id: r.id,
          text: r.snippet,
          metadata: { title: r.title, created_at: r.created_at },
          score: parseFloat(r.score) || 0,
          source: 'meetings',
        });
      }
    } catch { /* meetings search failed, continue */ }

    // Search KB embeddings by ILIKE (simpler than trigram, always works)
    try {
      const typeFilter = contentTypes && contentTypes.length > 0
        ? `AND content_type = ANY($3)`
        : '';
      const kbParams: any[] = [`%${q}%`, searchLimit];
      if (contentTypes && contentTypes.length > 0) kbParams.push(contentTypes);

      const kbResults = await query(
        `SELECT id, content_type, content_id, LEFT(content_text, 200) as content_text, metadata
         FROM kb_embeddings
         WHERE content_text ILIKE $1 ${typeFilter}
         ORDER BY id DESC
         LIMIT $2`,
        kbParams
      );
      for (const r of kbResults.rows) {
        results.push({
          type: r.content_type,
          id: r.content_id,
          text: r.content_text,
          metadata: r.metadata,
          score: 0.5,
          source: 'kb_embeddings',
        });
      }
    } catch { /* KB search failed, continue */ }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    res.json({ results: results.slice(0, searchLimit), total: results.length });
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
