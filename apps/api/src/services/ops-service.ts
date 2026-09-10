import { MARKETS } from '../config/markets.js';
import { simulatorEnabled } from '../config/provider-credentials.js';
import { db } from '../db/pool.js';
import type { ProviderCode } from '../domain/payments.js';
import { ProviderRouter } from './provider-router.js';

export class OpsService {
  constructor(private readonly router: ProviderRouter) {}

  async summary(): Promise<Record<string, unknown>> {
    const [payments, payouts, aging, rails, balances, settlements] = await Promise.all([
      db.query<{ status: string; count: string; amount_minor: string }>(
        `SELECT status, count(*)::text, COALESCE(sum(amount_minor),0)::text AS amount_minor
           FROM payment_intents
          WHERE created_at >= now() - interval '24 hours'
          GROUP BY status ORDER BY status`,
      ),
      db.query<{ status: string; count: string; amount_minor: string }>(
        `SELECT status, count(*)::text, COALESCE(sum(amount_minor),0)::text AS amount_minor
           FROM payout_requests
          WHERE created_at >= now() - interval '24 hours'
          GROUP BY status ORDER BY status`,
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
    ]);

    return {
      generatedAt: new Date().toISOString(),
      simulator: simulatorEnabled(),
      payments24h: payments.rows,
      payouts24h: payouts.rows,
      pendingAging: aging.rows[0] ?? { pending: '0', over_5m: '0', over_30m: '0' },
      rails: rails.rows,
      balances: balances.rows,
      settlements24h: settlements.rows[0] ?? { count: '0', gross_minor: '0', fee_minor: '0' },
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
