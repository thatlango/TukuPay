import { getMarket } from '../config/markets.js';
import type { CountryCode, ProviderCode } from '../domain/payments.js';
import type { PaymentProviderAdapter } from '../providers/types.js';

export class ProviderRouter {
  constructor(private readonly adapters: PaymentProviderAdapter[]) {}

  resolve(country: CountryCode, requestedProvider?: ProviderCode): PaymentProviderAdapter {
    const market = getMarket(country);
    const enabled = market.providers.filter((item) => item.enabled);

    if (requestedProvider) {
      const configured = enabled.find((item) => item.provider === requestedProvider);
      if (!configured) {
        throw new Error(`${requestedProvider} is not enabled for ${country}`);
      }

      const adapter = this.adapters.find(
        (candidate) =>
          candidate.provider === requestedProvider && candidate.supports(country),
      );

      if (!adapter) {
        throw new Error(`No ${requestedProvider} adapter is available for ${country}`);
      }

      return adapter;
    }

    for (const item of enabled) {
      const adapter = this.adapters.find(
        (candidate) => candidate.provider === item.provider && candidate.supports(country),
      );
      if (adapter) return adapter;
    }

    throw new Error(`No payment provider is available for ${country}`);
  }
}
