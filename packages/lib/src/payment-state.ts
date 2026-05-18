import { BookingPaymentState } from '@arcade/types';
import { sumMoney, roundMoney } from './money.js';

export interface PaymentRow {
  amount: number;
  type: 'deposit' | 'balance' | 'refund' | 'gift';
}

/**
 * Compute booking payment state from the live payment rows + the invoice total.
 *
 * Industry pattern (Checkfront, Bookinglayer): payment state is DERIVED, not stored, so it
 * cannot drift from the underlying payments. Refunds are negative; gifts apply like payments.
 */
export function computePaymentState(args: {
  invoiceTotal: number;
  depositRequired: number;
  payments: readonly PaymentRow[];
}): {
  state: BookingPaymentState;
  amountPaid: number;
  balanceRemaining: number;
} {
  const signed = args.payments.map(p => (p.type === 'refund' ? -p.amount : p.amount));
  const amountPaid = roundMoney(sumMoney(signed));
  const balanceRemaining = roundMoney(args.invoiceTotal - amountPaid);

  let state: BookingPaymentState;
  if (amountPaid <= 0) {
    state = BookingPaymentState.PENDING;
  } else if (amountPaid < args.depositRequired) {
    state = BookingPaymentState.PENDING;
  } else if (amountPaid < args.invoiceTotal) {
    state = BookingPaymentState.DEPOSIT_PAID;
  } else if (amountPaid === args.invoiceTotal) {
    state = BookingPaymentState.FULLY_PAID;
  } else {
    state = BookingPaymentState.OVERPAID;
  }
  // Special case: if a refund pushed paid back below zero overall, treat as refunded.
  if (amountPaid < 0) {
    state = BookingPaymentState.REFUNDED;
  }
  return { state, amountPaid, balanceRemaining };
}
