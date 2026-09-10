import { randomUUID } from 'node:crypto';
import { db } from '../db/pool.js';
import type { ProviderCode } from '../domain/payments.js';
import { TukuPayError } from '../errors.js';
import { majorToMinor, minorToMajor } from '../utils/money.js';

export type RecordSettlementInput = {
  provider: ProviderCode;
  country: string;
  currency: string;
  settlementReference: string;
  grossAmount: string;
  feeAmount?: string;
  bankReference?: string;
  metadata?: Record<string, unknown>;
};

export class SettlementService {
  async record(input: RecordSettlementInput, actor: string): Promise<Record<string, unknown>> {
    const gross = majorToMinor(input.grossAmount, input.currency);
    const fee = input.feeAmount ? majorToMinor(input.feeAmount, input.currency) : 0n;
    if (fee > gross) {
      throw new TukuPayError('Settlement fee cannot exceed gross amount', 'INVALID_SETTLEMENT', 400);
    }
    const net = gross - fee;
    const id = randomUUID();
    const client = await db.connect();

    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO settlements
          (id,country_code,provider_code,currency,settlement_reference,gross_minor,
           fee_minor,net_minor,bank_reference,status,settled_at,metadata,recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'RECORDED',now(),$10::jsonb,$11)`,
        [
          id, input.country.toUpperCase(), input.provider, input.currency.toUpperCase(),
          input.settlementReference, gross.toString(), fee.toString(), net.toString(),
          input.bankReference ?? null, JSON.stringify(input.metadata ?? {}), actor,
        ],
      );

      const journal = await client.query<{ id: string }>(
        `INSERT INTO journal_entries
          (reference_type,reference_id,country_code,currency,description)
         VALUES ('PROVIDER_SETTLEMENT',$1,$2,$3,$4)
         ON CONFLICT (reference_type,reference_id) DO NOTHING
         RETURNING id`,
        [
          id, input.country.toUpperCase(), input.currency.toUpperCase(),
          `${input.provider.toUpperCase()} settlement ${input.settlementReference}`,
        ],
      );
      const journalId = journal.rows[0]?.id;
      if (journalId) {
        const country = input.country.toUpperCase();
        const currency = input.currency.toUpperCase();
        const bankCode = `BANK:${country}:${currency}:SETTLEMENT`;
        const clearingCode = `${input.provider.toUpperCase()}:${country}:${currency}:CLEARING`;
        const feeCode = `FEES:${input.provider.toUpperCase()}:${country}:${currency}`;

        const bank = await client.query<{ id: string }>(
          `INSERT INTO ledger_accounts(code,name,account_type,country_code,currency)
           VALUES ($1,'Bank settlement account','ASSET',$2,$3)
           ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
          [bankCode, country, currency],
        );
        const clearing = await client.query<{ id: string }>(
          `INSERT INTO ledger_accounts(code,name,account_type,country_code,currency)
           VALUES ($1,'Provider collection clearing','ASSET',$2,$3)
           ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
          [clearingCode, country, currency],
        );

        if (net > 0n) {
          await client.query(
            `INSERT INTO ledger_postings(journal_entry_id,ledger_account_id,side,amount_minor)
             VALUES ($1,$2,'DEBIT',$3)`,
            [journalId, bank.rows[0]!.id, net.toString()],
          );
        }
        if (fee > 0n) {
          const fees = await client.query<{ id: string }>(
            `INSERT INTO ledger_accounts(code,name,account_type,country_code,currency)
             VALUES ($1,'Payment processing fees','EXPENSE',$2,$3)
             ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
            [feeCode, country, currency],
          );
          await client.query(
            `INSERT INTO ledger_postings(journal_entry_id,ledger_account_id,side,amount_minor)
             VALUES ($1,$2,'DEBIT',$3)`,
            [journalId, fees.rows[0]!.id, fee.toString()],
          );
        }
        await client.query(
          `INSERT INTO ledger_postings(journal_entry_id,ledger_account_id,side,amount_minor)
           VALUES ($1,$2,'CREDIT',$3)`,
          [journalId, clearing.rows[0]!.id, gross.toString()],
        );
      }

      await client.query(
        `INSERT INTO audit_events(actor,action,entity_type,entity_id,metadata)
         VALUES ($1,'settlement.recorded','settlement',$2,$3::jsonb)`,
        [actor, id, JSON.stringify({ provider: input.provider, reference: input.settlementReference })],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') {
        throw new TukuPayError('Settlement reference already exists', 'DUPLICATE_SETTLEMENT', 409);
      }
      throw error;
    } finally {
      client.release();
    }

    return {
      id,
      provider: input.provider,
      country: input.country.toUpperCase(),
      currency: input.currency.toUpperCase(),
      settlementReference: input.settlementReference,
      grossAmount: minorToMajor(gross, input.currency),
      feeAmount: minorToMajor(fee, input.currency),
      netAmount: minorToMajor(net, input.currency),
      status: 'RECORDED',
    };
  }
}
