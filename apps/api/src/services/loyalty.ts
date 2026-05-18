import type { PrismaClient } from '@arcade/db';
import { LedgerEventType } from '@arcade/types';
import { logger } from '../logger.js';

/**
 * Append-only points ledger. Industry standard (Square Books, Capillary, Salesforce
 * Loyalty DMO): every points movement is an immutable row; balance is SUM over the ledger.
 *
 * Corrections are compensating rows (REVERSAL pointing at the original ledger_id), never
 * UPDATE/DELETE of historical rows.
 */

export async function earnPoints(
  db: PrismaClient,
  tenantId: string,
  args: {
    customerId: string;
    points: number;
    sourceType: string;
    sourceId?: string;
    metadata?: Record<string, unknown>;
    expiryMonths?: number;
  },
) {
  if (args.points <= 0) throw new Error('earn points must be positive');
  const expiresAt = args.expiryMonths
    ? new Date(Date.now() + args.expiryMonths * 30 * 86_400_000)
    : null;
  const ledger = await db.pointsLedger.create({
    data: {
      tenantId,
      customerId: args.customerId,
      eventType: LedgerEventType.EARN,
      points: args.points,
      sourceType: args.sourceType,
      sourceId: args.sourceId ?? null,
      expiresAt,
      metadata: (args.metadata ?? {}) as object,
    },
  });
  // Denormalized balance for fast UI reads. The ledger is source of truth; this is a cache.
  await db.customer.update({
    where: { tenantId_id: { tenantId, id: args.customerId } },
    data: { loyaltyPoints: { increment: args.points } },
  });
  await maybeUpgradeTier(db, tenantId, args.customerId);
  return ledger;
}

export async function redeemPoints(
  db: PrismaClient,
  tenantId: string,
  customerId: string,
  rewardId: string,
) {
  const reward = await db.reward.findFirst({ where: { tenantId, id: rewardId, active: true } });
  if (!reward) throw new Error('reward not found');
  const balance = await currentBalance(db, tenantId, customerId);
  if (balance < reward.pointsCost) throw new Error('insufficient points');
  if (reward.stock !== null && reward.stock <= 0) throw new Error('reward out of stock');

  const redemption = await db.redemption.create({
    data: {
      tenantId,
      customerId,
      rewardId,
      pointsCost: reward.pointsCost,
      status: 'fulfilled',
      fulfilledAt: new Date(),
    },
  });
  await db.pointsLedger.create({
    data: {
      tenantId,
      customerId,
      eventType: LedgerEventType.REDEEM,
      points: -reward.pointsCost,
      sourceType: 'redemption',
      sourceId: redemption.id,
    },
  });
  await db.customer.update({
    where: { tenantId_id: { tenantId, id: customerId } },
    data: { loyaltyPoints: { decrement: reward.pointsCost } },
  });
  if (reward.stock !== null) {
    await db.reward.update({
      where: { tenantId_id: { tenantId, id: rewardId } },
      data: { stock: { decrement: 1 } },
    });
  }
  return redemption;
}

export async function currentBalance(
  db: PrismaClient,
  tenantId: string,
  customerId: string,
): Promise<number> {
  // Source of truth: ledger SUM where (EXPIRE/REDEEM/ADJUST/REVERSAL always count; EARN
  // only counts if not expired)
  const rows = await db.$queryRawUnsafe<{ balance: string }[]>(
    `SELECT COALESCE(SUM(points),0)::text AS balance
     FROM points_ledger
     WHERE tenant_id = $1::uuid
       AND customer_id = $2::uuid
       AND (event_type <> 'EARN' OR expires_at IS NULL OR expires_at > NOW())`,
    tenantId, customerId,
  );
  return Number(rows[0]?.balance ?? 0);
}

async function maybeUpgradeTier(db: PrismaClient, tenantId: string, customerId: string): Promise<void> {
  const program = await db.loyaltyProgram.findFirst({ where: { tenantId, active: true } });
  if (!program) return;
  const balance = await currentBalance(db, tenantId, customerId);
  const tier = await db.loyaltyTier.findFirst({
    where: { tenantId, programId: program.id, minQualifyingPoints: { lte: balance } },
    orderBy: { minQualifyingPoints: 'desc' },
  });
  if (!tier) return;
  const customer = await db.customer.findFirst({ where: { tenantId, id: customerId } });
  if (!customer) return;
  const currentTierName = customer.membershipType;
  // Lowercase the tier name as our membership type. Customers below "Silver" stay
  // 'walk_in' to avoid downgrading basic/premium configured manually.
  const newTier = tier.name.toLowerCase();
  if (['basic', 'premium', 'vip'].includes(newTier) && newTier !== currentTierName) {
    await db.customer.update({
      where: { tenantId_id: { tenantId, id: customerId } },
      data: { membershipType: newTier },
    });
    logger.info({ customerId, from: currentTierName, to: newTier }, 'tier upgrade');
  }
}

/**
 * Nightly batch: expire EARN rows whose expires_at has passed, by writing compensating
 * EXPIRE rows. Idempotent — we only EXPIRE earn rows that don't already have a paired
 * EXPIRE/REVERSAL via parent_ledger_id.
 */
export async function expirePointsBatch(db: PrismaClient, tenantId: string): Promise<number> {
  const candidates = await db.$queryRawUnsafe<Array<{ id: string; customer_id: string; points: string }>>(
    `SELECT pl.id::text, pl.customer_id::text, pl.points::text
     FROM points_ledger pl
     WHERE pl.tenant_id = $1::uuid
       AND pl.event_type = 'EARN'
       AND pl.expires_at IS NOT NULL
       AND pl.expires_at <= NOW()
       AND NOT EXISTS (
         SELECT 1 FROM points_ledger pl2
         WHERE pl2.parent_ledger_id = pl.id
       )`,
    tenantId,
  );
  let count = 0;
  for (const c of candidates) {
    const points = Number(c.points);
    await db.pointsLedger.create({
      data: {
        tenantId,
        customerId: c.customer_id,
        eventType: LedgerEventType.EXPIRE,
        points: -points,
        sourceType: 'expiry',
        parentLedgerId: BigInt(c.id),
      },
    });
    await db.customer.update({
      where: { tenantId_id: { tenantId, id: c.customer_id } },
      data: { loyaltyPoints: { decrement: points } },
    });
    count++;
  }
  return count;
}
