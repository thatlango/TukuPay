import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedInteger, requireAccount, requireUuid } from './request-validation.js';

test('UUID validation rejects malformed identifiers before database access', () => {
  assert.equal(requireUuid('ABCDEF01-1234-5678-9012-ABCDEF123456'), 'abcdef01-1234-5678-9012-abcdef123456');
  for (const value of ['', 'a'.repeat(36), '----', null, 1]) assert.throws(() => requireUuid(value), { code: 'VALIDATION_ERROR', statusCode: 400 });
});
test('bounded integer rejects invalid or out-of-range values', () => {
  assert.equal(boundedInteger(undefined, 50, 1, 500), 50);
  assert.equal(boundedInteger('500', 50, 1, 500), 500);
  assert.equal(boundedInteger(1, 50, 1, 500), 1);
  for (const value of [null, true, [], '', '1.5', '1e2', ' 1', NaN, Infinity, 0, 501, 1.5]) assert.throws(() => boundedInteger(value, 50, 1, 500), { code: 'VALIDATION_ERROR' });
});
test('balance account is explicit and invalid values are not silently reclassified', () => {
  assert.equal(requireAccount(undefined), 'collection');
  assert.equal(requireAccount('collection'), 'collection');
  assert.equal(requireAccount('disbursement'), 'disbursement');
  for (const value of [null, 'payout', '', 0]) assert.throws(() => requireAccount(value), { code: 'VALIDATION_ERROR' });
});
