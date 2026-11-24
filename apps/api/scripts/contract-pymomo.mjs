import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MtnMoMoAdapter } from '../dist/providers/mtn.js';
import { AirtelMoneyAdapter } from '../dist/providers/airtel.js';

for (const provider of ['MTN', 'AIRTEL']) {
  const endpoint = new URL(process.env[`${provider}_UG_BASE_URL`] ?? 'https://invalid.invalid');
  assert.equal(endpoint.protocol, 'http:', 'contract test requires loopback HTTP');
  assert.equal(endpoint.hostname, '127.0.0.1', 'no real operator endpoint permitted');
  assert.equal(process.env[`${provider}_UG_MODE`], 'sandbox');
}
const mtn = new MtnMoMoAdapter();
const airtel = new AirtelMoneyAdapter();
for (const adapter of [mtn, airtel]) {
  const context = { country: 'UG', currency: adapter.provider === 'mtn' ? 'EUR' : 'UGX' };
  const input = { product: 'contract-test', externalId: randomUUID(), country: 'UG',
    provider: adapter.provider, money: { amount: '1500', currency: context.currency }, phone: '256771234567' };
  const ref = randomUUID();
  const initiated = await adapter.collect(context, input, ref);
  assert.equal(initiated.providerReference, ref);
  assert.equal(initiated.status, 'PENDING');
  const checked = await adapter.getStatus(context, ref);
  assert.equal(checked.status, 'SUCCESSFUL');
  if (adapter.provider === 'mtn') {
    await assert.rejects(adapter.collect(context, input, ref), error => error.status === 409);
    const payoutRef = randomUUID();
    assert.equal((await adapter.payout(context, { ...input, externalId: randomUUID() }, payoutRef)).status, 'PENDING');
    assert.equal((await adapter.getPayoutStatus(context, payoutRef)).status, 'SUCCESSFUL');
  }
  const balance = await adapter.getBalance(context, 'collection');
  assert.equal(balance.currency, context.currency);
  assert(Number(balance.available) > 0);
}
assert.equal(airtel.supportsOperation('UG', 'payout'), false);
console.log('PyMoMo mock contract checks passed: MTN collections/payouts/duplicate ref/balance; Airtel collections/balance; Airtel payouts disabled.');
