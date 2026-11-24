const base = process.env.TUKUPAY_E2E_URL ?? 'http://127.0.0.1:8080';
const admin = process.env.TUKUPAY_SERVICE_TOKEN ?? 'ci-admin-token-0123456789';
const kela = process.env.TUKUPAY_E2E_KELA_TOKEN ?? 'ci-kela-token-0123456789';

async function call(method, path, token, body, idempotencyKey) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const preflight = await call('GET', '/v1/ops/summary', admin);
assert(preflight.response.ok && preflight.payload.ops.simulator === true, 'Refusing to run financial E2E outside simulator mode');

const stamp = Date.now();
const paymentBody = {
  product: 'kela',
  externalId: `E2E-${stamp}`,
  country: 'UG',
  provider: 'mtn',
  money: { amount: '2500', currency: 'UGX' },
  phone: '0772123456',
  metadata: { simulatorScenario: 'success' },
};

let result = await call('POST', '/v1/payments', kela, paymentBody, `pay-${stamp}`);
assert(result.response.status === 202, `payment create expected 202, got ${result.response.status}`);
const paymentId = result.payload.payment.id;
assert(result.payload.payment.status === 'PENDING', 'payment should start PENDING');

result = await call('POST', '/v1/payments', kela, paymentBody, `pay-${stamp}`);
assert(result.payload.payment.id === paymentId, 'idempotent payment must return same id');
const conflict = await call('POST', '/v1/payments', kela, { ...paymentBody, money: { amount: '2600', currency: 'UGX' } }, `pay-${stamp}`);
assert(conflict.response.status === 409, 'changed amount must not silently reuse an existing payment');

result = await call('POST', `/v1/payments/${paymentId}/refresh`, kela);
assert(result.payload.payment.status === 'SUCCESSFUL', 'simulated payment should become SUCCESSFUL');

const foreign = await call('POST', '/v1/payments', kela, { ...paymentBody, product: 'units', externalId: `FOREIGN-${stamp}` });
assert(foreign.response.status === 403, 'cross-product create is denied');
const other = await call('POST', '/v1/payments', admin, { ...paymentBody, product: 'units', externalId: `OTHER-${stamp}` });
assert(other.response.status === 202, 'admin can create other product payment');
const otherId = other.payload.payment.id;
assert((await call('GET', `/v1/payments/${otherId}`, kela)).response.status === 403, 'cross-product read is denied');
assert((await call('POST', `/v1/payments/${otherId}/refresh`, kela)).response.status === 403, 'cross-product refresh is denied');

const delayedBody = {
  ...paymentBody,
  externalId: `E2E-DELAY-${stamp}`,
  provider: 'airtel',
  metadata: { simulatorScenario: 'delayed_success' },
};
result = await call('POST', '/v1/payments', kela, delayedBody, `delay-${stamp}`);
const delayedId = result.payload.payment.id;
for (let i = 0; i < 3; i += 1) {
  result = await call('POST', `/v1/payments/${delayedId}/refresh`, kela);
}
assert(result.payload.payment.status === 'SUCCESSFUL', 'delayed payment should reconcile to SUCCESSFUL');

const forbidden = await call('POST', '/v1/payouts', kela, {
  product: 'kela',
  externalId: `E2E-NO-SCOPE-${stamp}`,
  country: 'UG',
  provider: 'mtn',
  money: { amount: '500', currency: 'UGX' },
  phone: '0772123456',
});
assert(forbidden.response.status === 403, 'collection-only credential must be denied payout scope');

result = await call('GET', '/v1/ops/summary', admin);
assert(result.response.ok && result.payload.ops.simulator === true, 'ops summary should report simulator mode');


const timeoutBody = { ...paymentBody, externalId: `E2E-TIMEOUT-${stamp}`, metadata: { simulatorScenario: 'timeout_then_success' } };
result = await call('POST', '/v1/payments', kela, timeoutBody, `timeout-${stamp}`);
assert(result.response.status === 202 && result.payload.payment.status === 'PENDING', 'ambiguous write must remain pending');
const timeoutId = result.payload.payment.id;
const exceptions = await call('GET', '/v1/ops/exceptions', admin);
assert(exceptions.response.ok && exceptions.payload.exceptions.some(row => row.id === timeoutId && row.reason === 'PROVIDER_ERROR'), 'ambiguous write must appear in exception queue');
assert((await call('GET', '/v1/ops/exceptions', kela)).response.status === 403, 'product without ops scope must not see exceptions');
const timeoutRef = result.payload.payment.providerReference;
result = await call('POST', '/v1/payments', kela, timeoutBody, `timeout-${stamp}`);
assert(result.payload.payment.id === timeoutId && result.payload.payment.providerReference === timeoutRef, 'retry must reuse original payment and provider reference');
for (let i = 0; i < 2; i++) result = await call('POST', `/v1/payments/${timeoutId}/refresh`, kela);
assert(result.payload.payment.status === 'SUCCESSFUL', 'ambiguous write must reconcile');

const payoutBody = { ...paymentBody, externalId: `E2E-PAYOUT-${stamp}` };
result = await call('POST', '/v1/payouts', admin, payoutBody, `payout-${stamp}`);
assert(result.response.status === 201 && result.payload.payout.status === 'APPROVAL_REQUIRED', 'payout must require approval');
const payoutId = result.payload.payout.id;
assert(!result.payload.payout.providerReference, 'unapproved payout must not be dispatched');
const payoutConflict = await call('POST', '/v1/payouts', admin, { ...payoutBody, money: { amount: '2600', currency: 'UGX' } }, `payout-${stamp}`);
assert(payoutConflict.response.status === 409, 'changed payout amount must be rejected');
const approvals = await Promise.all([0, 1].map(() => call('POST', `/v1/payouts/${payoutId}/approve`, admin, { reason: 'Simulator test only' })));
assert(approvals.every(a => a.response.ok), 'concurrent approvals must be idempotent');
result = await call('GET', `/v1/payouts/${payoutId}`, admin);
assert(result.response.ok && result.payload.payout.status === 'PENDING', 'approved payout should be pending');
const payoutRef = result.payload.payout.providerReference;
result = await call('POST', `/v1/payouts/${payoutId}/approve`, admin);
assert(result.payload.payout.providerReference === payoutRef, 'repeat approval must not dispatch again');
result = await call('POST', `/v1/payouts/${payoutId}/refresh`, admin);
assert(result.payload.payout.status === 'SUCCESSFUL', 'approved payout should reconcile');

console.log(JSON.stringify({
  ok: true,
  paymentId,
  delayedId,
  checks: ['scoped-auth', 'idempotency', 'collection-success', 'delayed-reconciliation', 'payout-scope-denial', 'ops-summary', 'ambiguous-write-reconciliation', 'payout-approval-and-idempotency'],
}));
