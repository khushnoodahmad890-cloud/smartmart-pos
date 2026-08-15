import dotenv from 'dotenv';
dotenv.config();

const required = ['DATABASE_URL', 'JWT_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`FATAL: missing required environment variable ${key}`);
    process.exit(1);
  }
}

export const env = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  // Multi-tenant SaaS mode: one server hosts many isolated stores
  multiTenant: process.env.MULTI_TENANT === 'true',
  controlDatabaseUrl: process.env.CONTROL_DATABASE_URL || process.env.DATABASE_URL,
};
