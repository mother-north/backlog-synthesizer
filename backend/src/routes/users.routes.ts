import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../config/database.js';
import { hashPassword } from '../utils/password.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();
router.use(authenticateToken);

// List all users
router.get('/', async (_req, res) => {
  try {
    const result = await query(
      'SELECT id, email, display_name, roles, created_at FROM users ORDER BY id'
    );
    res.json({ rows: result.rows, total: result.rowCount });
  } catch (error) {
    logger.error('List users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// Get user by id
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      'SELECT id, email, display_name, roles, created_at FROM users WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Create user
router.post('/',
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('displayName').optional().isString(),
  body('roles').optional().isArray(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, displayName, roles = [] } = req.body;

    try {
      const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Email already exists' });
      }

      const passwordHash = await hashPassword(password);
      const result = await query(
        `INSERT INTO users (email, password_hash, display_name, roles)
         VALUES ($1, $2, $3, $4) RETURNING id, email, display_name, roles, created_at`,
        [email, passwordHash, displayName || null, JSON.stringify(roles)]
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      logger.error('Create user error:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
);

// Update user
router.put('/:id',
  body('email').optional().isEmail().normalizeEmail(),
  body('displayName').optional().isString(),
  body('roles').optional().isArray(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, displayName, roles } = req.body;
    const userId = req.params.id;

    try {
      const existing = await query('SELECT id FROM users WHERE id = $1', [userId]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const updates: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      if (email !== undefined) {
        updates.push(`email = $${paramIdx++}`);
        params.push(email);
      }
      if (displayName !== undefined) {
        updates.push(`display_name = $${paramIdx++}`);
        params.push(displayName);
      }
      if (roles !== undefined) {
        updates.push(`roles = $${paramIdx++}`);
        params.push(JSON.stringify(roles));
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      params.push(userId);
      const result = await query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx}
         RETURNING id, email, display_name, roles, created_at`,
        params
      );

      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Update user error:', error);
      res.status(500).json({ error: 'Failed to update user' });
    }
  }
);

// Delete user
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted' });
  } catch (error) {
    logger.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
