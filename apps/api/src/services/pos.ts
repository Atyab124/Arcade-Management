import type { PrismaClient } from '@arcade/db';
import { applyTax, sumMoney } from '@arcade/lib';
import type { SaleCreate, RefundCreate, VoidCreate, PayInOut, TillOpen, TillClose } from '@arcade/types';

function generateReceiptNo(tillSessionId: string): string {
  return `R-${Date.now()}-${tillSessionId.slice(0, 4)}`;
}

export async function openTill(db: PrismaClient, tenantId: string, userId: string, input: TillOpen) {
  return db.tillSession.create({
    data: {
      tenantId,
      registerId: input.registerId,
      openedByUserId: userId,
      openingCash: input.openingCash,
      status: 'open',
    },
  });
}

/**
 * Closes a till session, computing expected_cash = opening + cash_sales - cash_refunds
 * + payins - payouts - expenses. Variance = actual - expected. Pay-ins/outs do NOT count
 * toward variance because they're intentional cash movements; we subtract them so they
 * don't masquerade as missing cash (research: universal pattern across Roller, Centeredge).
 */
export async function closeTill(
  db: PrismaClient,
  tenantId: string,
  userId: string,
  sessionId: string,
  input: TillClose,
) {
  const session = await db.tillSession.findFirst({
    where: { tenantId, id: sessionId, status: 'open' },
  });
  if (!session) throw new Error('till session not found or already closed');

  // Aggregate cash movements within the session
  const txns = await db.transaction.findMany({
    where: { tenantId, tillSessionId: sessionId },
  });

  let cashSales = 0;
  let cashRefunds = 0;
  let payIns = 0;
  let payOuts = 0;
  let expenses = 0;
  for (const t of txns) {
    const isCash = t.paymentMethod === 'cash';
    const amt = Number(t.total);
    if (t.type === 'sale' && isCash) cashSales += amt;
    else if (t.type === 'refund' && isCash) cashRefunds += amt;
    else if (t.type === 'payin') payIns += amt;
    else if (t.type === 'payout') payOuts += amt;
    else if (t.type === 'expense') expenses += amt;
  }
  const expected = Number(session.openingCash) + cashSales - cashRefunds + payIns - payOuts - expenses;
  const variance = input.actualCash - expected;

  return db.tillSession.update({
    where: { tenantId_id: { tenantId, id: sessionId } },
    data: {
      closedByUserId: userId,
      closedAt: new Date(),
      expectedCash: expected,
      actualCash: input.actualCash,
      variance,
      status: 'closed',
      notes: input.notes ?? null,
    },
  });
}

export async function createSale(
  db: PrismaClient,
  tenantId: string,
  userId: string,
  input: SaleCreate,
) {
  const lineTotals = input.lines.map(l => ({
    sku: l.sku,
    description: l.description,
    qty: l.qty,
    unitPrice: l.unitPrice,
    lineTotal: Math.round(l.qty * l.unitPrice * 100) / 100,
  }));
  const subtotal = sumMoney(lineTotals.map(l => l.lineTotal));
  const { taxTotal, total } = applyTax(subtotal, input.taxRate);
  const receiptNo = generateReceiptNo(input.tillSessionId);

  const txn = await db.transaction.create({
    data: {
      tenantId,
      tillSessionId: input.tillSessionId,
      customerId: input.customerId ?? null,
      type: 'sale',
      subtotal,
      taxTotal,
      total,
      paymentMethod: input.paymentMethod,
      receiptNo,
      createdByUserId: userId,
      lines: {
        create: lineTotals.map((l, idx) => ({
          tenantId,
          lineNo: idx + 1,
          sku: l.sku,
          description: l.description,
          qty: l.qty,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
        })),
      },
    },
    include: { lines: true },
  });

  // Update customer stats if linked
  if (input.customerId) {
    await db.customer.update({
      where: { tenantId_id: { tenantId, id: input.customerId } },
      data: {
        lifetimeSpend: { increment: total },
        visitCount: { increment: 1 },
        lastVisitDate: new Date(),
      },
    });
  }

  return txn;
}

/**
 * Refund: requires a manager approver, links back to the original sale, writes a negative
 * transaction. Refund reason code is mandatory (industry standard, Centeredge "Receipt Return").
 */
export async function createRefund(
  db: PrismaClient,
  tenantId: string,
  userId: string,
  input: RefundCreate,
) {
  const original = await db.transaction.findFirst({
    where: { tenantId, id: input.voidOfTransactionId },
  });
  if (!original) throw new Error('original transaction not found');
  if (original.type !== 'sale') throw new Error('can only refund sale transactions');
  if (input.amount > Number(original.total)) throw new Error('refund amount exceeds original total');

  const receiptNo = `${original.receiptNo}-R${Date.now() % 10000}`;
  const refund = await db.transaction.create({
    data: {
      tenantId,
      tillSessionId: input.tillSessionId,
      customerId: original.customerId,
      type: 'refund',
      subtotal: input.amount,
      taxTotal: 0,
      total: input.amount,
      paymentMethod: original.paymentMethod,
      receiptNo,
      reasonCode: input.reasonCode,
      approvedByUserId: input.approvedByUserId,
      voidOfTransactionId: original.id,
      createdByUserId: userId,
    },
  });

  if (original.customerId) {
    await db.customer.update({
      where: { tenantId_id: { tenantId, id: original.customerId } },
      data: { lifetimeSpend: { decrement: input.amount } },
    });
  }
  return refund;
}

export async function createVoid(
  db: PrismaClient,
  tenantId: string,
  userId: string,
  input: VoidCreate,
) {
  const original = await db.transaction.findFirst({
    where: { tenantId, id: input.voidOfTransactionId },
  });
  if (!original) throw new Error('original transaction not found');
  return db.transaction.create({
    data: {
      tenantId,
      tillSessionId: input.tillSessionId,
      customerId: original.customerId,
      type: 'void',
      subtotal: 0,
      taxTotal: 0,
      total: Number(original.total),
      paymentMethod: original.paymentMethod,
      receiptNo: `${original.receiptNo}-V`,
      reasonCode: input.reasonCode,
      approvedByUserId: input.approvedByUserId,
      voidOfTransactionId: original.id,
      createdByUserId: userId,
    },
  });
}

export async function recordPayInOut(
  db: PrismaClient,
  tenantId: string,
  userId: string,
  input: PayInOut,
) {
  return db.transaction.create({
    data: {
      tenantId,
      tillSessionId: input.tillSessionId,
      type: input.type,
      subtotal: input.amount,
      total: input.amount,
      paymentMethod: 'cash',
      receiptNo: `${input.type.toUpperCase()}-${Date.now()}`,
      reasonCode: input.reason,
      createdByUserId: userId,
    },
  });
}
