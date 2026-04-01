import { Router } from 'express';
import { query } from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();
router.use(authenticateToken);

// Get dashboard metrics
router.get('/', async (_req, res) => {
  try {
    // Meeting counts by status
    const meetingCounts = await query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'processing') as processing,
         COUNT(*) FILTER (WHERE status = 'in_review') as in_review,
         COUNT(*) FILTER (WHERE status = 'completed') as completed
       FROM meetings`
    );

    // Story counts by status
    const storyCounts = await query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status = 'generated') as generated,
         COUNT(*) FILTER (WHERE status = 'under_review') as under_review,
         COUNT(*) FILTER (WHERE status = 'pending_decision') as pending_decision,
         COUNT(*) FILTER (WHERE status = 'awaiting_confirmation') as awaiting_confirmation,
         COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
         COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
         COUNT(*) FILTER (WHERE status = 'ready_to_push') as ready_to_push
       FROM stories`
    );

    // Open checks by role
    const checksByRole = await query(
      `SELECT routed_to, COUNT(*) as count
       FROM checks
       WHERE status = 'open'
       GROUP BY routed_to
       ORDER BY count DESC`
    );

    // Average review time (time from created_at to confirmed_at for confirmed stories)
    const avgReviewTime = await query(
      `SELECT
         AVG(EXTRACT(EPOCH FROM (confirmed_at - created_at)) / 86400) as avg_days
       FROM stories
       WHERE status IN ('confirmed', 'ready_to_push') AND confirmed_at IS NOT NULL`
    );

    // Stories by meeting (for bar chart)
    const storiesByMeeting = await query(
      `SELECT m.id, m.title,
              COUNT(s.id) as total_stories,
              COUNT(s.id) FILTER (WHERE s.status = 'confirmed' OR s.status = 'ready_to_push') as confirmed,
              COUNT(s.id) FILTER (WHERE s.status = 'rejected') as rejected,
              COUNT(s.id) FILTER (WHERE s.status NOT IN ('confirmed', 'rejected', 'ready_to_push')) as pending
       FROM meetings m
       LEFT JOIN stories s ON s.meeting_id = m.id
       GROUP BY m.id, m.title
       ORDER BY m.created_at DESC
       LIMIT 20`
    );

    // Check types distribution (for pie chart)
    const checkTypes = await query(
      `SELECT check_type, COUNT(*) as count
       FROM checks
       GROUP BY check_type
       ORDER BY count DESC`
    );

    // Recent activity
    const recentActivity = await query(
      `SELECT entity_type, entity_id, action, user_id, created_at
       FROM audit_log
       ORDER BY created_at DESC
       LIMIT 20`
    );

    res.json({
      meetings: meetingCounts.rows[0],
      stories: storyCounts.rows[0],
      checksByRole: checksByRole.rows,
      avgReviewDays: avgReviewTime.rows[0]?.avg_days
        ? parseFloat(parseFloat(avgReviewTime.rows[0].avg_days).toFixed(1))
        : null,
      storiesByMeeting: storiesByMeeting.rows,
      checkTypes: checkTypes.rows,
      recentActivity: recentActivity.rows,
    });
  } catch (error) {
    logger.error('Dashboard metrics error:', error);
    res.status(500).json({ error: 'Failed to get dashboard metrics' });
  }
});

export default router;
