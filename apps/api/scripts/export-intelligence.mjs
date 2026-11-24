// Read-only financial snapshot. Run against an authorized read replica or isolated simulator.
import pg from 'pg';
import { majorToMinor } from '../dist/utils/money.js';
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
  const binding=await client.query('SELECT environment FROM financial_environment_binding');
  if(binding.rows.length!==1||binding.rows[0].environment!==mode)throw new Error('Database environment mismatch');
  const time = (await client.query("SELECT now() AS as_of, now()-($1::int * interval '1 day') AS window_start",[days])).rows[0];
  const result = await client.query(`
    WITH records AS (
      SELECT 'collection' AS kind,pi.country_code AS country,pm.provider_code AS provider,
             pi.currency,pi.status,pi.amount_minor::text,pt.provider_reference AS reference,
             pi.updated_at AS timestamp,pi.created_at,
             $2::text AS environment
        FROM payment_intents pi JOIN LATERAL(
          SELECT provider_reference,provider_market_id FROM provider_transactions
            WHERE payment_intent_id=pi.id ORDER BY created_at DESC,id DESC LIMIT 1
        ) pt ON TRUE JOIN provider_markets pm ON pm.id=pt.provider_market_id
        WHERE pi.updated_at >= $1
      UNION ALL
      SELECT 'payout',pr.country_code,pm.provider_code,pr.currency,pr.status,pr.amount_minor::text,
             pt.provider_reference,pr.updated_at,pr.created_at,
             $2::text
        FROM payout_requests pr JOIN LATERAL(
          SELECT provider_reference,provider_market_id FROM provider_payout_transactions
            WHERE payout_request_id=pr.id ORDER BY created_at DESC,id DESC LIMIT 1
        ) pt ON TRUE JOIN provider_markets pm ON pm.id=pt.provider_market_id
        WHERE pr.updated_at >= $1
    )
    SELECT * FROM records WHERE environment=$2 ORDER BY timestamp,kind,reference LIMIT 50001
  `,[time.window_start,mode]);
  if(result.rows.length>50000) throw new Error('Snapshot exceeds limit; narrow time window');
  const balances=await client.query(`
    SELECT DISTINCT ON (country_code,provider_code,account_type,currency)
      country_code AS country,provider_code AS provider,account_type AS account,currency,
      available_major, captured_at AS timestamp
      FROM provider_balance_snapshots
      ORDER BY country_code,provider_code,account_type,currency,captured_at DESC,id DESC
      LIMIT 1001
  `);
  if(balances.rows.length>1000)throw new Error('Balance scope limit exceeded');
  const normalizedBalances=balances.rows.map(({available_major,...row})=>{
    const text=String(available_major);
    if(!/^\d+(?:\.\d+)?$/.test(text))throw new Error('Invalid stored balance');
    const normalized=text.includes('.')?text.replace(/0+$/,'').replace(/\.$/,''):text;
    const amount=/^0+$/.test(normalized)?0n:majorToMinor(normalized,row.currency);
    if(amount>9223372036854775807n)throw new Error('Balance exceeds range');
    return {...row,environment:mode,available_minor:amount.toString()};
  });
  await client.query('ROLLBACK');
  console.log(JSON.stringify({schema_version:1,as_of:time.as_of,window_start:time.window_start,
    complete_daily_history:false,statement_coverage_complete:false,transactions:result.rows,statements:[],treasury:{balances:normalizedBalances,obligations:[],obligations_complete:false,settlements:[]}},null,2));
} catch {
  console.error('Read-only snapshot export failed. Check connectivity, schema, access, and row limits.');
  process.exitCode=1;
} finally { await client.end().catch(()=>{}); }
