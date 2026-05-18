import { Router } from 'express';
import { CustomerCreateSchema, CustomerUpdateSchema, ConsentCreateSchema, SegmentFilterSchema } from '@arcade/types';
import { buildSegmentWhere, normalizePhone } from '@arcade/lib';
import { tenantRoute } from '../middleware/tenant-context.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../middleware/audit.js';
import { BadRequest, NotFound, Conflict } from '../errors.js';

export const customersRouter = Router();
customersRouter.use(requireAuth);

customersRouter.get('/', tenantRoute(async (req, _res, db) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const where = q
    ? {
        OR: [
          { fullName: { contains: q, mode: 'insensitive' as const } },
          { phoneE164: { contains: q } },
          { email: { contains: q, mode: 'insensitive' as const } },
        ],
        deletedAt: null,
      }
    : { deletedAt: null };
  const customers = await db.customer.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
  return { customers };
}));

customersRouter.get('/:id', tenantRoute(async (req, _res, db) => {
  const id = req.params.id;
  if (!id) throw BadRequest('id required');
  const customer = await db.customer.findFirst({
    where: { id, deletedAt: null },
    include: {
      consents: { orderBy: { createdAt: 'desc' }, take: 50 },
    },
  });
  if (!customer) throw NotFound('customer');
  return customer;
}));

customersRouter.post('/', tenantRoute(async (req, _res, db) => {
  const body = CustomerCreateSchema.parse(req.body);
  const phone = normalizePhone(body.phoneE164);
  if (!phone) throw BadRequest('invalid phone number');
  const existing = await db.customer.findFirst({
    where: { phoneE164: phone, deletedAt: null },
  });
  if (existing) throw Conflict('customer with this phone already exists');
  const created = await db.customer.create({
    data: {
      tenantId: req.auth!.tenantId,
      fullName: body.fullName,
      phoneE164: phone,
      email: body.email ?? null,
      dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
      membershipType: body.membershipType,
      preferredLang: body.preferredLang,
      notes: body.notes ?? null,
      vipFlag: body.vipFlag,
      dietaryFlags: body.dietaryFlags,
      medicalFlags: body.medicalFlags,
      source: 'manual',
    },
  });
  await writeAudit(db, req, { action: 'customer.create', entityType: 'customer', entityId: created.id, after: created });
  return created;
}));

customersRouter.patch('/:id', tenantRoute(async (req, _res, db) => {
  const id = req.params.id;
  if (!id) throw BadRequest('id required');
  const patch = CustomerUpdateSchema.parse(req.body);
  const before = await db.customer.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw NotFound('customer');
  let phone: string | undefined;
  if (patch.phoneE164) {
    const n = normalizePhone(patch.phoneE164);
    if (!n) throw BadRequest('invalid phone number');
    phone = n;
  }
  const updated = await db.customer.update({
    where: { tenantId_id: { tenantId: req.auth!.tenantId, id } },
    data: {
      ...(patch.fullName !== undefined && { fullName: patch.fullName }),
      ...(phone !== undefined && { phoneE164: phone }),
      ...(patch.email !== undefined && { email: patch.email }),
      ...(patch.dateOfBirth !== undefined && { dateOfBirth: patch.dateOfBirth ? new Date(patch.dateOfBirth) : null }),
      ...(patch.membershipType !== undefined && { membershipType: patch.membershipType }),
      ...(patch.preferredLang !== undefined && { preferredLang: patch.preferredLang }),
      ...(patch.notes !== undefined && { notes: patch.notes }),
      ...(patch.vipFlag !== undefined && { vipFlag: patch.vipFlag }),
      ...(patch.dietaryFlags !== undefined && { dietaryFlags: patch.dietaryFlags }),
      ...(patch.medicalFlags !== undefined && { medicalFlags: patch.medicalFlags }),
    },
  });
  await writeAudit(db, req, { action: 'customer.update', entityType: 'customer', entityId: id, before, after: updated });
  return updated;
}));

/** PDPA right-to-erasure: soft-delete + anonymize while preserving transactional integrity. */
customersRouter.delete('/:id', requireRole('admin', 'manager'), tenantRoute(async (req, _res, db) => {
  const id = req.params.id;
  if (!id) throw BadRequest('id required');
  const before = await db.customer.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw NotFound('customer');
  const now = new Date();
  const anonymized = await db.customer.update({
    where: { tenantId_id: { tenantId: req.auth!.tenantId, id } },
    data: {
      fullName: 'Deleted Customer',
      phoneE164: `+0000${id.slice(0, 10)}`,
      email: null,
      dateOfBirth: null,
      notes: null,
      vipFlag: false,
      dietaryFlags: [],
      medicalFlags: [],
      deletedAt: now,
      anonymizedAt: now,
    },
  });
  await writeAudit(db, req, { action: 'customer.erase', entityType: 'customer', entityId: id, before, after: anonymized });
  return { ok: true };
}));

// ─── Consent ─────────────────────────────────

customersRouter.post('/:id/consent', tenantRoute(async (req, _res, db) => {
  const id = req.params.id;
  if (!id) throw BadRequest('id required');
  const body = ConsentCreateSchema.parse(req.body);
  const customer = await db.customer.findFirst({ where: { id, deletedAt: null } });
  if (!customer) throw NotFound('customer');
  const consent = await db.consentEvent.create({
    data: {
      tenantId: req.auth!.tenantId,
      customerId: id,
      channel: body.channel,
      action: body.action,
      source: body.source,
      noticeVersion: body.noticeVersion,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      evidence: (body.evidence ?? {}) as object,
    },
  });
  await writeAudit(db, req, { action: 'consent.record', entityType: 'consent', entityId: consent.id, after: consent });
  return consent;
}));

// ─── Segmentation ────────────────────────────

customersRouter.post('/segment/count', tenantRoute(async (req, _res, db) => {
  const filter = SegmentFilterSchema.parse(req.body);
  const { sql, params } = buildSegmentWhere(filter, req.auth!.tenantId);
  const rows = await db.$queryRawUnsafe<{ count: string }[]>(
    `SELECT COUNT(*)::text AS count FROM customers c WHERE ${sql}`,
    ...params,
  );
  return { count: Number(rows[0]?.count ?? 0) };
}));

customersRouter.post('/segment/list', tenantRoute(async (req, _res, db) => {
  const filter = SegmentFilterSchema.parse(req.body);
  const { sql, params } = buildSegmentWhere(filter, req.auth!.tenantId);
  const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT c.id, c.full_name AS "fullName", c.phone_e164 AS "phoneE164", c.email, c.membership_type AS "membershipType"
     FROM customers c WHERE ${sql} ORDER BY c.created_at DESC LIMIT 1000`,
    ...params,
  );
  return { customers: rows };
}));
