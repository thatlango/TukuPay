import type { CountryCode, ProviderCode } from '../domain/payments.js';

export type ProviderMarketConfig = {
  provider: ProviderCode;
  enabled: boolean;
  targetEnvironment?: string;
};

export type MarketConfig = {
  country: CountryCode;
  currency: string;
  dialCode: string;
  providers: ProviderMarketConfig[];
};

/**
 * TukuPay market registry.
 *
 * This is intentionally a routing/configuration registry, not a claim that every
 * market below is already commercially activated for Tuku. `enabled` means the
 * adapter can be configured for the market once operator onboarding is complete.
 */
export const MARKETS: Record<string, MarketConfig> = {
  UG: {
    country: 'UG',
    currency: 'UGX',
    dialCode: '256',
    providers: [
      { provider: 'mtn', enabled: true, targetEnvironment: 'mtnuganda' },
      { provider: 'airtel', enabled: true },
    ],
  },
  RW: {
    country: 'RW',
    currency: 'RWF',
    dialCode: '250',
    providers: [
      { provider: 'mtn', enabled: true, targetEnvironment: 'mtnrwanda' },
      { provider: 'airtel', enabled: true },
    ],
  },
  ZM: {
    country: 'ZM',
    currency: 'ZMW',
    dialCode: '260',
    providers: [
      { provider: 'mtn', enabled: true, targetEnvironment: 'mtnzambia' },
      { provider: 'airtel', enabled: true },
    ],
  },
  GH: {
    country: 'GH',
    currency: 'GHS',
    dialCode: '233',
    providers: [{ provider: 'mtn', enabled: true, targetEnvironment: 'mtnghana' }],
  },
  CM: {
    country: 'CM',
    currency: 'XAF',
    dialCode: '237',
    providers: [{ provider: 'mtn', enabled: true, targetEnvironment: 'mtncameroon' }],
  },
  CI: {
    country: 'CI',
    currency: 'XOF',
    dialCode: '225',
    providers: [{ provider: 'mtn', enabled: true, targetEnvironment: 'mtnivorycoast' }],
  },
  BJ: {
    country: 'BJ',
    currency: 'XOF',
    dialCode: '229',
    providers: [{ provider: 'mtn', enabled: true, targetEnvironment: 'mtnbenin' }],
  },
  CG: {
    country: 'CG',
    currency: 'XAF',
    dialCode: '242',
    providers: [
      { provider: 'mtn', enabled: true, targetEnvironment: 'mtncongo' },
      { provider: 'airtel', enabled: true },
    ],
  },
  SZ: {
    country: 'SZ',
    currency: 'SZL',
    dialCode: '268',
    providers: [{ provider: 'mtn', enabled: true, targetEnvironment: 'mtnswaziland' }],
  },
  GN: {
    country: 'GN',
    currency: 'GNF',
    dialCode: '224',
    providers: [{ provider: 'mtn', enabled: true, targetEnvironment: 'mtnguineaconakry' }],
  },
  KE: {
    country: 'KE',
    currency: 'KES',
    dialCode: '254',
    providers: [{ provider: 'airtel', enabled: true }],
  },
  TZ: {
    country: 'TZ',
    currency: 'TZS',
    dialCode: '255',
    providers: [{ provider: 'airtel', enabled: true }],
  },
  MW: {
    country: 'MW',
    currency: 'MWK',
    dialCode: '265',
    providers: [{ provider: 'airtel', enabled: true }],
  },
  CD: {
    country: 'CD',
    currency: 'CDF',
    dialCode: '243',
    providers: [{ provider: 'airtel', enabled: true }],
  },
  GA: {
    country: 'GA',
    currency: 'XAF',
    dialCode: '241',
    providers: [{ provider: 'airtel', enabled: true }],
  },
  TD: {
    country: 'TD',
    currency: 'XAF',
    dialCode: '235',
    providers: [{ provider: 'airtel', enabled: true }],
  },
  NE: {
    country: 'NE',
    currency: 'XOF',
    dialCode: '227',
    providers: [{ provider: 'airtel', enabled: true }],
  },
  MG: {
    country: 'MG',
    currency: 'MGA',
    dialCode: '261',
    providers: [{ provider: 'airtel', enabled: true }],
  },
  SC: {
    country: 'SC',
    currency: 'SCR',
    dialCode: '248',
    providers: [{ provider: 'airtel', enabled: true }],
  },
};

export function getMarket(country: CountryCode): MarketConfig {
  const market = MARKETS[country];
  if (!market) throw new Error(`Unsupported TukuPay market: ${country}`);
  return market;
}
