import type { ProviderCode } from '../domain/payments.js';
import { simulatorEnabled, providerRuntimeMode } from './provider-credentials.js';
import { callbackMode } from '../providers/webhook-policy.js';
import type { ProviderRouter } from '../services/provider-router.js';
import { MARKETS } from './markets.js';

export const CANDIDATE_RAILS = [
  { provider: 'mpesa', initialCountry: 'KE', status: 'planned' },
  { provider: 'paystack', initialCountry: null, status: 'planned' },
  { provider: 'flutterwave', initialCountry: null, status: 'planned' },
  { provider: 'wave', initialCountry: null, status: 'planned' },
  { provider: 'orange', initialCountry: null, status: 'planned' },
] as const;

type MarketRow = { country_code: string; provider_code: ProviderCode; environment: string; enabled: boolean };

export function describeCapabilities(router: ProviderRouter, rows: MarketRow[]) {
  const simulator = simulatorEnabled();
  const markets = Object.values(MARKETS).map(market => ({
    country: market.country, currency: market.currency,
    providers: market.providers.map(item => {
      const provider = item.provider;
      const configured = (operation: 'collection' | 'payout' | 'balance') => {
        try {
          if (operation === 'collection') router.resolve(market.country, provider);
          else if (operation === 'payout') router.resolvePayout(market.country, provider);
          else router.resolveBalance(market.country, provider);
          return true;
        } catch { return false; }
      };
      const collection = configured('collection');
      const payout = configured('payout');
      const balance = configured('balance');
      let environment: 'sandbox' | 'production' | null = null;
      try { environment = providerRuntimeMode(provider, market.country); } catch { /* unconfigured */ }
      const marketEnabled = environment !== null && rows.some(row => row.country_code === market.country
        && row.provider_code === provider && row.environment === environment && row.enabled);
      return { provider, environment, marketEnabled,
        runtime: simulator ? 'simulator' : 'operator',
        collection: { configured: collection, available: marketEnabled && collection },
        payout: { configured: payout, available: marketEnabled && payout &&
          (environment !== 'production' || process.env.TUKUPAY_LIVE_PAYOUTS_ENABLED === 'true') },
        balance: { configured: balance, available: marketEnabled && balance },
        callbacks: environment && marketEnabled ? callbackMode(provider, market.country, environment) : 'disabled',
      };
    }),
  }));
  return { simulator, markets, candidates: CANDIDATE_RAILS, note: 'Configuration and database flags are not evidence of commercial certification or live connectivity.' };
}
