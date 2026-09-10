import type { CountryCode, Money, PaymentStatus, ProviderCode } from './payments.js';

export type PayoutStatus =
  | 'APPROVAL_REQUIRED'
  | 'APPROVED'
  | 'PENDING'
  | 'SUCCESSFUL'
  | 'FAILED'
  | 'CANCELLED';

export type CreatePayoutInput = {
  product: string;
  externalId: string;
  country: CountryCode;
  provider?: ProviderCode;
  money: Money;
  phone: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

export type ProviderPayoutStatus = Extract<
  PaymentStatus,
  'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'CANCELLED'
>;
