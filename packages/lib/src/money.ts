/**
 * Money is represented in the application as numbers with up to 2 decimal places.
 * Database columns are NUMERIC(12,2). This module centralizes rounding rules.
 *
 * Avoid floating-point arithmetic where possible — we round at the boundary.
 */

export function roundMoney(amount: number): number {
  // Banker's rounding would be nicer but JS doesn't have it natively; standard half-up is fine
  // and matches how POS receipts conventionally round.
  return Math.round(amount * 100) / 100;
}

export function sumMoney(amounts: readonly number[]): number {
  // Sum via integer cents to avoid FP drift across many items.
  const cents = amounts.reduce((acc, a) => acc + Math.round(a * 100), 0);
  return cents / 100;
}

export function applyTax(subtotal: number, taxRate: number): { taxTotal: number; total: number } {
  const taxTotal = roundMoney(subtotal * taxRate);
  return { taxTotal, total: roundMoney(subtotal + taxTotal) };
}

export function pct(amount: number, pctValue: number): number {
  return roundMoney((amount * pctValue) / 100);
}
