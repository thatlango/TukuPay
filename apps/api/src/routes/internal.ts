import { boundedInteger } from '../utils/request-validation.js';
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
        (SELECT count(*)::int FROM payout_requests) payout_requests,
        (SELECT count(*)::int FROM payout_requests WHERE status IN ('APPROVAL_REQUIRED','APPROVED','PENDING')) payouts_pending,
        (SELECT count(*)::int FROM payout_requests WHERE status='SUCCESSFUL') payouts_successful,
        (SELECT count(*)::int FROM webhook_events WHERE processing_error IS NOT NULL) webhook_errors,
        (SELECT count(*)::int FROM reconciliation_runs WHERE status='FAILED') reconciliation_failures,
        (SELECT coalesce(jsonb_agg(jsonb_build_object('currency',currency,'collectedMinor',collected_minor,'paidOutMinor',paid_out_minor) ORDER BY currency),'[]'::jsonb)
         FROM (
           SELECT currency,coalesce(sum(amount_minor) FILTER (WHERE kind='collection'),0)::text AS collected_minor,
                  coalesce(sum(amount_minor) FILTER (WHERE kind='payout'),0)::text AS paid_out_minor
           FROM (
             SELECT currency,amount_minor,'collection' AS kind FROM payment_intents WHERE status='SUCCESSFUL'
             UNION ALL
             SELECT currency,amount_minor,'payout' AS kind FROM payout_requests WHERE status='SUCCESSFUL'
           ) amounts GROUP BY currency
         ) scoped_amounts) amounts_by_currency,
        (SELECT max(updated_at) FROM payment_intents) last_payment_at,
        (SELECT max(updated_at) FROM payout_requests) last_payout_at,
        (SELECT max(received_at) FROM webhook_events) last_webhook_at
    `);
    const row = result.rows[0] ?? {};
    return {
      productCode: 'tukupay',
      schemaVersion: 2,
      amountsByCurrency: row.amounts_by_currency ?? [],
      generatedAt: new Date().toISOString(),
      kpis: {
        paymentIntents: Number(row.payment_intents ?? 0),
        paymentsPending: Number(row.payments_pending ?? 0),
        paymentsSuccessful: Number(row.payments_successful ?? 0),
        payoutRequests: Number(row.payout_requests ?? 0),
        payoutsPending: Number(row.payouts_pending ?? 0),
        payoutsSuccessful: Number(row.payouts_successful ?? 0),
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
    const limit = boundedInteger(body.limit,50,1,500);
    return { reconciliation: await reconciliation.runBatch(limit) };
  });
}
