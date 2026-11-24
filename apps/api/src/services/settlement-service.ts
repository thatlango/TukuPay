import { db } from '../db/pool.js';
import type { ProviderCode } from '../domain/payments.js';
import { TukuPayError } from '../errors.js';
import { currencyExponent, majorToMinor, minorToMajor } from '../utils/money.js';

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
    const country=input.country.trim().toUpperCase();
    const currency=input.currency.trim().toUpperCase();
    const reference=input.settlementReference.trim();
    const bankReference=input.bankReference?.trim() || null;
    if(!/^[A-Z]{2}$/.test(country)||!reference||reference.length>128||(bankReference?.length??0)>128)
      throw new TukuPayError('Invalid settlement scope or reference','INVALID_SETTLEMENT',400);
    if(!actor||actor==='unknown')throw new TukuPayError('Authenticated maker required','UNAUTHORIZED',401);
    const gross=majorToMinor(input.grossAmount,currency);
    const feeText=input.feeAmount?.trim()??'0';
    const exponent=currencyExponent(currency);
    const zero=/^0+(?:\.0+)?$/.test(feeText) && (feeText.split('.')[1]?.length??0)<=exponent;
    const fee=zero?0n:majorToMinor(feeText,currency);
    if(fee>gross)throw new TukuPayError('Settlement fee cannot exceed gross','INVALID_SETTLEMENT',400);
    try {
      const r=await db.query<{id:string}>(
        `INSERT INTO settlement_proposals(country_code,provider_code,currency,settlement_reference,bank_reference,
         gross_minor,fee_minor,net_minor,submitted_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [country,input.provider,currency,reference,bankReference,gross.toString(),fee.toString(),(gross-fee).toString(),actor],
      );
      return {id:r.rows[0]!.id,provider:input.provider,country,currency,settlementReference:reference,
        grossAmount:minorToMajor(gross,currency),feeAmount:minorToMajor(fee,currency),
        netAmount:minorToMajor(gross-fee,currency),status:'PROPOSED',ledgerPosted:false};
    } catch(error) {
      if((error as {code?:string}).code==='23505')throw new TukuPayError('Settlement proposal already exists','DUPLICATE_SETTLEMENT',409);
      throw error;
    }
  }
  async review(id:string,body:unknown,actor:string):Promise<Record<string,unknown>> {
    if(!/^[a-f0-9-]{36}$/i.test(id)||!body||typeof body!=='object'||Array.isArray(body))
      throw new TukuPayError('Invalid review','INVALID_REVIEW',400);
    const v=body as Record<string,unknown>;
    const decision=v.decision; const note=typeof v.note==='string'?v.note.trim():'';
    const evidence=typeof v.evidenceReference==='string'?v.evidenceReference.trim():null;
    if(!actor||actor==='unknown'||(decision!=='APPROVED_FOR_RECONCILIATION'&&decision!=='REJECTED')
      ||!note||note.length>1000||(evidence?.length??0)>256||(decision==='APPROVED_FOR_RECONCILIATION'&&!evidence))
      throw new TukuPayError('Independent review and evidence reference required','INVALID_REVIEW',400);
    const client=await db.connect();
    try {
      await client.query('BEGIN');
      const found=await client.query<{submitted_by:string}>('SELECT submitted_by FROM settlement_proposals WHERE id=$1 FOR UPDATE',[id]);
      const maker=found.rows[0]?.submitted_by;
      if(!maker)throw new TukuPayError('Proposal not found','NOT_FOUND',404);
      if(maker.toLowerCase()===actor.toLowerCase())throw new TukuPayError('Independent reviewer required','REVIEW_CONFLICT',403);
      const r=await client.query(
        `INSERT INTO settlement_proposal_reviews(proposal_id,decision,reviewer,evidence_reference,note)
         VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING proposal_id`,
        [id,decision,actor,evidence,note]);
      if(!r.rowCount)throw new TukuPayError('Proposal already reviewed','REVIEW_CONFLICT',409);
      await client.query('COMMIT');
      return {id,status:decision,ledgerPosted:false,reviewer:actor};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
}
