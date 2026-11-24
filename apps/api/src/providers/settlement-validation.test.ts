import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSuccessfulSettlement } from './settlement-validation.js';

const expected = { provider: 'mtn' as const, reference: 'reference-1', externalId: 'invoice-1', amount: '1500', currency: 'UGX', simulator: false };
const mtn = { amount: '1500.00', currency: 'UGX', externalId: 'invoice-1', financialTransactionId: 'fin-1' };

test('successful MTN settlement must match amount, currency and original external ID', () => {
  assert.doesNotThrow(() => assertSuccessfulSettlement(mtn, expected));
  for (const change of [{ amount: '1501' }, { currency: 'EUR' }, { externalId: 'invoice-2' }, { financialTransactionId: '' }, { referenceId: 'wrong' }, { amount: undefined }]) {
    assert.throws(() => assertSuccessfulSettlement({ ...mtn, ...change }, expected));
  }
});

test('Airtel settlement requires matching transaction identity and money', () => {
  const airtel = { ...expected, provider: 'airtel' as const };
  const transaction = { id: 'reference-1', amount: 1500, currency: 'UGX' };
  assert.doesNotThrow(() => assertSuccessfulSettlement({ data: { transaction } }, airtel));
  assert.throws(() => assertSuccessfulSettlement({ data: { transaction: { ...transaction, id: 'wrong' } } }, airtel));
  assert.throws(() => assertSuccessfulSettlement({ data: { transaction: { id: 'reference-1' } } }, airtel));
});

test('simulator marker cannot bypass live settlement checks', () => {
  const raw = { simulated: true, providerReference: 'reference-1', amount: '1500', currency: 'UGX' };
  assert.throws(() => assertSuccessfulSettlement(raw, expected));
  assert.doesNotThrow(() => assertSuccessfulSettlement(raw, { ...expected, simulator: true }));
});
