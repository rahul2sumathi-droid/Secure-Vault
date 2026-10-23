const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const need = (key) => {
  const v = process.env[key];
  if (!v) {
    throw new Error(`Missing environment variable ${key}. Run "npm run setup" from the project root to create server/.env.`);
  }
  return v;
};
const num = (key, fallback) => (process.env[key] ? Number(process.env[key]) : fallback);

const masterKey = Buffer.from(need('MASTER_KEY'), 'hex');
if (masterKey.length !== 32) throw new Error('MASTER_KEY must be exactly 64 hex characters (32 bytes).');
const jwtAccessSecret = need('JWT_ACCESS_SECRET');
if (jwtAccessSecret.length < 32) throw new Error('JWT_ACCESS_SECRET must be at least 32 characters.');

module.exports = Object.freeze({
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: num('PORT', 5000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/securevault',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  // When true, allow all CORS origins (useful for local dev or when required)
  allowAllOrigins: process.env.ALLOW_ALL_ORIGINS === 'true',
  jwtAccessSecret,
  masterKey,
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTokenDays: num('REFRESH_TOKEN_DAYS', 7),
  maxFileBytes: num('MAX_FILE_MB', 25) * 1024 * 1024,
  maxLoginAttempts: 5,
  lockMinutes: 15,
  resetTokenMinutes: 30,
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: num('SMTP_PORT', 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'SecureVault <no-reply@securevault.local>',
  },
  ssl: { keyPath: process.env.SSL_KEY_PATH || '', certPath: process.env.SSL_CERT_PATH || '' },
});
