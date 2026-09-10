import { getMarket } from '../config/markets.js';
import type { CountryCode, ProviderCode } from '../domain/payments.js';
import type { PaymentProviderAdapter } from '../providers/types.js';

type ProviderOperation = 'collection' | 'payout' | 'balance';

export class ProviderRouter {
  constructor(private readonly adapters: PaymentProviderAdapter[]) {}

  resolve(country: CountryCode, requestedProvider?: ProviderCode): PaymentProviderAdapter {
    return this.resolveFor(country, 'collection', requestedProvider);
  }

  resolvePayout(country: CountryCode, requestedProvider?: ProviderCode): PaymentProviderAdapter {
    return this.resolveFor(country, 'payout', requestedProvider);
  }

  resolveBalance(country: CountryCode, requestedProvider: ProviderCode): PaymentProviderAdapter {
    return this.resolveFor(country, 'balance', requestedProvider);
  }

  private resolveFor(
    country: CountryCode,
    operation: ProviderOperation,
    requestedProvider?: ProviderCode,
  ): PaymentProviderAdapter {
    const market = getMarket(country);
    const enabled = market.providers.filter((item) => item.enabled);

    const candidateSupports = (candidate: PaymentProviderAdapter): boolean => {
      if (!candidate.supports(country)) return false;
      return candidate.supportsOperation
        ? candidate.supportsOperation(country, operation)
        : operation === 'collection';
    };

    if (requestedProvider) {
      const configured = enabled.find((item) => item.provider === requestedProvider);
      if (!configured) throw new Error(`${requestedProvider} is not enabled for ${country}`);

      const adapter = this.adapters.find(
        (candidate) => candidate.provider === requestedProvider && candidateSupports(candidate),
      );
      if (!adapter) {
        throw new Error(`No ${requestedProvider} ${operation} adapter is available for ${country}`);
      }
      return adapter;
    }

    for (const item of enabled) {
      const adapter = this.adapters.find(
        (candidate) => candidate.provider === item.provider && candidateSupports(candidate),
      );
      if (adapter) return adapter;
    }

    throw new Error(`No ${operation} provider is available for ${country}`);
  }
}
