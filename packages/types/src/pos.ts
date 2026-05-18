import { z } from 'zod';

export const TillOpenSchema = z.object({
  registerId: z.string().min(1).max(50),
  openingCash: z.number().nonnegative(),
});
export type TillOpen = z.infer<typeof TillOpenSchema>;

export const TillCloseSchema = z.object({
  actualCash: z.number().nonnegative(),
  notes: z.string().max(2000).optional(),
});
export type TillClose = z.infer<typeof TillCloseSchema>;

export const TransactionLineSchema = z.object({
  sku: z.string().min(1).max(60),
  description: z.string().min(1).max(300),
  qty: z.number().positive(),
  unitPrice: z.number().nonnegative(),
});
export type TransactionLineInput = z.infer<typeof TransactionLineSchema>;

export const SaleCreateSchema = z.object({
  tillSessionId: z.string().uuid(),
  customerId: z.string().uuid().optional().nullable(),
  paymentMethod: z.string().min(1).max(40),
  lines: z.array(TransactionLineSchema).min(1),
  taxRate: z.number().min(0).max(1).default(0),
});
export type SaleCreate = z.infer<typeof SaleCreateSchema>;

export const RefundCreateSchema = z.object({
  tillSessionId: z.string().uuid(),
  voidOfTransactionId: z.string().uuid(),
  reasonCode: z.string().min(1).max(50),
  approvedByUserId: z.string().uuid(),
  amount: z.number().positive(),
});
export type RefundCreate = z.infer<typeof RefundCreateSchema>;

export const VoidCreateSchema = z.object({
  tillSessionId: z.string().uuid(),
  voidOfTransactionId: z.string().uuid(),
  reasonCode: z.string().min(1).max(50),
  approvedByUserId: z.string().uuid(),
});
export type VoidCreate = z.infer<typeof VoidCreateSchema>;

export const PayInOutSchema = z.object({
  tillSessionId: z.string().uuid(),
  type: z.enum(['payin', 'payout', 'expense']),
  amount: z.number().positive(),
  reason: z.string().min(1).max(200),
});
export type PayInOut = z.infer<typeof PayInOutSchema>;
