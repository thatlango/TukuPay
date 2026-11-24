import type { CreatePaymentInput } from '../domain/payments.js';
import { TukuPayError } from '../errors.js';
import { majorToMinor } from './money.js';

function invalid(message: string): never {
  throw new TukuPayError(message, 'VALIDATION_ERROR', 400);
}
function object(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(field + ' must be an object');
  return value as Record<string, unknown>;
}
function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) {
    invalid(field + ' is invalid');
  }
  return value.trim();
}

/** HTTP input contract shared by collection and payout creation. */
export function parseCreateIntent(body: unknown): CreatePaymentInput {
  const root = object(body, 'body');
  const money = object(root.money, 'money');
  const product = text(root.product,'product',64).toLowerCase();
  const country = text(root.country,'country',2).toUpperCase();
  const currency = text(money.currency,'money.currency',3).toUpperCase();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(product)) invalid('Invalid product');
  if (!/^[A-Z]{2}$/.test(country)) invalid('Invalid country');
  if (!/^[A-Z]{3}$/.test(currency)) invalid('Invalid currency');
  const amount = text(money.amount,'money.amount',64);
  majorToMinor(amount,currency);
  const input: CreatePaymentInput = {
    product, externalId:text(root.externalId,'externalId',128),country,
    money:{amount,currency},phone:text(root.phone,'phone',64),
  };
  if(root.provider !== undefined) {
    if(root.provider !== 'mtn' && root.provider !== 'airtel') invalid('Invalid provider');
    input.provider=root.provider;
  }
  if(root.description !== undefined) {
    if(typeof root.description !== 'string' || root.description.length>1024 || /[\x00-\x1f\x7f]/.test(root.description)) invalid('Invalid description');
    if(root.description.trim()) input.description=root.description.trim();
  }
  if(root.metadata !== undefined) {
    const metadata=object(root.metadata,'metadata');
    if(Buffer.byteLength(JSON.stringify(metadata),'utf8')>32768) invalid('Metadata exceeds 32 KiB');
    input.metadata=metadata;
  }
  return input;
}

/** Optional key must be an unambiguous visible ASCII header value. */
export function parseIdempotencyHeader(value: unknown): string | undefined {
  if(value===undefined) return undefined;
  if(typeof value !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(value) || value.includes(',')) invalid('Invalid idempotency key');
  return value;
}
