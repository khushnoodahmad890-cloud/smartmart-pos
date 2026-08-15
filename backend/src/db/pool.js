import pg from 'pg';
import { AsyncLocalStorage } from 'async_hooks';
import { env } from '../config/env.js';

/**
 * Tenant-aware connection pooling.
 *
 * Single-tenant mode (default, incl. desktop): everything uses DATABASE_URL — identical
 * behaviour to before.
 *
 * Multi-tenant mode (MULTI_TENANT=true): a middleware resolves the store from the
 * X-Tenant header and wraps the request in AsyncLocalStorage context; `query` and
 * `withTransaction` then transparently route to that tenant's database. Controllers
 * never need to know about tenancy.
 */
const als = new AsyncLocalStorage();
const pools = new Map();

function sslFor(url) {
  return env.isProd && !url.includes('127.0.0.1') && !url.includes('localhost')
    ? { rejectUnauthorized: false }
    : false;
}

export function poolFor(url) {
  if (!pools.has(url)) {
    pools.set(url, new pg.Pool({ connectionString: url, max: env.multiTenant ? 5 : 10, ssl: sslFor(url) }));
  }
  return pools.get(url);
}

/** Default pool — used by standalone scripts (migrate/seed/bootstrap) and single-tenant mode. */
export const pool = poolFor(env.databaseUrl);

function current() {
  const store = als.getStore();
  return store?.dbUrl ? poolFor(store.dbUrl) : pool;
}

export const query = (text, params) => current().query(text, params);

/** Run fn inside a database transaction on the current tenant's database. */
export async function withTransaction(fn) {
  const client = await current().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Execute fn with all query()/withTransaction() calls routed to dbUrl. */
export function runWithTenantDb(dbUrl, fn) {
  return als.run({ dbUrl }, fn);
}
