import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { logger } from '../utils/logger.js';
import { config } from './env.js';

const poolConfig = config.database.url
  ? {
      connectionString: config.database.url,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
    }
  : {
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      password: config.database.password || undefined,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
    };

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error:', err);
});

export { pool };

export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    if (duration > 100) {
      logger.warn(`Slow query (${duration}ms): ${text.substring(0, 100)}`);
    }
    return result;
  } catch (error) {
    logger.error(`Query error: ${text}`, error);
    throw error;
  }
}

export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function initDatabase(): Promise<void> {
  try {
    const result = await pool.query('SELECT NOW() as now, current_database() as db');
    logger.info(`PostgreSQL connected to ${result.rows[0].db} at ${result.rows[0].now}`);
  } catch (error) {
    logger.error('Failed to connect to PostgreSQL:', error);
    throw error;
  }
}

export async function cleanupExpiredTokens(): Promise<void> {
  try {
    const result = await pool.query(
      "DELETE FROM refresh_tokens WHERE expires_at < NOW()"
    );
    if (result.rowCount && result.rowCount > 0) {
      logger.info(`Cleaned up ${result.rowCount} expired tokens`);
    }
  } catch (error) {
    logger.error('Failed to cleanup expired tokens:', error);
  }
}
