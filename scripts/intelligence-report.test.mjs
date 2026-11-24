import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeIntelligence } from './intelligence-report.mjs';
const row={country:'UG',provider:'mtn',currency:'UGX',environment:'simulator',reference:'fixture',code:'STALE_PENDING',severity:'medium',private_payload:'not displayed'};
const report={schema_version:1,decision:'HUMAN_REVIEW_ONLY',as_of:'2026-11-24T00:00:00Z',findings:[row],reconciliation_by_scope:[],liquidity_baseline:[],statement_coverage_complete:false};
const now=Date.parse('2026-11-24T12:00:00Z');
test('report filters fields and preserves incomplete evidence state',()=>{
 const view=summarizeIntelligence(report,'simulator',now);
 assert.equal(view.findings[0].private_payload,undefined);assert.equal(view.stale,false);assert.equal(view.statementComplete,false);
});
test('reject mixed environment and future report',()=>{
 assert.throws(()=>summarizeIntelligence(report,'production',now));
 assert.throws(()=>summarizeIntelligence(report,'simulator',now-86400000));
 assert.equal(summarizeIntelligence(report,'simulator',now+86400000).stale,true);
});

test('reconciliation preserves ambiguous reference count and exact monetary strings',()=>{
 const scope={country:'UG',provider:'mtn',currency:'UGX',environment:'simulator',kind:'collection',matched_count:1,ambiguous_reference_count:2,matched_minor:'9223372036854775807',observed_difference_minor:'0'};
 const view=summarizeIntelligence({...report,reconciliation_by_scope:[scope]},'simulator',now);
 assert.equal(view.reconciliation[0].ambiguous_reference_count,2);
 assert.equal(view.reconciliation[0].matched_minor,'9223372036854775807');
});
