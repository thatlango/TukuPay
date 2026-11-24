import test from 'node:test';
import assert from 'node:assert/strict';
import { validEventBatch, validTransaction } from './response.js';
const id = 'abcdef01-1234-5678-9012-abcdef123456';
const payment = {id, product:'kela', externalId:'fixture', country:'UG', provider:'mtn', providerReference:null, amount:'2500', currency:'UGX', phone:'256700000000',status:'PENDING',providerStatus:null,lastError:null,metadata:{}};
const event = {id, sequence:'1', schema_version:1, kind:'collection', transaction_id:id, product_code:'kela',status:'SUCCESSFUL',currency:'UGX',amount_minor:'9223372036854775807',occurred_at:'2026-11-24T00:00:00Z'};
const batch = (events: unknown[]) => ({delivery:'at-least-once',events});
test('payment responses must match the client product and expected structure',()=>{
  assert.equal(validTransaction(payment,'kela','payment'),true);
  for(const value of [null, [], {}, {...payment,product:'units'}, {...payment,amount:2500}, {...payment,amount:'0'}, {...payment,status:'APPROVED'}, {...payment,metadata:[]}]) assert.equal(validTransaction(value,'kela','payment'),false);
});
test('payout responses require explicit requester and approver fields',()=>{
  assert.equal(validTransaction(payment,'kela','payout'),false);
  assert.equal(validTransaction({...payment,requestedBy:'maker',approvedBy:null,status:'APPROVAL_REQUIRED'},'kela','payout'),true);
});
test('event batches reject invalid scope, amounts, state and duplicate identity',()=>{
  assert.equal(validEventBatch(batch([event]),'kela'),true);
  assert.equal(validEventBatch(batch([]),'kela'),true);
  for(const events of [[event,event],[{...event,product_code:'units'}],[{...event,amount_minor:1}],[{...event,amount_minor:'9223372036854775808'}],[{...event,status:'APPROVED'}],[{...event,schema_version:2}],[{...event,occurred_at:'invalid'}]]) assert.equal(validEventBatch(batch(events),'kela'),false);
});
