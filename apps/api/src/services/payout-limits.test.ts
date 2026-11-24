import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPayoutLimits, readPayoutLimits } from './payout-limits.js';

test('production limit settings are required and validated', () => {
  assert.throws(() => readPayoutLimits('UG','UGX', {}));
  assert.throws(() => readPayoutLimits('UG','UGX', { TUKUPAY_PAYOUT_UG_UGX_MAX_MINOR: '100', TUKUPAY_PAYOUT_UG_UGX_DAILY_MINOR: '50' }));
  assert.deepEqual(readPayoutLimits('UG','UGX', { TUKUPAY_PAYOUT_UG_UGX_MAX_MINOR: '100', TUKUPAY_PAYOUT_UG_UGX_DAILY_MINOR: '500' }), { max: 100n, daily: 500n });
});
test('single and cumulative limits are enforced exactly in minor units', () => {
  const limits = { max: 100n, daily: 500n };
  assert.doesNotThrow(() => checkPayoutLimits(100n, 400n, limits));
  assert.throws(() => checkPayoutLimits(101n, 0n, limits));
  assert.throws(() => checkPayoutLimits(100n, 401n, limits));
});
