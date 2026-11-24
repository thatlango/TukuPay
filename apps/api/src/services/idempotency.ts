import { isDeepStrictEqual } from 'node:util';
import { TukuPayError } from '../errors.js';
import { majorToMinor } from '../utils/money.js';

type Intent = {
  product: string; externalId: string; country: string; provider: string | null;
  amount: string; currency: string; phone: string;
  description: string | null; metadata: Record<string, unknown>;
};

export function assertSameIntent<T extends Intent>(existing: T, incoming: Intent): T {
  const equal = existing.product === incoming.product
    && existing.externalId === incoming.externalId
    && existing.country === incoming.country
    && existing.provider === incoming.provider
    && existing.currency === incoming.currency
    && existing.phone === incoming.phone
    && majorToMinor(existing.amount, existing.currency) === majorToMinor(incoming.amount, incoming.currency)
    && existing.description === incoming.description
    && isDeepStrictEqual(existing.metadata, incoming.metadata);
  if (!equal) throw new TukuPayError('Idempotency reference already belongs to a different request', 'IDEMPOTENCY_CONFLICT', 409);
  return existing;
}
