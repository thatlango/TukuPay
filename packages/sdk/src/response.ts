export type FinancialEvent = {
  id: string;
  sequence: string;
  schema_version: 1;
  kind: 'collection' | 'payout';
  transaction_id: string;
  product_code: string;
  status: string;
  currency: string;
  amount_minor: string;
  occurred_at: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLLECTION = ['CREATED','PENDING','SUCCESSFUL','FAILED','CANCELLED','EXPIRED'];
const PAYOUT = ['APPROVAL_REQUIRED','APPROVED','PENDING','SUCCESSFUL','FAILED','CANCELLED'];
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const string = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const nullableString = (v: unknown): boolean => v === null || typeof v === 'string';
const uuid = (v: unknown): boolean => string(v) && UUID.test(v);
const positiveInteger = (v: unknown): boolean => string(v) && /^[1-9][0-9]{0,18}$/.test(v) && BigInt(v) <= 9223372036854775807n;

export function validTransaction(value: unknown, product: string, kind: 'payment' | 'payout'): boolean {
  if (!record(value)) return false;
  const statuses = kind === 'payment' ? COLLECTION : PAYOUT;
  return uuid(value.id) && value.product === product && string(value.externalId)
    && string(value.country) && /^[A-Z]{2}$/.test(value.country)
    && (value.provider === 'mtn' || value.provider === 'airtel' || (kind === 'payment' && value.provider === null))
    && nullableString(value.providerReference) && string(value.amount) && /^\d+(?:\.\d+)?$/.test(value.amount)
    && /[1-9]/.test(value.amount) && string(value.currency) && /^[A-Z]{3}$/.test(value.currency)
    && string(value.phone) && string(value.status) && statuses.includes(value.status)
    && nullableString(value.providerStatus) && nullableString(value.lastError) && record(value.metadata)
    && (kind !== 'payout' || (nullableString(value.requestedBy) && nullableString(value.approvedBy)));
}

export function validEventBatch(value: unknown, product: string): value is { delivery: 'at-least-once'; events: FinancialEvent[] } {
  if (!record(value) || value.delivery !== 'at-least-once' || !Array.isArray(value.events) || value.events.length > 100) return false;
  const ids = new Set<string>();
  for (const event of value.events) {
    if (!record(event) || !string(event.id) || !uuid(event.id) || ids.has(event.id)
      || !uuid(event.transaction_id) || event.product_code !== product || event.schema_version !== 1
      || !positiveInteger(event.sequence) || !positiveInteger(event.amount_minor)
      || !string(event.currency) || !/^[A-Z]{3}$/.test(event.currency)
      || !string(event.occurred_at) || !Number.isFinite(Date.parse(event.occurred_at))
      || (event.kind !== 'collection' && event.kind !== 'payout') || !string(event.status)
      || !(event.kind === 'collection' ? COLLECTION : PAYOUT).includes(event.status)) return false;
    ids.add(event.id);
  }
  return true;
}
