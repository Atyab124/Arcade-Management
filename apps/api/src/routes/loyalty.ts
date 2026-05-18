import { Router } from 'express';
import { PointsEarnInputSchema, PointsRedeemInputSchema, RewardCreateSchema, PointsAdjustSchema } from '@arcade/types';
import { tenantRoute } from '../middleware/tenant-context.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { writeAudit } from '../middleware/audit.js';
import { BadRequest } from '../errors.js';
import { currentBalance, earnPoints, redeemPoints } from '../services/loyalty.js';

export const loyaltyRouter = Router();
loyaltyRouter.use(requireAuth);

loyaltyRouter.get('/rewards', tenantRoute(async (_req, _res, db) => {
  return db.reward.findMany({ where: { active: true }, orderBy: { pointsCost: 'asc' } });
}));

loyaltyRouter.post('/rewards', requireRole('admin', 'manager'), tenantRoute(async (req, _res, db) => {
  const input = RewardCreateSchema.parse(req.body);
  const r = await db.reward.create({ data: { tenantId: req.auth!.tenantId, ...input } });
  await writeAudit(db, req, { action: 'reward.create', entityType: 'reward', entityId: r.id, after: r });
  return r;
}));

loyaltyRouter.get('/balance/:customerId', tenantRoute(async (req, _res, db) => {
  const customerId = req.params.customerId;
  if (!customerId) throw BadRequest('customerId required');
  const balance = await currentBalance(db, req.auth!.tenantId, customerId);
  return { customerId, balance };
}));

loyaltyRouter.get('/ledger/:customerId', tenantRoute(async (req, _res, db) => {
  const customerId = req.params.customerId;
  if (!customerId) throw BadRequest('customerId required');
  const ledger = await db.pointsLedger.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return ledger.map(l => ({ ...l, id: l.id.toString(), parentLedgerId: l.parentLedgerId?.toString() ?? null }));
}));

loyaltyRouter.post('/earn', requireRole('manager', 'admin', 'staff'), tenantRoute(async (req, _res, db) => {
  const input = PointsEarnInputSchema.parse(req.body);
  const program = await db.loyaltyProgram.findFirst({ where: { active: true } });
  const result = await earnPoints(db, req.auth!.tenantId, {
    customerId: input.customerId,
    points: input.points,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    metadata: input.metadata,
    expiryMonths: program?.expiryMonths,
  });
  await writeAudit(db, req, { action: 'points.earn', entityType: 'ledger', entityId: result.id.toString(), after: result });
  return { ...result, id: result.id.toString() };
}));

loyaltyRouter.post('/redeem', tenantRoute(async (req, _res, db) => {
  const input = PointsRedeemInputSchema.parse(req.body);
  const result = await redeemPoints(db, req.auth!.tenantId, input.customerId, input.rewardId);
  await writeAudit(db, req, { action: 'points.redeem', entityType: 'redemption', entityId: result.id, after: result });
  return result;
}));

loyaltyRouter.post('/adjust', requireRole('manager', 'admin'), tenantRoute(async (req, _res, db) => {
  const input = PointsAdjustSchema.parse(req.body);
  const result = await db.pointsLedger.create({
    data: {
      tenantId: req.auth!.tenantId,
      customerId: input.customerId,
      eventType: 'ADJUST',
      points: input.points,
      sourceType: 'manual_adjust',
      metadata: { reason: input.reason },
    },
  });
  await db.customer.update({
    where: { tenantId_id: { tenantId: req.auth!.tenantId, id: input.customerId } },
    data: { loyaltyPoints: { increment: input.points } },
  });
  await writeAudit(db, req, { action: 'points.adjust', entityType: 'ledger', entityId: result.id.toString(), after: result });
  return { ...result, id: result.id.toString() };
}));
