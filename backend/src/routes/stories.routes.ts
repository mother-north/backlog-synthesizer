import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../config/database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();
router.use(authenticateToken);

// List stories with filters
router.get('/', async (req, res) => {
  try {
    const { status, type, meeting_id, epic_id } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (status) {
      conditions.push(`s.status = $${paramIdx++}`);
      params.push(status);
    }
    if (type) {
      conditions.push(`s.type = $${paramIdx++}`);
      params.push(type);
    }
    if (meeting_id) {
      conditions.push(`s.meeting_id = $${paramIdx++}`);
      params.push(meeting_id);
    }
    if (epic_id) {
      conditions.push(`s.epic_id = $${paramIdx++}`);
      params.push(epic_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT s.*, m.title as meeting_title, e.title as epic_title, e.external_id as epic_external_id,
              (SELECT COUNT(*) FROM checks c WHERE c.story_id = s.id AND c.status = 'open') as open_checks
       FROM stories s
       LEFT JOIN meetings m ON m.id = s.meeting_id
       LEFT JOIN epics e ON e.id = s.epic_id
       ${whereClause}
       ORDER BY s.created_at DESC`,
      params
    );
    res.json({ rows: result.rows, total: result.rowCount });
  } catch (error) {
    logger.error('List stories error:', error);
    res.status(500).json({ error: 'Failed to list stories' });
  }
});

// Get story by id
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT s.*, m.title as meeting_title, e.title as epic_title, e.external_id as epic_external_id
       FROM stories s
       LEFT JOIN meetings m ON m.id = s.meeting_id
       LEFT JOIN epics e ON e.id = s.epic_id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Story not found' });
    }

    // Also fetch checks for this story
    const checks = await query(
      'SELECT * FROM checks WHERE story_id = $1 ORDER BY id',
      [req.params.id]
    );

    res.json({ ...result.rows[0], checks: checks.rows });
  } catch (error) {
    logger.error('Get story error:', error);
    res.status(500).json({ error: 'Failed to get story' });
  }
});

// Update story (edit)
router.put('/:id',
  body('title').optional().isString(),
  body('description').optional().isString(),
  body('type').optional().isString(),
  body('acceptance_criteria').optional(),
  body('epic_id').optional({ nullable: true }),
  body('priority_signals').optional(),
  body('feature_tags').optional(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const storyId = req.params.id;

    try {
      // Get current story for audit
      const currentResult = await query('SELECT * FROM stories WHERE id = $1', [storyId]);
      if (currentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Story not found' });
      }
      const currentStory = currentResult.rows[0];

      const { title, description, type, acceptance_criteria, epic_id, priority_signals, feature_tags } = req.body;

      const updates: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      if (title !== undefined) { updates.push(`title = $${paramIdx++}`); params.push(title); }
      if (description !== undefined) { updates.push(`description = $${paramIdx++}`); params.push(description); }
      if (type !== undefined) { updates.push(`type = $${paramIdx++}`); params.push(type); }
      if (acceptance_criteria !== undefined) { updates.push(`acceptance_criteria = $${paramIdx++}`); params.push(JSON.stringify(acceptance_criteria)); }
      if (epic_id !== undefined) { updates.push(`epic_id = $${paramIdx++}`); params.push(epic_id); }
      if (priority_signals !== undefined) { updates.push(`priority_signals = $${paramIdx++}`); params.push(JSON.stringify(priority_signals)); }
      if (feature_tags !== undefined) { updates.push(`feature_tags = $${paramIdx++}`); params.push(JSON.stringify(feature_tags)); }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      // If story was awaiting_confirmation, move back to under_review (edit triggers re-check)
      if (currentStory.status === 'awaiting_confirmation') {
        updates.push(`status = $${paramIdx++}`);
        params.push('under_review');
      }

      params.push(storyId);
      const result = await query(
        `UPDATE stories SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
        params
      );

      // Write to audit_log
      await query(
        `INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id)
         VALUES ('story', $1, 'updated', $2, $3, $4)`,
        [storyId, JSON.stringify(currentStory), JSON.stringify(result.rows[0]), req.user!.id]
      );

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Update story error:', error);
      res.status(500).json({ error: 'Failed to update story' });
    }
  }
);

// Confirm story
router.post('/:id/confirm', async (req: AuthRequest, res: Response) => {
  const storyId = req.params.id;

  try {
    const currentResult = await query('SELECT * FROM stories WHERE id = $1', [storyId]);
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Story not found' });
    }
    const currentStory = currentResult.rows[0];

    // Check for open checks
    const openChecks = await query(
      "SELECT COUNT(*) as count FROM checks WHERE story_id = $1 AND status = 'open'",
      [storyId]
    );
    if (parseInt(openChecks.rows[0].count) > 0) {
      return res.status(400).json({ error: 'Cannot confirm story with open checks' });
    }

    // Check story has an epic
    if (!currentStory.epic_id) {
      return res.status(400).json({ error: 'Cannot confirm story without an epic assignment' });
    }

    const result = await query(
      `UPDATE stories SET status = 'confirmed', confirmed_at = NOW(), confirmed_by = $1
       WHERE id = $2 RETURNING *`,
      [req.user!.id, storyId]
    );

    // Write to audit_log
    await query(
      `INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id)
       VALUES ('story', $1, 'confirmed', $2, $3, $4)`,
      [storyId, JSON.stringify({ status: currentStory.status }), JSON.stringify({ status: 'confirmed' }), req.user!.id]
    );

    // Write decision
    await query(
      `INSERT INTO decisions (meeting_id, story_id, decision_type, decided_by)
       VALUES ($1, $2, 'confirmed', $3)`,
      [currentStory.meeting_id, storyId, req.user!.id]
    );

    // Check if all stories in meeting are resolved (confirmed or rejected)
    await checkMeetingCompletion(currentStory.meeting_id);

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Confirm story error:', error);
    res.status(500).json({ error: 'Failed to confirm story' });
  }
});

// Reject story
router.post('/:id/reject',
  body('rationale').notEmpty().isString(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const storyId = req.params.id;
    const { rationale } = req.body;

    try {
      const currentResult = await query('SELECT * FROM stories WHERE id = $1', [storyId]);
      if (currentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Story not found' });
      }
      const currentStory = currentResult.rows[0];

      const result = await query(
        `UPDATE stories SET status = 'rejected' WHERE id = $1 RETURNING *`,
        [storyId]
      );

      // Write to audit_log
      await query(
        `INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id)
         VALUES ('story', $1, 'rejected', $2, $3, $4)`,
        [storyId, JSON.stringify({ status: currentStory.status }), JSON.stringify({ status: 'rejected', rationale }), req.user!.id]
      );

      // Write decision
      await query(
        `INSERT INTO decisions (meeting_id, story_id, decision_type, rationale, decided_by)
         VALUES ($1, $2, 'rejected', $3, $4)`,
        [currentStory.meeting_id, storyId, rationale, req.user!.id]
      );

      // Check if all stories in meeting are resolved
      await checkMeetingCompletion(currentStory.meeting_id);

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Reject story error:', error);
      res.status(500).json({ error: 'Failed to reject story' });
    }
  }
);

// Bulk confirm stories
router.post('/bulk-confirm',
  body('storyIds').isArray({ min: 1 }),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { storyIds } = req.body;
    const results: any[] = [];
    const errors_list: any[] = [];

    for (const storyId of storyIds) {
      try {
        // Check for open checks
        const openChecks = await query(
          "SELECT COUNT(*) as count FROM checks WHERE story_id = $1 AND status = 'open'",
          [storyId]
        );
        if (parseInt(openChecks.rows[0].count) > 0) {
          errors_list.push({ storyId, error: 'Has open checks' });
          continue;
        }

        // Check has epic
        const storyResult = await query('SELECT * FROM stories WHERE id = $1', [storyId]);
        if (storyResult.rows.length === 0) {
          errors_list.push({ storyId, error: 'Not found' });
          continue;
        }
        if (!storyResult.rows[0].epic_id) {
          errors_list.push({ storyId, error: 'No epic assigned' });
          continue;
        }

        const result = await query(
          `UPDATE stories SET status = 'confirmed', confirmed_at = NOW(), confirmed_by = $1
           WHERE id = $2 RETURNING *`,
          [req.user!.id, storyId]
        );

        await query(
          `INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id)
           VALUES ('story', $1, 'confirmed', $2, $3, $4)`,
          [storyId, JSON.stringify({ status: storyResult.rows[0].status }), JSON.stringify({ status: 'confirmed' }), req.user!.id]
        );

        await query(
          `INSERT INTO decisions (meeting_id, story_id, decision_type, decided_by)
           VALUES ($1, $2, 'confirmed', $3)`,
          [storyResult.rows[0].meeting_id, storyId, req.user!.id]
        );

        results.push(result.rows[0]);
      } catch (error) {
        logger.error(`Bulk confirm story ${storyId} error:`, error);
        errors_list.push({ storyId, error: 'Internal error' });
      }
    }

    // Check meeting completion for affected meetings
    const meetingIds = [...new Set(results.map(r => r.meeting_id))];
    for (const meetingId of meetingIds) {
      await checkMeetingCompletion(meetingId);
    }

    res.json({ confirmed: results, errors: errors_list });
  }
);

// Helper: check if all stories in a meeting are resolved → mark meeting completed
async function checkMeetingCompletion(meetingId: number): Promise<void> {
  try {
    const unresolvedResult = await query(
      `SELECT COUNT(*) as count FROM stories
       WHERE meeting_id = $1 AND status NOT IN ('confirmed', 'rejected', 'ready_to_push')`,
      [meetingId]
    );
    if (parseInt(unresolvedResult.rows[0].count) === 0) {
      // All stories resolved — update to ready_to_push and mark meeting completed
      await query(
        `UPDATE stories SET status = 'ready_to_push'
         WHERE meeting_id = $1 AND status = 'confirmed'`,
        [meetingId]
      );
      await query(
        `UPDATE meetings SET status = 'completed' WHERE id = $1`,
        [meetingId]
      );
    }
  } catch (error) {
    logger.error('Check meeting completion error:', error);
  }
}

export default router;
