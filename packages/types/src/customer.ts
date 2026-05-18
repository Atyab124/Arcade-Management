import { z } from 'zod';
import { MembershipType, ConsentChannel, ConsentAction } from './enums.js';

export const phoneE164 = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'must be E.164, e.g. +60123456789');

export const CustomerCreateSchema = z.object({
  fullName: z.string().min(1).max(150),
  phoneE164: phoneE164,
  email: z.string().email().max(200).optional().nullable(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  membershipType: z.enum([
    MembershipType.WALK_IN,
    MembershipType.BASIC,
    MembershipType.PREMIUM,
    MembershipType.VIP,
  ]).default(MembershipType.WALK_IN),
  preferredLang: z.string().min(2).max(10).default('en'),
  notes: z.string().max(5000).optional().nullable(),
  vipFlag: z.boolean().default(false),
  dietaryFlags: z.array(z.string()).default([]),
  medicalFlags: z.array(z.string()).default([]),
});
export type CustomerCreate = z.infer<typeof CustomerCreateSchema>;

export const CustomerUpdateSchema = CustomerCreateSchema.partial();
export type CustomerUpdate = z.infer<typeof CustomerUpdateSchema>;

export const ConsentCreateSchema = z.object({
  channel: z.enum([ConsentChannel.WHATSAPP, ConsentChannel.EMAIL, ConsentChannel.SMS]),
  action: z.enum([ConsentAction.OPT_IN, ConsentAction.OPT_OUT]),
  source: z.string().min(1).max(50),
  noticeVersion: z.string().min(1).max(20),
  evidence: z.record(z.unknown()).optional(),
});
export type ConsentCreate = z.infer<typeof ConsentCreateSchema>;

export const SegmentFilterSchema = z.object({
  whatsappOptIn: z.boolean().optional(),
  membershipTypes: z.array(z.string()).optional(),
  birthdayWithinDays: z.number().int().min(1).max(366).optional(),
  lastVisitOlderThanDays: z.number().int().min(1).max(3650).optional(),
  lifetimeSpendGte: z.number().min(0).optional(),
  loyaltyPointsGte: z.number().min(0).optional(),
  createdWithinDays: z.number().int().min(1).max(3650).optional(),
});
export type SegmentFilter = z.infer<typeof SegmentFilterSchema>;
