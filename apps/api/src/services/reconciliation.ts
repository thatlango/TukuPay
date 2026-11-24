import { reconciliationSettings } from '../config/reconciliation-settings.js';
import { boundedInteger } from '../utils/request-validation.js';
import type { PayoutService } from './payout-service.js';
import type { PaymentService } from './payment-service.js';

export class ReconciliationService {
  constructor(
    private readonly payments: PaymentService,
    private readonly payouts: PayoutService,
  ) {}

  async runBatch(limit = 50): Promise<{
    checked: number;
    changed: number;
    errors: number;
    paymentsChecked: number;
    payoutsChecked: number;
  }> {
    const bounded = boundedInteger(limit,50,1,500);
    const [paymentIds, payoutIds] = await Promise.all([
      this.payments.pendingPaymentIds(bounded),
      this.payouts.pendingPayoutIds(bounded),
    ]);

    let changed = 0;
    let errors = 0;

    for (const id of paymentIds) {
      try {
        const before = await this.payments.getById(id);
        const after = await this.payments.refresh(id);
        if (before.status !== after.status) changed += 1;
      } catch {
        errors += 1;
      }
    }

    for (const id of payoutIds) {
      try {
        const before = await this.payouts.getById(id);
        const after = await this.payouts.refresh(id);
        if (before.status !== after.status) changed += 1;
      } catch {
        errors += 1;
      }
    }

    return {
      checked: paymentIds.length + payoutIds.length,
      changed,
      errors,
      paymentsChecked: paymentIds.length,
      payoutsChecked: payoutIds.length,
    };
  }
}

export function startReconciliationWorker(
  reconciler: ReconciliationService,
  logger: { info: (obj: unknown, message?: string) => void; error: (obj: unknown, message?: string) => void },
): () => void {
  const { enabled, intervalMs, batchSize } = reconciliationSettings();
  if (!enabled) return () => undefined;
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
