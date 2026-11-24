import test from 'node:test';
import assert from 'node:assert/strict';
import { estateClientOptions, assertCollectionBinding, assertSuccessfulCollection } from './estate.js';
import { createEstateClient, type Payment } from './index.js';
const id='abcdef01-1234-5678-9012-abcdef123456';
const payment: Payment={id,product:'kela',externalId:'fixture-order',country:'UG',provider:'mtn',providerReference:'fixture-provider',amount:'1000',currency:'UGX',phone:'256700000000',status:'SUCCESSFUL',providerStatus:'SUCCESSFUL',lastError:null,metadata:{}};
const binding={paymentId:id,product:'kela',externalId:'fixture-order',country:'UG',money:{amount:'1000.00',currency:'UGX'},provider:'mtn' as const};
const env={TUKUPAY_ENABLED:'true',TUKUPAY_BASE_URL:'http://127.0.0.1:8080',TUKUPAY_TOKEN:'fixture-token-123456'};
test('estate configuration is disabled by default and fails closed on invalid settings',()=>{
  assert.equal(estateClientOptions('kela',{}),null);
  assert.equal(createEstateClient('kela',{}),null);
  assert.equal(estateClientOptions('kela',env)?.timeoutMs,12000);
  assert.ok(createEstateClient('kela',env));
  for(const bad of [{...env,TUKUPAY_ENABLED:'yes'},{...env,TUKUPAY_TOKEN:''},{...env,TUKUPAY_TIMEOUT_MS:'1e4'},{...env,TUKUPAY_TIMEOUT_MS:'999'}]) assert.throws(()=>createEstateClient('kela',bad));
  assert.throws(()=>createEstateClient('kela',{...env,TUKUPAY_BASE_URL:'http://example.test'}));
});
test('collection binding rejects mismatched immutable business fields',()=>{
  assert.equal(assertCollectionBinding(payment,binding),payment);
  for(const wrong of [{...payment,id:'other'},{...payment,product:'units'},{...payment,externalId:'other'},{...payment,country:'KE'},{...payment,currency:'KES'},{...payment,provider:'airtel' as const},{...payment,amount:'1001'}]) assert.throws(()=>assertCollectionBinding(wrong,binding),{code:'PAYMENT_BINDING_MISMATCH'});
});
test('only matching successful status and provider reference satisfy success guard',()=>{
  assert.equal(assertSuccessfulCollection(payment,binding).status,'SUCCESSFUL');
  assert.throws(()=>assertSuccessfulCollection({...payment,status:'PENDING'},binding));
  assert.throws(()=>assertSuccessfulCollection({...payment,providerReference:null},binding));
});
