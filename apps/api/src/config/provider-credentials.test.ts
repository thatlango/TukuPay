import assert from 'node:assert/strict';
import test from 'node:test';
import { providerTransactionCurrency, providerUsesOperatorSandbox } from './provider-credentials.js';

function withEnv(values: Record<string, string | undefined>, run: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('MTN sandbox defaults to EUR without changing the market currency', () => {
  withEnv({
    TUKUPAY_SIMULATOR_ENABLED: 'false',
    MTN_UG_BASE_URL: 'https://sandbox.momodeveloper.mtn.com',
    MTN_UG_MODE: undefined,
    MTN_UG_SANDBOX_CURRENCY: undefined,
  }, () => {
    assert.equal(providerTransactionCurrency('mtn', 'UG', 'UGX'), 'EUR');
  });
});

test('MTN production retains the Uganda market currency', () => {
  withEnv({
    TUKUPAY_SIMULATOR_ENABLED: 'false',
    MTN_UG_BASE_URL: 'https://proxy.momoapi.mtn.com',
    MTN_UG_MODE: 'production',
    MTN_UG_SANDBOX_CURRENCY: 'EUR',
  }, () => {
    assert.equal(providerTransactionCurrency('mtn', 'UG', 'UGX'), 'UGX');
  });
});

test('simulator retains the market currency', () => {
  withEnv({
    TUKUPAY_SIMULATOR_ENABLED: 'true',
    MTN_UG_BASE_URL: 'https://sandbox.momodeveloper.mtn.com',
    MTN_UG_SANDBOX_CURRENCY: 'EUR',
  }, () => {
    assert.equal(providerTransactionCurrency('mtn', 'UG', 'UGX'), 'UGX');
  });
});

test('detects the real MTN operator sandbox separately from the local simulator', () => {
  withEnv({
    TUKUPAY_SIMULATOR_ENABLED: 'false',
    MTN_UG_BASE_URL: 'https://sandbox.momodeveloper.mtn.com',
    MTN_UG_MODE: undefined,
  }, () => {
    assert.equal(providerUsesOperatorSandbox('mtn', 'UG'), true);
  });

  withEnv({
    TUKUPAY_SIMULATOR_ENABLED: 'true',
    MTN_UG_BASE_URL: 'https://sandbox.momodeveloper.mtn.com',
  }, () => {
    assert.equal(providerUsesOperatorSandbox('mtn', 'UG'), false);
  });
});
