/** Runtime checks for non-transaction SDK response envelopes. */
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=(value:unknown):value is string=>typeof value==='string'&&value.length>0;
const integer=(value:unknown):boolean=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const timestamp=(value:unknown):boolean=>text(value)&&Number.isFinite(Date.parse(value));
const nullableTime=(value:unknown):boolean=>value===null||timestamp(value);
const uuid=(value:unknown):boolean=>text(value)&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const scope=(value:Record<string,unknown>):boolean=>(value.kind==='collection'||value.kind==='payout');
const flag=(value:unknown):boolean=>record(value)&&typeof value.configured==='boolean'&&typeof value.available==='boolean'&&(!value.available||value.configured===true);
const provider=(v:unknown):boolean=>v==='mtn'||v==='airtel';
export function validCapabilities(value:unknown):boolean {
  if(!record(value)||typeof value.simulator!=='boolean'||!Array.isArray(value.markets)||!Array.isArray(value.candidates)||!text(value.note))return false;
  return value.markets.every(m=>record(m)&&text(m.country)&&/^[A-Z]{2}$/.test(m.country)&&text(m.currency)&&/^[A-Z]{3}$/.test(m.currency)&&Array.isArray(m.providers)&&m.providers.every(p=>
    record(p)&&provider(p.provider)&&(p.environment===null||p.environment==='sandbox'||p.environment==='production')&&typeof p.marketEnabled==='boolean'
    &&p.runtime===(value.simulator?'simulator':'operator')&&flag(p.collection)&&flag(p.payout)&&flag(p.balance)
    &&(p.callbacks==='wake-up-only'||p.callbacks==='disabled')
    &&record(p.balance)&&(p.balance.accounts===undefined||(record(p.balance.accounts)&&flag(p.balance.accounts.collection)&&flag(p.balance.accounts.disbursement)))))
    &&value.candidates.every(c=>record(c)&&['mpesa','paystack','flutterwave','wave','orange'].includes(String(c.provider))&&c.status==='planned'&&(c.initialCountry===null||(text(c.initialCountry)&&/^[A-Z]{2}$/.test(c.initialCountry)))&&(c.contractStage===undefined||text(c.contractStage)));
}
export function validExceptions(value:unknown):boolean {
  return record(value)&&timestamp(value.generatedAt)&&typeof value.limit==='number'&&Number.isInteger(value.limit)&&value.limit>=1&&value.limit<=200
    &&Array.isArray(value.exceptions)&&value.exceptions.length<=value.limit&&value.exceptions.every(e=>record(e)&&scope(e)&&uuid(e.id)
    &&text(e.product_code)&&text(e.country_code)&&/^[A-Z]{2}$/.test(e.country_code)&&provider(e.provider_code)&&text(e.currency)&&/^[A-Z]{3}$/.test(e.currency)
    &&text(e.status)&&timestamp(e.created_at)&&nullableTime(e.last_checked_at)&&integer(e.attempts)&&typeof e.has_error==='boolean'&&text(e.reason)
    &&(e.review_state===null||['OPEN','INVESTIGATING','ESCALATED','REVIEWED'].includes(String(e.review_state)))
    &&(e.assigned_to===null||text(e.assigned_to))&&nullableTime(e.review_updated_at)&&integer(e.review_version));
}
export function validTransport(value:unknown):boolean {
  return record(value)&&timestamp(value.startedAt)&&timestamp(value.generatedAt)&&value.scope==='process-local'&&Array.isArray(value.metrics)&&value.metrics.length<=256
    &&value.metrics.every(m=>record(m)&&provider(m.provider)&&text(m.country)&&/^[A-Z]{2}$/.test(m.country)&&text(m.operation)
    &&['requests','successes','httpErrors','networkErrors','timeouts','redirects','retries','totalDurationMs','maxDurationMs','averageDurationMs'].every(k=>integer(m[k]))
    &&(m.lastStatus===null||(typeof m.lastStatus==='number'&&Number.isInteger(m.lastStatus)&&m.lastStatus>=100&&m.lastStatus<=599)));
}
export type DispatchRecovery = {kind:'collection'|'payout';transaction_id:string;phase:'RESERVED'|'ATTEMPTING';created_at:string;attempted_at:string|null;observed_at:string|null};
export function validRecovery(value:unknown):value is {records:DispatchRecovery[];policy:string} {
  return record(value)&&text(value.policy)&&Array.isArray(value.records)&&value.records.length<=100&&value.records.every(r=>record(r)&&scope(r)&&uuid(r.transaction_id)
    &&(r.phase==='RESERVED'||r.phase==='ATTEMPTING')&&timestamp(r.created_at)&&nullableTime(r.attempted_at)&&nullableTime(r.observed_at));
}
export function validOpsSummary(value:unknown):boolean {
  return record(value)&&record(value.ops)&&timestamp(value.ops.generatedAt)&&typeof value.ops.simulator==='boolean';
}
export function validReview(value:unknown):boolean {
  return record(value)&&record(value.review)&&uuid(value.review.transaction_id)&&scope(value.review)&&integer(value.review.version);
}
