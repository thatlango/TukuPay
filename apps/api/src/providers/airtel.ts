import { getMarket } from '../config/markets.js';
import {
  getOperatorCredentials,
  isOperationConfigured,
} from '../config/provider-credentials.js';
import type { CountryCode, PaymentStatus, ProviderTransaction } from '../domain/payments.js';
import { providerMsisdn } from '../utils/msisdn.js';
import type { PaymentProviderAdapter, ProviderContext } from './types.js';
import { joinUrl, ProviderHttpError, responsePayload } from './http.js';

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

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

  private async token(country: CountryCode): Promise<string> {
    const cache = tokenCache.get(country);
    if (cache && cache.expiresAt > Date.now() + 60_000) return cache.token;

    const credentials = getOperatorCredentials('airtel', country);
    const response = await fetch(joinUrl(credentials.baseUrl, '/auth/oauth2/token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: '*/*' },
      body: JSON.stringify({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        grant_type: 'client_credentials',
      }),
    });
    const payload = await responsePayload(response);
    if (!response.ok) {
      throw new ProviderHttpError('airtel', response.status, JSON.stringify(payload));
    }

    const data = payload as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new Error('Airtel token response did not include access_token');
    const expiresIn = Number(data.expires_in ?? 3600);
    tokenCache.set(country, { token: data.access_token, expiresAt: Date.now() + expiresIn * 1000 });
    return data.access_token;
  }

  async collect(
    context: ProviderContext,
    input: Parameters<PaymentProviderAdapter['collect']>[1],
    providerReference: string,
  ): Promise<ProviderTransaction> {
    const credentials = getOperatorCredentials('airtel', context.country);
    const token = await this.token(context.country);
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

    const response = await fetch(
      joinUrl(credentials.baseUrl, `/merchant/v${credentials.apiVersion}/payments/`),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: '*/*',
          'X-Country': context.country,
          'X-Currency': context.currency,
        },
        body: JSON.stringify(body),
      },
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
    const token = await this.token(context.country);
    const response = await fetch(
      joinUrl(credentials.baseUrl, `/standard/v1/payments/${encodeURIComponent(providerReference)}`),
      {
        headers: {
          Authorization: `Bearer ${token}`,
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
  ): Promise<{ available: string; currency: string; raw?: unknown }> {
    const credentials = getOperatorCredentials('airtel', context.country);
    if (!credentials.airtelBalancePath) {
      throw new Error(`Airtel balance endpoint is not configured for ${context.country}`);
    }
    const token = await this.token(context.country);
    const response = await fetch(joinUrl(credentials.baseUrl, credentials.airtelBalancePath), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: '*/*',
        'X-Country': context.country,
        'X-Currency': context.currency,
      },
    });
    const payload = await responsePayload(response);
    if (!response.ok) throw new ProviderHttpError('airtel', response.status, JSON.stringify(payload));
    const root = payload as { data?: { balance?: unknown }; balance?: unknown; currency?: unknown };
    return {
      available: String(root.data?.balance ?? root.balance ?? '0'),
      currency: String(root.currency ?? context.currency),
      raw: payload,
    };
  }
}
