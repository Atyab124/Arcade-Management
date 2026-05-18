import { getQueues } from '../queues.js';

export interface WhatsAppSendJob {
  tenantId: string;
  customerId?: string | null;
  phoneE164?: string;
  templateName: string;
  variables: Record<string, string>;
  /**
   * Optional stable key for idempotent enqueue. Used for cron-triggered sends so a retry
   * doesn't double-enqueue (e.g. `booking:${id}:reminder_48h`).
   */
  idempotencyKey?: string;
}

/**
 * Enqueue a WhatsApp send. The actual sending — including opt-in checks, quiet-hours
 * enforcement, template lookup, and Trengo API call — is handled by the scheduler's
 * whatsapp-worker consumer. This keeps the API stateless and shifts retry/backoff to BullMQ.
 */
export async function enqueueWhatsAppSend(job: WhatsAppSendJob): Promise<void> {
  const queues = getQueues();
  await queues.whatsapp.add('send', job, {
    jobId: job.idempotencyKey,
    attempts: 5,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { age: 7 * 24 * 3600, count: 5000 },
    removeOnFail: { age: 30 * 24 * 3600 },
  });
}
