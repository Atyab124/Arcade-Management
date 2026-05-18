import { Router } from 'express';
import {
  BookingCreateSchema,
  PaymentRecordSchema,
  WaitlistCreateSchema,
  BookingCancelSchema,
  ResourceCreateSchema,
  PackageCreateSchema,
  PackageAddonCreateSchema,
  AvailabilityEventCreateSchema,
} from '@arcade/types';
import { tenantRoute } from '../middleware/tenant-context.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../middleware/audit.js';
import { BadRequest, NotFound } from '../errors.js';
import { cancelBooking, createBooking, getBookingWithPaymentState, recordPayment } from '../services/booking.js';
import { enqueueWhatsAppSend } from '../services/whatsapp.js';

export const bookingsRouter = Router();
bookingsRouter.use(requireAuth);

// ─── Resources ─────────────────────

bookingsRouter.get('/resources', tenantRoute(async (_req, _res, db) => {
  return db.resource.findMany({ orderBy: { name: 'asc' } });
}));

bookingsRouter.post('/resources', requireRole('admin', 'manager'), tenantRoute(async (req, _res, db) => {
  const input = ResourceCreateSchema.parse(req.body);
  const r = await db.resource.create({
    data: { tenantId: req.auth!.tenantId, ...input },
  });
  await writeAudit(db, req, { action: 'resource.create', entityType: 'resource', entityId: r.id, after: r });
  return r;
}));

bookingsRouter.post('/availability', requireRole('admin', 'manager'), tenantRoute(async (req, _res, db) => {
  const input = AvailabilityEventCreateSchema.parse(req.body);
  return db.availabilityEvent.create({
    data: {
      tenantId: req.auth!.tenantId,
      resourceId: input.resourceId,
      type: input.type,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      reason: input.reason ?? null,
    },
  });
}));

// ─── Packages ─────────────────────

bookingsRouter.get('/packages', tenantRoute(async (_req, _res, db) => {
  return db.partyPackage.findMany({
    include: { variations: true, addons: true },
    orderBy: { name: 'asc' },
  });
}));

bookingsRouter.post('/packages', requireRole('admin', 'manager'), tenantRoute(async (req, _res, db) => {
  const input = PackageCreateSchema.parse(req.body);
  const pkg = await db.partyPackage.create({
    data: {
      tenantId: req.auth!.tenantId,
      ...input,
      cancellationPolicy: input.cancellationPolicy as object,
    },
  });
  await writeAudit(db, req, { action: 'package.create', entityType: 'package', entityId: pkg.id, after: pkg });
  return pkg;
}));

bookingsRouter.post('/addons', requireRole('admin', 'manager'), tenantRoute(async (req, _res, db) => {
  const input = PackageAddonCreateSchema.parse(req.body);
  return db.packageAddon.create({
    data: {
      tenantId: req.auth!.tenantId,
      packageId: input.packageId ?? null,
      name: input.name,
      price: input.price,
      stockPeriodStart: input.stockPeriodStart ? new Date(input.stockPeriodStart) : null,
      stockPeriodEnd: input.stockPeriodEnd ? new Date(input.stockPeriodEnd) : null,
    },
  });
}));

// ─── Bookings ─────────────────────

bookingsRouter.get('/', tenantRoute(async (req, _res, db) => {
  const from = req.query.from ? new Date(req.query.from as string) : undefined;
  const to = req.query.to ? new Date(req.query.to as string) : undefined;
  const where: { startAt?: { gte?: Date; lt?: Date } } = {};
  if (from || to) {
    where.startAt = {};
    if (from) where.startAt.gte = from;
    if (to) where.startAt.lt = to;
  }
  return db.booking.findMany({
    where,
    include: { customer: true, package: true, resource: true, invoice: { include: { payments: true } } },
    orderBy: { startAt: 'asc' },
    take: 500,
  });
}));

bookingsRouter.get('/:id', tenantRoute(async (req, _res, db) => {
  const id = req.params.id;
  if (!id) throw BadRequest('id required');
  const result = await getBookingWithPaymentState(db, req.auth!.tenantId, id);
  if (!result) throw NotFound('booking');
  return result;
}));

bookingsRouter.post('/', tenantRoute(async (req, _res, db) => {
  const input = BookingCreateSchema.parse(req.body);
  const { booking } = await createBooking(db, req.auth!.tenantId, req.auth!.userId, input);
  const created = booking as { id: string; customerId: string };
  await writeAudit(db, req, { action: 'booking.create', entityType: 'booking', entityId: created.id, after: booking });

  // Fire-and-forget WhatsApp confirmation. Failures must not break booking creation, so we
  // catch and log. The scheduled reminders (48h/24h) will be picked up by the scheduler.
  enqueueWhatsAppSend({
    tenantId: req.auth!.tenantId,
    customerId: created.customerId,
    templateName: 'booking_confirmation',
    variables: {},
  }).catch(err => console.error('confirmation enqueue failed', err));

  return booking;
}));

bookingsRouter.post('/:id/payments', tenantRoute(async (req, _res, db) => {
  const id = req.params.id;
  if (!id) throw BadRequest('id required');
  const input = PaymentRecordSchema.parse(req.body);
  const payment = await recordPayment(db, req.auth!.tenantId, id, input);
  await writeAudit(db, req, { action: 'payment.record', entityType: 'payment', entityId: payment.id, after: payment });
  return payment;
}));

bookingsRouter.post('/:id/cancel', requireRole('manager', 'admin'), tenantRoute(async (req, _res, db) => {
  const id = req.params.id;
  if (!id) throw BadRequest('id required');
  const input = BookingCancelSchema.parse(req.body);
  const result = await cancelBooking(db, req.auth!.tenantId, id, input.reason, input.refundOverride);
  await writeAudit(db, req, { action: 'booking.cancel', entityType: 'booking', entityId: id, after: result });
  return result;
}));

// ─── Waitlist ─────────────────────

bookingsRouter.post('/waitlist', tenantRoute(async (req, _res, db) => {
  const input = WaitlistCreateSchema.parse(req.body);
  return db.waitlistEntry.create({
    data: {
      tenantId: req.auth!.tenantId,
      packageId: input.packageId,
      customerId: input.customerId ?? null,
      contactPhone: input.contactPhone,
      requestedDate: new Date(input.requestedDate),
    },
  });
}));

bookingsRouter.get('/waitlist/:packageId/:date', tenantRoute(async (req, _res, db) => {
  const { packageId, date } = req.params;
  return db.waitlistEntry.findMany({
    where: { packageId, requestedDate: new Date(date!), claimedAt: null },
    orderBy: { createdAt: 'asc' },
  });
}));
