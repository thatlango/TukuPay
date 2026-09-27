import { MARKETS } from '../config/markets.js';
import { simulatorEnabled } from '../config/provider-credentials.js';
import { db } from '../db/pool.js';
import type { ProviderCode } from '../domain/payments.js';
import { ProviderRouter } from './provider-router.js';

export class OpsService {
  constructor(private readonly router: ProviderRouter) {}

  async summary(): Promise<Record<string, unknown>> {
    const [
      payments,
      paymentsByCurrency,
      payouts,
      payoutsByCurrency,
      aging,
      rails,
      balances,
      settlements,
      settlementsByCurrency,
      productPerformance,
      recentPayments,
      reconciliationHealth,
      reconciliationRuns,
      webhookHealth,
      dailyCollections,
    ] = await Promise.all([
      db.query<{ status: string; count: string; amount_minor: string }>(
        `SELECT status, count(*)::text, COALESCE(sum(amount_minor),0)::text AS amount_minor
           FROM payment_intents
          WHERE created_at >= now() - interval '24 hours'
          GROUP BY status ORDER BY status`,
      ),
      db.query<{ status: string; currency: string; count: string; amount_minor: string }>(
        `SELECT status,currency,count(*)::text,COALESCE(sum(amount_minor),0)::text AS amount_minor
           FROM payment_intents
          WHERE created_at >= now() - interval '24 hours'
          GROUP BY status,currency
          ORDER BY currency,status`,
      ),
      db.query<{ status: string; count: string; amount_minor: string }>(
        `SELECT status, count(*)::text, COALESCE(sum(amount_minor),0)::text AS amount_minor
           FROM payout_requests
          WHERE created_at >= now() - interval '24 hours'
          GROUP BY status ORDER BY status`,
      ),
      db.query<{ status: string; currency: string; count: string; amount_minor: string }>(
        `SELECT status,currency,count(*)::text,COALESCE(sum(amount_minor),0)::text AS amount_minor
           FROM payout_requests
          WHERE created_at >= now() - interval '24 hours'
          GROUP BY status,currency
          ORDER BY currency,status`,
      ),
      db.query<{ pending: string; over_5m: string; over_30m: string }>(
        `SELECT
           count(*) FILTER (WHERE status='PENDING')::text AS pending,
           count(*) FILTER (WHERE status='PENDING' AND created_at < now()-interval '5 minutes')::text AS over_5m,
           count(*) FILTER (WHERE status='PENDING' AND created_at < now()-interval '30 minutes')::text AS over_30m
         FROM payment_intents`,
      ),
      db.query<{ country_code: string; provider_code: ProviderCode; environment: string; enabled: boolean }>(
        `SELECT country_code,provider_code,environment,enabled
           FROM provider_markets ORDER BY country_code,provider_code,environment`,
      ),
      db.query<{ country_code: string; provider_code: ProviderCode; account_type: string; available_major: string; currency: string; simulated: boolean; captured_at: Date }>(
        `SELECT DISTINCT ON (country_code,provider_code,account_type)
           country_code,provider_code,account_type,available_major,currency,simulated,captured_at
           FROM provider_balance_snapshots
          ORDER BY country_code,provider_code,account_type,captured_at DESC`,
      ),
      db.query<{ count: string; gross_minor: string; fee_minor: string }>(
        `SELECT count(*)::text, COALESCE(sum(gross_minor),0)::text AS gross_minor,
                COALESCE(sum(fee_minor),0)::text AS fee_minor
           FROM settlements WHERE settled_at >= now()-interval '24 hours'`,
      ),
      db.query<{ currency: string; count: string; gross_minor: string; fee_minor: string; net_minor: string }>(
        `SELECT currency,count(*)::text,COALESCE(sum(gross_minor),0)::text AS gross_minor,
                COALESCE(sum(fee_minor),0)::text AS fee_minor,
                COALESCE(sum(net_minor),0)::text AS net_minor
           FROM settlements
          WHERE settled_at >= now()-interval '24 hours'
          GROUP BY currency ORDER BY currency`,
      ),
      db.query<{
        product_code: string;
        currency: string;
        requests: string;
        successful: string;
        failed: string;
        pending: string;
        requested_minor: string;
        successful_minor: string;
      }>(
        `SELECT product_code,currency,
                count(*)::text AS requests,
                count(*) FILTER (WHERE status='SUCCESSFUL')::text AS successful,
                count(*) FILTER (WHERE status='FAILED')::text AS failed,
                count(*) FILTER (WHERE status='PENDING')::text AS pending,
                COALESCE(sum(amount_minor),0)::text AS requested_minor,
                COALESCE(sum(amount_minor) FILTER (WHERE status='SUCCESSFUL'),0)::text AS successful_minor
           FROM payment_intents
          WHERE created_at >= now()-interval '7 days'
          GROUP BY product_code,currency
          ORDER BY COALESCE(sum(amount_minor) FILTER (WHERE status='SUCCESSFUL'),0) DESC,product_code,currency`,
      ),
      db.query<{
        id: string;
        external_id: string;
        product_code: string;
        country_code: string;
        requested_provider: ProviderCode | null;
        provider_code: ProviderCode | null;
        amount_minor: string;
        currency: string;
        status: string;
        created_at: Date;
        updated_at: Date;
        provider_reference: string | null;
        provider_status: string | null;
        last_checked_at: Date | null;
        attempts: number | null;
        last_error: string | null;
      }>(
        `SELECT pi.id,pi.external_id,pi.product_code,pi.country_code,pi.requested_provider,
                tx.provider_code,pi.amount_minor::text,pi.currency,pi.status,pi.created_at,pi.updated_at,
                tx.provider_reference,tx.provider_status,tx.last_checked_at,tx.attempts,tx.last_error
           FROM payment_intents pi
           LEFT JOIN LATERAL (
             SELECT pm.provider_code,pt.provider_reference,pt.provider_status,pt.last_checked_at,pt.attempts,pt.last_error
               FROM provider_transactions pt
               JOIN provider_markets pm ON pm.id=pt.provider_market_id
              WHERE pt.payment_intent_id=pi.id
              ORDER BY pt.created_at DESC
              LIMIT 1
           ) tx ON TRUE
          ORDER BY pi.created_at DESC
          LIMIT 40`,
      ),
      db.query<{
        running: string;
        completed_24h: string;
        failed_24h: string;
        checked_24h: string;
        corrected_24h: string;
        last_completed_at: Date | null;
        last_failed_at: Date | null;
      }>(
        `SELECT
           count(*) FILTER (WHERE status='RUNNING')::text AS running,
           count(*) FILTER (WHERE status='COMPLETED' AND started_at>=now()-interval '24 hours')::text AS completed_24h,
           count(*) FILTER (WHERE status='FAILED' AND started_at>=now()-interval '24 hours')::text AS failed_24h,
           COALESCE(sum(checked_count) FILTER (WHERE started_at>=now()-interval '24 hours'),0)::text AS checked_24h,
           COALESCE(sum(corrected_count) FILTER (WHERE started_at>=now()-interval '24 hours'),0)::text AS corrected_24h,
           max(completed_at) FILTER (WHERE status='COMPLETED') AS last_completed_at,
           max(completed_at) FILTER (WHERE status='FAILED') AS last_failed_at
         FROM reconciliation_runs`,
      ),
      db.query<{
        id: string;
        country_code: string;
        provider_code: ProviderCode;
        status: string;
        checked_count: number;
        corrected_count: number;
        started_at: Date;
        completed_at: Date | null;
        error: string | null;
      }>(
        `SELECT rr.id,pm.country_code,pm.provider_code,rr.status,rr.checked_count,rr.corrected_count,
                rr.started_at,rr.completed_at,rr.error
           FROM reconciliation_runs rr
           JOIN provider_markets pm ON pm.id=rr.provider_market_id
          ORDER BY rr.started_at DESC
          LIMIT 12`,
      ),
      db.query<{
        received_24h: string;
        pending_24h: string;
        errors_24h: string;
        last_received_at: Date | null;
        last_processed_at: Date | null;
      }>(
        `SELECT
           count(*) FILTER (WHERE received_at>=now()-interval '24 hours')::text AS received_24h,
           count(*) FILTER (WHERE received_at>=now()-interval '24 hours' AND processed_at IS NULL)::text AS pending_24h,
           count(*) FILTER (WHERE received_at>=now()-interval '24 hours' AND processing_error IS NOT NULL)::text AS errors_24h,
           max(received_at) AS last_received_at,
           max(processed_at) AS last_processed_at
         FROM webhook_events`,
      ),
      db.query<{
        day: string;
        currency: string;
        status: string;
        count: string;
        amount_minor: string;
      }>(
        `SELECT date_trunc('day',created_at)::date::text AS day,currency,status,
                count(*)::text,COALESCE(sum(amount_minor),0)::text AS amount_minor
           FROM payment_intents
          WHERE created_at>=now()-interval '7 days'
          GROUP BY 1,currency,status
          ORDER BY 1,currency,status`,
      ),
    ]);

    const agingRow = aging.rows[0] ?? { pending: '0', over_5m: '0', over_30m: '0' };
    const reconciliationRow = reconciliationHealth.rows[0] ?? {
      running: '0',
      completed_24h: '0',
      failed_24h: '0',
      checked_24h: '0',
      corrected_24h: '0',
      last_completed_at: null,
      last_failed_at: null,
    };
    const webhookRow = webhookHealth.rows[0] ?? {
      received_24h: '0',
      pending_24h: '0',
      errors_24h: '0',
      last_received_at: null,
      last_processed_at: null,
    };

    const attention: Array<{ code: string; severity: 'warning' | 'critical'; count: number }> = [];
    const pendingOver30m = Number(agingRow.over_30m ?? 0);
    const webhookErrors = Number(webhookRow.errors_24h ?? 0);
    const reconciliationFailures = Number(reconciliationRow.failed_24h ?? 0);
    if (pendingOver30m > 0) {
      attention.push({ code: 'PENDING_OVER_30M', severity: 'critical', count: pendingOver30m });
    }
    if (webhookErrors > 0) {
      attention.push({ code: 'WEBHOOK_ERRORS_24H', severity: 'critical', count: webhookErrors });
    }
    if (reconciliationFailures > 0) {
      attention.push({ code: 'RECONCILIATION_FAILED_24H', severity: 'warning', count: reconciliationFailures });
    }

    return {
      generatedAt: new Date().toISOString(),
      simulator: simulatorEnabled(),
      payments24h: payments.rows,
      payments24hByCurrency: paymentsByCurrency.rows,
      payouts24h: payouts.rows,
      payouts24hByCurrency: payoutsByCurrency.rows,
      pendingAging: agingRow,
      rails: rails.rows,
      balances: balances.rows,
      settlements24h: settlements.rows[0] ?? { count: '0', gross_minor: '0', fee_minor: '0' },
      settlements24hByCurrency: settlementsByCurrency.rows,
      productPerformance7d: productPerformance.rows,
      recentPayments: recentPayments.rows,
      reconciliation: {
        ...reconciliationRow,
        recentRuns: reconciliationRuns.rows,
      },
      webhooks: webhookRow,
      dailyCollections7d: dailyCollections.rows,
      attention,
    };
  }

  async captureBalance(
    provider: ProviderCode,
    country: string,
    account: 'collection' | 'disbursement',
  ): Promise<Record<string, unknown>> {
    const market = MARKETS[country.toUpperCase()];
    if (!market) throw new Error(`Unsupported market: ${country}`);
    const adapter = this.router.resolveBalance(country.toUpperCase(), provider);
    if (!adapter.getBalance) throw new Error(`${provider} balance operation is unavailable`);

    const result = await adapter.getBalance(
      { country: country.toUpperCase(), currency: market.currency },
      account,
    );
    const simulated = simulatorEnabled();
    const saved = await db.query<{ id: string; captured_at: Date }>(
      `INSERT INTO provider_balance_snapshots
        (country_code,provider_code,account_type,available_major,currency,simulated,raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       RETURNING id,captured_at`,
      [
        country.toUpperCase(), provider, account, result.available, result.currency,
        simulated, JSON.stringify(result.raw ?? null),
      ],
    );
    return {
      id: saved.rows[0]!.id,
      country: country.toUpperCase(),
      provider,
      account,
      available: result.available,
      currency: result.currency,
      simulated,
      capturedAt: saved.rows[0]!.captured_at,
    };
  }
}
