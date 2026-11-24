import assert from 'node:assert/strict';
import test from 'node:test';
import { AirtelMoneyAdapter } from './airtel.js';

test('unverified Airtel disbursement balance is rejected before contacting an operator', async () => {
  const adapter = new AirtelMoneyAdapter();
  await assert.rejects(adapter.getBalance({country:'UG',currency:'UGX'},'disbursement'), /disbursement balance is not supported/);
});
