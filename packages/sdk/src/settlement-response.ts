export type SettlementProposalInput = {
  provider:'mtn'|'airtel';country:string;currency:string;settlementReference:string;
  grossAmount:string;feeAmount?:string;bankReference?:string;
};
export type SettlementProposal = {
  id:string;provider:'mtn'|'airtel';country:string;currency:string;settlementReference:string;
  grossAmount:string;feeAmount:string;netAmount:string;status:'PROPOSED';ledgerPosted:false;
};
export type SettlementReviewInput = {
  decision:'APPROVED_FOR_RECONCILIATION'|'REJECTED';note:string;evidenceReference?:string;
};
export type SettlementReview = {
  id:string;status:'APPROVED_FOR_RECONCILIATION'|'REJECTED';ledgerPosted:false;reviewer:string;
};
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const amount=(v:unknown):boolean=>typeof v==='string'&&/^\d{1,19}(?:\.\d{1,2})?$/.test(v);
export function validProposal(value:unknown,input:SettlementProposalInput):value is SettlementProposal {
  return object(value)&&uuid(value.id)&&value.ledgerPosted===false&&value.status==='PROPOSED'
    &&value.provider===input.provider&&value.country===input.country.trim().toUpperCase()&&value.currency===input.currency.trim().toUpperCase()
    &&value.settlementReference===input.settlementReference.trim()
    &&amount(value.grossAmount)&&amount(value.feeAmount)&&amount(value.netAmount);
}
export function validSettlementReview(value:unknown,id:string,input:SettlementReviewInput):value is SettlementReview {
  return object(value)&&uuid(value.id)&&value.id===id.toLowerCase()&&value.ledgerPosted===false&&value.status===input.decision
    &&typeof value.reviewer==='string'&&value.reviewer.trim().length>0;
}
