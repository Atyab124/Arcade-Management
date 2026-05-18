import { describe, it, expect } from 'vitest';
import { calculateBookingPrice } from '../pricing.js';

describe('calculateBookingPrice', () => {
  it('uses base price when no variation override', () => {
    const result = calculateBookingPrice({
      basePrice: 500,
      guestCount: 10,
      addons: [],
      depositPct: 50,
    });
    expect(result.subtotal).toBe(500);
    expect(result.total).toBe(500);
    expect(result.depositRequired).toBe(250);
  });

  it('uses variation override when provided', () => {
    const result = calculateBookingPrice({
      basePrice: 500,
      variationPriceOverride: 700,
      guestCount: 10,
      addons: [],
      depositPct: 50,
    });
    expect(result.subtotal).toBe(700);
  });

  it('sums add-on lines correctly', () => {
    const result = calculateBookingPrice({
      basePrice: 500,
      guestCount: 10,
      addons: [
        { addonId: 'a1', name: 'Cake', unitPrice: 80, qty: 1 },
        { addonId: 'a2', name: 'Decor', unitPrice: 50, qty: 2 },
      ],
      depositPct: 50,
    });
    expect(result.subtotal).toBe(680);
    expect(result.addonLines[0]?.lineTotal).toBe(80);
    expect(result.addonLines[1]?.lineTotal).toBe(100);
    expect(result.depositRequired).toBe(340);
  });

  it('applies tax', () => {
    const result = calculateBookingPrice({
      basePrice: 100,
      guestCount: 5,
      addons: [],
      depositPct: 50,
      taxRate: 0.06,
    });
    expect(result.taxTotal).toBe(6);
    expect(result.total).toBe(106);
  });

  it('rounds money to 2dp without FP drift', () => {
    const result = calculateBookingPrice({
      basePrice: 0.1,
      guestCount: 1,
      addons: [
        { addonId: 'a', name: 'x', unitPrice: 0.2, qty: 1 },
      ],
      depositPct: 50,
    });
    // 0.1 + 0.2 = 0.30000000000000004 in IEEE float
    expect(result.subtotal).toBe(0.3);
  });
});
