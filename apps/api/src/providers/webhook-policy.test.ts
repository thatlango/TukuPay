import test from 'node:test';
import assert from 'node:assert/strict';
import { callbackMode, validProviderReference } from './webhook-policy.js';

test('unsigned production callbacks require explicit market-specific approval', () => {
  assert.equal(callbackMode('mtn','UG','production', {}), 'disabled');
  assert.equal(callbackMode('mtn','UG','production', { MTN_UG_UNSIGNED_CALLBACKS_ENABLED: 'true' }), 'wake-up-only');
  assert.equal(callbackMode('airtel','UG','production', { MTN_UG_UNSIGNED_CALLBACKS_ENABLED: 'true' }), 'disabled');
  assert.equal(callbackMode('airtel','UG','sandbox', {}), 'wake-up-only');
});
test('reference syntax is bounded', () => {
  assert.equal(validProviderReference('b0b-01'), true);
  assert.equal(validProviderReference('a'.repeat(129)), false);
  assert.equal(validProviderReference('../a'), false);
});
