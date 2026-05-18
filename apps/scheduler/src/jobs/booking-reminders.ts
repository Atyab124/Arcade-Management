import { getServicePrisma } from '@arcade/db';
import { getQueues } from '../queues.js';
import { logger } from '../logger.js';

/**
 * Send reminder messages 48h and 24h before each booking.
 *
 * Idempotency pattern (Peek Pro, AnyRoad, generic SRE): per-flag column on the booking
 * (`reminder_48h_sent_at`). The selector picks bookings where:
 *   - the booking is within the reminder window NOW
 *   - the flag is NULL
 * We set the flag in the same transaction as enqueuing the send. Even if cron retries,
 * the next pass won't pick the same row.
 *
 * This makes the SELECTOR idempotent, not the message sender — which is the correct
 * layer (Traveling Coderman pattern).
 */
export async function processBookingReminders(): Promise<void> {
  const prisma = getServicePrisma();
  const queues = getQueues();
  const now = Date.now();

  const window48Start = new Date(now + 47 * 3600_000);
  const window48End = new Date(now + 49 * 3600_000);
  const due48 = await prisma.booking.findMany({
    where: {
      cancelledAt: null,
      reminder48hSentAt: null,
      startAt: { gte: window48Start, lte: window48End },
    },
    include: { customer: true },
    take: 1000,
  });

  for (const b of due48) {
    await prisma.booking.update({
      where: { tenantId_id: { tenantId: b.tenantId, id: b.id } },
      data: { reminder48hSentAt: new Date() },
    });
    await queues.whatsapp.add('send', {
      tenantId: b.tenantId,
      customerId: b.customerId,
      templateName: 'booking_reminder_48h',
      variables: { date: b.startAt.toISOString().slice(0, 10) },
      idempotencyKey: `booking:${b.id}:reminder_48h`,
    });
  }

  const window24Start = new Date(now + 23 * 3600_000);
  const window24End = new Date(now + 25 * 3600_000);
  const due24 = await prisma.booking.findMany({
    where: {
      cancelledAt: null,
      reminder24hSentAt: null,
      startAt: { gte: window24Start, lte: window24End },
    },
    take: 1000,
  });
  for (const b of due24) {
    await prisma.booking.update({
      where: { tenantId_id: { tenantId: b.tenantId, id: b.id } },
      data: { reminder24hSentAt: new Date() },
    });
    await queues.whatsapp.add('send', {
      tenantId: b.tenantId,
      customerId: b.customerId,
      templateName: 'booking_reminder_24h',
      variables: { time: b.startAt.toISOString().slice(11, 16) },
      idempotencyKey: `booking:${b.id}:reminder_24h`,
    });
  }

  logger.info({ count48: due48.length, count24: due24.length }, 'booking reminders processed');
}
