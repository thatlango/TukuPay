import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { CandidateContractClient } from './client.js';

test('candidate checkout clients round-trip mock HTTP and fail closed on missing evidence', async () => {
  const seen: Array<{ method: string; path: string; body: Record<string, unknown> }> = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString();
    const body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    const path = req.url ?? '';
    seen.push({ method: req.method ?? '', path, body });
    let payload: unknown;
    if (path === '/transaction/initialize') payload = { status: true, data: { authorization_url: 'https://example.invalid/pay' } };
    else if (path === '/transaction/verify/ref-1') payload = { status: true, data: { id: 1, reference: 'ref-1', amount: 10000, currency: 'KES', status: 'success' } };
    else if (path === '/v3/payments') payload = { status: 'success', data: { link: 'https://example.invalid/flw' } };
    else if (path === '/v3/transactions/verify_by_reference?tx_ref=ref-1') payload = { status: 'success', data: { id: 2, tx_ref: 'ref-1', amount: 100, currency: 'KES', status: 'successful' } };
    else if (path === '/v1/checkout/sessions') payload = { id: 'cos-1', wave_launch_url: 'https://example.invalid/wave' };
    else if (path === '/v1/checkout/sessions/cos-1') payload = { id: 'cos-1', transaction_id: 'T_1', client_reference: 'ref-1', amount: '100', currency: 'XOF', checkout_status: 'complete', payment_status: 'succeeded' };
    else if (path === '/transfer') payload = { status:true,data:{transfer_code:'TRF_1'} };
    else if (path === '/transfer/verify/ref-1') payload = { status:true,data:{transfer_code:'TRF_1',reference:'ref-1',currency:'KES',amount:10000,status:'success',recipient:{recipient_code:'RCP_fixture'}} };
    else if (path === '/v3/transfers') payload = { status:'success',data:{id:3} };
    else if (path === '/v3/transfers/3') payload = { status:'success',data:{id:3,reference:'ref-1',currency:'KES',amount:100,status:'SUCCESSFUL',account_number:'fixture-account',bank_code:'fixture-bank'} };
    else if (path === '/v1/payout') payload = { id:'pt-1' };
    else if (path === '/v1/payout/pt-1') payload = { id:'pt-1',client_reference:'ref-1',currency:'XOF',receive_amount:'100',status:'succeeded',mobile:'+221700000000' };
    else if (path === '/mpesa/stkpush/v1/processrequest') payload = { ResponseCode: '0', CheckoutRequestID: 'ws_CO_1' };
    else if (path === '/mpesa/stkpushquery/v1/query') payload = { ResultCode: '0', CheckoutRequestID: 'ws_CO_1' };
    else { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload));
  });
  server.listen(0,'127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert(address && typeof address === 'object');
    const client = new CandidateContractClient('http://127.0.0.1:' + address.port);
    assert.throws(() => new CandidateContractClient('https://example.invalid'));
    const intent = { reference: 'ref-1', amount: '100', currency: 'KES', operation: 'collection' as const,
      email: 'test@example.invalid', successUrl: 'https://example.invalid/success', errorUrl: 'https://example.invalid/error' };
    for (const rail of ['paystack','flutterwave','wave'] as const) {
      const input = rail === 'wave' ? { ...intent, currency: 'XOF' } : intent;
      const receipt = await client.initiateCheckout(rail,input);
      assert.equal(receipt.status,'PENDING');
      assert.equal((await client.verifyCheckout(rail,input,receipt.providerId ?? undefined)).status,'SUCCESSFUL');
    }
    const payout = { ...intent, operation:'payout' as const };
    for (const recipient of [
      {rail:'paystack',recipientCode:'RCP_fixture'},
      {rail:'flutterwave',accountNumber:'fixture-account',bankCode:'fixture-bank'},
      {rail:'wave',mobile:'+221700000000'},
    ] as const) {
      const input = recipient.rail === 'wave' ? {...payout,currency:'XOF'} : payout;
      const receipt = await client.initiatePayout(input,recipient);
      assert.equal(receipt.status,'PENDING');
      assert.equal((await client.verifyPayout(input,recipient,receipt.providerId ?? undefined)).status,'SUCCESSFUL');
    }
    const stk = await client.initiateMpesa({ ...intent, phone: '254712345678' });
    assert.equal(stk.providerId,'ws_CO_1');
    assert.equal((await client.queryMpesa(intent,stk.providerId!)).status,'PENDING');
    assert.equal(seen[0]?.body.amount,'10000');
    assert.equal(seen.find(r => r.path.includes('processrequest'))?.body.Amount,100);
    assert.equal(client.supports('airtel','payout'),false);
    assert.equal(client.supports('orange','collection'),false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
