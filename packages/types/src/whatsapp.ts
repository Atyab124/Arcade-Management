import { z } from 'zod';
import { WaTemplateCategory } from './enums.js';
import { SegmentFilterSchema } from './customer.js';

export const TemplateRegisterSchema = z.object({
  name: z.string().min(1).max(80),
  category: z.enum([
    WaTemplateCategory.MARKETING,
    WaTemplateCategory.UTILITY,
    WaTemplateCategory.AUTH,
  ]),
  trengoHsmId: z.string().min(1).max(60),
  language: z.string().min(2).max(10).default('en'),
  body: z.string().min(1).max(2000),
  variables: z.array(z.object({
    key: z.string().min(1).max(40),
    description: z.string().max(200).optional(),
  })).default([]),
  version: z.number().int().min(1).default(1),
});
export type TemplateRegister = z.infer<typeof TemplateRegisterSchema>;

export const SendMessageInputSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  phoneE164: z.string().regex(/^\+[1-9]\d{6,14}$/),
  templateName: z.string().min(1),
  variables: z.record(z.string()).default({}),
});
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;

export const CampaignCreateSchema = z.object({
  name: z.string().min(1).max(120),
  templateName: z.string().min(1).max(80),
  variables: z.record(z.string()).default({}),
  segment: SegmentFilterSchema,
  scheduledFor: z.string().datetime().optional().nullable(),
});
export type CampaignCreate = z.infer<typeof CampaignCreateSchema>;

// Inbound Trengo webhook payload (subset we care about — we parse defensively)
export const TrengoWebhookEventSchema = z.object({
  event_id: z.string().optional(),
  type: z.string(),
  message: z.object({
    id: z.union([z.string(), z.number()]).optional(),
    text: z.string().optional(),
    direction: z.enum(['in', 'out']).optional(),
    status: z.string().optional(),
    contact: z.object({
      phone: z.string().optional(),
    }).optional(),
  }).optional(),
  contact: z.object({
    phone: z.string().optional(),
  }).optional(),
}).passthrough();
export type TrengoWebhookEvent = z.infer<typeof TrengoWebhookEventSchema>;
