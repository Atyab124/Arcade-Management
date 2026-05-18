export const UserRole = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  STAFF: 'staff',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const MembershipType = {
  WALK_IN: 'walk_in',
  BASIC: 'basic',
  PREMIUM: 'premium',
  VIP: 'vip',
} as const;
export type MembershipType = (typeof MembershipType)[keyof typeof MembershipType];

export const ConsentChannel = {
  WHATSAPP: 'whatsapp',
  EMAIL: 'email',
  SMS: 'sms',
} as const;
export type ConsentChannel = (typeof ConsentChannel)[keyof typeof ConsentChannel];

export const ConsentAction = {
  OPT_IN: 'opt_in',
  OPT_OUT: 'opt_out',
} as const;
export type ConsentAction = (typeof ConsentAction)[keyof typeof ConsentAction];

export const TransactionType = {
  SALE: 'sale',
  REFUND: 'refund',
  VOID: 'void',
  PAYIN: 'payin',
  PAYOUT: 'payout',
  EXPENSE: 'expense',
} as const;
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export const TillStatus = {
  OPEN: 'open',
  CLOSED: 'closed',
  RECONCILED: 'reconciled',
} as const;
export type TillStatus = (typeof TillStatus)[keyof typeof TillStatus];

export const CardBucket = {
  CREDITS: 'credits',
  BONUS: 'bonus',
  TIME: 'time',
  TICKETS: 'tickets',
} as const;
export type CardBucket = (typeof CardBucket)[keyof typeof CardBucket];

export const BookingPaymentState = {
  PENDING: 'pending',
  DEPOSIT_PAID: 'deposit_paid',
  BALANCE_DUE: 'balance_due',
  FULLY_PAID: 'fully_paid',
  REFUNDED: 'refunded',
  OVERPAID: 'overpaid',
} as const;
export type BookingPaymentState = (typeof BookingPaymentState)[keyof typeof BookingPaymentState];

export const LedgerEventType = {
  EARN: 'EARN',
  REDEEM: 'REDEEM',
  ADJUST: 'ADJUST',
  EXPIRE: 'EXPIRE',
  REVERSAL: 'REVERSAL',
} as const;
export type LedgerEventType = (typeof LedgerEventType)[keyof typeof LedgerEventType];

export const MachineStatus = {
  IN_SERVICE: 'in_service',
  OUT_OF_SERVICE: 'out_of_service',
  DECOMMISSIONED: 'decommissioned',
} as const;
export type MachineStatus = (typeof MachineStatus)[keyof typeof MachineStatus];

export const WaTemplateCategory = {
  MARKETING: 'marketing',
  UTILITY: 'utility',
  AUTH: 'auth',
} as const;
export type WaTemplateCategory = (typeof WaTemplateCategory)[keyof typeof WaTemplateCategory];

export const WaMessageStatus = {
  QUEUED: 'queued',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed',
} as const;
export type WaMessageStatus = (typeof WaMessageStatus)[keyof typeof WaMessageStatus];

export const WaMessageDirection = {
  IN: 'in',
  OUT: 'out',
} as const;
export type WaMessageDirection = (typeof WaMessageDirection)[keyof typeof WaMessageDirection];
