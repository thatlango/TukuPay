import { randomUUID } from 'node:crypto';
import { getMarket } from '../config/markets.js';
import { providerRuntimeMode } from '../config/provider-credentials.js';
import { db } from '../db/pool.js';
import type { PaymentStatus, ProviderCode } from '../domain/payments.js';
import type { CreatePayoutInput, PayoutStatus } from '../domain/payouts.js';
import { TukuPayError } from '../errors.js';
import { ProviderHttpError } from '../providers/http.js';
import { majorToMinor, minorToMajor } from '../utils/money.js';
import { normalizeMsisdn } from '../utils/msisdn.js';
import { ProviderRouter } from './provider-router.js';

type PayoutRow = {
  id: string;
  product_code: string;
  external_id: string;
  country_code: string;
  provider_code: ProviderCode;
  amount_minor: string;
  currency: string;
  phone_e164: string;
  description: string | null;
  status: PayoutStatus;
  metadata: Record<string, unknown>;
  approved_by: string | null;
  approved_at: Date | null;
  provider_reference: string | null;
  provider_status: string | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
};

export type PayoutView = {
  id: string;
  product: string;
  externalId: string;
  country: string;
  provider: ProviderCode;
  providerReference: string | null;
  amount: string;
  currency: string;
  phone: string;
  description: string | null;
  status: PayoutStatus;
  providerStatus: string | null;
  lastError: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

function required(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TukuPayError(`${field} is required`, 'VALIDATION_ERROR', 400);
  }
  return value.trim();
}

function toPayoutStatus(status: PaymentStatus): PayoutStatus {
  if (status === 'SUCCESSFUL') return 'SUCCESSFUL';
  if (status === 'FAILED' || status === 'EXPIRED') return 'FAILED';
  if (status === 'CANCELLED') return 'CANCELLED';
  return 'PENDING';
}

export class PayoutService {
  constructor(private readonly router: ProviderRouter) {}

  private map(row: PayoutRow): PayoutView {
    return {
      id: row.id,
      product: row.product_code,
      externalId: row.external_id,
      country: row.country_code,
      provider: row.provider_code,
      providerReference: row.provider_reference,
      amount: minorToMajor(row.amount_minor, row.currency),
      currency: row.currency,
      phone: row.phone_e164,
      description: row.description,
      status: row.status,
      providerStatus: row.provider_status,
      lastError: row.last_error,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getById(id: string): Promise<PayoutView> {
    const result = await db.query<PayoutRow>(
      `SELECT pr.id, pr.product_code, pr.external_id, pr.country_code, pr.provider_code,
              pr.amount_minor::text, pr.currency, pr.phone_e164, pr.description,
              pr.status, pr.metadata, pr.approved_by, pr.approved_at,
              ppt.provider_reference, ppt.provider_status, ppt.last_error,
              pr.created_at, pr.updated_at
         FROM payout_requests pr
         LEFT JOIN LATERAL (
           SELECT * FROM provider_payout_transactions
            WHERE payout_request_id = pr.id
            ORDER BY created_at DESC LIMIT 1
         ) ppt ON TRUE
        WHERE pr.id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new TukuPayError('Payout not found', 'PAYOUT_NOT_FOUND', 404);
    return this.map(row);
  }

  private async findExisting(
    product: string,
    externalId: string,
    idempotencyKey?: string,
  ): Promise<PayoutView | null> {
    const result = await db.query<{ id: string }>(
      `SELECT id FROM payout_requests
        WHERE product_code = $1
          AND (external_id = $2 OR ($3::text IS NOT NULL AND idempotency_key = $3))
        ORDER BY created_at DESC LIMIT 1`,
      [product, externalId, idempotencyKey ?? null],
    );
    return result.rows[0] ? this.getById(result.rows[0].id) : null;
  }

  async create(input: CreatePayoutInput, idempotencyKey?: string): Promise<PayoutView> {
    const product = required(input.product, 'product').toLowerCase();
    const externalId = required(input.externalId, 'externalId');
    const country = required(input.country, 'country').toUpperCase();
    const currency = required(input.money?.currency, 'money.currency').toUpperCase();
    const amount = required(input.money?.amount, 'money.amount');
    const market = getMarket(country);
    if (currency !== market.currency) {
      throw new TukuPayError(
        `${country} is configured for ${market.currency}, not ${currency}`,
        'CURRENCY_MISMATCH',
        400,
      );
    }

    const existing = await this.findExisting(product, externalId, idempotencyKey);
    if (existing) return existing;

    const adapter = this.router.resolvePayout(country, input.provider);
    const amountMinor = majorToMinor(amount, currency);
    const phone = normalizeMsisdn(required(input.phone, 'phone'), country);
    const id = randomUUID();

    try {
      await db.query(
        `INSERT INTO payout_requests
          (id, product_code, external_id, country_code, provider_code, amount_minor,
           currency, phone_e164, description, status, metadata, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'APPROVAL_REQUIRED',$10::jsonb,$11)`,
        [
          id, product, externalId, country, adapter.provider, amountMinor.toString(),
          currency, phone, input.description ?? null,
          JSON.stringify(input.metadata ?? {}), idempotencyKey ?? null,
        ],
      );
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        const raced = await this.findExisting(product, externalId, idempotencyKey);
        if (raced) return raced;
      }
      throw error;
    }
    return this.getById(id);
  }

  async approve(id: string, actor: string, reason?: string): Promise<PayoutView> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query<{ status: PayoutStatus }>(
        'SELECT status FROM payout_requests WHERE id = $1 FOR UPDATE',
        [id],
      );
      const row = current.rows[0];
      if (!row) throw new TukuPayError('Payout not found', 'PAYOUT_NOT_FOUND', 404);
      if (['SUCCESSFUL', 'PENDING', 'APPROVED'].includes(row.status)) {
        await client.query('COMMIT');
        return this.getById(id);
      }
      if (row.status !== 'APPROVAL_REQUIRED') {
        throw new TukuPayError(
          `Payout cannot be approved from ${row.status}`,
          'INVALID_PAYOUT_STATE',
          409,
        );
      }

      await client.query(
        `UPDATE payout_requests
            SET status='APPROVED', approved_by=$2, approved_at=now(), updated_at=now()
          WHERE id=$1`,
        [id, actor],
      );
      await client.query(
        `INSERT INTO payout_approvals (payout_request_id, approved_by, reason)
         VALUES ($1,$2,$3)`,
        [id, actor, reason ?? null],
      );
      await client.query(
        `INSERT INTO audit_events (actor, action, entity_type, entity_id, metadata)
         VALUES ($1,'payout.approved','payout',$2,$3::jsonb)`,
        [actor, id, JSON.stringify({ reason: reason ?? null })],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.dispatch(id);
  }

  private async dispatch(id: string): Promise<PayoutView> {
    const payout = await this.getById(id);
    if (payout.status !== 'APPROVED') return payout;

    const adapter = this.router.resolvePayout(payout.country, payout.provider);
    if (!adapter.payout) {
      throw new TukuPayError('Provider payout operation is unavailable', 'PAYOUT_UNAVAILABLE', 503);
    }

    const runtimeMode = providerRuntimeMode(payout.provider, payout.country);
    const market = await db.query<{ id: string }>(
      `SELECT id FROM provider_markets
        WHERE country_code=$1 AND provider_code=$2 AND environment=$3 AND enabled=TRUE
        LIMIT 1`,
      [payout.country, payout.provider, runtimeMode],
    );
    const providerMarketId = market.rows[0]?.id;
    if (!providerMarketId) {
      throw new TukuPayError('Payout market is not activated', 'MARKET_NOT_ACTIVATED', 503);
    }

    const providerReference = randomUUID();
    await db.query(
      `INSERT INTO provider_payout_transactions
        (payout_request_id, provider_market_id, provider_reference, normalized_status,
         request_payload)
       VALUES ($1,$2,$3,'PENDING',$4::jsonb)`,
      [
        payout.id,
        providerMarketId,
        providerReference,
        JSON.stringify({
          product: payout.product,
          externalId: payout.externalId,
          country: payout.country,
          provider: payout.provider,
          money: { amount: payout.amount, currency: payout.currency },
          phone: payout.phone,
          description: payout.description,
          metadata: payout.metadata,
        }),
      ],
    );
    await db.query(`UPDATE payout_requests SET status='PENDING', updated_at=now() WHERE id=$1`, [id]);

    const input: CreatePayoutInput = {
      product: payout.product,
      externalId: payout.externalId,
      country: payout.country,
      provider: payout.provider,
      money: { amount: payout.amount, currency: payout.currency },
      phone: payout.phone,
      metadata: payout.metadata,
    };
    if (payout.description) input.description = payout.description;

    try {
      const transaction = await adapter.payout(
        { country: payout.country, currency: payout.currency },
        input,
        providerReference,
      );
      await this.applyStatus(id, providerReference, transaction.status, transaction.raw, null);
    } catch (error) {
      const retryable = !(error instanceof ProviderHttpError) || error.retryable;
      await this.applyStatus(
        id,
        providerReference,
        retryable ? 'PENDING' : 'FAILED',
        null,
        error instanceof Error ? error.message : 'Unknown provider error',
      );
    }
    return this.getById(id);
  }

  async refresh(id: string): Promise<PayoutView> {
    const payout = await this.getById(id);
    if (['SUCCESSFUL', 'FAILED', 'CANCELLED', 'APPROVAL_REQUIRED'].includes(payout.status)) return payout;
    if (!payout.providerReference) return payout;

    const adapter = this.router.resolvePayout(payout.country, payout.provider);
    if (!adapter.getPayoutStatus) {
      throw new TukuPayError('Provider payout status is unavailable', 'PAYOUT_UNAVAILABLE', 503);
    }
    const status = await adapter.getPayoutStatus(
      { country: payout.country, currency: payout.currency },
      payout.providerReference,
    );
    await this.applyStatus(id, payout.providerReference, status.status, status.raw, null);
    return this.getById(id);
  }

  async pendingPayoutIds(limit: number): Promise<string[]> {
    const result = await db.query<{ payout_request_id: string }>(
      `SELECT DISTINCT payout_request_id
         FROM provider_payout_transactions
        WHERE normalized_status='PENDING'
          AND (last_checked_at IS NULL OR last_checked_at < now() - interval '5 seconds')
        ORDER BY payout_request_id
        LIMIT $1`,
      [Math.max(1, Math.min(limit, 500))],
    );
    return result.rows.map((row) => row.payout_request_id);
  }

  private async applyStatus(
    payoutId: string,
    providerReference: string,
    providerStatus: PaymentStatus,
    responsePayload: unknown,
    lastError: string | null,
  ): Promise<void> {
    const status = toPayoutStatus(providerStatus);
    const payload = responsePayload === null ? null : JSON.stringify(responsePayload);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE provider_payout_transactions
            SET normalized_status=$3, provider_status=$3,
                response_payload=COALESCE($4::jsonb,response_payload),
                last_error=$5, attempts=attempts+1, last_checked_at=now(), updated_at=now()
          WHERE payout_request_id=$1 AND provider_reference=$2`,
        [payoutId, providerReference, status, payload, lastError],
      );
      await client.query(
        `UPDATE payout_requests
            SET status = CASE WHEN status='SUCCESSFUL' THEN status ELSE $2 END,
                updated_at=now()
          WHERE id=$1`,
        [payoutId, status],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
