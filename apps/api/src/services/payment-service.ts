import { createHash, randomUUID } from 'node:crypto';
import { getMarket } from '../config/markets.js';
import { providerRuntimeMode } from '../config/provider-credentials.js';
import { db } from '../db/pool.js';
import type { CreatePaymentInput, PaymentStatus, ProviderCode } from '../domain/payments.js';
import { TukuPayError } from '../errors.js';
import { ProviderHttpError } from '../providers/http.js';
import { majorToMinor, minorToMajor } from '../utils/money.js';
import { normalizeMsisdn } from '../utils/msisdn.js';
import { ProviderRouter } from './provider-router.js';

type PaymentRow = {
  id: string;
  product_code: string;
  external_id: string;
  country_code: string;
  amount_minor: string;
  currency: string;
  phone_e164: string;
  description: string | null;
  status: PaymentStatus;
  metadata: Record<string, unknown>;
  provider: ProviderCode | null;
  provider_reference: string | null;
  provider_status: string | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
};

export type PaymentView = {
  id: string;
  product: string;
  externalId: string;
  country: string;
  provider: ProviderCode | null;
  providerReference: string | null;
  amount: string;
  currency: string;
  phone: string;
  description: string | null;
  status: PaymentStatus;
  providerStatus: string | null;
  lastError: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TukuPayError(`${field} is required`, 'VALIDATION_ERROR', 400);
  }
  return value.trim();
}

function safePayload(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return JSON.stringify({ serializationError: true });
  }
}

function extractReference(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : undefined;
  const transaction = data?.transaction && typeof data.transaction === 'object'
    ? data.transaction as Record<string, unknown>
    : root.transaction && typeof root.transaction === 'object'
      ? root.transaction as Record<string, unknown>
      : undefined;

  const candidates = [
    root.providerReference,
    root.referenceId,
    transaction?.id,
    root.transactionId,
    root.id,
  ];
  return candidates.find((value): value is string => typeof value === 'string' && value.length > 0);
}

export class PaymentService {
  constructor(private readonly router: ProviderRouter) {}

  private map(row: PaymentRow): PaymentView {
    return {
      id: row.id,
      product: row.product_code,
      externalId: row.external_id,
      country: row.country_code,
      provider: row.provider,
      providerReference: row.provider_reference,
      amount: minorToMajor(row.amount_minor, row.currency),
      currency: row.currency,
      phone: row.phone_e164,
      description: row.description,
      status: row.status,
      providerStatus: row.provider_status,
      lastError: row.last_error,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async findExisting(
    product: string,
    externalId: string,
    idempotencyKey?: string,
  ): Promise<PaymentView | null> {
    const result = await db.query<{ id: string }>(
      `SELECT id
         FROM payment_intents
        WHERE product_code = $1
          AND (external_id = $2 OR ($3::text IS NOT NULL AND idempotency_key = $3))
        ORDER BY created_at DESC
        LIMIT 1`,
      [product, externalId, idempotencyKey ?? null],
    );
    return result.rows[0] ? this.getById(result.rows[0].id) : null;
  }

  async create(input: CreatePaymentInput, idempotencyKey?: string): Promise<PaymentView> {
    const product = text(input.product, 'product').toLowerCase();
    const externalId = text(input.externalId, 'externalId');
    const country = text(input.country, 'country').toUpperCase();
    const currency = text(input.money?.currency, 'money.currency').toUpperCase();
    const amount = text(input.money?.amount, 'money.amount');
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

    const amountMinor = majorToMinor(amount, currency);
    const phone = normalizeMsisdn(text(input.phone, 'phone'), country);
    const provider = input.provider;
    if (provider !== undefined && provider !== 'mtn' && provider !== 'airtel') {
      throw new TukuPayError('provider must be mtn or airtel', 'INVALID_PROVIDER', 400);
    }

    const adapter = this.router.resolve(country, provider);
    const runtimeMode = providerRuntimeMode(adapter.provider, country);
    const providerMarket = await db.query<{ id: string }>(
      `SELECT id
         FROM provider_markets
        WHERE country_code = $1
          AND provider_code = $2
          AND environment = $3
          AND enabled = TRUE
        LIMIT 1`,
      [country, adapter.provider, runtimeMode],
    );
    const providerMarketId = providerMarket.rows[0]?.id;
    if (!providerMarketId) {
      throw new TukuPayError(
        `${adapter.provider} ${country} ${runtimeMode} is not activated in TukuPay`,
        'MARKET_NOT_ACTIVATED',
        503,
      );
    }

    const client = await db.connect();
    const paymentId = randomUUID();
    const providerReference = randomUUID();
    const normalizedInput: CreatePaymentInput = {
      ...input,
      product,
      externalId,
      country,
      provider: adapter.provider,
      money: { amount, currency },
      phone,
    };

    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO payment_intents
          (id, product_code, external_id, country_code, requested_provider, amount_minor,
           currency, phone_e164, description, status, metadata, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING',$10::jsonb,$11)`,
        [
          paymentId,
          product,
          externalId,
          country,
          adapter.provider,
          amountMinor.toString(),
          currency,
          phone,
          input.description ?? null,
          safePayload(input.metadata ?? {}),
          idempotencyKey ?? null,
        ],
      );
      await client.query(
        `INSERT INTO provider_transactions
          (payment_intent_id, provider_market_id, provider_reference, provider_status,
           normalized_status, request_payload, attempts)
         VALUES ($1,$2,$3,'CREATED','CREATED',$4::jsonb,0)`,
        [paymentId, providerMarketId, providerReference, safePayload(normalizedInput)],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      const pgCode = (error as { code?: string }).code;
      if (pgCode === '23505') {
        const raced = await this.findExisting(product, externalId, idempotencyKey);
        if (raced) return raced;
      }
      throw error;
    } finally {
      client.release();
    }

    try {
      const transaction = await adapter.collect(
        { country, currency },
        normalizedInput,
        providerReference,
      );
      await this.applyStatus(paymentId, providerReference, transaction.status, transaction.raw, null);
    } catch (error) {
      const retryable = !(error instanceof ProviderHttpError) || error.retryable;
      const status: PaymentStatus = retryable ? 'PENDING' : 'FAILED';
      const message = error instanceof Error ? error.message : 'Unknown provider error';
      await this.applyStatus(paymentId, providerReference, status, null, message);
      if (!retryable) {
        throw new TukuPayError(
          'Mobile money provider rejected the collection request',
          'PROVIDER_REJECTED',
          502,
        );
      }
    }

    return this.getById(paymentId);
  }

  async getById(id: string): Promise<PaymentView> {
    const result = await db.query<PaymentRow>(
      `SELECT pi.id, pi.product_code, pi.external_id, pi.country_code,
              pi.amount_minor::text, pi.currency, pi.phone_e164, pi.description,
              pi.status, pi.metadata, pm.provider_code AS provider,
              pt.provider_reference, pt.provider_status, pt.last_error,
              pi.created_at, pi.updated_at
         FROM payment_intents pi
         LEFT JOIN LATERAL (
           SELECT * FROM provider_transactions
            WHERE payment_intent_id = pi.id
            ORDER BY created_at DESC
            LIMIT 1
         ) pt ON TRUE
         LEFT JOIN provider_markets pm ON pm.id = pt.provider_market_id
        WHERE pi.id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new TukuPayError('Payment not found', 'PAYMENT_NOT_FOUND', 404);
    return this.map(row);
  }

  async refresh(id: string): Promise<PaymentView> {
    const transactionResult = await db.query<{
      provider_reference: string;
      provider_code: ProviderCode;
      country_code: string;
      currency: string;
      normalized_status: PaymentStatus;
    }>(
      `SELECT pt.provider_reference, pm.provider_code, pi.country_code, pi.currency,
              pt.normalized_status
         FROM provider_transactions pt
         JOIN payment_intents pi ON pi.id = pt.payment_intent_id
         JOIN provider_markets pm ON pm.id = pt.provider_market_id
        WHERE pi.id = $1
        ORDER BY pt.created_at DESC
        LIMIT 1`,
      [id],
    );
    const transaction = transactionResult.rows[0];
    if (!transaction) throw new TukuPayError('Payment transaction not found', 'PAYMENT_NOT_FOUND', 404);
    if (transaction.normalized_status === 'SUCCESSFUL') return this.getById(id);

    const adapter = this.router.resolve(transaction.country_code, transaction.provider_code);
    const status = await adapter.getStatus(
      { country: transaction.country_code, currency: transaction.currency },
      transaction.provider_reference,
    );
    await this.applyStatus(id, transaction.provider_reference, status.status, status.raw, null);
    return this.getById(id);
  }

  async refreshByReference(
    provider: ProviderCode,
    country: string,
    reference: string,
  ): Promise<PaymentView | null> {
    const result = await db.query<{ payment_intent_id: string }>(
      `SELECT pt.payment_intent_id
         FROM provider_transactions pt
         JOIN provider_markets pm ON pm.id = pt.provider_market_id
        WHERE pm.provider_code = $1
          AND pm.country_code = $2
          AND pt.provider_reference = $3
        ORDER BY pt.created_at DESC
        LIMIT 1`,
      [provider, country.toUpperCase(), reference],
    );
    const id = result.rows[0]?.payment_intent_id;
    return id ? this.refresh(id) : null;
  }

  async pendingPaymentIds(limit: number): Promise<string[]> {
    const result = await db.query<{ payment_intent_id: string }>(
      `SELECT DISTINCT pt.payment_intent_id
         FROM provider_transactions pt
        WHERE pt.normalized_status IN ('CREATED','PENDING')
          AND (pt.last_checked_at IS NULL OR pt.last_checked_at < now() - interval '5 seconds')
        ORDER BY pt.payment_intent_id
        LIMIT $1`,
      [limit],
    );
    return result.rows.map((row) => row.payment_intent_id);
  }

  async recordWebhook(
    provider: ProviderCode,
    country: string,
    reference: string | undefined,
    payload: unknown,
    signature?: string,
  ): Promise<{ eventId: string | null; reference: string | undefined }> {
    const normalizedCountry = country.toUpperCase();
    const runtimeMode = providerRuntimeMode(provider, normalizedCountry);
    const market = await db.query<{ id: string }>(
      `SELECT id FROM provider_markets
        WHERE provider_code = $1 AND country_code = $2 AND environment = $3 AND enabled = TRUE
        LIMIT 1`,
      [provider, normalizedCountry, runtimeMode],
    );
    const providerMarketId = market.rows[0]?.id;
    if (!providerMarketId) {
      throw new TukuPayError('Webhook market is not active', 'MARKET_NOT_ACTIVATED', 404);
    }

    const resolvedReference = reference || extractReference(payload);
    const payloadText = safePayload(payload);
    const eventKey = createHash('sha256')
      .update(`${provider}:${normalizedCountry}:${resolvedReference ?? ''}:${payloadText}`)
      .digest('hex');
    const inserted = await db.query<{ id: string }>(
      `INSERT INTO webhook_events
        (provider_market_id, event_key, payload, signature)
       VALUES ($1,$2,$3::jsonb,$4)
       ON CONFLICT (provider_market_id, event_key) WHERE event_key IS NOT NULL DO NOTHING
       RETURNING id`,
      [providerMarketId, eventKey, payloadText, signature ?? null],
    );
    return { eventId: inserted.rows[0]?.id ?? null, reference: resolvedReference };
  }

  async processWebhook(
    eventId: string | null,
    provider: ProviderCode,
    country: string,
    reference: string | undefined,
  ): Promise<void> {
    try {
      if (!reference) throw new Error('Provider reference was not present in callback');
      await this.refreshByReference(provider, country, reference);
      if (eventId) {
        await db.query('UPDATE webhook_events SET processed_at = now(), processing_error = NULL WHERE id = $1', [eventId]);
      }
    } catch (error) {
      if (eventId) {
        await db.query(
          'UPDATE webhook_events SET processed_at = now(), processing_error = $2 WHERE id = $1',
          [eventId, error instanceof Error ? error.message : 'Unknown webhook processing error'],
        );
      }
      throw error;
    }
  }

  private async applyStatus(
    paymentId: string,
    providerReference: string,
    status: PaymentStatus,
    responsePayload: unknown,
    lastError: string | null,
  ): Promise<void> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE provider_transactions
            SET normalized_status = CASE WHEN normalized_status = 'SUCCESSFUL' THEN normalized_status ELSE $3 END,
                provider_status = $3,
                response_payload = COALESCE($4::jsonb, response_payload),
                last_error = $5,
                attempts = attempts + 1,
                last_checked_at = now(),
                updated_at = now()
          WHERE payment_intent_id = $1 AND provider_reference = $2`,
        [paymentId, providerReference, status, responsePayload === null ? null : safePayload(responsePayload), lastError],
      );
      await client.query(
        `UPDATE payment_intents
            SET status = CASE WHEN status = 'SUCCESSFUL' THEN status ELSE $2 END,
                updated_at = now()
          WHERE id = $1`,
        [paymentId, status],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    if (status === 'SUCCESSFUL') await this.ensureCollectionLedger(paymentId);
  }

  private async ensureCollectionLedger(paymentId: string): Promise<void> {
    const result = await db.query<{
      amount_minor: string;
      currency: string;
      country_code: string;
      product_code: string;
      provider_code: ProviderCode;
    }>(
      `SELECT pi.amount_minor::text, pi.currency, pi.country_code, pi.product_code, pm.provider_code
         FROM payment_intents pi
         JOIN provider_transactions pt ON pt.payment_intent_id = pi.id
         JOIN provider_markets pm ON pm.id = pt.provider_market_id
        WHERE pi.id = $1
        ORDER BY pt.created_at DESC
        LIMIT 1`,
      [paymentId],
    );
    const payment = result.rows[0];
    if (!payment) return;

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const journal = await client.query<{ id: string }>(
        `INSERT INTO journal_entries
          (reference_type, reference_id, country_code, currency, description)
         VALUES ('PAYMENT_COLLECTION',$1,$2,$3,$4)
         ON CONFLICT (reference_type, reference_id) DO NOTHING
         RETURNING id`,
        [paymentId, payment.country_code, payment.currency, `Collection for ${payment.product_code}`],
      );
      const journalId = journal.rows[0]?.id;
      if (!journalId) {
        await client.query('COMMIT');
        return;
      }

      const assetCode = `${payment.provider_code.toUpperCase()}:${payment.country_code}:${payment.currency}:CLEARING`;
      const liabilityCode = `PRODUCT:${payment.product_code.toUpperCase()}:${payment.country_code}:${payment.currency}:CUSTOMER_FUNDS`;
      const asset = await client.query<{ id: string }>(
        `INSERT INTO ledger_accounts (code,name,account_type,country_code,currency)
         VALUES ($1,$2,'ASSET',$3,$4)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [assetCode, `${payment.provider_code.toUpperCase()} collection clearing`, payment.country_code, payment.currency],
      );
      const liability = await client.query<{ id: string }>(
        `INSERT INTO ledger_accounts (code,name,account_type,product_code,country_code,currency)
         VALUES ($1,$2,'LIABILITY',$3,$4,$5)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [liabilityCode, `${payment.product_code} customer funds`, payment.product_code, payment.country_code, payment.currency],
      );
      await client.query(
        `INSERT INTO ledger_postings (journal_entry_id, ledger_account_id, side, amount_minor)
         VALUES ($1,$2,'DEBIT',$4), ($1,$3,'CREDIT',$4)`,
        [journalId, asset.rows[0]!.id, liability.rows[0]!.id, payment.amount_minor],
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
