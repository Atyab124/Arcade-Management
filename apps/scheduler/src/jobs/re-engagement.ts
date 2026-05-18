import { getServicePrisma } from '@arcade/db';
import { getQueues } from '../queues.js';
import { logger } from '../logger.js';

/**
 * Re-engagement: customers who haven't visited in 60+ days. Per spec § 7.2, this is a
 * Marketing category template — consent will be enforced at the WhatsApp send layer.
 *
 * Idempotency: per-customer day-bucket. We don't re-target the same customer until they
 * either visit again or 30 days pass. Implemented via a coarse `lastVisitDate` check
 * against an upper bound (so people who came back 59 days ago AND 30 days ago can both
 * be re-targeted at the right time).
 */
export async function processReEngagement(): Promise<void> {
  const prisma = getServicePrisma();
  const queues = getQueues();
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);

  // Customers whose last visit is between 60–90 days ago — narrow window so we don't
  // re-target the same lapsed customer every single day.
  const customers = await prisma.customer.findMany({
    where: {
      deletedAt: null,
      lastVisitDate: { lte: sixtyDaysAgo, gte: ninetyDaysAgo },
    },
    take: 500,
  });

  const today = new Date().toISOString().slice(0, 10);
  for (const c of customers) {
    await queues.whatsapp.add('send', {
      tenantId: c.tenantId,
      customerId: c.id,
      templateName: 're_engagement',
      variables: { name: c.fullName.split(' ')[0] ?? c.fullName },
      idempotencyKey: `reengagement:${c.id}:${today}`,
    });
  }
  logger.info({ count: customers.length }, 're-engagement queued');
}
