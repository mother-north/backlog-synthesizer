import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../config/database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();
router.use(authenticateToken);

// List checks with filters
router.get('/', async (req, res) => {
  try {
    const { status, routed_to, meeting_id, story_id } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (status) {
      conditions.push(`c.status = $${paramIdx++}`);
      params.push(status);
    }
    if (routed_to) {
      conditions.push(`c.routed_to = $${paramIdx++}`);
      params.push(routed_to);
    }
    if (story_id) {
      conditions.push(`c.story_id = $${paramIdx++}`);
      params.push(story_id);
    }
    if (meeting_id) {
      conditions.push(`s.meeting_id = $${paramIdx++}`);
      params.push(meeting_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT c.*, s.title as story_title, s.meeting_id, m.title as meeting_title
       FROM checks c
       JOIN stories s ON s.id = c.story_id
       LEFT JOIN meetings m ON m.id = s.meeting_id
       ${whereClause}
       ORDER BY c.id DESC`,
      params
    );
    res.json({ rows: result.rows, total: result.rowCount });
  } catch (error) {
    logger.error('List checks error:', error);
    res.status(500).json({ error: 'Failed to list checks' });
  }
});

// Resolve check
router.post('/:id/resolve',
  body('resolution_notes').optional().isString(),
  body('resolution_type').optional().isString(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const checkId = req.params.id;
    const { resolution_notes, resolution_type } = req.body;

    try {
      const currentResult = await query('SELECT * FROM checks WHERE id = $1', [checkId]);
      if (currentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Check not found' });
      }
      const currentCheck = currentResult.rows[0];

      if (currentCheck.status !== 'open') {
        return res.status(400).json({ error: 'Check is already resolved' });
      }

      const result = await query(
        `UPDATE checks SET status = 'resolved', resolved_by = $1, resolution_notes = $2, resolved_at = NOW()
         WHERE id = $3 RETURNING *`,
        [req.user!.id, resolution_notes || null, checkId]
      );

      // Write to audit_log
      await query(
        `INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id)
         VALUES ('check', $1, 'resolved', $2, $3, $4)`,
        [checkId, JSON.stringify({ status: 'open' }), JSON.stringify({ status: 'resolved', resolution_notes, resolution_type }), req.user!.id]
      );

      // Check if all checks for this story are resolved → update story status
      await updateStoryStatusAfterCheckResolution(currentCheck.story_id);

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Resolve check error:', error);
      res.status(500).json({ error: 'Failed to resolve check' });
    }
  }
);

// Dismiss check
router.post('/:id/dismiss',
  body('reason').optional().isString(),
  async (req: AuthRequest, res: Response) => {
    const checkId = req.params.id;
    const { reason } = req.body;

    try {
      const currentResult = await query('SELECT * FROM checks WHERE id = $1', [checkId]);
      if (currentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Check not found' });
      }
      const currentCheck = currentResult.rows[0];

      if (currentCheck.status !== 'open') {
        return res.status(400).json({ error: 'Check is already resolved or dismissed' });
      }

      const result = await query(
        `UPDATE checks SET status = 'dismissed', resolved_by = $1, resolution_notes = $2, resolved_at = NOW()
         WHERE id = $3 RETURNING *`,
        [req.user!.id, reason || 'Dismissed', checkId]
      );

      // Write to audit_log
      await query(
        `INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id)
         VALUES ('check', $1, 'dismissed', $2, $3, $4)`,
        [checkId, JSON.stringify({ status: 'open' }), JSON.stringify({ status: 'dismissed', reason }), req.user!.id]
      );

      // Check if all checks for this story are resolved
      await updateStoryStatusAfterCheckResolution(currentCheck.story_id);

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Dismiss check error:', error);
      res.status(500).json({ error: 'Failed to dismiss check' });
    }
  }
);

// Helper: update story status after all checks resolved
async function updateStoryStatusAfterCheckResolution(storyId: number): Promise<void> {
  try {
    const openChecks = await query(
      "SELECT COUNT(*) as count FROM checks WHERE story_id = $1 AND status = 'open'",
      [storyId]
    );
    if (parseInt(openChecks.rows[0].count) === 0) {
      // All checks resolved — move story to awaiting_confirmation
      const storyResult = await query('SELECT status FROM stories WHERE id = $1', [storyId]);
      if (storyResult.rows.length > 0) {
        const currentStatus = storyResult.rows[0].status;
        if (currentStatus === 'under_review' || currentStatus === 'pending_decision') {
          await query(
            `UPDATE stories SET status = 'awaiting_confirmation' WHERE id = $1`,
            [storyId]
          );
        }
      }
    }
  } catch (error) {
    logger.error('Update story status after check resolution error:', error);
  }
}

export default router;
