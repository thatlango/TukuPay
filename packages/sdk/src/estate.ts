import type { Payment, Provider, TukuPayClientOptions } from './index.js';

export type EstateEnvironment = Readonly<Record<string, string | undefined>>;
export type CollectionBinding = {
  paymentId: string;
  product: string;
  externalId: string;
  country: string;
  money: { amount: string; currency: string };
  provider?: Provider;
};

export class TukuPayBindingError extends Error {
  readonly code = 'PAYMENT_BINDING_MISMATCH';
  constructor(readonly field: string) {
    super('TukuPay collection does not match the stored obligation: ' + field);
    this.name = 'TukuPayBindingError';
  }
}

export function estateClientOptions(product: string, env: EstateEnvironment): TukuPayClientOptions | null {
  const enabled = env.TUKUPAY_ENABLED ?? 'false';
  if (enabled === 'false') return null;
  if (enabled !== 'true') throw new Error('Invalid TUKUPAY_ENABLED');
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(product)) throw new Error('Invalid TukuPay product code');
  const baseUrl = env.TUKUPAY_BASE_URL;
  const token = env.TUKUPAY_TOKEN;
  if (!baseUrl || !token || !/^[\x21-\x7e]{16,512}$/.test(token)) throw new Error('Incomplete TukuPay server configuration');
  const rawTimeout = env.TUKUPAY_TIMEOUT_MS ?? '12000';
  const timeoutMs = Number(rawTimeout);
  if (!/^\d+$/.test(rawTimeout) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) throw new Error('Invalid TUKUPAY_TIMEOUT_MS');
  return { baseUrl, token, product, timeoutMs };
}

function canonicalAmount(value: string): string {
  if (typeof value !== 'string' || value.length > 64 || !/^\d+(?:\.\d+)?$/.test(value) || !/[1-9]/.test(value)) throw new TukuPayBindingError('amount');
  const [whole = '', fraction = ''] = value.split('.');
  const integer = whole.replace(/^0+(?=\d)/, '');
  const decimals = fraction.replace(/0+$/, '');
  return decimals ? integer + '.' + decimals : integer;
}

/** The stored obligation must be captured independently of the API response. */
export function assertCollectionBinding(payment: Payment, expected: CollectionBinding): Payment {
  if (payment.id !== expected.paymentId) throw new TukuPayBindingError('paymentId');
  if (payment.product !== expected.product) throw new TukuPayBindingError('product');
  if (payment.externalId !== expected.externalId) throw new TukuPayBindingError('externalId');
  if (payment.country !== expected.country) throw new TukuPayBindingError('country');
  if (payment.currency !== expected.money.currency) throw new TukuPayBindingError('currency');
  if (expected.provider !== undefined && payment.provider !== expected.provider) throw new TukuPayBindingError('provider');
  if (canonicalAmount(payment.amount) !== canonicalAmount(expected.money.amount)) throw new TukuPayBindingError('amount');
  return payment;
}

/** A matching successful status is a prerequisite, not a local accounting instruction. */
export function assertSuccessfulCollection(payment: Payment, expected: CollectionBinding): Payment & { status: 'SUCCESSFUL' } {
  const matched = assertCollectionBinding(payment, expected);
  if (matched.status !== 'SUCCESSFUL' || !matched.provider || !matched.providerReference) throw new TukuPayBindingError('successfulEvidence');
  return matched as Payment & { status: 'SUCCESSFUL' };
}
