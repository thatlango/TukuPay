import type {
  CountryCode,
  CreatePaymentInput,
  PaymentStatus,
  ProviderCode,
  ProviderTransaction,
} from '../domain/payments.js';

export type ProviderContext = {
  country: CountryCode;
  currency: string;
};

export interface PaymentProviderAdapter {
  readonly provider: ProviderCode;

  supports(country: CountryCode): boolean;

  collect(
    context: ProviderContext,
    input: CreatePaymentInput,
    providerReference: string,
  ): Promise<ProviderTransaction>;

  getStatus(
    context: ProviderContext,
    providerReference: string,
  ): Promise<{ status: PaymentStatus; raw?: unknown }>;

  payout?(
    context: ProviderContext,
    input: {
      reference: string;
      amount: string;
      currency: string;
      phone: string;
      description?: string;
    },
  ): Promise<ProviderTransaction>;
}
