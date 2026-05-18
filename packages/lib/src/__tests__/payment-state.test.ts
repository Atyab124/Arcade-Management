import { describe, it, expect } from 'vitest';
import { computePaymentState } from '../payment-state.js';
import { BookingPaymentState } from '@arcade/types';

const setup = (payments: { amount: number; type: 'deposit' | 'balance' | 'refund' | 'gift' }[]) =>
  computePaymentState({ invoiceTotal: 1000, depositRequired: 500, payments });

describe('computePaymentState', () => {
  it('PENDING with no payments', () => {
    expect(setup([]).state).toBe(BookingPaymentState.PENDING);
  });

  it('PENDING when partial below deposit', () => {
    expect(setup([{ amount: 100, type: 'deposit' }]).state).toBe(BookingPaymentState.PENDING);
  });

  it('DEPOSIT_PAID when deposit met but balance outstanding', () => {
    expect(setup([{ amount: 500, type: 'deposit' }]).state).toBe(BookingPaymentState.DEPOSIT_PAID);
  });

  it('FULLY_PAID when total met exactly', () => {
    expect(setup([
      { amount: 500, type: 'deposit' },
      { amount: 500, type: 'balance' },
    ]).state).toBe(BookingPaymentState.FULLY_PAID);
  });

  it('OVERPAID when payments exceed invoice', () => {
    expect(setup([
      { amount: 500, type: 'deposit' },
      { amount: 600, type: 'balance' },
    ]).state).toBe(BookingPaymentState.OVERPAID);
  });

  it('flips back to PENDING when refund offsets above-deposit payment', () => {
    expect(setup([
      { amount: 500, type: 'deposit' },
      { amount: 300, type: 'refund' },
    ]).state).toBe(BookingPaymentState.PENDING);
  });

  it('REFUNDED when net is negative', () => {
    expect(setup([
      { amount: 500, type: 'deposit' },
      { amount: 600, type: 'refund' },
    ]).state).toBe(BookingPaymentState.REFUNDED);
  });

  it('computes balanceRemaining correctly', () => {
    expect(setup([{ amount: 700, type: 'deposit' }]).balanceRemaining).toBe(300);
  });
});
