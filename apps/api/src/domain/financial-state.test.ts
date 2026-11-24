import assert from 'node:assert/strict';
import test from 'node:test';
import { collectionTransition,payoutTransition } from './financial-state.js';
test('collection success requires evidence and terminal outcomes cannot regress',()=>{
  assert.equal(collectionTransition('PENDING','SUCCESSFUL',false),false);
  assert.equal(collectionTransition('PENDING','SUCCESSFUL',true),true);
  assert.equal(collectionTransition('FAILED','PENDING',true),false);
  assert.equal(collectionTransition('SUCCESSFUL','FAILED',true),false);
  assert.equal(collectionTransition('SUCCESSFUL','SUCCESSFUL',true),true);
});
test('payout cannot bypass approval or verified success',()=>{
  assert.equal(payoutTransition('APPROVAL_REQUIRED','PENDING',true),false);
  assert.equal(payoutTransition('APPROVED','PENDING',false),true);
  assert.equal(payoutTransition('PENDING','SUCCESSFUL',false),false);
  assert.equal(payoutTransition('PENDING','SUCCESSFUL',true),true);
  assert.equal(payoutTransition('CANCELLED','APPROVED',true),false);
});
