import type { CountryCode, ProviderCode } from '../domain/payments.js';

export type OperatorCredentials = {
  provider: ProviderCode;
  country: CountryCode;
  baseUrl: string;
  callbackUrl: string;
  targetEnvironment?: string;
  subscriptionKey?: string;
  apiUser?: string;
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export function getOperatorCredentials(
  provider: ProviderCode,
  country: CountryCode,
): OperatorCredentials {
  const prefix = `${provider.toUpperCase()}_${country}`;

  if (provider === 'mtn') {
    return {
      provider,
      country,
      baseUrl: required(`${prefix}_BASE_URL`),
      callbackUrl: required(`${prefix}_CALLBACK_URL`),
      targetEnvironment: required(`${prefix}_TARGET_ENVIRONMENT`),
      subscriptionKey: required(`${prefix}_COLLECTION_SUBSCRIPTION_KEY`),
      apiUser: required(`${prefix}_API_USER`),
      apiKey: required(`${prefix}_API_KEY`),
    };
  }

  return {
    provider,
    country,
    baseUrl: required(`${prefix}_BASE_URL`),
    callbackUrl: required(`${prefix}_CALLBACK_URL`),
    clientId: required(`${prefix}_CLIENT_ID`),
    clientSecret: required(`${prefix}_CLIENT_SECRET`),
    targetEnvironment: optional(`${prefix}_TARGET_ENVIRONMENT`),
  };
}
