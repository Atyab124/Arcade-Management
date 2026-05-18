import { PrismaClient } from './generated/client/index.js';

let _prisma: PrismaClient | undefined;
let _service: PrismaClient | undefined;

/**
 * Singleton Prisma client for the tenant-scoped API.
 *
 * For RLS to enforce isolation, this client should authenticate as the `arcade_app` role
 * (no BYPASSRLS attribute). The API server wraps every tenant-scoped query in `withTenant`
 * which sets `SET LOCAL app.tenant_id = '<uuid>'` for the transaction.
 */
export function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }
  return _prisma;
}

/**
 * Service-role Prisma client used by background workers and webhook receivers that
 * legitimately need cross-tenant access. Configure SERVICE_DATABASE_URL to point at a role
 * with the BYPASSRLS attribute. Falls back to DATABASE_URL if SERVICE_DATABASE_URL is
 * unset (single-role dev setups).
 *
 * Use sparingly. Most operations should still be tenant-scoped.
 */
export function getServicePrisma(): PrismaClient {
  if (!_service) {
    const url = process.env.SERVICE_DATABASE_URL ?? process.env.DATABASE_URL;
    _service = new PrismaClient({
      datasources: { db: { url } },
      log: ['error'],
    });
  }
  return _service;
}

export type { PrismaClient } from './generated/client/index.js';
export { Prisma } from './generated/client/index.js';
