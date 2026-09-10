import { getMarket } from '../config/markets.js';
import {
  getOperatorCredentials,
  isOperationConfigured,
} from '../config/provider-credentials.js';
import type { CountryCode, PaymentStatus, ProviderTransaction } from '../domain/payments.js';
import { providerMsisdn } from '../utils/msisdn.js';
import type { PaymentProviderAdapter, ProviderContext } from './types.js';
import { joinUrl, ProviderHttpError, responsePayload } from './http.js';

type Product = 'collection' | 'disbursement';
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function normalizedStatus(value: unknown): PaymentStatus {
  const status = String(value ?? '').toUpperCase();
  if (status === 'SUCCESSFUL') return 'SUCCESSFUL';
  if (status === 'FAILED' || status === 'REJECTED') return 'FAILED';
  if (status === 'CANCELLED') return 'CANCELLED';
  return 'PENDING';
}

export class MtnMoMoAdapter implements PaymentProviderAdapter {
  readonly provider = 'mtn' as const;

  supports(country: CountryCode): boolean {
    return getMarket(country).providers.some((item) => item.provider === 'mtn' && item.enabled)
      && isOperationConfigured('mtn', country, 'collection');
  }

  supportsOperation(country: CountryCode, operation: 'collection' | 'payout' | 'balance'): boolean {
    const listed = getMarket(country).providers.some((item) => item.provider === 'mtn' && item.enabled);
    if (!listed) return false;
    if (operation === 'payout') return isOperationConfigured('mtn', country, 'payout');
    return isOperationConfigured('mtn', country, 'collection');
  }

  private async token(country: CountryCode, product: Product): Promise<string> {
    const key = `${country}:${product}`;
    const cache = tokenCache.get(key);
    if (cache && cache.expiresAt > Date.now() + 60_000) return cache.token;

    const credentials = getOperatorCredentials('mtn', country);
    const subscriptionKey = product === 'collection'
      ? credentials.subscriptionKey
      : credentials.disbursementSubscriptionKey;
    if (!subscriptionKey) throw new Error(`MTN ${product} subscription key is not configured for ${country}`);

    const basic = Buffer.from(`${credentials.apiUser}:${credentials.apiKey}`).toString('base64');
    const response = await fetch(joinUrl(credentials.baseUrl, `/${product}/token/`), {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Ocp-Apim-Subscription-Key': subscriptionKey,
      },
    });
    const payload = await responsePayload(response);
    if (!response.ok) throw new ProviderHttpError('mtn', response.status, JSON.stringify(payload));

    const data = payload as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new Error('MTN token response did not include access_token');
    const expiresIn = Number(data.expires_in ?? 3600);
    tokenCache.set(key, { token: data.access_token, expiresAt: Date.now() + expiresIn * 1000 });
    return data.access_token;
  }

  async collect(
    context: ProviderContext,
    input: Parameters<PaymentProviderAdapter['collect']>[1],
    providerReference: string,
  ): Promise<ProviderTransaction> {
    const credentials = getOperatorCredentials('mtn', context.country);
    const token = await this.token(context.country, 'collection');
    const callbackUrl = `${credentials.callbackUrl}/${encodeURIComponent(providerReference)}`;
    const phone = providerMsisdn(input.phone, context.country, credentials.msisdnMode);
    const body = {
      amount: input.money.amount,
      currency: context.currency,
      externalId: input.externalId,
      payer: { partyIdType: 'MSISDN', partyId: phone },
      payerMessage: input.description ?? `${input.product} payment`,
      payeeNote: `${input.product}:${input.externalId}`,
    };

    const response = await fetch(joinUrl(credentials.baseUrl, '/collection/v1_0/requesttopay'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': credentials.subscriptionKey ?? '',
        'X-Reference-Id': providerReference,
        'X-Target-Environment': credentials.targetEnvironment ?? 'sandbox',
        'X-Callback-Url': callbackUrl,
      },
      body: JSON.stringify(body),
    });
    const payload = await responsePayload(response);
    if (response.status !== 202) throw new ProviderHttpError('mtn', response.status, JSON.stringify(payload));
    return { provider: 'mtn', country: context.country, providerReference, status: 'PENDING', raw: payload };
  }

  async getStatus(
    context: ProviderContext,
    providerReference: string,
  ): Promise<{ status: PaymentStatus; raw?: unknown }> {
    const credentials = getOperatorCredentials('mtn', context.country);
    const token = await this.token(context.country, 'collection');
    const response = await fetch(
      joinUrl(credentials.baseUrl, `/collection/v1_0/requesttopay/${encodeURIComponent(providerReference)}`),
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Ocp-Apim-Subscription-Key': credentials.subscriptionKey ?? '',
          'X-Target-Environment': credentials.targetEnvironment ?? 'sandbox',
        },
      },
    );
    const payload = await responsePayload(response);
    if (!response.ok) throw new ProviderHttpError('mtn', response.status, JSON.stringify(payload));
    return { status: normalizedStatus((payload as { status?: unknown }).status), raw: payload };
  }

  async payout(
    context: ProviderContext,
    input: NonNullable<Parameters<NonNullable<PaymentProviderAdapter['payout']>>[1]>,
    providerReference: string,
  ): Promise<ProviderTransaction> {
    const credentials = getOperatorCredentials('mtn', context.country);
    const token = await this.token(context.country, 'disbursement');
    const phone = providerMsisdn(input.phone, context.country, credentials.msisdnMode);
    const callbackUrl = `${credentials.callbackUrl}/payout/${encodeURIComponent(providerReference)}`;
    const body = {
      amount: input.money.amount,
      currency: context.currency,
      externalId: input.externalId,
      payee: { partyIdType: 'MSISDN', partyId: phone },
      payerMessage: input.description ?? `${input.product} payout`,
      payeeNote: `${input.product}:${input.externalId}`,
    };

    const response = await fetch(joinUrl(credentials.baseUrl, '/disbursement/v1_0/transfer'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': credentials.disbursementSubscriptionKey ?? '',
        'X-Reference-Id': providerReference,
        'X-Target-Environment': credentials.targetEnvironment ?? 'sandbox',
        'X-Callback-Url': callbackUrl,
      },
      body: JSON.stringify(body),
    });
    const payload = await responsePayload(response);
    if (response.status !== 202) throw new ProviderHttpError('mtn', response.status, JSON.stringify(payload));
    return { provider: 'mtn', country: context.country, providerReference, status: 'PENDING', raw: payload };
  }

  async getPayoutStatus(
    context: ProviderContext,
    providerReference: string,
  ): Promise<{ status: PaymentStatus; raw?: unknown }> {
    const credentials = getOperatorCredentials('mtn', context.country);
    const token = await this.token(context.country, 'disbursement');
    const response = await fetch(
      joinUrl(credentials.baseUrl, `/disbursement/v1_0/transfer/${encodeURIComponent(providerReference)}`),
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Ocp-Apim-Subscription-Key': credentials.disbursementSubscriptionKey ?? '',
          'X-Target-Environment': credentials.targetEnvironment ?? 'sandbox',
        },
      },
    );
    const payload = await responsePayload(response);
    if (!response.ok) throw new ProviderHttpError('mtn', response.status, JSON.stringify(payload));
    return { status: normalizedStatus((payload as { status?: unknown }).status), raw: payload };
  }

  async getBalance(
    context: ProviderContext,
    account: 'collection' | 'disbursement',
  ): Promise<{ available: string; currency: string; raw?: unknown }> {
    if (account === 'disbursement' && !isOperationConfigured('mtn', context.country, 'payout')) {
      throw new Error(`MTN disbursement is not configured for ${context.country}`);
    }
    const credentials = getOperatorCredentials('mtn', context.country);
    const token = await this.token(context.country, account);
    const subscriptionKey = account === 'collection'
      ? credentials.subscriptionKey
      : credentials.disbursementSubscriptionKey;
    const response = await fetch(joinUrl(credentials.baseUrl, `/${account}/v1_0/account/balance`), {
      headers: {
        Authorization: `Bearer ${token}`,
        'Ocp-Apim-Subscription-Key': subscriptionKey ?? '',
        'X-Target-Environment': credentials.targetEnvironment ?? 'sandbox',
      },
    });
    const payload = await responsePayload(response);
    if (!response.ok) throw new ProviderHttpError('mtn', response.status, JSON.stringify(payload));
    const data = payload as { availableBalance?: unknown; currency?: unknown };
    return {
      available: String(data.availableBalance ?? '0'),
      currency: String(data.currency ?? context.currency),
      raw: payload,
    };
  }
}
