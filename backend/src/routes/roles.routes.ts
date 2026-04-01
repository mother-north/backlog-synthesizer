import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../config/database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();
router.use(authenticateToken);

// List all roles
router.get('/', async (_req, res) => {
  try {
    const result = await query('SELECT * FROM roles ORDER BY id');
    res.json({ rows: result.rows, total: result.rowCount });
  } catch (error) {
    logger.error('List roles error:', error);
    res.status(500).json({ error: 'Failed to list roles' });
  }
});

// Get role by id
router.get('/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM roles WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get role error:', error);
    res.status(500).json({ error: 'Failed to get role' });
  }
});

// Create role
router.post('/',
  body('name').notEmpty().isString(),
  body('description').optional().isString(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description } = req.body;

    try {
      const result = await query(
        'INSERT INTO roles (name, description) VALUES ($1, $2) RETURNING *',
        [name, description || null]
      );
      res.status(201).json(result.rows[0]);
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Role name already exists' });
      }
      logger.error('Create role error:', error);
      res.status(500).json({ error: 'Failed to create role' });
    }
  }
);

// Update role
router.put('/:id',
  body('name').optional().isString(),
  body('description').optional().isString(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description } = req.body;
    const roleId = req.params.id;

    try {
      const updates: string[] = [];
      const params: any[] = [];
      let paramIdx = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramIdx++}`);
        params.push(name);
      }
      if (description !== undefined) {
        updates.push(`description = $${paramIdx++}`);
        params.push(description);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      params.push(roleId);
      const result = await query(
        `UPDATE roles SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Role not found' });
      }
      res.json(result.rows[0]);
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Role name already exists' });
      }
      logger.error('Update role error:', error);
      res.status(500).json({ error: 'Failed to update role' });
    }
  }
);

// Delete role
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('DELETE FROM roles WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Role not found' });
    }
    res.json({ message: 'Role deleted' });
  } catch (error) {
    logger.error('Delete role error:', error);
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

export default router;
