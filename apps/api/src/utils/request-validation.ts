import { TukuPayError } from './errors.js';

export function requireUuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new TukuPayError('Invalid identifier', 'VALIDATION_ERROR', 400);
  }
  return value.toLowerCase();
}

export function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new TukuPayError(`Expected integer between ${min} and ${max}`, 'VALIDATION_ERROR', 400);
  }
  return parsed;
}

export function requireAccount(value: unknown): 'collection' | 'disbursement' {
  if (value === undefined || value === 'collection') return 'collection';
  if (value === 'disbursement') return value;
  throw new TukuPayError('Invalid balance account', 'VALIDATION_ERROR', 400);
}
