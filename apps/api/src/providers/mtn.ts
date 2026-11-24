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

type Product = 'collection' | 'disbursement';
const tokenCache = new TokenCache();

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

  private async authorizedFetch(country: CountryCode, product: Product, url: string, init: RequestInit = {}): Promise<Response> {
    const credentials = getOperatorCredentials('mtn', country);
    const subscriptionKey = product === 'collection'
      ? credentials.subscriptionKey
      : credentials.disbursementSubscriptionKey;
    if (!subscriptionKey) throw new Error(`MTN ${product} subscription key is not configured for ${country}`);

    const key = credentialKey(['mtn', country, product, credentials.baseUrl, credentials.mode, credentials.targetEnvironment, credentials.apiUser, credentials.apiKey, subscriptionKey]);
    return authorizedProviderFetch(tokenCache, key, async () => {
      const basic = Buffer.from(`${credentials.apiUser}:${credentials.apiKey}`).toString('base64');
      const response = await providerFetch(joinUrl(credentials.baseUrl, `/${product}/token/`), {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Ocp-Apim-Subscription-Key': subscriptionKey,
        },
      });
      const payload = await responsePayload(response);
      if (!response.ok) throw new ProviderHttpError('mtn', response.status, 'Token acquisition rejected');
      return parseToken(payload);
    }, url, init);
  }

  async collect(
    context: ProviderContext,
    input: Parameters<PaymentProviderAdapter['collect']>[1],
    providerReference: string,
  ): Promise<ProviderTransaction> {
    const credentials = getOperatorCredentials('mtn', context.country);
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

    const response = await this.authorizedFetch(context.country, 'collection', joinUrl(credentials.baseUrl, '/collection/v1_0/requesttopay'), {
      method: 'POST',
      headers: {
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
    const response = await this.authorizedFetch(context.country, 'collection', 
      joinUrl(credentials.baseUrl, `/collection/v1_0/requesttopay/${encodeURIComponent(providerReference)}`),
      {
        headers: {
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

    const response = await this.authorizedFetch(context.country, 'disbursement', joinUrl(credentials.baseUrl, '/disbursement/v1_0/transfer'), {
      method: 'POST',
      headers: {
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
    const response = await this.authorizedFetch(context.country, 'disbursement', 
      joinUrl(credentials.baseUrl, `/disbursement/v1_0/transfer/${encodeURIComponent(providerReference)}`),
      {
        headers: {
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
    const subscriptionKey = account === 'collection'
      ? credentials.subscriptionKey
      : credentials.disbursementSubscriptionKey;
    const response = await this.authorizedFetch(context.country, account, joinUrl(credentials.baseUrl, `/${account}/v1_0/account/balance`), {
      headers: {
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
