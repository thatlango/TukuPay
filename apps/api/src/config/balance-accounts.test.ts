import test from 'node:test';
import assert from 'node:assert/strict';
import { balanceAccounts } from './balance-accounts.js';
test('operator Airtel balance is collection only',()=>{
  assert.deepEqual(balanceAccounts('airtel',false,true,true),{collection:true,disbursement:false});
});
test('MTN disbursement requires configured payout credentials; simulator reports both accounts',()=>{
  assert.deepEqual(balanceAccounts('mtn',false,true,false),{collection:true,disbursement:false});
  assert.deepEqual(balanceAccounts('mtn',false,true,true),{collection:true,disbursement:true});
  assert.deepEqual(balanceAccounts('airtel',true,true,false),{collection:true,disbursement:true});
  assert.deepEqual(balanceAccounts('mtn',true,false,true),{collection:false,disbursement:false});
});
