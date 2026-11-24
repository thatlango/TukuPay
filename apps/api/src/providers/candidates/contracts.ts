import { majorToMinor } from '../../utils/money.js';

export type CandidateRail = 'mpesa' | 'paystack' | 'flutterwave' | 'wave' | 'orange' | 'airtel';
export type CandidateOperation = 'collection' | 'payout';
export type CandidateIntent = { reference: string; amount: string; currency: string; operation: CandidateOperation };
export type CandidateReceipt = { reference: string; providerId: string | null; checkoutUrl: string | null; status: 'PENDING' };
export type CandidateEvidence = { status: 'PENDING' | 'FAILED' | 'SUCCESSFUL'; reason: string; providerId: string | null };

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid provider response');
  return value as Record<string, unknown>;
}
export function nonempty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}
export function identifier(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  return nonempty(value);
}
export function moneyMatches(value: unknown, intent: CandidateIntent, minor: boolean): boolean {
  try {
    if (typeof value !== 'string' && typeof value !== 'number') return false;
    if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) return false;
    const expected = majorToMinor(intent.amount, intent.currency);
    const str = String(value);
    if (minor) return /^\d+$/.test(str) && BigInt(str) === expected;
    const normalized = str.includes('.') ? str.replace(/0+$/, '').replace(/\.$/, '') : str;
    return majorToMinor(normalized, intent.currency) === expected;
  } catch { return false; }
}
function evidence(status: CandidateEvidence['status'], reason: string, providerId: string | null = null): CandidateEvidence {
  return { status, reason, providerId };
}

/** Verification is intentionally independent of initiation acknowledgements and callback claims.
 * Candidate contracts cannot be routed by PaymentService or PayoutService yet. */
export function verifyCandidate(rail: CandidateRail, intent: CandidateIntent, payload: unknown): CandidateEvidence {
  try {
    const root = asRecord(payload);
    if (rail === 'mpesa') {
      // STK query alone lacks authoritative amount/currency. Never treat ResultCode=0 as sufficient.
      return evidence('PENDING', 'DARAJA_AMOUNT_EVIDENCE_REQUIRED', identifier(root.CheckoutRequestID));
    }
    if (rail === 'orange' || rail === 'airtel') {
      return evidence('PENDING', 'OPERATOR_CONTRACT_REQUIRED');
    }
    if (intent.operation === 'payout') {
      return evidence('PENDING', 'PAYOUT_CONTRACT_REQUIRED');
    }
    const row = rail === 'wave' ? root : asRecord(root.data);
    const id = identifier(rail === 'wave' ? row.transaction_id : row.id);
    const reference = rail === 'paystack' ? row.reference : rail === 'flutterwave' ? row.tx_ref : row.client_reference;
    const status = rail === 'wave' ? row.payment_status : row.status;
    const success = rail === 'paystack' ? status === 'success' && root.status === true
      : rail === 'flutterwave' ? status === 'successful' && root.status === 'success'
      : status === 'succeeded' && row.checkout_status === 'complete';
    if (reference !== intent.reference) return evidence('PENDING', 'REFERENCE_MISMATCH', id);
    if (!success) return evidence('PENDING', 'NOT_CONFIRMED', id);
    if (!id || row.currency !== intent.currency || !moneyMatches(row.amount, intent, rail === 'paystack')) {
      return evidence('PENDING', 'MONEY_OR_ID_MISMATCH', id);
    }
    return evidence('SUCCESSFUL', 'MATCHED_PROVIDER_EVIDENCE', id);
  } catch { return evidence('PENDING', 'MALFORMED_RESPONSE'); }
}

export function candidateReceipt(intent: CandidateIntent, id: unknown, link: unknown): CandidateReceipt {
  let checkoutUrl: string | null = null;
  if (typeof link === 'string') {
    const url = new URL(link);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid checkout URL');
    checkoutUrl = url.toString();
  }
  return { reference: intent.reference, providerId: identifier(id), checkoutUrl, status: 'PENDING' };
}

export type PayoutRecipient =
  | { rail: 'paystack'; recipientCode: string }
  | { rail: 'flutterwave'; bankCode: string; accountNumber: string }
  | { rail: 'wave'; mobile: string };

export function verifyCandidatePayout(intent: CandidateIntent, recipient: PayoutRecipient, payload: unknown): CandidateEvidence {
  try {
    if (intent.operation !== 'payout') return evidence('PENDING','OPERATION_MISMATCH');
    const root = asRecord(payload);
    const row = recipient.rail === 'wave' ? root : asRecord(root.data);
    const id = identifier(recipient.rail === 'paystack' ? row.transfer_code : row.id);
    const reference = recipient.rail === 'wave' ? row.client_reference : row.reference;
    const matchedRecipient = recipient.rail === 'wave' ? row.mobile === recipient.mobile
      : recipient.rail === 'flutterwave' ? row.account_number === recipient.accountNumber && row.bank_code === recipient.bankCode
      : typeof row.recipient === 'object' && row.recipient !== null && asRecord(row.recipient).recipient_code === recipient.recipientCode;
    const confirmed = recipient.rail === 'wave' ? row.status === 'succeeded'
      : recipient.rail === 'flutterwave' ? root.status === 'success' && row.status === 'SUCCESSFUL'
      : root.status === true && row.status === 'success';
    if (!confirmed || !matchedRecipient || reference !== intent.reference || row.currency !== intent.currency || !id ||
        !moneyMatches(recipient.rail === 'wave' ? row.receive_amount : row.amount, intent, recipient.rail === 'paystack')) {
      return evidence('PENDING','PAYOUT_EVIDENCE_INCOMPLETE',id);
    }
    return evidence('SUCCESSFUL','MATCHED_PAYOUT_EVIDENCE',id);
  } catch { return evidence('PENDING','MALFORMED_RESPONSE'); }
}
