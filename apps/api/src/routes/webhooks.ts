import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getServicePrisma, withTenant } from '@arcade/db';
import { detectConsentKeyword } from '@arcade/lib';
import { TrengoWebhookEventSchema } from '@arcade/types';
import { getConfig } from '../config.js';
import { logger } from '../logger.js';

export const webhooksRouter = Router();

/**
 * Trengo webhook receiver.
 *
 * Responsibilities (per research):
 *   1. Verify signature so external parties can't spoof opt-out events.
 *   2. Idempotency on external_id — Meta/Trengo retry at-least-once for up to 24h.
 *   3. Tolerate out-of-order delivered/read status events (rank-based comparison).
 *   4. Build STOP-keyword detection ourselves — Meta Cloud API does NOT auto-handle STOP
 *      for WhatsApp (unlike SMS via Twilio).
 *   5. Use the service-role client for the initial cross-tenant phone lookup, then switch
 *      to a tenant-scoped transaction for the writes so audit boundaries stay clean.
 */
webhooksRouter.post('/trengo', async (req, res) => {
  const cfg = getConfig();
  const signature = req.header('x-trengo-signature') ?? '';
  const raw = JSON.stringify(req.body);

  if (cfg.TRENGO_WEBHOOK_SECRET) {
    const expected = createHmac('sha256', cfg.TRENGO_WEBHOOK_SECRET).update(raw).digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    const ok = sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
    if (!ok) {
      logger.warn({ signature }, 'trengo webhook: invalid signature');
      res.status(401).json({ error: 'invalid signature' });
      return;
    }
  } else {
    logger.warn('TRENGO_WEBHOOK_SECRET not configured — webhook signature verification disabled');
  }

  const parsed = TrengoWebhookEventSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({ errors: parsed.error.flatten() }, 'trengo webhook: malformed payload');
    res.status(200).json({ ok: true, skipped: 'malformed' });
    return;
  }
  const event = parsed.data;
  const externalId = String(event.event_id ?? event.message?.id ?? `${event.type}-${Date.now()}`);

  const svc = getServicePrisma();

  // Idempotency: dedupe on external_id
  const existing = await svc.waWebhookEvent.findUnique({ where: { externalId } });
  if (existing?.processedAt) {
    res.status(200).json({ ok: true, deduped: true });
    return;
  }
  if (!existing) {
    await svc.waWebhookEvent.create({
      data: { provider: 'trengo', externalId, eventType: event.type, raw: event as object },
    });
  }

  try {
    await processTrengoEvent(event, externalId);
    await svc.waWebhookEvent.update({
      where: { externalId },
      data: { processedAt: new Date() },
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'trengo webhook processing failed');
    res.status(500).json({ error: 'processing failed' });
  }
});

async function processTrengoEvent(event: unknown, externalId: string): Promise<void> {
  const ev = event as {
    type: string;
    message?: {
      id?: string | number;
      text?: string;
      direction?: 'in' | 'out';
      status?: string;
      contact?: { phone?: string };
    };
    contact?: { phone?: string };
  };
  const svc = getServicePrisma();
  const phone = ev.message?.contact?.phone ?? ev.contact?.phone;
  if (!phone) return;
  if (!/^\+/.test(phone)) return;

  // Cross-tenant lookup — uses service role
  const customer = await svc.customer.findFirst({
    where: { phoneE164: phone, deletedAt: null },
  });

  // Status update for outbound message — find by external_id (unique globally)
  if (ev.message?.status && ev.message?.id) {
    const msgId = String(ev.message.id);
    const existing = await svc.waMessage.findUnique({ where: { externalId: msgId } });
    if (existing) {
      const rank: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };
      const newRank = rank[ev.message.status] ?? -1;
      const oldRank = rank[existing.status] ?? -1;
      if (newRank > oldRank) {
        await svc.waMessage.update({
          where: { id: existing.id },
          data: { status: ev.message.status },
        });
      }
    }
    return;
  }

  // Inbound message — STOP keyword detection + persist
  if (ev.message?.direction === 'in' && ev.message?.text && customer) {
    const keyword = detectConsentKeyword(ev.message.text);
    await withTenant(customer.tenantId, async (tx) => {
      if (keyword) {
        await tx.consentEvent.create({
          data: {
            tenantId: customer.tenantId,
            customerId: customer.id,
            channel: 'whatsapp',
            action: keyword,
            source: 'sms_reply',
            noticeVersion: '1.0',
            evidence: { externalId, body: ev.message!.text! },
          },
        });
        logger.info({ customerId: customer.id, keyword }, 'consent keyword detected and recorded');
      }
      await tx.waMessage.create({
        data: {
          tenantId: customer.tenantId,
          customerId: customer.id,
          phoneE164: phone,
          direction: 'in',
          body: ev.message!.text!,
          status: 'delivered',
          externalId: `in-${externalId}`,
          conversationWindowUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    });
  }
}
