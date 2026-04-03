import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// In production, JWT secrets MUST be set via env vars
if (isProduction && (!process.env.JWT_ACCESS_SECRET || !process.env.JWT_REFRESH_SECRET)) {
  console.error('CRITICAL: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in production');
  process.exit(1);
}

// In dev/test, generate random secrets if not provided (never use hardcoded defaults)
const devAccessSecret = process.env.JWT_ACCESS_SECRET || crypto.randomBytes(32).toString('hex');
const devRefreshSecret = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(32).toString('hex');

if (!process.env.JWT_ACCESS_SECRET && !isTest) {
  console.warn('WARNING: JWT_ACCESS_SECRET not set — using random secret (sessions won\'t survive restarts)');
}

// In production, ADMIN_PASSWORD must be set
if (isProduction && !process.env.ADMIN_PASSWORD) {
  console.error('CRITICAL: ADMIN_PASSWORD must be set in production');
  process.exit(1);
}

export const config = {
  port: process.env.PORT || 3006,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwt: {
    accessSecret: devAccessSecret,
    refreshSecret: devRefreshSecret,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    refreshExpiryRemember: process.env.JWT_REFRESH_EXPIRY_REMEMBER || '30d',
  },
  database: {
    url: process.env.DATABASE_URL,
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432'),
    name: process.env.PG_DATABASE || 'backlog_synthesizer_db',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'password',
  },
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  agentsUrl: process.env.AGENTS_URL || 'http://localhost:8000',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@backlog-synthesizer.local',
    password: process.env.ADMIN_PASSWORD || '',
  },
};
