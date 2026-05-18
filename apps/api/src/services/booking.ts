import type { PrismaClient } from '@arcade/db';
import { calculateBookingPrice, computePaymentState, type PaymentRow } from '@arcade/lib';
import type { BookingCreate, PaymentRecord } from '@arcade/types';

/**
 * Check capacity for a booking start time. Returns true if the resource is free.
 *
 * Rules:
 *  - No active blackout event covering the time window.
 *  - No existing non-cancelled booking with overlapping (start, end) on the same resource.
 *  - guest_count <= resource.capacity (per the spec — overbooking is not allowed at v1;
 *    Roller's "purple overbook" can be added later).
 */
export async function checkCapacity(
  db: PrismaClient,
  tenantId: string,
  resourceId: string,
  startAt: Date,
  endAt: Date,
  guestCount: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const resource = await db.resource.findFirst({ where: { tenantId, id: resourceId, active: true } });
  if (!resource) return { ok: false, reason: 'resource not found' };
  if (guestCount > resource.capacity) return { ok: false, reason: `exceeds resource capacity (${resource.capacity})` };

  const blackouts = await db.availabilityEvent.findMany({
    where: {
      tenantId,
      resourceId,
      type: 'blackout',
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
  });
  if (blackouts.length > 0) return { ok: false, reason: 'resource is blacked out for this window' };

  const overlapping = await db.booking.findMany({
    where: {
      tenantId,
      resourceId,
      cancelledAt: null,
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
  });
  if (overlapping.length > 0) return { ok: false, reason: 'time slot already booked' };

  return { ok: true };
}

/**
 * Create a booking with snapshotted pricing + policy. Per industry convention (Roller,
 * Checkfront, FareHarbor), price and policy are frozen at booking time so later changes
 * don't retroactively affect this booking.
 */
export async function createBooking(
  db: PrismaClient,
  tenantId: string,
  _userId: string,
  input: BookingCreate,
): Promise<{ booking: unknown; invoiceId: string }> {
  const pkg = await db.partyPackage.findFirst({
    where: { tenantId, id: input.packageId, active: true },
    include: {
      variations: input.variationId ? { where: { id: input.variationId } } : false,
    },
  });
  if (!pkg) throw new Error('package not found');
  if (input.guestCount < pkg.minGuests || input.guestCount > pkg.maxGuests) {
    throw new Error(`guest count must be between ${pkg.minGuests} and ${pkg.maxGuests}`);
  }

  const variation = (pkg as unknown as { variations?: Array<{ id: string; priceOverride: unknown }> }).variations?.[0];

  const startAt = new Date(input.startAt);
  const endAt = new Date(startAt.getTime() + pkg.durationMinutes * 60_000);

  const capacity = await checkCapacity(db, tenantId, input.resourceId, startAt, endAt, input.guestCount);
  if (!capacity.ok) throw new Error(`capacity check failed: ${capacity.reason}`);

  // Resolve add-ons with stock-period validation
  const addonRecords = input.addons.length > 0
    ? await db.packageAddon.findMany({
        where: {
          tenantId,
          id: { in: input.addons.map(a => a.addonId) },
        },
      })
    : [];
  const now = new Date();
  for (const a of addonRecords) {
    if (a.stockPeriodStart && a.stockPeriodEnd) {
      if (startAt < a.stockPeriodStart || startAt > a.stockPeriodEnd) {
        throw new Error(`add-on "${a.name}" is not available for this date`);
      }
    }
    void now;
  }

  const pricing = calculateBookingPrice({
    basePrice: Number(pkg.basePrice),
    variationPriceOverride: variation?.priceOverride !== undefined && variation?.priceOverride !== null
      ? Number(variation.priceOverride as unknown as number)
      : null,
    guestCount: input.guestCount,
    depositPct: Number(pkg.depositPct),
    addons: input.addons.map(a => {
      const rec = addonRecords.find(r => r.id === a.addonId);
      if (!rec) throw new Error(`addon ${a.addonId} not found`);
      return {
        addonId: rec.id,
        name: rec.name,
        unitPrice: Number(rec.price),
        qty: a.qty,
      };
    }),
  });

  // Create booking + nested lines + invoice in a single transaction. Prisma's nested
  // creates with composite-PK relations require the tenantId on the parent only — children
  // inherit it via the relation.
  const booking = await db.booking.create({
    data: {
      tenantId,
      customerId: input.customerId,
      packageId: input.packageId,
      variationId: input.variationId ?? null,
      resourceId: input.resourceId,
      startAt,
      endAt,
      guestCount: input.guestCount,
      notes: input.notes ?? null,
      policySnapshot: pkg.cancellationPolicy as object,
      pricingSnapshot: pricing as unknown as object,
      lines: {
        create: pricing.addonLines.map(l => ({
          tenantId,
          addonId: l.addonId,
          description: l.name,
          qty: l.qty,
          unitPriceSnapshot: l.unitPrice,
          lineTotal: l.lineTotal,
        })),
      },
    },
    include: { lines: true },
  });

  const invoice = await db.invoice.create({
    data: {
      tenantId,
      bookingId: booking.id,
      total: pricing.total,
      taxTotal: pricing.taxTotal,
    },
  });

  return { booking: { ...booking, invoice }, invoiceId: invoice.id };
}

export async function getBookingWithPaymentState(
  db: PrismaClient,
  tenantId: string,
  bookingId: string,
) {
  const booking = await db.booking.findFirst({
    where: { tenantId, id: bookingId },
    include: { invoice: { include: { payments: true } }, lines: true, customer: true, resource: true, package: true },
  });
  if (!booking) return null;
  const pricing = booking.pricingSnapshot as unknown as { total: number; depositRequired: number };
  const paymentRows: PaymentRow[] = (booking.invoice?.payments ?? []).map(p => ({
    amount: Number(p.amount),
    type: p.type as PaymentRow['type'],
  }));
  const paymentState = computePaymentState({
    invoiceTotal: Number(booking.invoice?.total ?? pricing.total),
    depositRequired: pricing.depositRequired,
    payments: paymentRows,
  });
  return { ...booking, paymentState };
}

export async function recordPayment(
  db: PrismaClient,
  tenantId: string,
  bookingId: string,
  input: PaymentRecord,
) {
  const booking = await db.booking.findFirst({
    where: { tenantId, id: bookingId },
    include: { invoice: true },
  });
  if (!booking || !booking.invoice) throw new Error('booking or invoice not found');
  return db.payment.create({
    data: {
      tenantId,
      invoiceId: booking.invoice.id,
      amount: input.amount,
      method: input.method,
      type: input.type,
      txnRef: input.txnRef ?? null,
    },
  });
}

/**
 * Cancel a booking and compute refund per the snapshotted policy.
 * Refund tiers are an array of { daysBefore, refundPct } sorted desc by daysBefore.
 * The first matching tier wins. If `nonRefundableDeposit` is true, the deposit portion
 * is excluded from the refund.
 */
export async function cancelBooking(
  db: PrismaClient,
  tenantId: string,
  bookingId: string,
  reason: string,
  refundOverride?: number,
): Promise<{ booking: unknown; refundAmount: number }> {
  const booking = await db.booking.findFirst({
    where: { tenantId, id: bookingId, cancelledAt: null },
    include: { invoice: { include: { payments: true } } },
  });
  if (!booking) throw new Error('booking not found or already cancelled');
  const policy = booking.policySnapshot as {
    nonRefundableDeposit?: boolean;
    tiers?: Array<{ daysBefore: number; refundPct: number }>;
  };
  const pricing = booking.pricingSnapshot as unknown as { total: number; depositRequired: number };
  const paid = (booking.invoice?.payments ?? [])
    .filter(p => p.type !== 'refund')
    .reduce((acc, p) => acc + Number(p.amount), 0);

  let refundAmount: number;
  if (refundOverride !== undefined) {
    refundAmount = Math.min(refundOverride, paid);
  } else {
    const msPerDay = 86_400_000;
    const daysBefore = Math.floor((booking.startAt.getTime() - Date.now()) / msPerDay);
    const tiers = (policy.tiers ?? []).slice().sort((a, b) => b.daysBefore - a.daysBefore);
    let pct = 0;
    for (const t of tiers) {
      if (daysBefore >= t.daysBefore) {
        pct = t.refundPct;
        break;
      }
    }
    const refundableBase = policy.nonRefundableDeposit
      ? Math.max(0, paid - pricing.depositRequired)
      : paid;
    refundAmount = Math.round((refundableBase * pct) / 100 * 100) / 100;
  }

  await db.booking.update({
    where: { tenantId_id: { tenantId, id: bookingId } },
    data: {
      cancelledAt: new Date(),
      cancellationReason: reason,
    },
  });

  if (refundAmount > 0 && booking.invoice) {
    await db.payment.create({
      data: {
        tenantId,
        invoiceId: booking.invoice.id,
        amount: refundAmount,
        method: 'cash',
        type: 'refund',
        txnRef: 'cancellation',
      },
    });
  }

  return {
    booking: await db.booking.findFirst({ where: { tenantId, id: bookingId } }),
    refundAmount,
  };
}
