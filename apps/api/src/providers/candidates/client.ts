import { Buffer } from 'node:buffer';
import { providerFetch, responsePayload } from '../http.js';
import { majorToMinor } from '../../utils/money.js';
import { asRecord, candidateReceipt, verifyCandidate, type CandidateIntent, type CandidateRail } from './contracts.js';

type CheckoutInput = CandidateIntent & { email: string; successUrl: string; errorUrl: string };
/** Contract-development client only: loopback mocks, synthetic credentials, no runtime registration. */
export class CandidateContractClient {
  private readonly base: URL;
  constructor(base: string) {
    this.base = new URL(base);
    if (this.base.protocol !== 'http:' || this.base.hostname !== '127.0.0.1' || this.base.username || this.base.password
        || this.base.pathname !== '/' || this.base.search || this.base.hash) throw new Error('Candidate contracts require a loopback mock origin');
  }
  private async request(path: string, body?: unknown) {
    const response = await providerFetch(new URL(path, this.base).toString(), {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Authorization': 'Bearer synthetic-contract-token', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error('Candidate contract HTTP ' + response.status); }
    return asRecord(await responsePayload(response));
  }
  async initiateCheckout(rail: 'paystack' | 'flutterwave' | 'wave', input: CheckoutInput) {
    if (input.operation !== 'collection') throw new Error('Checkout only supports collections');
    const amount = majorToMinor(input.amount, input.currency);
    if (rail === 'paystack') {
      const root = await this.request('/transaction/initialize', { email: input.email, amount: amount.toString(),
        currency: input.currency, reference: input.reference, callback_url: input.successUrl });
      if (root.status !== true) throw new Error('Paystack initialization was not acknowledged');
      const data = asRecord(root.data);
      return candidateReceipt(input, null, data.authorization_url);
    }
    if (rail === 'flutterwave') {
      const root = await this.request('/v3/payments', { tx_ref: input.reference, amount: input.amount,
        currency: input.currency, redirect_url: input.successUrl, customer: { email: input.email } });
      if (root.status !== 'success') throw new Error('Flutterwave initialization was not acknowledged');
      return candidateReceipt(input, null, asRecord(root.data).link);
    }
    const root = await this.request('/v1/checkout/sessions', { amount: input.amount, currency: input.currency,
      client_reference: input.reference, success_url: input.successUrl, error_url: input.errorUrl });
    return candidateReceipt(input, root.id, root.wave_launch_url);
  }
  async verifyCheckout(rail: 'paystack' | 'flutterwave' | 'wave', intent: CandidateIntent, providerId?: string) {
    if (intent.operation !== 'collection') throw new Error('Checkout only supports collections');
    let payload: unknown;
    if (rail === 'paystack') payload = await this.request('/transaction/verify/' + encodeURIComponent(intent.reference));
    else if (rail === 'flutterwave') payload = await this.request('/v3/transactions/verify_by_reference?tx_ref=' + encodeURIComponent(intent.reference));
    else {
      if (!providerId) throw new Error('Persisted Wave checkout ID is required');
      payload = await this.request('/v1/checkout/sessions/' + encodeURIComponent(providerId));
      if (asRecord(payload).id !== providerId) throw new Error('Wave checkout ID mismatch');
    }
    return verifyCandidate(rail, intent, payload);
  }
  /** Daraja STK initiation/query only against the local fixture.
   * Query acknowledgement is not sufficient financial evidence. */
  async initiateMpesa(input: CandidateIntent & { phone: string }) {
    if (input.operation !== 'collection' || input.currency !== 'KES' || !/^[1-9][0-9]*$/.test(input.amount)
      || !/^254[17][0-9]{8}$/.test(input.phone)) throw new Error('Invalid mock STK input');
    const amount = Number(input.amount);
    if (!Number.isSafeInteger(amount)) throw new Error('Unsafe STK amount');
    const timestamp = new Date(Date.now() + 3 * 3600_000).toISOString().replace(/[^0-9]/g, '').slice(0,14);
    const shortcode = '174379';
    const password = Buffer.from(shortcode + 'fixture-passkey' + timestamp).toString('base64');
    const response = await this.request('/mpesa/stkpush/v1/processrequest', {
      BusinessShortCode: shortcode, Password: password, Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline', Amount: amount, PartyA: input.phone,
      PartyB: shortcode, PhoneNumber: input.phone, CallBackURL: 'https://example.invalid/callback',
      AccountReference: input.reference.slice(0,12), TransactionDesc: 'Contract test',
    });
    if (String(response.ResponseCode) !== '0' || typeof response.CheckoutRequestID !== 'string' || !response.CheckoutRequestID) {
      throw new Error('Daraja initiation not acknowledged');
    }
    return candidateReceipt(input, response.CheckoutRequestID, null);
  }
  async queryMpesa(intent: CandidateIntent, checkoutId: string) {
    if (!checkoutId || intent.operation !== 'collection' || intent.currency !== 'KES') throw new Error('Invalid STK query');
    const timestamp = new Date(Date.now() + 3 * 3600_000).toISOString().replace(/[^0-9]/g, '').slice(0,14);
    const response = await this.request('/mpesa/stkpushquery/v1/query', {
      BusinessShortCode: '174379', Password: Buffer.from('174379fixture-passkey' + timestamp).toString('base64'),
      Timestamp: timestamp, CheckoutRequestID: checkoutId,
    });
    if (response.CheckoutRequestID !== checkoutId) throw new Error('Daraja checkout ID mismatch');
    return verifyCandidate('mpesa', intent, response);
  }
  // The remaining provider contracts are not callable until the actual merchant API
  // schema, encryption/signing requirements and independent financial evidence are reviewed.
  supports(rail: CandidateRail, operation: CandidateIntent['operation']): boolean {
    return operation === 'collection' && ['paystack', 'flutterwave', 'wave', 'mpesa'].includes(rail);
  }
}
