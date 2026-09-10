import type { CountryCode, ProviderCode } from '../domain/payments.js';
import type { MsisdnMode } from '../utils/msisdn.js';

export type OperatorCredentials = {
  provider: ProviderCode;
  country: CountryCode;
  baseUrl: string;
  callbackUrl: string;
  mode: 'sandbox' | 'production';
  targetEnvironment: string | undefined;
  subscriptionKey: string | undefined;
  apiUser: string | undefined;
  apiKey: string | undefined;
  clientId: string | undefined;
  clientSecret: string | undefined;
  apiVersion: number;
  msisdnMode: MsisdnMode;
};

function prefix(provider: ProviderCode, country: CountryCode): string {
  return `${provider.toUpperCase()}_${country.toUpperCase()}`;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function modeFor(name: string, baseUrl: string): 'sandbox' | 'production' {
  const configured = optional(`${name}_MODE`);
  if (configured === 'production') return 'production';
  if (configured === 'sandbox') return 'sandbox';
  return /sandbox|uat/i.test(baseUrl) ? 'sandbox' : 'production';
}

export function isOperatorConfigured(provider: ProviderCode, country: CountryCode): boolean {
  const p = prefix(provider, country);
  const requiredNames = provider === 'mtn'
    ? [`${p}_BASE_URL`, `${p}_CALLBACK_URL`, `${p}_TARGET_ENVIRONMENT`, `${p}_COLLECTION_SUBSCRIPTION_KEY`, `${p}_API_USER`, `${p}_API_KEY`]
    : [`${p}_BASE_URL`, `${p}_CALLBACK_URL`, `${p}_CLIENT_ID`, `${p}_CLIENT_SECRET`];

  return requiredNames.every((name) => Boolean(process.env[name]?.trim()));
}

export function getOperatorCredentials(
  provider: ProviderCode,
  country: CountryCode,
): OperatorCredentials {
  const p = prefix(provider, country);
  const baseUrl = required(`${p}_BASE_URL`).replace(/\/$/, '');
  const msisdnMode = optional(`${p}_MSISDN_MODE`) === 'e164' ? 'e164' : 'local';

  if (provider === 'mtn') {
    return {
      provider,
      country,
      baseUrl,
      callbackUrl: required(`${p}_CALLBACK_URL`).replace(/\/$/, ''),
      mode: modeFor(p, baseUrl),
      targetEnvironment: required(`${p}_TARGET_ENVIRONMENT`),
      subscriptionKey: required(`${p}_COLLECTION_SUBSCRIPTION_KEY`),
      apiUser: required(`${p}_API_USER`),
      apiKey: required(`${p}_API_KEY`),
      clientId: undefined,
      clientSecret: undefined,
      apiVersion: 1,
      msisdnMode: optional(`${p}_MSISDN_MODE`) === 'local' ? 'local' : 'e164',
    };
  }

  const version = Number(optional(`${p}_API_VERSION`) ?? '1');
  return {
    provider,
    country,
    baseUrl,
    callbackUrl: required(`${p}_CALLBACK_URL`).replace(/\/$/, ''),
    mode: modeFor(p, baseUrl),
    targetEnvironment: optional(`${p}_TARGET_ENVIRONMENT`),
    subscriptionKey: undefined,
    apiUser: undefined,
    apiKey: undefined,
    clientId: required(`${p}_CLIENT_ID`),
    clientSecret: required(`${p}_CLIENT_SECRET`),
    apiVersion: Number.isFinite(version) && version >= 1 ? version : 1,
    msisdnMode,
  };
}
