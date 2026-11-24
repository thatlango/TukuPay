import test from 'node:test';
import assert from 'node:assert/strict';
import {validCapabilities,validExceptions,validRecovery,validTransport,validOpsSummary,validReview} from './ops-response.js';
const now='2026-11-24T00:00:00Z';
const id='abcdef01-1234-5678-9012-abcdef123456';
const flag={configured:true,available:false};
const capabilities={simulator:false,markets:[{country:'UG',currency:'UGX',providers:[{provider:'airtel',environment:'sandbox',marketEnabled:false,runtime:'operator',collection:flag,payout:flag,balance:{...flag,accounts:{collection:flag,disbursement:{configured:false,available:false}}},callbacks:'disabled'}]}],candidates:[],note:'fixture'};
test('capability schema rejects contradictory availability and malformed markets',()=>{
  assert.equal(validCapabilities(capabilities),true);
  assert.equal(validCapabilities({...capabilities,markets:[{country:'UG'}]}),false);
  const p=capabilities.markets[0]!.providers[0]!;
  assert.equal(validCapabilities({...capabilities,markets:[{country:'UG',currency:'UGX',providers:[{...p,payout:{configured:false,available:true}}]}]}),false);
});
test('operations envelopes require bounded valid records',()=>{
  assert.equal(validExceptions({generatedAt:now,limit:50,exceptions:[]}),true);
  assert.equal(validExceptions({generatedAt:now,limit:0,exceptions:[]}),false);
  assert.equal(validExceptions({generatedAt:now,limit:50,exceptions:[{}]}),false);
  assert.equal(validTransport({startedAt:now,generatedAt:now,scope:'process-local',metrics:[]}),true);
  assert.equal(validTransport({startedAt:now,generatedAt:now,scope:'process-local',metrics:[{}]}),false);
  assert.equal(validOpsSummary({ops:{generatedAt:now,simulator:true}}),true);
  assert.equal(validOpsSummary({ops:[]}),false);
  assert.equal(validReview({review:{transaction_id:id,kind:'collection',version:1}}),true);
  assert.equal(validReview({review:{transaction_id:id,kind:'collection',version:'1'}}),false);
});
test('recovery remains review only and requires valid record shape',()=>{
  const record={kind:'collection',transaction_id:id,phase:'RESERVED',created_at:now,attempted_at:null,observed_at:null};
  assert.equal(validRecovery({records:[record],policy:'Review only; no automatic resubmission'}),true);
  assert.equal(validRecovery({records:[{...record,phase:'SEND'}],policy:'fixture'}),false);
});
