import { db } from '../db/pool.js';
import { TukuPayError } from '../errors.js';

export type ReviewState = 'OPEN' | 'INVESTIGATING' | 'ESCALATED' | 'REVIEWED';
export type ReviewInput = { kind: 'collection' | 'payout'; id: string; state: ReviewState; assignedTo: string | null; note: string; expectedVersion: number };

export function parseReview(input: unknown): ReviewInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TukuPayError('Review object required','INVALID_REVIEW',400);
  const v = input as Record<string, unknown>;
  if ((v.kind !== 'collection' && v.kind !== 'payout') || typeof v.id !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.id)
    || !['OPEN','INVESTIGATING','ESCALATED','REVIEWED'].includes(String(v.state))
    || typeof v.note !== 'string' || !v.note.trim() || v.note.length > 1000
    || typeof v.expectedVersion !== 'number' || !Number.isSafeInteger(v.expectedVersion) || v.expectedVersion < 0
    || (v.assignedTo !== null && (typeof v.assignedTo !== 'string' || !/^[a-zA-Z0-9_.@-]{1,100}$/.test(v.assignedTo)))) {
    throw new TukuPayError('Invalid exception review','INVALID_REVIEW',400);
  }
  return { kind: v.kind, id: v.id, state: v.state as ReviewState, assignedTo: v.assignedTo as string | null, note: v.note.trim(), expectedVersion: v.expectedVersion };
}

export async function recordExceptionReview(input: ReviewInput, actor: string) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const table = input.kind === 'collection' ? 'payment_intents' : 'payout_requests';
    // Table is selected from a fixed allowlist; caller data is always parameterized.
    const exists = await client.query('SELECT id FROM ' + table + ' WHERE id=$1 FOR UPDATE', [input.id]);
    if (!exists.rowCount) throw new TukuPayError('Transaction not found','TRANSACTION_NOT_FOUND',404);
    const result = input.expectedVersion === 0
      ? await client.query(
        `INSERT INTO payment_exception_reviews(kind,transaction_id,state,assigned_to,note,updated_by)
         VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING *`,
        [input.kind,input.id,input.state,input.assignedTo,input.note,actor])
      : await client.query(
        `UPDATE payment_exception_reviews SET state=$3,assigned_to=$4,note=$5,updated_by=$6,updated_at=now(),version=version+1
          WHERE kind=$1 AND transaction_id=$2 AND version=$7 RETURNING *`,
        [input.kind,input.id,input.state,input.assignedTo,input.note,actor,input.expectedVersion]);
    if (!result.rowCount) throw new TukuPayError('Review changed; reload before editing','REVIEW_CONFLICT',409);
    await client.query(
      `INSERT INTO audit_events(actor,action,entity_type,entity_id,metadata)
       VALUES($1,'payment_exception.reviewed',$2,$3,$4::jsonb)`,
      [actor,input.kind,input.id,JSON.stringify({ state: input.state, assignedTo: input.assignedTo, note: input.note, version: result.rows[0].version })],
    );
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
