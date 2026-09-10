import { getMarket } from '../config/markets.js';
import { getOperatorCredentials, isOperatorConfigured } from '../config/provider-credentials.js';
import type { CountryCode, PaymentStatus, ProviderTransaction } from '../domain/payments.js';
import { providerMsisdn } from '../utils/msisdn.js';
import type { PaymentProviderAdapter, ProviderContext } from './types.js';
import { joinUrl, ProviderHttpError, responsePayload } from './http.js';

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
    const market = getMarket(country);
    return market.providers.some((item) => item.provider === 'mtn' && item.enabled)
      && isOperatorConfigured('mtn', country);
  }

  private async token(country: CountryCode): Promise<string> {
    const cache = tokenCache.get(country);
    if (cache && cache.expiresAt > Date.now() + 60_000) return cache.token;

    const credentials = getOperatorCredentials('mtn', country);
    const basic = Buffer.from(`${credentials.apiUser}:${credentials.apiKey}`).toString('base64');
    const response = await fetch(joinUrl(credentials.baseUrl, '/collection/token/'), {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Ocp-Apim-Subscription-Key': credentials.subscriptionKey ?? '',
      },
    });
    const payload = await responsePayload(response);
    if (!response.ok) {
      throw new ProviderHttpError('mtn', response.status, JSON.stringify(payload));
    }

    const data = payload as { access_token?: string; expires_in?: number };
    if (!data.access_token) throw new Error('MTN token response did not include access_token');
    const expiresIn = Number(data.expires_in ?? 3600);
    tokenCache.set(country, { token: data.access_token, expiresAt: Date.now() + expiresIn * 1000 });
    return data.access_token;
  }

  async collect(
    context: ProviderContext,
    input: Parameters<PaymentProviderAdapter['collect']>[1],
    providerReference: string,
  ): Promise<ProviderTransaction> {
    const credentials = getOperatorCredentials('mtn', context.country);
    const token = await this.token(context.country);
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
    if (response.status !== 202) {
      throw new ProviderHttpError('mtn', response.status, JSON.stringify(payload));
    }

    return {
      provider: 'mtn',
      country: context.country,
      providerReference,
      status: 'PENDING',
      raw: payload,
    };
  }

  async getStatus(
    context: ProviderContext,
    providerReference: string,
  ): Promise<{ status: PaymentStatus; raw?: unknown }> {
    const credentials = getOperatorCredentials('mtn', context.country);
    const token = await this.token(context.country);
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
    if (!response.ok) {
      throw new ProviderHttpError('mtn', response.status, JSON.stringify(payload));
    }

    const data = payload as { status?: unknown };
    return { status: normalizedStatus(data.status), raw: payload };
  }
}
