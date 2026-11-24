/** Process-local counters: no payloads, credentials, URLs, or transaction identifiers. */
export type TransportOutcome = 'ok' | 'http_error' | 'network_error' | 'timeout' | 'redirect';
export type TransportScope = { provider: 'mtn' | 'airtel'; country: string; operation: 'token' | 'collection' | 'payout' | 'balance' | 'status' };
type Sample = { scope: TransportScope; outcome: TransportOutcome; status: number | null; durationMs: number; retry: boolean };
type Counter = {
  provider: string; country: string; operation: string; requests: number; successes: number;
  httpErrors: number; networkErrors: number; timeouts: number; redirects: number;
  retries: number; totalDurationMs: number; maxDurationMs: number; lastStatus: number | null;
};
export class TransportMetrics {
  private readonly counters = new Map<string, Counter>();
  private readonly startedAt = new Date().toISOString();
  record(sample: Sample): void {
    const { provider, country, operation } = sample.scope;
    if (!/^[A-Z]{2}$/.test(country)) return;
    const key = [provider, country, operation].join(':');
    let row = this.counters.get(key);
    if (!row) {
      if (this.counters.size >= 256) return;
      row = { provider, country, operation, requests: 0, successes: 0, httpErrors: 0,
        networkErrors: 0, timeouts: 0, redirects: 0, retries: 0, totalDurationMs: 0,
        maxDurationMs: 0, lastStatus: null };
      this.counters.set(key, row);
    }
    row.requests++;
    if (sample.outcome === 'ok') row.successes++;
    if (sample.outcome === 'http_error') row.httpErrors++;
    if (sample.outcome === 'network_error') row.networkErrors++;
    if (sample.outcome === 'timeout') row.timeouts++;
    if (sample.outcome === 'redirect') row.redirects++;
    if (sample.retry) row.retries++;
    const duration = Math.max(0, Math.round(sample.durationMs));
    row.totalDurationMs += duration;
    row.maxDurationMs = Math.max(row.maxDurationMs, duration);
    row.lastStatus = sample.status;
  }
  snapshot() {
    return { startedAt: this.startedAt, generatedAt: new Date().toISOString(), scope: 'process-local',
      metrics: Array.from(this.counters.values(), row => ({ ...row,
        averageDurationMs: Math.round(row.totalDurationMs / row.requests) })) };
  }
}
export const transportMetrics = new TransportMetrics();
