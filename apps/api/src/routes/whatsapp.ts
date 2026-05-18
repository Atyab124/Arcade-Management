import { Router } from 'express';
import { TemplateRegisterSchema, SendMessageInputSchema, CampaignCreateSchema, SegmentFilterSchema } from '@arcade/types';
import { buildSegmentWhere } from '@arcade/lib';
import { tenantRoute } from '../middleware/tenant-context.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../middleware/audit.js';
import { enqueueWhatsAppSend } from '../services/whatsapp.js';
import { BadRequest } from '../errors.js';

export const whatsappRouter = Router();
whatsappRouter.use(requireAuth);

whatsappRouter.get('/templates', tenantRoute(async (_req, _res, db) => {
  return db.waTemplate.findMany({ orderBy: { name: 'asc' } });
}));

whatsappRouter.post('/templates', requireRole('admin', 'manager'), tenantRoute(async (req, _res, db) => {
  const input = TemplateRegisterSchema.parse(req.body);
  const t = await db.waTemplate.create({
    data: {
      tenantId: req.auth!.tenantId,
      name: input.name,
      category: input.category,
      trengoHsmId: input.trengoHsmId,
      language: input.language,
      body: input.body,
      variables: input.variables as object,
      version: input.version,
      status: 'active',
      approvedAt: new Date(),
    },
  });
  await writeAudit(db, req, { action: 'template.register', entityType: 'wa_template', entityId: t.id, after: t });
  return t;
}));

whatsappRouter.post('/send', tenantRoute(async (req, _res, db) => {
  const input = SendMessageInputSchema.parse(req.body);
  await enqueueWhatsAppSend({
    tenantId: req.auth!.tenantId,
    customerId: input.customerId ?? null,
    phoneE164: input.phoneE164,
    templateName: input.templateName,
    variables: input.variables,
  });
  await writeAudit(db, req, { action: 'whatsapp.send_queued', entityType: 'wa_message', after: input });
  return { queued: true };
}));

whatsappRouter.post('/campaigns', requireRole('admin', 'manager'), tenantRoute(async (req, _res, db) => {
  const input = CampaignCreateSchema.parse(req.body);
  const { sql, params } = buildSegmentWhere(input.segment, req.auth!.tenantId);
  const customers = await db.$queryRawUnsafe<Array<{ id: string; phone_e164: string }>>(
    `SELECT c.id::text, c.phone_e164 FROM customers c WHERE ${sql} LIMIT 10000`,
    ...params,
  );
  const campaign = await db.waCampaign.create({
    data: {
      tenantId: req.auth!.tenantId,
      name: input.name,
      templateName: input.templateName,
      variables: input.variables as object,
      segmentFilter: input.segment as object,
      scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
      createdByUserId: req.auth!.userId,
      status: input.scheduledFor ? 'queued' : 'sending',
      totalRecipients: customers.length,
    },
  });
  // Enqueue sends (rate-limited by BullMQ queue config). For scheduled campaigns,
  // the scheduler will pick this up at the scheduled time — for now we enqueue immediately
  // if no schedule was given.
  if (!input.scheduledFor) {
    for (const c of customers) {
      await enqueueWhatsAppSend({
        tenantId: req.auth!.tenantId,
        customerId: c.id,
        templateName: input.templateName,
        variables: input.variables,
        idempotencyKey: `campaign:${campaign.id}:customer:${c.id}`,
      });
    }
  }
  await writeAudit(db, req, { action: 'campaign.create', entityType: 'wa_campaign', entityId: campaign.id, after: campaign });
  return { ...campaign, recipientCount: customers.length };
}));

whatsappRouter.get('/messages/:customerId', tenantRoute(async (req, _res, db) => {
  const customerId = req.params.customerId;
  if (!customerId) throw BadRequest('customerId required');
  return db.waMessage.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}));
