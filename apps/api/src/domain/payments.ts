export type CountryCode =
  | 'UG'
  | 'KE'
  | 'TZ'
  | 'RW'
  | 'ZM'
  | 'MW'
  | 'GH'
  | 'CM'
  | 'CI'
  | 'BJ'
  | 'CG'
  | 'SZ'
  | 'GN'
  | 'LR'
  | 'SS'
  | 'ZA'
  | 'NG'
  | 'CD'
  | 'GA'
  | 'TD'
  | 'NE'
  | 'MG'
  | 'SC';

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
