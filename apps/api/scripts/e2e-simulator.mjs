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

result = await call('POST', `/v1/payments/${paymentId}/refresh`, kela);
assert(result.payload.payment.status === 'SUCCESSFUL', 'simulated payment should become SUCCESSFUL');

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

console.log(JSON.stringify({
  ok: true,
  paymentId,
  delayedId,
  checks: ['scoped-auth', 'idempotency', 'collection-success', 'delayed-reconciliation', 'payout-scope-denial', 'ops-summary'],
}));
