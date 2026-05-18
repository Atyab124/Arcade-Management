import { z } from 'zod';
import { LedgerEventType } from './enums.js';

export const LoyaltyProgramConfigSchema = z.object({
  name: z.string().min(1).max(80),
  earnRatePerRm: z.number().nonnegative().default(1),
  expiryMonths: z.number().int().min(1).max(60).default(12),
  active: z.boolean().default(true),
  tiers: z.array(z.object({
    name: z.string().min(1).max(40),
    minQualifyingPoints: z.number().int().min(0),
    perks: z.record(z.unknown()).optional(),
  })),
});
export type LoyaltyProgramConfig = z.infer<typeof LoyaltyProgramConfigSchema>;

export const PointsEarnInputSchema = z.object({
  customerId: z.string().uuid(),
  points: z.number().int().positive(),
  sourceType: z.string().min(1).max(40),
  sourceId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type PointsEarnInput = z.infer<typeof PointsEarnInputSchema>;

export const PointsRedeemInputSchema = z.object({
  customerId: z.string().uuid(),
  rewardId: z.string().uuid(),
});
export type PointsRedeemInput = z.infer<typeof PointsRedeemInputSchema>;

export const RewardCreateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  pointsCost: z.number().int().positive(),
  stock: z.number().int().min(0).optional().nullable(),
  active: z.boolean().default(true),
});
export type RewardCreate = z.infer<typeof RewardCreateSchema>;

export const PointsAdjustSchema = z.object({
  customerId: z.string().uuid(),
  points: z.number().int(),
  reason: z.string().min(1).max(200),
});
export type PointsAdjust = z.infer<typeof PointsAdjustSchema>;

export type LedgerEventTypeT = (typeof LedgerEventType)[keyof typeof LedgerEventType];
