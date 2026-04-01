import { Router, Response } from 'express';
import { query } from '../config/database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';
import OpenAI from 'openai';

const router = Router();
router.use(authenticateToken);

// OpenAI client for embeddings
let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI | null {
  if (!config.openaiApiKey) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: config.openaiApiKey });
  }
  return openaiClient;
}

async function getEmbedding(text: string): Promise<number[] | null> {
  const client = getOpenAI();
  if (!client) return null;
  try {
    const resp = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return resp.data[0].embedding;
  } catch (e) {
    logger.error('Embedding generation failed:', e);
    return null;
  }
}

// Search knowledge base — semantic (pgvector) + full-text on meetings
router.post('/search', async (req: AuthRequest, res: Response) => {
  const { query: q, content_types: contentTypes, limit: limitParam } = req.body;

  if (!q || typeof q !== 'string') {
    return res.status(400).json({ error: 'Field "query" is required' });
  }

  const searchLimit = parseInt(limitParam as string) || 20;
  const results: any[] = [];

  try {
    // 1. Semantic search on kb_embeddings via pgvector
    const embedding = await getEmbedding(q);
    if (embedding) {
      try {
        const typeFilter = contentTypes && contentTypes.length > 0
          ? `AND content_type = ANY($3)`
          : '';
        const vecParams: any[] = [JSON.stringify(embedding), searchLimit];
        if (contentTypes && contentTypes.length > 0) vecParams.push(contentTypes);

        const kbResults = await query(
          `SELECT id, content_type, content_id, LEFT(content_text, 300) as content_text, metadata,
                  1 - (embedding <=> $1::vector) as score
           FROM kb_embeddings
           WHERE embedding IS NOT NULL ${typeFilter}
           ORDER BY embedding <=> $1::vector
           LIMIT $2`,
          vecParams
        );
        for (const r of kbResults.rows) {
          results.push({
            type: r.content_type,
            id: r.content_id,
            text: r.content_text,
            metadata: r.metadata,
            score: parseFloat(r.score) || 0,
            source: 'semantic',
          });
        }
      } catch (e) {
        logger.debug('pgvector search failed (table may be empty):', e);
      }
    }

    // 2. Full-text search on meeting transcripts
    try {
      const meetingResults = await query(
        `SELECT id, title, LEFT(transcript, 300) as snippet, created_at,
                ts_rank(transcript_tsvector, plainto_tsquery('english', $1)) as score
         FROM meetings
         WHERE transcript_tsvector @@ plainto_tsquery('english', $1)
         ORDER BY score DESC
         LIMIT $2`,
        [q, searchLimit]
      );
      for (const r of meetingResults.rows) {
        // Avoid duplicates if meeting was also in kb_embeddings
        if (!results.some(x => x.type === 'meeting' && x.id === r.id)) {
          results.push({
            type: 'meeting',
            id: r.id,
            text: r.snippet,
            metadata: { title: r.title, created_at: r.created_at },
            score: parseFloat(r.score) || 0,
            source: 'full_text',
          });
        }
      }
    } catch { /* full-text search failed, continue */ }

    // 3. Also search stories by title/description (for confirmed stories)
    try {
      const storyResults = await query(
        `SELECT s.id, s.title, LEFT(s.description, 200) as description, s.type, s.status,
                s.meeting_id, m.title as meeting_title,
                similarity(s.title, $1) as score
         FROM stories s
         JOIN meetings m ON s.meeting_id = m.id
         WHERE s.title ILIKE $2 OR s.description ILIKE $2
         ORDER BY score DESC
         LIMIT $3`,
        [q, `%${q}%`, searchLimit]
      );
      for (const r of storyResults.rows) {
        results.push({
          type: 'story',
          id: r.id,
          text: `[${r.type}] ${r.title}: ${r.description || ''}`,
          metadata: { meeting_title: r.meeting_title, meeting_id: r.meeting_id, status: r.status },
          score: parseFloat(r.score) || 0.3,
          source: 'stories',
        });
      }
    } catch { /* story search failed, continue */ }

    // Sort by score descending, deduplicate
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
