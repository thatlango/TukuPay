/** Validate operational settings before scheduling a reconciliation timer. */
export function reconciliationSettings(env: NodeJS.ProcessEnv = process.env): {
  enabled: boolean; intervalMs: number; batchSize: number;
} {
  const enabled = (env.RECONCILIATION_ENABLED ?? 'true').trim().toLowerCase();
  if (enabled !== 'true' && enabled !== 'false') throw new Error('Invalid RECONCILIATION_ENABLED');
  const integer = (name: string, fallback: number, min: number, max: number): number => {
    const raw = env[name];
    if (raw === undefined) return fallback;
    if (!/^\d+$/.test(raw)) throw new Error('Invalid ' + name);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('Invalid ' + name);
    return value;
  };
  return {
    enabled: enabled === 'true',
    intervalMs: integer('RECONCILIATION_INTERVAL_MS', 15000, 5000, 3600000),
    batchSize: integer('RECONCILIATION_BATCH_SIZE', 50, 1, 500),
  };
}
