import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../config/database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();
router.use(authenticateToken);

// List all epics
router.get('/', async (req, res) => {
  try {
    const { status, is_proposed } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    const { meeting_id } = req.query;

    if (meeting_id) {
      conditions.push(`(e.proposed_by_meeting = $${paramIdx} OR e.id IN (SELECT DISTINCT epic_id FROM stories WHERE meeting_id = $${paramIdx} AND epic_id IS NOT NULL))`);
      params.push(meeting_id);
      paramIdx++;
    }
    if (status) {
      conditions.push(`e.status = $${paramIdx++}`);
      params.push(status);
    }
    if (is_proposed !== undefined) {
      conditions.push(`e.is_proposed = $${paramIdx++}`);
      params.push(is_proposed === 'true');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT e.*,
              m.title as proposed_by_meeting_title,
              u.display_name as approved_by_name,
              (SELECT COUNT(*) FROM stories s WHERE s.epic_id = e.id) as story_count
       FROM epics e
       LEFT JOIN meetings m ON m.id = e.proposed_by_meeting
       LEFT JOIN users u ON u.id = e.approved_by
       ${whereClause}
       ORDER BY e.id`,
      params
    );
    res.json({ rows: result.rows, total: result.rowCount });
  } catch (error) {
    logger.error('List epics error:', error);
    res.status(500).json({ error: 'Failed to list epics' });
  }
});

// Get epic by id
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT e.*, m.title as proposed_by_meeting_title, u.display_name as approved_by_name
       FROM epics e
       LEFT JOIN meetings m ON m.id = e.proposed_by_meeting
       LEFT JOIN users u ON u.id = e.approved_by
       WHERE e.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Epic not found' });
    }

    // Also fetch stories under this epic
    const stories = await query(
      'SELECT id, title, status, type, confidence FROM stories WHERE epic_id = $1 ORDER BY id',
      [req.params.id]
    );

    res.json({ ...result.rows[0], stories: stories.rows });
  } catch (error) {
    logger.error('Get epic error:', error);
    res.status(500).json({ error: 'Failed to get epic' });
  }
});

// Approve epic
router.post('/:id/approve', async (req: AuthRequest, res: Response) => {
  const epicId = req.params.id;

  try {
    const currentResult = await query('SELECT * FROM epics WHERE id = $1', [epicId]);
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Epic not found' });
    }
    const currentEpic = currentResult.rows[0];

    if (!currentEpic.is_proposed) {
      return res.status(400).json({ error: 'Epic is not a proposal' });
    }

    const result = await query(
      `UPDATE epics SET is_proposed = FALSE, status = 'active', approved_by = $1, approved_at = NOW()
       WHERE id = $2 RETURNING *`,
      [req.user!.id, epicId]
    );

    // Write to audit_log
    await query(
      `INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id)
       VALUES ('epic', $1, 'approved', $2, $3, $4)`,
      [epicId, JSON.stringify({ is_proposed: true }), JSON.stringify({ is_proposed: false, status: 'active' }), req.user!.id]
    );

    // Write decision
    await query(
      `INSERT INTO decisions (meeting_id, epic_id, decision_type, decided_by)
       VALUES ($1, $2, 'epic_approved', $3)`,
      [currentEpic.proposed_by_meeting, epicId, req.user!.id]
    );

    // Resolve any "new_epic" checks on stories under this epic
    await query(
      `UPDATE checks SET status = 'resolved', resolved_by = $1, resolution_notes = 'Epic approved', resolved_at = NOW()
       WHERE story_id IN (SELECT id FROM stories WHERE epic_id = $2)
         AND check_type = 'new_epic' AND status = 'open'`,
      [req.user!.id, epicId]
    );

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Approve epic error:', error);
    res.status(500).json({ error: 'Failed to approve epic' });
  }
});

// Reject epic
router.post('/:id/reject',
  body('rationale').notEmpty().isString(),
  body('reassign_epic_id').optional().isInt(),
  body('reject_stories').optional().isBoolean(),
  body('stories_rejection_rationale').optional().isString(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const epicId = req.params.id;
    const { rationale, reassign_epic_id, reject_stories, stories_rejection_rationale } = req.body;

    try {
      const currentResult = await query('SELECT * FROM epics WHERE id = $1', [epicId]);
      if (currentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Epic not found' });
      }
      const currentEpic = currentResult.rows[0];

      // Mark epic as rejected
      await query(
        `UPDATE epics SET status = 'rejected' WHERE id = $1`,
        [epicId]
      );

      // Write to audit_log
      await query(
        `INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id)
         VALUES ('epic', $1, 'rejected', $2, $3, $4)`,
        [epicId, JSON.stringify({ status: currentEpic.status }), JSON.stringify({ status: 'rejected', rationale }), req.user!.id]
      );

      // Write decision
      await query(
        `INSERT INTO decisions (meeting_id, epic_id, decision_type, rationale, decided_by)
         VALUES ($1, $2, 'epic_rejected', $3, $4)`,
        [currentEpic.proposed_by_meeting, epicId, rationale, req.user!.id]
      );

      // Handle stories under this epic
      if (reassign_epic_id) {
        // Reassign stories to another epic
        await query(
          `UPDATE stories SET epic_id = $1 WHERE epic_id = $2`,
          [reassign_epic_id, epicId]
        );
      } else if (reject_stories) {
        // Reject all stories under this epic
        const storyResult = await query('SELECT id, meeting_id FROM stories WHERE epic_id = $1', [epicId]);
        for (const story of storyResult.rows) {
          await query(`UPDATE stories SET status = 'rejected' WHERE id = $1`, [story.id]);
          await query(
            `INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id)
             VALUES ('story', $1, 'rejected', $2, $3, $4)`,
            [story.id, JSON.stringify({ reason: 'epic_rejected' }), JSON.stringify({ status: 'rejected', rationale: stories_rejection_rationale || rationale }), req.user!.id]
          );
          await query(
            `INSERT INTO decisions (meeting_id, story_id, decision_type, rationale, decided_by)
             VALUES ($1, $2, 'rejected', $3, $4)`,
            [story.meeting_id, story.id, stories_rejection_rationale || rationale, req.user!.id]
          );
        }
      } else {
        // Default: unassign stories from rejected epic (set epic_id to null)
        await query(
          `UPDATE stories SET epic_id = NULL WHERE epic_id = $1`,
          [epicId]
        );
      }

      res.json({ message: 'Epic rejected', epicId });
    } catch (error) {
      logger.error('Reject epic error:', error);
      res.status(500).json({ error: 'Failed to reject epic' });
    }
  }
);

// Merge epic into another epic
router.post('/:id/merge',
  body('target_epic_id').isInt(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const sourceEpicId = req.params.id;
    const { target_epic_id } = req.body;

    try {
      // Verify both epics exist
      const sourceResult = await query('SELECT * FROM epics WHERE id = $1', [sourceEpicId]);
      if (sourceResult.rows.length === 0) {
        return res.status(404).json({ error: 'Source epic not found' });
      }
      const targetResult = await query('SELECT * FROM epics WHERE id = $1', [target_epic_id]);
      if (targetResult.rows.length === 0) {
        return res.status(404).json({ error: 'Target epic not found' });
      }

      // Move all stories to target epic
      await query(
        `UPDATE stories SET epic_id = $1 WHERE epic_id = $2`,
        [target_epic_id, sourceEpicId]
      );

      // Mark source epic as merged
      await query(
        `UPDATE epics SET status = 'merged' WHERE id = $1`,
        [sourceEpicId]
      );

      // Write to audit_log
      await query(
        `INSERT INTO audit_log (entity_type, entity_id, action, old_value, new_value, user_id)
         VALUES ('epic', $1, 'merged', $2, $3, $4)`,
        [sourceEpicId, JSON.stringify({ status: sourceResult.rows[0].status }), JSON.stringify({ status: 'merged', target_epic_id }), req.user!.id]
      );

      // Write decision
      await query(
        `INSERT INTO decisions (meeting_id, epic_id, decision_type, rationale, decided_by)
         VALUES ($1, $2, 'epic_merged', $3, $4)`,
        [sourceResult.rows[0].proposed_by_meeting, sourceEpicId, `Merged into epic ${target_epic_id}`, req.user!.id]
      );

      res.json({ message: 'Epic merged', sourceEpicId, targetEpicId: target_epic_id });
    } catch (error) {
      logger.error('Merge epic error:', error);
      res.status(500).json({ error: 'Failed to merge epic' });
    }
  }
);

export default router;
