import { validateBalance } from './balance-validation.js';
import type { TransportScope } from './telemetry.js';
import { getMarket } from '../config/markets.js';
import {
  getOperatorCredentials,
  isOperationConfigured,
} from '../config/provider-credentials.js';
import type { CountryCode, PaymentStatus, ProviderTransaction } from '../domain/payments.js';
import { providerMsisdn } from '../utils/msisdn.js';
import type { PaymentProviderAdapter, ProviderContext } from './types.js';
import { joinUrl, providerFetch, ProviderHttpError, responsePayload } from './http.js';
import { authorizedProviderFetch, credentialKey, parseToken, TokenCache } from './tokens.js';

const tokenCache = new TokenCache();

function statusFromPayload(payload: unknown): PaymentStatus {
  const root = payload as {
    data?: { transaction?: { status?: unknown } };
    transaction?: { status?: unknown };
  };
  const raw = root?.data?.transaction?.status ?? root?.transaction?.status;
  const status = String(raw ?? '').toUpperCase();
  if (['TS', 'SUCCESS', 'SUCCESSFUL', 'COMPLETED'].includes(status)) return 'SUCCESSFUL';
  if (['TF', 'FAILED', 'FAILURE', 'REJECTED'].includes(status)) return 'FAILED';
  if (['CANCELLED', 'CANCELED'].includes(status)) return 'CANCELLED';
  return 'PENDING';
}

export class AirtelMoneyAdapter implements PaymentProviderAdapter {
  readonly provider = 'airtel' as const;

  supports(country: CountryCode): boolean {
    return getMarket(country).providers.some((item) => item.provider === 'airtel' && item.enabled)
      && isOperationConfigured('airtel', country, 'collection');
  }

  supportsOperation(country: CountryCode, operation: 'collection' | 'payout' | 'balance'): boolean {
    const listed = getMarket(country).providers.some((item) => item.provider === 'airtel' && item.enabled);
    if (!listed || !isOperationConfigured('airtel', country, 'collection')) return false;
    if (operation === 'collection') return true;
    const credentials = getOperatorCredentials('airtel', country);
    // Airtel Uganda disbursement stays deliberately disabled until the current
    // portal contract confirms its signing/encryption requirements and paths.
    if (operation === 'payout') return false;
    return Boolean(credentials.airtelBalancePath);
  }

  private async authorizedFetch(country: CountryCode, url: string, init: RequestInit = {}, operation: TransportScope['operation'] = 'status'): Promise<Response> {
    const credentials = getOperatorCredentials('airtel', country);
    const key = credentialKey(['airtel', country, credentials.baseUrl, credentials.mode, credentials.clientId, credentials.clientSecret]);
    return authorizedProviderFetch(tokenCache, key, async () => {
      const response = await providerFetch(joinUrl(credentials.baseUrl, '/auth/oauth2/token'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: '*/*' },
        body: JSON.stringify({
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          grant_type: 'client_credentials',
        }),
      }, { provider: 'airtel', country, operation: 'token' });
      const payload = await responsePayload(response);
      if (!response.ok) {
        throw new ProviderHttpError('airtel', response.status, 'Token acquisition rejected');
      }
      return parseToken(payload);
    }, url, init, { provider: 'airtel', country, operation });
  }

  async collect(
    context: ProviderContext,
    input: Parameters<PaymentProviderAdapter['collect']>[1],
    providerReference: string,
  ): Promise<ProviderTransaction> {
    const credentials = getOperatorCredentials('airtel', context.country);
    const phone = providerMsisdn(input.phone, context.country, credentials.msisdnMode);
    const body = {
      reference: input.externalId,
      subscriber: {
        country: context.country,
        currency: context.currency,
        msisdn: phone,
      },
      transaction: {
        amount: Number(input.money.amount),
        country: context.country,
        currency: context.currency,
        id: providerReference,
      },
    };

    const response = await this.authorizedFetch(context.country, 
      joinUrl(credentials.baseUrl, `/merchant/v${credentials.apiVersion}/payments/`),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: '*/*',
          'X-Country': context.country,
          'X-Currency': context.currency,
        },
        body: JSON.stringify(body),
      }, 'collection',
    );
    const payload = await responsePayload(response);
    if (!response.ok) {
      throw new ProviderHttpError('airtel', response.status, JSON.stringify(payload));
    }

    return {
      provider: 'airtel',
      country: context.country,
      providerReference,
      status: statusFromPayload(payload),
      raw: payload,
    };
  }

  async getStatus(
    context: ProviderContext,
    providerReference: string,
  ): Promise<{ status: PaymentStatus; raw?: unknown }> {
    const credentials = getOperatorCredentials('airtel', context.country);
    const response = await this.authorizedFetch(context.country, 
      joinUrl(credentials.baseUrl, `/standard/v1/payments/${encodeURIComponent(providerReference)}`),
      {
        headers: {
          Accept: '*/*',
          'X-Country': context.country,
          'X-Currency': context.currency,
        },
      },
    );
    const payload = await responsePayload(response);
    if (!response.ok) {
      throw new ProviderHttpError('airtel', response.status, JSON.stringify(payload));
    }
    return { status: statusFromPayload(payload), raw: payload };
  }

  async getBalance(
    context: ProviderContext,
    account: 'collection' | 'disbursement' = 'collection',
  ): Promise<{ available: string; currency: string; raw?: unknown }> {
    if (account !== 'collection') throw new Error('Airtel disbursement balance is not supported');
    const credentials = getOperatorCredentials('airtel', context.country);
    if (!credentials.airtelBalancePath) {
      throw new Error(`Airtel balance endpoint is not configured for ${context.country}`);
    }
    const response = await this.authorizedFetch(context.country, joinUrl(credentials.baseUrl, credentials.airtelBalancePath), {
      headers: {
        Accept: '*/*',
        'X-Country': context.country,
        'X-Currency': context.currency,
      },
    }, 'balance');
    const payload = await responsePayload(response);
    if (!response.ok) throw new ProviderHttpError('airtel', response.status, JSON.stringify(payload));
    const root = payload as { data?: { balance?: unknown; currency?: unknown }; balance?: unknown; currency?: unknown };
    return {
      ...validateBalance(root.data?.balance ?? root.balance, root.data?.currency ?? root.currency, context.currency),
      raw: payload,
    };
  }
}
