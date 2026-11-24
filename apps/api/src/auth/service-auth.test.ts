import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessProduct } from './service-auth.js';

test('product identity and explicit grants constrain access independently of operation scope', () => {
  const identity = { service: 'kela', scopes: ['payments:*'] };
  assert.equal(canAccessProduct(identity, 'kela'), true);
  assert.equal(canAccessProduct(identity, 'units'), false);
  assert.equal(canAccessProduct({ service: 'finance', scopes: ['products:units'] }, 'units'), true);
  assert.equal(canAccessProduct({ service: 'finance', scopes: ['products:units'] }, 'kela'), false);
  assert.equal(canAccessProduct({ service: 'admin', scopes: ['*'] }, 'units'), true);
  assert.equal(canAccessProduct({ service: 'admin', scopes: ['*'] }, '*'), false);
});
