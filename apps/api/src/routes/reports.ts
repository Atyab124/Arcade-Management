import { Router } from 'express';
import { tenantRoute } from '../middleware/tenant-context.js';
import { requireAuth } from '../middleware/auth.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

reportsRouter.get('/daily-revenue', tenantRoute(async (req, _res, db) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const start = new Date(`${date}T00:00:00Z`);
  const end = new Date(start.getTime() + 86_400_000);
  const txns = await db.transaction.findMany({
    where: { createdAt: { gte: start, lt: end }, type: { in: ['sale', 'refund'] } },
  });
  let cashTotal = 0, cardTotal = 0, walletTotal = 0, refundTotal = 0;
  let saleCount = 0;
  for (const t of txns) {
    const amt = Number(t.total);
    if (t.type === 'refund') refundTotal += amt;
    else {
      saleCount++;
      if (t.paymentMethod === 'cash') cashTotal += amt;
      else if (t.paymentMethod === 'card' || t.paymentMethod === 'qr') cardTotal += amt;
      else walletTotal += amt;
    }
  }
  const bookingPayments = await db.payment.findMany({
    where: { paidAt: { gte: start, lt: end } },
  });
  let bookingDepositTotal = 0, bookingBalanceTotal = 0, bookingRefundTotal = 0;
  for (const p of bookingPayments) {
    const amt = Number(p.amount);
    if (p.type === 'refund') bookingRefundTotal += amt;
    else if (p.type === 'deposit') bookingDepositTotal += amt;
    else if (p.type === 'balance') bookingBalanceTotal += amt;
  }
  return {
    date,
    pos: {
      saleCount,
      cashTotal,
      cardTotal,
      walletTotal,
      refundTotal,
      netRevenue: cashTotal + cardTotal + walletTotal - refundTotal,
    },
    bookings: {
      deposits: bookingDepositTotal,
      balances: bookingBalanceTotal,
      refunds: bookingRefundTotal,
      net: bookingDepositTotal + bookingBalanceTotal - bookingRefundTotal,
    },
  };
}));

reportsRouter.get('/machine-performance', tenantRoute(async (req, _res, db) => {
  const days = Number(req.query.days ?? 30);
  const since = new Date(Date.now() - days * 86_400_000);
  const machines = await db.machine.findMany({
    include: {
      revenueEvents: { where: { periodStart: { gte: since } } },
    },
    orderBy: { name: 'asc' },
  });
  return machines.map(m => {
    const totalPlays = m.revenueEvents.reduce((acc, e) => acc + e.plays, 0);
    const totalCollection = m.revenueEvents.reduce((acc, e) => acc + Number(e.collection), 0);
    const payoutAvg = m.revenueEvents.length > 0
      ? m.revenueEvents.reduce((acc, e) => acc + Number(e.payoutPct ?? 0), 0) / m.revenueEvents.length
      : null;
    return {
      id: m.id,
      name: m.name,
      status: m.status,
      totalPlays,
      totalCollection: Math.round(totalCollection * 100) / 100,
      payoutAvgPct: payoutAvg !== null ? Math.round(payoutAvg * 100) / 100 : null,
    };
  });
}));

reportsRouter.get('/segment-counts', tenantRoute(async (_req, _res, db) => {
  const total = await db.customer.count({ where: { deletedAt: null } });
  const vip = await db.customer.count({ where: { deletedAt: null, membershipType: 'vip' } });
  const premium = await db.customer.count({ where: { deletedAt: null, membershipType: 'premium' } });
  const basic = await db.customer.count({ where: { deletedAt: null, membershipType: 'basic' } });
  const walkIn = await db.customer.count({ where: { deletedAt: null, membershipType: 'walk_in' } });

  // Birthdays this week
  const birthdayWeek = await db.$queryRawUnsafe<{ count: string }[]>(
    `SELECT COUNT(*)::text AS count FROM customers
     WHERE tenant_id = (SELECT current_setting('app.tenant_id'))::uuid
       AND deleted_at IS NULL
       AND date_of_birth IS NOT NULL
       AND (DATE_PART('doy', date_of_birth) - DATE_PART('doy', CURRENT_DATE) + 365) % 365 <= 7`,
  );

  // Lapsed (no visit in 60+ days)
  const lapsed = await db.customer.count({
    where: {
      deletedAt: null,
      lastVisitDate: { lt: new Date(Date.now() - 60 * 86_400_000) },
    },
  });

  return {
    total,
    byMembership: { vip, premium, basic, walkIn },
    birthdayThisWeek: Number(birthdayWeek[0]?.count ?? 0),
    lapsed,
  };
}));

reportsRouter.get('/booking-revenue', tenantRoute(async (req, _res, db) => {
  const days = Number(req.query.days ?? 90);
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db.$queryRawUnsafe<Array<{ package_name: string; bookings: string; revenue: string }>>(
    `SELECT pp.name AS package_name, COUNT(b.id)::text AS bookings, COALESCE(SUM(i.total),0)::text AS revenue
     FROM bookings b
     JOIN party_packages pp ON pp.tenant_id = b.tenant_id AND pp.id = b.package_id
     LEFT JOIN invoices i ON i.tenant_id = b.tenant_id AND i.booking_id = b.id
     WHERE b.tenant_id = (SELECT current_setting('app.tenant_id'))::uuid
       AND b.created_at >= $1
       AND b.cancelled_at IS NULL
     GROUP BY pp.name
     ORDER BY revenue DESC`,
    since,
  );
  return rows.map(r => ({
    packageName: r.package_name,
    bookings: Number(r.bookings),
    revenue: Number(r.revenue),
  }));
}));
