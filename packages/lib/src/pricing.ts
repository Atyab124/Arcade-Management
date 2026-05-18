import { sumMoney, applyTax } from './money.js';

export interface PackagePricingInput {
  basePrice: number;
  variationPriceOverride?: number | null;
  guestCount: number;
  addons: ReadonlyArray<{
    addonId: string;
    name: string;
    unitPrice: number;
    qty: number;
  }>;
  taxRate?: number;
  depositPct: number;
}

export interface PricingSnapshot {
  basePrice: number;
  variationPrice: number | null;
  guestCount: number;
  addonLines: Array<{
    addonId: string;
    name: string;
    unitPrice: number;
    qty: number;
    lineTotal: number;
  }>;
  subtotal: number;
  taxRate: number;
  taxTotal: number;
  total: number;
  depositPct: number;
  depositRequired: number;
}

/**
 * Computes the price snapshot for a party booking at booking time.
 *
 * Industry standard: snapshot at booking time and persist the snapshot on the booking.
 * Subsequent price changes never retroactively alter old bookings (Roller, Checkfront,
 * FareHarbor all do this implicitly via invoice generation).
 */
export function calculateBookingPrice(input: PackagePricingInput): PricingSnapshot {
  const taxRate = input.taxRate ?? 0;
  const variationPrice = input.variationPriceOverride ?? null;
  const baseLine = variationPrice ?? input.basePrice;

  const addonLines = input.addons.map(a => ({
    addonId: a.addonId,
    name: a.name,
    unitPrice: a.unitPrice,
    qty: a.qty,
    lineTotal: Math.round(a.unitPrice * a.qty * 100) / 100,
  }));

  const subtotal = sumMoney([baseLine, ...addonLines.map(l => l.lineTotal)]);
  const { taxTotal, total } = applyTax(subtotal, taxRate);
  const depositRequired = Math.round((total * input.depositPct) / 100 * 100) / 100;

  return {
    basePrice: input.basePrice,
    variationPrice,
    guestCount: input.guestCount,
    addonLines,
    subtotal,
    taxRate,
    taxTotal,
    total,
    depositPct: input.depositPct,
    depositRequired,
  };
}
