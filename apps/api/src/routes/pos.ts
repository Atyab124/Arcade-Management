import { Router } from 'express';
import { TillOpenSchema, TillCloseSchema, SaleCreateSchema, RefundCreateSchema, VoidCreateSchema, PayInOutSchema } from '@arcade/types';
import { tenantRoute } from '../middleware/tenant-context.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../middleware/audit.js';
import { BadRequest, NotFound, Forbidden } from '../errors.js';
import { closeTill, createRefund, createSale, createVoid, openTill, recordPayInOut } from '../services/pos.js';

export const posRouter = Router();
posRouter.use(requireAuth);

posRouter.get('/till/open', tenantRoute(async (req, _res, db) => {
  return db.tillSession.findMany({
    where: { status: 'open' },
    orderBy: { openedAt: 'desc' },
  });
}));

posRouter.post('/till/open', tenantRoute(async (req, _res, db) => {
  const input = TillOpenSchema.parse(req.body);
  const session = await openTill(db, req.auth!.tenantId, req.auth!.userId, input);
  await writeAudit(db, req, { action: 'till.open', entityType: 'till_session', entityId: session.id, after: session });
  return session;
}));

posRouter.post('/till/:id/close', tenantRoute(async (req, _res, db) => {
  const id = req.params.id;
  if (!id) throw BadRequest('id required');
  const input = TillCloseSchema.parse(req.body);
  const session = await closeTill(db, req.auth!.tenantId, req.auth!.userId, id, input);
  await writeAudit(db, req, { action: 'till.close', entityType: 'till_session', entityId: id, after: session });
  return session;
}));

posRouter.get('/till/:id', tenantRoute(async (req, _res, db) => {
  const id = req.params.id;
  if (!id) throw BadRequest('id required');
  const session = await db.tillSession.findFirst({
    where: { id },
    include: { transactions: { orderBy: { createdAt: 'desc' } } },
  });
  if (!session) throw NotFound('till session');
  return session;
}));

posRouter.post('/sale', tenantRoute(async (req, _res, db) => {
  const input = SaleCreateSchema.parse(req.body);
  const txn = await createSale(db, req.auth!.tenantId, req.auth!.userId, input);
  await writeAudit(db, req, { action: 'sale.create', entityType: 'transaction', entityId: txn.id, after: txn });
  return txn;
}));

/** Refund and void require manager approval; the approver and reason are recorded. */
posRouter.post('/refund', requireRole('manager', 'admin'), tenantRoute(async (req, _res, db) => {
  const input = RefundCreateSchema.parse(req.body);
  // approvedByUserId must be a manager/admin. Cheap check: must equal the caller (we don't
  // support a 2nd-user approval flow yet but the schema is ready for it).
  if (input.approvedByUserId !== req.auth!.userId) {
    throw Forbidden('approvedByUserId must match the authenticated manager');
  }
  const txn = await createRefund(db, req.auth!.tenantId, req.auth!.userId, input);
  await writeAudit(db, req, { action: 'refund.create', entityType: 'transaction', entityId: txn.id, after: txn });
  return txn;
}));

posRouter.post('/void', requireRole('manager', 'admin'), tenantRoute(async (req, _res, db) => {
  const input = VoidCreateSchema.parse(req.body);
  if (input.approvedByUserId !== req.auth!.userId) {
    throw Forbidden('approvedByUserId must match the authenticated manager');
  }
  const txn = await createVoid(db, req.auth!.tenantId, req.auth!.userId, input);
  await writeAudit(db, req, { action: 'void.create', entityType: 'transaction', entityId: txn.id, after: txn });
  return txn;
}));

posRouter.post('/pay', tenantRoute(async (req, _res, db) => {
  const input = PayInOutSchema.parse(req.body);
  const txn = await recordPayInOut(db, req.auth!.tenantId, req.auth!.userId, input);
  await writeAudit(db, req, { action: `${input.type}.create`, entityType: 'transaction', entityId: txn.id, after: txn });
  return txn;
}));
