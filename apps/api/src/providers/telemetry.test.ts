import assert from 'node:assert/strict';
import test from 'node:test';
import { TransportMetrics } from './telemetry.js';

test('transport metrics distinguish failures and retries without sensitive dimensions', () => {
  const metrics = new TransportMetrics();
  const scope = { provider: 'mtn' as const, country: 'UG', operation: 'status' as const };
  metrics.record({ scope, outcome: 'http_error', status: 503, durationMs: 100, retry: false });
  metrics.record({ scope, outcome: 'ok', status: 200, durationMs: 200, retry: true });
  const row = metrics.snapshot().metrics[0]!;
  assert.equal(row.requests, 2);
  assert.equal(row.successes, 1);
  assert.equal(row.httpErrors, 1);
  assert.equal(row.retries, 1);
  assert.equal(row.averageDurationMs, 150);
  assert.equal(row.lastStatus, 200);
  assert.equal(metrics.snapshot().scope, 'process-local');
});
