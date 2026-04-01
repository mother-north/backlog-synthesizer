import { pool, query } from './config/database.js';
import { hashPassword } from './utils/password.js';
import { config } from './config/env.js';
import { logger } from './utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seed() {
  try {
    // Apply init.sql schema
    const sqlPath = path.join(__dirname, '../sql/init.sql');
    if (fs.existsSync(sqlPath)) {
      const sql = fs.readFileSync(sqlPath, 'utf-8');
      await pool.query(sql);
      logger.info('Database schema applied from init.sql');
    } else {
      logger.warn('init.sql not found, skipping schema application');
    }

    // Seed default roles
    const defaultRoles = ['Admin', 'PM', 'Architect', 'Dev Lead', 'Analyst'];
    for (const roleName of defaultRoles) {
      await query(
        `INSERT INTO roles (name, description)
         VALUES ($1, $2)
         ON CONFLICT (name) DO NOTHING`,
        [roleName, `${roleName} role`]
      );
    }
    logger.info('Default roles seeded');

    // Create admin user if not exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [config.admin.email]);
    if (existing.rows.length === 0) {
      const passwordHash = await hashPassword(config.admin.password);
      await query(
        `INSERT INTO users (email, password_hash, display_name, roles)
         VALUES ($1, $2, $3, $4)`,
        [config.admin.email, passwordHash, 'Admin', JSON.stringify(['Admin'])]
      );
      logger.info(`Admin user created: ${config.admin.email}`);
    } else {
      logger.info(`Admin user already exists: ${config.admin.email}`);
    }

    logger.info('Seed completed successfully');
  } catch (error) {
    logger.error('Seed failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
