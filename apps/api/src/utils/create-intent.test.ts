import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCreateIntent,parseIdempotencyHeader } from './create-intent.js';
const fixture={product:'Kela',externalId:'test-1',country:'ug',money:{amount:'2500',currency:'ugx'},phone:'0772 000 000'};

test('shared create parser normalizes scope and preserves exact amount',()=>{
  assert.deepEqual(parseCreateIntent(fixture),{...fixture,product:'kela',country:'UG',money:{amount:'2500',currency:'UGX'}});
  assert.equal(parseCreateIntent({...fixture,description:' note ',provider:'mtn'}).description,'note');
});
test('invalid scope, money and optional fields are rejected',()=>{
  for(const body of [null,[],{}, {...fixture,product:'x y'}, {...fixture,country:'UGA'},
    {...fixture,money:{amount:2500,currency:'UGX'}}, {...fixture,money:{amount:'0',currency:'UGX'}},
    {...fixture,money:{amount:'1.01',currency:'UGX'}}, {...fixture,externalId:'a'.repeat(129)},
    {...fixture,description:42}, {...fixture,description:'x'.repeat(1025)}, {...fixture,metadata:[]},
    {...fixture,metadata:{large:'x'.repeat(32769)}}, {...fixture,provider:'unknown'}]) assert.throws(()=>parseCreateIntent(body));
});
test('ambiguous or malformed idempotency headers are rejected',()=>{
  assert.equal(parseIdempotencyHeader(undefined),undefined);
  assert.equal(parseIdempotencyHeader('fixture:123'),'fixture:123');
  for(const value of ['', ' ', 'two words','a,b',['a','b'],'x'.repeat(129),null,12]) assert.throws(()=>parseIdempotencyHeader(value),{code:'VALIDATION_ERROR'});
});
