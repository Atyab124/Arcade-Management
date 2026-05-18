import { getServicePrisma } from '@arcade/db';
import { getQueues } from '../queues.js';
import { logger } from '../logger.js';

/**
 * 24h after the event end, send a feedback request. Same idempotent-selector pattern
 * as booking reminders.
 */
export async function processPostEventFeedback(): Promise<void> {
  const prisma = getServicePrisma();
  const queues = getQueues();
  const now = Date.now();
  const windowStart = new Date(now - 25 * 3600_000);
  const windowEnd = new Date(now - 23 * 3600_000);

  const due = await prisma.booking.findMany({
    where: {
      cancelledAt: null,
      feedbackRequestSentAt: null,
      endAt: { gte: windowStart, lte: windowEnd },
    },
    take: 500,
  });

  for (const b of due) {
    await prisma.booking.update({
      where: { tenantId_id: { tenantId: b.tenantId, id: b.id } },
      data: { feedbackRequestSentAt: new Date() },
    });
    await queues.whatsapp.add('send', {
      tenantId: b.tenantId,
      customerId: b.customerId,
      templateName: 'post_event_feedback',
      variables: {},
      idempotencyKey: `booking:${b.id}:feedback`,
    });
  }
  logger.info({ count: due.length }, 'post-event feedback processed');
}
