import { getMarket } from '../config/markets.js';
import type { CountryCode, ProviderCode } from '../domain/payments.js';
import { TukuPayError } from '../errors.js';
import type { PaymentProviderAdapter } from '../providers/types.js';

export class ProviderRouter {
  constructor(private readonly adapters: PaymentProviderAdapter[]) {}

  resolve(country: CountryCode, requestedProvider?: ProviderCode): PaymentProviderAdapter {
    const market = getMarket(country);
    const supported = market.providers.filter((item) => item.enabled);

    if (requestedProvider) {
      const marketProvider = supported.find((item) => item.provider === requestedProvider);
      if (!marketProvider) {
        throw new TukuPayError(
          `${requestedProvider} is not supported for ${country}`,
          'PROVIDER_NOT_SUPPORTED',
          400,
        );
      }
      const adapter = this.adapters.find(
        (candidate) => candidate.provider === requestedProvider && candidate.supports(country),
      );
      if (!adapter) {
        throw new TukuPayError(
          `${requestedProvider} is not configured for ${country}`,
          'PROVIDER_NOT_CONFIGURED',
          503,
        );
      }
      return adapter;
    }

    const available = supported
      .map((item) => this.adapters.find(
        (candidate) => candidate.provider === item.provider && candidate.supports(country),
      ))
      .filter((adapter): adapter is PaymentProviderAdapter => Boolean(adapter));

    if (available.length === 1) return available[0]!;
    if (available.length > 1) {
      throw new TukuPayError(
        `Provider is required for ${country}; more than one mobile money rail is configured`,
        'PROVIDER_REQUIRED',
        400,
      );
    }

    throw new TukuPayError(
      `No mobile money provider is configured for ${country}`,
      'NO_PROVIDER_AVAILABLE',
      503,
    );
  }
}
