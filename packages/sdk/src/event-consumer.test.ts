import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeFinancialEventsOnce } from './event-consumer.js';
import type { FinancialEvent } from './index.js';

const event:FinancialEvent={id:'abcdef01-1234-5678-9012-abcdef123456',sequence:'1',schema_version:1,kind:'collection',transaction_id:'abcdef01-1234-5678-9012-abcdef123457',product_code:'kela',status:'SUCCESSFUL',currency:'UGX',amount_minor:'1000',occurred_at:'2026-11-24T00:00:00Z'};
const batch={delivery:'at-least-once' as const,events:[event]};
test('acknowledges after the durable handler resolves',async()=>{
  const order:string[]=[];
  const client={getFinancialEvents:async()=>batch,acknowledgeFinancialEvent:async(id:string)=>{order.push('ack');return {id,acknowledged:true as const};}};
  assert.deepEqual(await consumeFinancialEventsOnce(client,async()=>{order.push('commit');return 'processed';}),{received:1,acknowledged:1,deferred:false});
  assert.deepEqual(order,['commit','ack']);
});
test('deferred and failed handlers never acknowledge',async()=>{
  let acks=0;
  const client={getFinancialEvents:async()=>batch,acknowledgeFinancialEvent:async(id:string)=>{acks++;return {id,acknowledged:true as const};}};
  assert.deepEqual(await consumeFinancialEventsOnce(client,async()=>'deferred'),{received:1,acknowledged:0,deferred:true});
  await assert.rejects(consumeFinancialEventsOnce(client,async()=>{throw new Error('local transaction failed');}));
  assert.equal(acks,0);
});
test('acknowledgement failure is propagated and already-processed replay can acknowledge',async()=>{
  let calls=0;
  const client={getFinancialEvents:async()=>batch,acknowledgeFinancialEvent:async(id:string)=>{if(++calls===1)throw new Error('network failure');return {id,acknowledged:true as const};}};
  await assert.rejects(consumeFinancialEventsOnce(client,async()=>'processed'));
  assert.equal((await consumeFinancialEventsOnce(client,async()=>'already-processed')).acknowledged,1);
  assert.equal(calls,2);
});
