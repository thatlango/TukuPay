import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSameIntent } from './idempotency.js';

const original = { product: 'test', externalId: 'invoice', country: 'UG', provider: 'mtn',
  amount: '1000', currency: 'UGX', phone: '256700000000', description: null, metadata: { a: 1, b: 2 } };
test('identical requests return original intent and metadata key order is immaterial', () => {
  assert.equal(assertSameIntent(original, { ...original, metadata: { b: 2, a: 1 } }), original);
});
test('reused reference with different financial details is a conflict', () => {
  for (const change of [{ amount: '1001' }, { currency: 'EUR' }, { externalId: 'other' },
    { provider: 'airtel' }, { phone: '256700000001' }, { metadata: { a: 3 } }]) {
    assert.throws(() => assertSameIntent(original, { ...original, ...change }), /different request/);
  }
});
