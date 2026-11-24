import test from 'node:test';
import assert from 'node:assert/strict';
import { reconciliationSettings } from './reconciliation-settings.js';

test('reconciliation defaults and explicit boundaries', () => {
  assert.deepEqual(reconciliationSettings({}), {enabled:true, intervalMs:15000, batchSize:50});
  assert.deepEqual(reconciliationSettings({RECONCILIATION_ENABLED:'false', RECONCILIATION_INTERVAL_MS:'5000', RECONCILIATION_BATCH_SIZE:'500'}), {enabled:false, intervalMs:5000, batchSize:500});
  assert.equal(reconciliationSettings({RECONCILIATION_INTERVAL_MS:'3600000'}).intervalMs,3600000);
});
test('invalid reconciliation settings fail before timer creation', () => {
  for (const value of ['','yes','1']) assert.throws(()=>reconciliationSettings({RECONCILIATION_ENABLED:value}));
  for (const value of ['NaN','Infinity','1e4','5000.5','4999','3600001','']) assert.throws(()=>reconciliationSettings({RECONCILIATION_INTERVAL_MS:value}));
  for (const value of ['0','501','1.5','-1','NaN','']) assert.throws(()=>reconciliationSettings({RECONCILIATION_BATCH_SIZE:value}));
});
