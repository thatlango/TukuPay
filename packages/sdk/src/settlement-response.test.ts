import test from 'node:test';
import assert from 'node:assert/strict';
import { validProposal,validSettlementReview,type SettlementProposalInput,type SettlementReviewInput } from './settlement-response.js';
const id='abcdef01-1234-5678-9012-abcdef123456';
const input:SettlementProposalInput={provider:'mtn',country:'UG',currency:'UGX',settlementReference:'fixture',grossAmount:'1000'};
const proposal={...input,id,feeAmount:'0',netAmount:'1000',status:'PROPOSED',ledgerPosted:false};
test('settlement proposal response is scoped and explicitly non-posting',()=>{
  assert.equal(validProposal(proposal,input),true);
  for(const value of [{...proposal,ledgerPosted:true},{...proposal,status:'RECORDED'},{...proposal,country:'KE'},{...proposal,grossAmount:1000},{...proposal,settlementReference:'other'}])assert.equal(validProposal(value,input),false);
});
test('settlement review response must match the requested non-posting decision',()=>{
  const review:SettlementReviewInput={decision:'APPROVED_FOR_RECONCILIATION',note:'Fixture review',evidenceReference:'fixture'};
  const result={id,status:review.decision,reviewer:'finance-fixture',ledgerPosted:false};
  assert.equal(validSettlementReview(result,id,review),true);
  assert.equal(validSettlementReview({...result,ledgerPosted:true},id,review),false);
  assert.equal(validSettlementReview({...result,status:'REJECTED'},id,review),false);
});
