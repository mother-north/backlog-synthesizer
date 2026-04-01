import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const hasAccessSecret = Boolean(process.env.JWT_ACCESS_SECRET);
const hasRefreshSecret = Boolean(process.env.JWT_REFRESH_SECRET);

if (isProduction && (!hasAccessSecret || !hasRefreshSecret)) {
  console.error('CRITICAL ERROR: JWT secrets must be set in production!');
  process.exit(1);
}

if (!hasAccessSecret || !hasRefreshSecret) {
  console.warn('WARNING: Using default JWT secrets. NOT SAFE FOR PRODUCTION!');
}

export const config = {
  port: process.env.PORT || 3006,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'backlog-synth-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'backlog-synth-refresh-secret',
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
    password: process.env.ADMIN_PASSWORD || 'root',
  },
};
