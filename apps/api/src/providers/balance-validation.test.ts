import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBalance} from './balance-validation.js';
test('balance requires explicit exact amount and currency, including zero',()=>{
  assert.deepEqual(validateBalance('0.00','UGX','UGX'),{available:'0',currency:'UGX'});
  assert.deepEqual(validateBalance('120.00','EUR','EUR'),{available:'120',currency:'EUR'});
  for(const args of [[undefined,'UGX','UGX'],['1',undefined,'UGX'],['1','USD','UGX'],['1.5','UGX','UGX'],['-1','UGX','UGX'],['9223372036854775808','UGX','UGX']] as const){
    assert.throws(()=>validateBalance(args[0],args[1],args[2]));
  }
});
