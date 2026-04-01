import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../config/database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();
router.use(authenticateToken);

// List all menu access rules
router.get('/', async (_req, res) => {
  try {
    const result = await query(
      `SELECT ma.*, r.name as role_name
       FROM menu_access ma
       JOIN roles r ON r.id = ma.role_id
       ORDER BY ma.role_id, ma.menu_path`
    );
    res.json({ rows: result.rows, total: result.rowCount });
  } catch (error) {
    logger.error('List menu access error:', error);
    res.status(500).json({ error: 'Failed to list menu access rules' });
  }
});

// Get menu access rules for a specific role
router.get('/role/:roleId', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM menu_access WHERE role_id = $1 ORDER BY menu_path',
      [req.params.roleId]
    );
    res.json({ rows: result.rows, total: result.rowCount });
  } catch (error) {
    logger.error('Get menu access by role error:', error);
    res.status(500).json({ error: 'Failed to get menu access rules' });
  }
});

// Get menu access for current user (based on their roles)
router.get('/me', async (req: AuthRequest, res: Response) => {
  try {
    const userRoles = req.user!.roles;
    if (!userRoles || userRoles.length === 0) {
      return res.json({ rows: [], total: 0 });
    }

    // Get role IDs for the user's role names
    const roleResult = await query(
      'SELECT id, name FROM roles WHERE name = ANY($1)',
      [userRoles]
    );

    if (roleResult.rows.length === 0) {
      return res.json({ rows: [], total: 0 });
    }

    const roleIds = roleResult.rows.map((r: any) => r.id);
    const result = await query(
      `SELECT DISTINCT menu_path, tab_name, allowed
       FROM menu_access
       WHERE role_id = ANY($1) AND allowed = true
       ORDER BY menu_path`,
      [roleIds]
    );
    res.json({ rows: result.rows, total: result.rowCount });
  } catch (error) {
    logger.error('Get my menu access error:', error);
    res.status(500).json({ error: 'Failed to get menu access' });
  }
});

// Create menu access rule
router.post('/',
  body('roleId').isInt(),
  body('menuPath').notEmpty().isString(),
  body('tabName').optional().isString(),
  body('allowed').optional().isBoolean(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { roleId, menuPath, tabName, allowed = true } = req.body;

    try {
      const result = await query(
        `INSERT INTO menu_access (role_id, menu_path, tab_name, allowed)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [roleId, menuPath, tabName || null, allowed]
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
      logger.error('Create menu access error:', error);
      res.status(500).json({ error: 'Failed to create menu access rule' });
    }
  }
);

// Update menu access rule
router.put('/:id',
  body('allowed').isBoolean(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const result = await query(
        'UPDATE menu_access SET allowed = $1 WHERE id = $2 RETURNING *',
        [req.body.allowed, req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Rule not found' });
      }
      res.json(result.rows[0]);
    } catch (error) {
      logger.error('Update menu access error:', error);
      res.status(500).json({ error: 'Failed to update menu access rule' });
    }
  }
);

// Delete menu access rule
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const result = await query('DELETE FROM menu_access WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    res.json({ message: 'Rule deleted' });
  } catch (error) {
    logger.error('Delete menu access error:', error);
    res.status(500).json({ error: 'Failed to delete menu access rule' });
  }
});

// Bulk replace rules for a role
router.put('/role/:roleId/bulk',
  body('rules').isArray(),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const roleId = req.params.roleId;
    const { rules } = req.body;

    try {
      // Delete existing rules for this role
      await query('DELETE FROM menu_access WHERE role_id = $1', [roleId]);

      // Insert new rules
      for (const rule of rules) {
        await query(
          `INSERT INTO menu_access (role_id, menu_path, tab_name, allowed)
           VALUES ($1, $2, $3, $4)`,
          [roleId, rule.menuPath, rule.tabName || null, rule.allowed !== false]
        );
      }

      const result = await query(
        'SELECT * FROM menu_access WHERE role_id = $1 ORDER BY menu_path',
        [roleId]
      );
      res.json({ rows: result.rows, total: result.rowCount });
    } catch (error) {
      logger.error('Bulk update menu access error:', error);
      res.status(500).json({ error: 'Failed to update menu access rules' });
    }
  }
);

export default router;
