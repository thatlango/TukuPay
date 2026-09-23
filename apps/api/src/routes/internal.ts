import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { db } from '../db/pool.js';
import { requireScopes } from '../auth/service-auth.js';
import type { ReconciliationService } from '../services/reconciliation.js';

export async function registerInternalRoutes(
  app: FastifyInstance,
  reconciliation: ReconciliationService,
): Promise<void> {
  app.get('/internal/estate-telemetry', async (request, reply) => {
    const expected = String(process.env.TUKU_ESTATE_INSIGHTS_SECRET ?? '');
    const supplied = String(request.headers['x-tuku-insights-key'] ?? '');
    let allowed = false;
    if (expected && supplied && expected.length === supplied.length) {
      try {
        allowed = timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
      } catch {
        allowed = false;
      }
    }
    if (!allowed) {
      return reply.code(401).send({ error: { code: 'ESTATE_TELEMETRY_UNAUTHORIZED', message: 'Telemetry credential is invalid.' } });
    }

    const result = await db.query(`
      SELECT
        (SELECT count(*)::int FROM payment_intents) payment_intents,
        (SELECT count(*)::int FROM payment_intents WHERE status='PENDING') payments_pending,
        (SELECT count(*)::int FROM payment_intents WHERE status='SUCCESSFUL') payments_successful,
        (SELECT coalesce(sum(amount_minor),0)::bigint FROM payment_intents WHERE status='SUCCESSFUL') collected_minor,
        (SELECT count(*)::int FROM payout_requests) payout_requests,
        (SELECT count(*)::int FROM payout_requests WHERE status IN ('APPROVAL_REQUIRED','APPROVED','PENDING')) payouts_pending,
        (SELECT count(*)::int FROM payout_requests WHERE status='SUCCESSFUL') payouts_successful,
        (SELECT coalesce(sum(amount_minor),0)::bigint FROM payout_requests WHERE status='SUCCESSFUL') paid_out_minor,
        (SELECT count(*)::int FROM webhook_events WHERE processing_error IS NOT NULL) webhook_errors,
        (SELECT count(*)::int FROM reconciliation_runs WHERE status='FAILED') reconciliation_failures,
        (SELECT max(updated_at) FROM payment_intents) last_payment_at,
        (SELECT max(updated_at) FROM payout_requests) last_payout_at,
        (SELECT max(received_at) FROM webhook_events) last_webhook_at
    `);
    const row = result.rows[0] ?? {};
    return {
      productCode: 'tukupay',
      generatedAt: new Date().toISOString(),
      kpis: {
        paymentIntents: Number(row.payment_intents ?? 0),
        paymentsPending: Number(row.payments_pending ?? 0),
        paymentsSuccessful: Number(row.payments_successful ?? 0),
        collectedMinor: Number(row.collected_minor ?? 0),
        payoutRequests: Number(row.payout_requests ?? 0),
        payoutsPending: Number(row.payouts_pending ?? 0),
        payoutsSuccessful: Number(row.payouts_successful ?? 0),
        paidOutMinor: Number(row.paid_out_minor ?? 0),
        webhookErrors: Number(row.webhook_errors ?? 0),
        reconciliationFailures: Number(row.reconciliation_failures ?? 0),
      },
      activity: {
        lastPaymentAt: row.last_payment_at ? new Date(row.last_payment_at).toISOString() : null,
        lastPayoutAt: row.last_payout_at ? new Date(row.last_payout_at).toISOString() : null,
        lastWebhookAt: row.last_webhook_at ? new Date(row.last_webhook_at).toISOString() : null,
      },
    };
  });

  app.post('/internal/reconcile', { preHandler: requireScopes('reconcile:run') }, async (request) => {
    const body = request.body && typeof request.body === 'object'
      ? request.body as { limit?: unknown }
      : {};
    const parsed = Number(body.limit ?? 50);
    const limit = Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 500)) : 50;
    return { reconciliation: await reconciliation.runBatch(limit) };
  });
}
