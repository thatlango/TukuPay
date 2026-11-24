// Read-only financial snapshot. Run against an authorized read replica or isolated simulator.
import pg from 'pg';
const { Client } = pg;
const mode = process.argv[2];
const days = Number(process.argv[3] ?? 14);
if (!['simulator','sandbox','production'].includes(mode) || !Number.isInteger(days) || days<1 || days>90) {
  console.error('Usage: node apps/api/scripts/export-intelligence.mjs simulator|sandbox|production [days:1-90]');
  process.exit(2);
}
const url = process.env.TUKUPAY_INTELLIGENCE_READONLY_URL;
if (!url) throw new Error('Dedicated read-only database URL required');
const client = new Client({connectionString:url,connectionTimeoutMillis:5000,statement_timeout:30000});
try {
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const time = (await client.query("SELECT now() AS as_of, now()-($1::int * interval '1 day') AS window_start",[days])).rows[0];
  const result = await client.query(`
    WITH records AS (
      SELECT 'collection' AS kind,pi.country_code AS country,pm.provider_code AS provider,
             pi.currency,pi.status,pi.amount_minor::text,pt.provider_reference AS reference,
             pi.updated_at AS timestamp,pi.created_at,
             CASE WHEN EXISTS(SELECT 1 FROM simulator_transactions sim
                WHERE sim.provider_code=pm.provider_code AND sim.country_code=pi.country_code
                 AND sim.provider_reference=pt.provider_reference AND sim.kind='collection')
                THEN 'simulator' ELSE pm.environment END AS environment
        FROM payment_intents pi JOIN LATERAL(
          SELECT provider_reference,provider_market_id FROM provider_transactions
            WHERE payment_intent_id=pi.id ORDER BY created_at DESC,id DESC LIMIT 1
        ) pt ON TRUE JOIN provider_markets pm ON pm.id=pt.provider_market_id
        WHERE pi.updated_at >= $1
      UNION ALL
      SELECT 'payout',pr.country_code,pm.provider_code,pr.currency,pr.status,pr.amount_minor::text,
             pt.provider_reference,pr.updated_at,pr.created_at,
             CASE WHEN EXISTS(SELECT 1 FROM simulator_transactions sim
                WHERE sim.provider_code=pm.provider_code AND sim.country_code=pr.country_code
                  AND sim.provider_reference=pt.provider_reference AND sim.kind='payout')
                THEN 'simulator' ELSE pm.environment END
        FROM payout_requests pr JOIN LATERAL(
          SELECT provider_reference,provider_market_id FROM provider_payout_transactions
            WHERE payout_request_id=pr.id ORDER BY created_at DESC,id DESC LIMIT 1
        ) pt ON TRUE JOIN provider_markets pm ON pm.id=pt.provider_market_id
        WHERE pr.updated_at >= $1
    )
    SELECT * FROM records WHERE environment=$2 ORDER BY timestamp,kind,reference LIMIT 50001
  `,[time.window_start,mode]);
  if(result.rows.length>50000) throw new Error('Snapshot exceeds limit; narrow time window');
  await client.query('ROLLBACK');
  console.log(JSON.stringify({schema_version:1,as_of:time.as_of,window_start:time.window_start,
    complete_daily_history:false,statement_coverage_complete:false,transactions:result.rows,statements:[]},null,2));
} catch {
  console.error('Read-only snapshot export failed. Check connectivity, schema, access, and row limits.');
  process.exitCode=1;
} finally { await client.end().catch(()=>{}); }
