import { getServicePrisma } from '@arcade/db';
import { getQueues } from '../queues.js';
import { logger } from '../logger.js';

/**
 * Daily birthday greeting. Only sends to customers with whatsapp opt-in.
 * Idempotency: we tag the job with `birthday:${customerId}:${yyyymmdd}` so a same-day
 * retry can't double-send.
 */
export async function processBirthdays(): Promise<void> {
  const prisma = getServicePrisma();
  const queues = getQueues();
  const today = new Date();
  const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(today.getUTCDate()).padStart(2, '0');
  const yyyymmdd = `${today.getUTCFullYear()}${mm}${dd}`;

  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; tenant_id: string; full_name: string }>>(
    `SELECT c.id::text, c.tenant_id::text, c.full_name
     FROM customers c
     WHERE c.deleted_at IS NULL
       AND c.date_of_birth IS NOT NULL
       AND EXTRACT(MONTH FROM c.date_of_birth) = $1::int
       AND EXTRACT(DAY FROM c.date_of_birth) = $2::int
       AND EXISTS (
         SELECT 1 FROM consent_events ce
         WHERE ce.tenant_id = c.tenant_id
           AND ce.customer_id = c.id
           AND ce.channel = 'whatsapp'
         ORDER BY ce.created_at DESC LIMIT 1
       )`,
    Number(mm),
    Number(dd),
  );

  for (const r of rows) {
    await queues.whatsapp.add('send', {
      tenantId: r.tenant_id,
      customerId: r.id,
      templateName: 'birthday_greeting',
      variables: { name: r.full_name.split(' ')[0] ?? r.full_name },
      idempotencyKey: `birthday:${r.id}:${yyyymmdd}`,
    });
  }
  logger.info({ count: rows.length }, 'birthday greetings queued');
}
