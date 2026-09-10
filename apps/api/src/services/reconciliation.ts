import type { PaymentService } from './payment-service.js';

export class ReconciliationService {
  constructor(private readonly payments: PaymentService) {}

  async runBatch(limit = 50): Promise<{ checked: number; changed: number; errors: number }> {
    const ids = await this.payments.pendingPaymentIds(Math.max(1, Math.min(limit, 500)));
    let changed = 0;
    let errors = 0;

    for (const id of ids) {
      try {
        const before = await this.payments.getById(id);
        const after = await this.payments.refresh(id);
        if (before.status !== after.status) changed += 1;
      } catch {
        errors += 1;
      }
    }

    return { checked: ids.length, changed, errors };
  }
}

export function startReconciliationWorker(
  reconciler: ReconciliationService,
  logger: { info: (obj: unknown, message?: string) => void; error: (obj: unknown, message?: string) => void },
): () => void {
  if ((process.env.RECONCILIATION_ENABLED ?? 'true').toLowerCase() === 'false') return () => undefined;

  const intervalMs = Math.max(5_000, Number(process.env.RECONCILIATION_INTERVAL_MS ?? 15_000));
  const batchSize = Math.max(1, Number(process.env.RECONCILIATION_BATCH_SIZE ?? 50));
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const result = await reconciler.runBatch(batchSize);
      if (result.checked > 0) logger.info(result, 'TukuPay reconciliation batch completed');
    } catch (error) {
      logger.error({ err: error }, 'TukuPay reconciliation batch failed');
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  const initial = setTimeout(() => void tick(), Math.min(5_000, intervalMs));
  initial.unref();

  return () => {
    clearInterval(timer);
    clearTimeout(initial);
  };
}
