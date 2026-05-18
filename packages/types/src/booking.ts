import { z } from 'zod';
import { BookingPaymentState } from './enums.js';

export const ResourceCreateSchema = z.object({
  name: z.string().min(1).max(100),
  capacity: z.number().int().min(1).max(10000),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3b82f6'),
  active: z.boolean().default(true),
});
export type ResourceCreate = z.infer<typeof ResourceCreateSchema>;

export const AvailabilityEventCreateSchema = z.object({
  resourceId: z.string().uuid(),
  type: z.enum(['blackout', 'open']),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  reason: z.string().max(200).optional(),
});
export type AvailabilityEventCreate = z.infer<typeof AvailabilityEventCreateSchema>;

export const PackageCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  basePrice: z.number().nonnegative(),
  depositPct: z.number().min(0).max(100).default(50),
  minGuests: z.number().int().min(1).default(1),
  maxGuests: z.number().int().min(1).default(50),
  durationMinutes: z.number().int().min(15).default(120),
  active: z.boolean().default(true),
  cancellationPolicy: z.object({
    nonRefundableDeposit: z.boolean(),
    tiers: z.array(z.object({
      daysBefore: z.number().int().min(0),
      refundPct: z.number().min(0).max(100),
    })),
  }).default({
    nonRefundableDeposit: true,
    tiers: [
      { daysBefore: 7, refundPct: 100 },
      { daysBefore: 2, refundPct: 50 },
      { daysBefore: 0, refundPct: 0 },
    ],
  }),
});
export type PackageCreate = z.infer<typeof PackageCreateSchema>;

export const PackageVariationCreateSchema = z.object({
  packageId: z.string().uuid(),
  name: z.string().min(1).max(100),
  priceOverride: z.number().nonnegative().optional(),
  includedAddons: z.array(z.object({
    addonId: z.string().uuid(),
    qty: z.number().int().min(1).default(1),
  })).default([]),
});
export type PackageVariationCreate = z.infer<typeof PackageVariationCreateSchema>;

export const PackageAddonCreateSchema = z.object({
  packageId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(100),
  price: z.number().nonnegative(),
  stockPeriodStart: z.string().datetime().optional().nullable(),
  stockPeriodEnd: z.string().datetime().optional().nullable(),
});
export type PackageAddonCreate = z.infer<typeof PackageAddonCreateSchema>;

export const BookingCreateSchema = z.object({
  customerId: z.string().uuid(),
  packageId: z.string().uuid(),
  variationId: z.string().uuid().optional().nullable(),
  resourceId: z.string().uuid(),
  startAt: z.string().datetime(),
  guestCount: z.number().int().min(1).max(500),
  addons: z.array(z.object({
    addonId: z.string().uuid(),
    qty: z.number().int().min(1),
  })).default([]),
  notes: z.string().max(2000).optional(),
});
export type BookingCreate = z.infer<typeof BookingCreateSchema>;

export const PaymentRecordSchema = z.object({
  amount: z.number().positive(),
  method: z.string().min(1).max(40),
  type: z.enum(['deposit', 'balance', 'refund', 'gift']),
  txnRef: z.string().max(120).optional(),
});
export type PaymentRecord = z.infer<typeof PaymentRecordSchema>;

export const WaitlistCreateSchema = z.object({
  packageId: z.string().uuid(),
  requestedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  customerId: z.string().uuid().optional().nullable(),
  contactPhone: phoneE164OrString(),
});
function phoneE164OrString() {
  return z.string().regex(/^\+[1-9]\d{6,14}$/);
}
export type WaitlistCreate = z.infer<typeof WaitlistCreateSchema>;

export const BookingCancelSchema = z.object({
  reason: z.string().min(1).max(500),
  refundOverride: z.number().min(0).optional(),
});
export type BookingCancel = z.infer<typeof BookingCancelSchema>;

export interface PaymentStateView {
  state: BookingPaymentState;
  invoiceTotal: number;
  amountPaid: number;
  depositRequired: number;
  balanceRemaining: number;
}
