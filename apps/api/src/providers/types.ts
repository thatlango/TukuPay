import type {
  CountryCode,
  CreatePaymentInput,
  PaymentStatus,
  ProviderCode,
  ProviderTransaction,
} from '../domain/payments.js';
import type { CreatePayoutInput } from '../domain/payouts.js';

export type ProviderContext = {
  country: CountryCode;
  currency: string;
};

export interface PaymentProviderAdapter {
  readonly provider: ProviderCode;

  supports(country: CountryCode): boolean;
  supportsOperation?(country: CountryCode, operation: 'collection' | 'payout' | 'balance'): boolean;

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
    input: CreatePayoutInput,
    providerReference: string,
  ): Promise<ProviderTransaction>;

  getPayoutStatus?(
    context: ProviderContext,
    providerReference: string,
  ): Promise<{ status: PaymentStatus; raw?: unknown }>;

  getBalance?(
    context: ProviderContext,
    account: 'collection' | 'disbursement',
  ): Promise<{ available: string; currency: string; raw?: unknown }>;
}
