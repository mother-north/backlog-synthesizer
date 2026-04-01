import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { query } from '../config/database.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Login
router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  body('rememberMe').optional().isBoolean(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, rememberMe = false } = req.body;

    try {
      const result = await query(
        'SELECT id, email, password_hash, display_name, roles FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];
      const validPassword = await verifyPassword(password, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const roles = user.roles || [];
      const tokenPayload = { id: user.id, email: user.email, roles };
      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken(tokenPayload, rememberMe);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (rememberMe ? 30 : 7));

      await query(
        'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [user.id, refreshToken, expiresAt.toISOString()]
      );

      res.json({
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, displayName: user.display_name, roles },
      });
    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// Refresh token
router.post('/refresh',
  body('refreshToken').notEmpty(),
  async (req, res) => {
    const { refreshToken } = req.body;

    try {
      const tokenResult = await query(
        "SELECT user_id FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()",
        [refreshToken]
      );

      if (tokenResult.rows.length === 0) {
        return res.status(403).json({ error: 'Invalid or expired refresh token' });
      }

      verifyRefreshToken(refreshToken);

      const userResult = await query(
        'SELECT id, email, roles FROM users WHERE id = $1',
        [tokenResult.rows[0].user_id]
      );

      if (userResult.rows.length === 0) {
        return res.status(403).json({ error: 'User not found' });
      }

      const user = userResult.rows[0];
      const roles = user.roles || [];
      const newAccessToken = generateAccessToken({ id: user.id, email: user.email, roles });

      res.json({ accessToken: newAccessToken });
    } catch (error) {
      logger.error('Token refresh error:', error);
      res.status(403).json({ error: 'Failed to refresh token' });
    }
  }
);

// Logout
router.post('/logout',
  body('refreshToken').notEmpty(),
  async (req, res) => {
    const { refreshToken } = req.body;
    try {
      await query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      logger.error('Logout error:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  }
);

// Change password
router.put('/change-password',
  authenticateToken,
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 }),
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.id;

    try {
      const userResult = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const validPassword = await verifyPassword(currentPassword, userResult.rows[0].password_hash);
      if (!validPassword) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      const newPasswordHash = await hashPassword(newPassword);
      await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newPasswordHash, userId]);
      await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      logger.error('Password change error:', error);
      res.status(500).json({ error: 'Failed to change password' });
    }
  }
);

// Get current user (session)
router.get('/me', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await query(
      'SELECT id, email, display_name, roles, created_at FROM users WHERE id = $1',
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      roles: user.roles || [],
      createdAt: user.created_at,
    });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

export default router;
