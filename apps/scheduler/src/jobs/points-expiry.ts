import { getServicePrisma } from '@arcade/db';
import { logger } from '../logger.js';

/**
 * Nightly: expire EARN ledger rows whose expires_at has passed by writing compensating
 * EXPIRE rows. We replicate `expirePointsBatch` from the API service here to avoid
 * pulling in API imports — keeps the scheduler bundle slim.
 */
export async function processPointsExpiry(): Promise<void> {
  const prisma = getServicePrisma();
  const tenants = await prisma.tenant.findMany();
  let totalExpired = 0;
  for (const tenant of tenants) {
    const candidates = await prisma.$queryRawUnsafe<Array<{ id: string; customer_id: string; points: string }>>(
      `SELECT pl.id::text, pl.customer_id::text, pl.points::text
       FROM points_ledger pl
       WHERE pl.tenant_id = $1::uuid
         AND pl.event_type = 'EARN'
         AND pl.expires_at IS NOT NULL
         AND pl.expires_at <= NOW()
         AND NOT EXISTS (
           SELECT 1 FROM points_ledger pl2 WHERE pl2.parent_ledger_id = pl.id
         )`,
      tenant.id,
    );
    for (const c of candidates) {
      const points = Number(c.points);
      await prisma.pointsLedger.create({
        data: {
          tenantId: tenant.id,
          customerId: c.customer_id,
          eventType: 'EXPIRE',
          points: -points,
          sourceType: 'expiry',
          parentLedgerId: BigInt(c.id),
        },
      });
      await prisma.customer.update({
        where: { tenantId_id: { tenantId: tenant.id, id: c.customer_id } },
        data: { loyaltyPoints: { decrement: points } },
      });
      totalExpired++;
    }
  }
  logger.info({ totalExpired }, 'points expiry processed');
}
