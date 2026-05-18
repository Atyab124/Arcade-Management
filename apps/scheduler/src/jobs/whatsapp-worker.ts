import { Worker } from 'bullmq';
import { getServicePrisma } from '@arcade/db';
import { HttpTrengoClient, FakeTrengoClient, type TrengoClient, renderTemplate } from '@arcade/whatsapp';
import { isInQuietHours } from '@arcade/lib';
import { getRedis } from '../queues.js';
import { logger } from '../logger.js';

/**
 * Worker that consumes the `whatsapp` queue. Reimplements the send logic that the API
 * service has, so the scheduler doesn't need to call back to the API.
 *
 * NOTE: this duplicates code with apps/api/src/services/whatsapp.ts. In a real codebase
 * we'd extract this into a shared package (@arcade/whatsapp-pipeline). For Phase 1
 * with one of each running, the duplication is acceptable.
 */

let _client: TrengoClient | undefined;
function getClient(): TrengoClient {
  if (!_client) {
    if (process.env.TRENGO_TOKEN) {
      _client = new HttpTrengoClient(
        process.env.TRENGO_BASE_URL ?? 'https://app.trengo.com/api/v2',
        process.env.TRENGO_TOKEN,
      );
    } else {
      logger.warn('TRENGO_TOKEN not set — using FakeTrengoClient in worker');
      _client = new FakeTrengoClient();
    }
  }
  return _client;
}

interface SendJob {
  tenantId: string;
  customerId?: string | null;
  phoneE164?: string;
  templateName: string;
  variables: Record<string, string>;
  idempotencyKey?: string;
}

export function startWhatsAppWorker() {
  const worker = new Worker<SendJob>('whatsapp', async (job) => {
    const data = job.data;
    const prisma = getServicePrisma();

    let customerId = data.customerId ?? null;
    let phoneE164 = data.phoneE164;
    if (customerId) {
      const customer = await prisma.customer.findFirst({
        where: { tenantId: data.tenantId, id: customerId, deletedAt: null },
      });
      if (!customer) return { status: 'skipped', reason: 'customer not found' };
      phoneE164 = customer.phoneE164;
    }
    if (!phoneE164) return { status: 'skipped', reason: 'no phone' };

    const template = await prisma.waTemplate.findFirst({
      where: { tenantId: data.tenantId, name: data.templateName, status: 'active' },
      orderBy: { version: 'desc' },
    });
    if (!template) return { status: 'skipped', reason: 'template not found' };

    if (template.category === 'marketing' && customerId) {
      const latest = await prisma.consentEvent.findFirst({
        where: { tenantId: data.tenantId, customerId, channel: 'whatsapp' },
        orderBy: { createdAt: 'desc' },
      });
      if (!latest || latest.action !== 'opt_in') {
        return { status: 'skipped', reason: 'no opt-in' };
      }
    }
    if (template.category === 'marketing') {
      const tenant = await prisma.tenant.findUnique({ where: { id: data.tenantId } });
      const start = Number(process.env.WA_MARKETING_QUIET_HOUR_START ?? 22);
      const end = Number(process.env.WA_MARKETING_QUIET_HOUR_END ?? 8);
      if (isInQuietHours(new Date(), tenant?.timezone ?? 'Asia/Kuala_Lumpur', start, end)) {
        return { status: 'skipped', reason: 'quiet hours' };
      }
    }

    const renderedBody = renderTemplate(template.body, data.variables);
    const client = getClient();
    const result = await client.send({
      hsmId: template.trengoHsmId,
      recipientPhoneE164: phoneE164,
      params: Object.entries(data.variables).map(([key, value]) => ({ type: 'body' as const, key, value })),
    });

    await prisma.waMessage.create({
      data: {
        tenantId: data.tenantId,
        customerId: customerId ?? null,
        phoneE164,
        direction: 'out',
        templateId: template.id,
        body: renderedBody,
        status: 'sent',
        externalId: result.messageId,
      },
    });
    return { status: 'sent', externalId: result.messageId };
  }, {
    connection: getRedis(),
    concurrency: 5,
    limiter: { max: 80, duration: 60_000 }, // global throttle: ~80 sends/min
  });

  worker.on('completed', (job, result) => {
    logger.info({ jobId: job.id, result }, 'whatsapp job completed');
  });
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'whatsapp job failed');
  });
  return worker;
}
