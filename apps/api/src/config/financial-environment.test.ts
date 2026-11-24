import test from 'node:test';
import assert from 'node:assert/strict';
import {configuredEnvironment,verifyBinding,verifyOperatorMode} from './financial-environment.js';
test('explicit compatible environment is required',()=>{
  assert.equal(configuredEnvironment({TUKUPAY_FINANCIAL_ENVIRONMENT:'simulator',TUKUPAY_SIMULATOR_ENABLED:'true'}),'simulator');
  assert.throws(()=>configuredEnvironment({}));
  assert.throws(()=>configuredEnvironment({TUKUPAY_FINANCIAL_ENVIRONMENT:'production',TUKUPAY_SIMULATOR_ENABLED:'true'}));
  assert.throws(()=>configuredEnvironment({TUKUPAY_FINANCIAL_ENVIRONMENT:'sandbox',TUKUPAY_LIVE_PAYOUTS_ENABLED:'true'}));
});
test('unbound and mismatched databases refuse startup',()=>{
  assert.doesNotThrow(()=>verifyBinding('sandbox',[{environment:'sandbox'}]));
  assert.throws(()=>verifyBinding('sandbox',[]));
  assert.throws(()=>verifyBinding('production',[{environment:'simulator'}]));
});
test('operator credentials cannot cross environment boundaries',()=>{
  assert.doesNotThrow(()=>verifyOperatorMode('sandbox','sandbox'));
  assert.throws(()=>verifyOperatorMode('production','sandbox'));
  assert.throws(()=>verifyOperatorMode('simulator','sandbox'));
});
