import { getPrisma, type PrismaClient } from './client.js';

/**
 * Execute a callback inside a transaction that has `app.tenant_id` set to the given tenant.
 *
 * Postgres RLS policies are wired to read `app.tenant_id` via a STABLE function. Setting
 * the GUC with SET LOCAL ensures it's automatically reverted at transaction commit/rollback
 * — exactly what we want for per-request scoping.
 *
 * Background jobs that legitimately need cross-tenant access can use the raw prisma client
 * directly, but should generally still scope by passing a tenantId explicitly.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: PrismaClient) => Promise<T>,
): Promise<T> {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    // SET LOCAL is the right primitive — it scopes to the current transaction only.
    // We use $executeRawUnsafe because parameterized GUC names aren't supported; the tenantId
    // is validated as a UUID upstream so this is safe from injection.
    if (!/^[0-9a-fA-F-]{36}$/.test(tenantId)) {
      throw new Error('withTenant: tenantId must be a UUID');
    }
    await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);
    return fn(tx as unknown as PrismaClient);
  });
}
