import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMsisdn, providerMsisdn } from './msisdn.js';

test('normalizes a Ugandan local number to E164 digits', () => {
  assert.equal(normalizeMsisdn('0772 123 456', 'UG'), '256772123456');
});

test('can format E164 digits as provider-local MSISDN', () => {
  assert.equal(providerMsisdn('256772123456', 'UG', 'local'), '772123456');
});
