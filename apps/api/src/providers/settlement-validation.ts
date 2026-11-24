import { majorToMinor } from '../utils/money.js';
import type { ProviderCode } from '../domain/payments.js';

type Expected = {
  provider: ProviderCode;
  reference: string;
  externalId: string;
  amount: string;
  currency: string;
  simulator: boolean;
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid provider settlement response');
  return value as Record<string, unknown>;
}

function checkAmount(value: unknown, expected: Expected): void {
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('Provider settlement amount missing');
  // A JSON numeric amount may already have lost precision. Reject unsafe values.
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) {
    throw new Error('Provider settlement amount is unsafe');
  }
  const text = String(value);
  // Operators sometimes format whole units as 1500.00. Strip only trailing zeroes.
  const normalized = text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
  if (majorToMinor(normalized, expected.currency) !== majorToMinor(expected.amount, expected.currency)) {
    throw new Error('Provider settlement amount mismatch');
  }
}

/** Fail closed if a successful status cannot be matched to the original intent. */
export function assertSuccessfulSettlement(raw: unknown, expected: Expected): void {
  const root = object(raw);
  let transaction = root;
  if (expected.simulator) {
    if (root.simulated !== true || root.providerReference !== expected.reference) {
      throw new Error('Simulator settlement reference mismatch');
    }
  } else if (expected.provider === 'mtn') {
    // MTN identifies the transaction by the queried reference URL and returns externalId.
    if (root.externalId !== expected.externalId) throw new Error('MTN settlement external ID mismatch');
    if (root.referenceId !== undefined && root.referenceId !== expected.reference) {
      throw new Error('MTN settlement reference mismatch');
    }
    if (typeof root.financialTransactionId !== 'string' || !root.financialTransactionId.trim()) {
      throw new Error('MTN financial transaction ID missing');
    }
  } else if (expected.provider === 'airtel') {
    transaction = root.data ? object(object(root.data).transaction) : object(root.transaction);
    if (transaction.id !== expected.reference) throw new Error('Airtel settlement reference mismatch');
  } else {
    throw new Error('Unsupported settlement provider');
  }
  if (transaction.currency !== expected.currency) throw new Error('Provider settlement currency missing or mismatched');
  checkAmount(transaction.amount, expected);
}
