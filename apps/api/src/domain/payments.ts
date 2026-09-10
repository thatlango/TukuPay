export type CountryCode = string;

export type ProviderCode = 'mtn' | 'airtel';

export type PaymentStatus =
  | 'CREATED'
  | 'PENDING'
  | 'SUCCESSFUL'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';

export type Money = {
  amount: string;
  currency: string;
};

export type CreatePaymentInput = {
  product: string;
  externalId: string;
  /** ISO 3166-1 alpha-2 country code, e.g. UG, RW, ZM. */
  country: CountryCode;
  provider?: ProviderCode;
  money: Money;
  phone: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

export type ProviderTransaction = {
  provider: ProviderCode;
  country: CountryCode;
  providerReference: string;
  status: PaymentStatus;
  raw?: unknown;
};
