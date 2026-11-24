import { getMarket } from './markets.js';
import { providerUrl, providerMode, msisdnMode as parseMsisdnMode, airtelVersion, operatorPath, mtnTargetEnvironment } from './provider-settings.js';
import { configuredEnvironment, verifyOperatorMode } from './financial-environment.js';
import type { CountryCode, ProviderCode } from '../domain/payments.js';
import type { MsisdnMode } from '../utils/msisdn.js';

export type Operation = 'collection' | 'payout' | 'balance';

export type OperatorCredentials = {
  provider: ProviderCode;
  country: CountryCode;
  baseUrl: string;
  callbackUrl: string;
  mode: 'sandbox' | 'production';
  targetEnvironment: string | undefined;
  subscriptionKey: string | undefined;
  disbursementSubscriptionKey: string | undefined;
  apiUser: string | undefined;
  apiKey: string | undefined;
  clientId: string | undefined;
  clientSecret: string | undefined;
  apiVersion: number;
  msisdnMode: MsisdnMode;
  airtelDisbursementPath: string | undefined;
  airtelDisbursementStatusPath: string | undefined;
  airtelBalancePath: string | undefined;
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
  return providerMode(optional(name+'_MODE'),baseUrl);
}

export function simulatorEnabled(): boolean {
  return (process.env.TUKUPAY_SIMULATOR_ENABLED ?? 'false').toLowerCase() === 'true';
}

export function providerUsesOperatorSandbox(
  provider: ProviderCode,
  country: CountryCode,
): boolean {
  if (simulatorEnabled() || provider !== 'mtn') return false;
  const p = prefix(provider, country);
  const baseUrl = optional(`${p}_BASE_URL`);
  return Boolean(baseUrl && modeFor(p, baseUrl) === 'sandbox');
}

export function providerTransactionCurrency(
  provider: ProviderCode,
  country: CountryCode,
  marketCurrency: string,
): string {
  const normalizedMarketCurrency = marketCurrency.toUpperCase();
  if (!providerUsesOperatorSandbox(provider, country)) return normalizedMarketCurrency;

  const p = prefix(provider, country);
  return (optional(`${p}_SANDBOX_CURRENCY`) ?? 'EUR').toUpperCase();
}

export function providerRuntimeMode(
  provider: ProviderCode,
  country: CountryCode,
): 'sandbox' | 'production' {
  if (simulatorEnabled()) return 'sandbox';
  return getOperatorCredentials(provider, country).mode;
}

export function isOperationConfigured(
  provider: ProviderCode,
  country: CountryCode,
  operation: Operation,
): boolean {
  if (simulatorEnabled()) return true;

  const p = prefix(provider, country);
  const common = provider === 'mtn'
    ? [`${p}_BASE_URL`, `${p}_CALLBACK_URL`, `${p}_TARGET_ENVIRONMENT`, `${p}_API_USER`, `${p}_API_KEY`]
    : [`${p}_BASE_URL`, `${p}_CALLBACK_URL`, `${p}_CLIENT_ID`, `${p}_CLIENT_SECRET`];

  const operationSpecific = provider === 'mtn'
    ? operation === 'payout'
      ? [`${p}_DISBURSEMENT_SUBSCRIPTION_KEY`]
      : [`${p}_COLLECTION_SUBSCRIPTION_KEY`]
    : operation === 'payout'
      ? [`${p}_DISBURSEMENT_PATH`, `${p}_DISBURSEMENT_STATUS_PATH`]
      : [];

  if (![...common,...operationSpecific].every(name=>Boolean(process.env[name]?.trim()))) return false;
  try { getOperatorCredentials(provider,country); return true; } catch { return false; }
}

export function isOperatorConfigured(provider: ProviderCode, country: CountryCode): boolean {
  return isOperationConfigured(provider, country, 'collection');
}

export function getOperatorCredentials(
  provider: ProviderCode,
  country: CountryCode,
): OperatorCredentials {
  const p = prefix(provider, country);
  const rawUrl = required(`${p}_BASE_URL`);
  const mode = modeFor(p, rawUrl);
  const baseUrl = providerUrl(rawUrl,mode,`${p}_BASE_URL`);
  verifyOperatorMode(configuredEnvironment(), mode);
  const msisdnMode = parseMsisdnMode(optional(`${p}_MSISDN_MODE`),provider==='mtn'?'e164':'local');

  if (provider === 'mtn') {
    return {
      provider,
      country,
      baseUrl,
      callbackUrl: providerUrl(required(`${p}_CALLBACK_URL`),mode,`${p}_CALLBACK_URL`),
      mode,
      targetEnvironment: mtnTargetEnvironment(mode,required(`${p}_TARGET_ENVIRONMENT`),getMarket(country).providers.find(item=>item.provider==='mtn'&&item.enabled)?.targetEnvironment),
      subscriptionKey: optional(`${p}_COLLECTION_SUBSCRIPTION_KEY`),
      disbursementSubscriptionKey: optional(`${p}_DISBURSEMENT_SUBSCRIPTION_KEY`),
      apiUser: required(`${p}_API_USER`),
      apiKey: required(`${p}_API_KEY`),
      clientId: undefined,
      clientSecret: undefined,
      apiVersion: 1,
      msisdnMode,
      airtelDisbursementPath: undefined,
      airtelDisbursementStatusPath: undefined,
      airtelBalancePath: undefined,
    };
  }

  const version = airtelVersion(optional(`${p}_API_VERSION`));
  return {
    provider,
    country,
    baseUrl,
    callbackUrl: providerUrl(required(`${p}_CALLBACK_URL`),mode,`${p}_CALLBACK_URL`),
    mode,
    targetEnvironment: optional(`${p}_TARGET_ENVIRONMENT`),
    subscriptionKey: undefined,
    disbursementSubscriptionKey: undefined,
    apiUser: undefined,
    apiKey: undefined,
    clientId: required(`${p}_CLIENT_ID`),
    clientSecret: required(`${p}_CLIENT_SECRET`),
    apiVersion: version,
    msisdnMode,
    airtelDisbursementPath: operatorPath(optional(`${p}_DISBURSEMENT_PATH`)),
    airtelDisbursementStatusPath: operatorPath(optional(`${p}_DISBURSEMENT_STATUS_PATH`)),
    airtelBalancePath: operatorPath(optional(`${p}_BALANCE_PATH`)),
  };
}
