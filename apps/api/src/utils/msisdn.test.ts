import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMsisdn, normalizeSandboxMsisdn, providerMsisdn } from './msisdn.js';

test('normalizes a Ugandan local number to E164 digits', () => {
  assert.equal(normalizeMsisdn('0772 123 456', 'UG'), '256772123456');
});

test('can format E164 digits as provider-local MSISDN', () => {
  assert.equal(providerMsisdn('256772123456', 'UG', 'local'), '772123456');
});

test('keeps MTN sandbox fixture numbers unscoped', () => {
  assert.equal(normalizeSandboxMsisdn('46733123453'), '46733123453');
});

test('explicit international numbers must match requested market',()=>{
  assert.equal(normalizeMsisdn('+256 772 123456','UG'),'256772123456');
  assert.equal(normalizeMsisdn('00256772123456','UG'),'256772123456');
  for(const phone of ['+254722123456','00254722123456','+2560772123456','0772abc123456','0772+123456','0772.123456'])assert.throws(()=>normalizeMsisdn(phone,'UG'),{code:'INVALID_PHONE'});
  assert.throws(()=>normalizeSandboxMsisdn('abc46733123453'));
});
