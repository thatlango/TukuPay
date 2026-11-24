import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyCandidate, candidateReceipt, type CandidateIntent } from './contracts.js';

const intent: CandidateIntent = { reference: 'tuku-1', amount: '100.50', currency: 'KES', operation: 'collection' };
test('Paystack requires exact minor amount, reference, currency and successful status', () => {
  const data = { id: 12, reference: 'tuku-1', amount: 10050, currency: 'KES', status: 'success' };
  assert.equal(verifyCandidate('paystack', intent, { status: true, data }).status, 'SUCCESSFUL');
  for (const patch of [{ amount: 100 }, { currency: 'UGX' }, { reference: 'other' }, { id: null }, { status: 'pending' }]) {
    assert.equal(verifyCandidate('paystack', intent, { status: true, data: { ...data, ...patch } }).status, 'PENDING');
  }
});
test('Flutterwave verifies merchant transaction reference and major units', () => {
  const data = { id: 1, tx_ref: 'tuku-1', amount: 100.5, currency: 'KES', status: 'successful' };
  assert.equal(verifyCandidate('flutterwave', intent, { status: 'success', data }).status, 'SUCCESSFUL');
  assert.equal(verifyCandidate('flutterwave', intent, { status: 'success', data: { ...data, amount: 101 } }).status, 'PENDING');
});
test('Wave checkout requires matching client reference and completed payment', () => {
  const req = { ...intent, amount: '1000', currency: 'XOF' };
  const row = { transaction_id: 'T_123', client_reference: 'tuku-1', amount: '1000', currency: 'XOF', payment_status: 'succeeded', checkout_status: 'complete' };
  assert.equal(verifyCandidate('wave', req, row).status, 'SUCCESSFUL');
  assert.equal(verifyCandidate('wave', req, { ...row, checkout_status: 'open' }).status, 'PENDING');
});
test('M-Pesa STK result, unconfirmed contracts and payout acknowledgements never settle', () => {
  assert.equal(verifyCandidate('mpesa', intent, { ResultCode: '0', CheckoutRequestID: 'ws_CO_1' }).status, 'PENDING');
  for (const rail of ['airtel', 'orange'] as const) assert.equal(verifyCandidate(rail, intent, {}).status, 'PENDING');
  assert.equal(verifyCandidate('paystack', { ...intent, operation: 'payout' }, {}).status, 'PENDING');
  assert.equal(candidateReceipt(intent, 'id', 'https://example.invalid/checkout').status, 'PENDING');
  assert.throws(() => candidateReceipt(intent, 'id', 'http://example.invalid/checkout'));
});
