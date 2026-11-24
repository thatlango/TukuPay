import test from 'node:test';
import assert from 'node:assert/strict';
import {providerUrl,providerMode,msisdnMode,airtelVersion,operatorPath} from './provider-settings.js';
test('provider configuration rejects unsafe or conflicting endpoints',()=>{
  assert.equal(providerMode(undefined,'https://sandbox.example.test'),'sandbox');
  assert.equal(providerUrl('http://127.0.0.1:8080','sandbox','BASE_URL'),'http://127.0.0.1:8080');
  assert.throws(()=>providerMode('production','https://sandbox.example.test'));
  assert.throws(()=>providerMode('typo','https://example.test'));
  for(const url of ['http://example.test','https://u:p@example.test','https://example.test/?token=fixture','https://example.test/#fragment','http://127.0.0.1:8080'])assert.throws(()=>providerUrl(url,'production','BASE_URL'));
});
test('provider setting enums and path boundaries are explicit',()=>{
  assert.equal(msisdnMode(undefined,'local'),'local');
  assert.equal(msisdnMode('e164','local'),'e164');
  assert.throws(()=>msisdnMode('other','local'));
  assert.equal(airtelVersion('1'),1);
  assert.throws(()=>airtelVersion('2'));
  assert.throws(()=>airtelVersion('1.5'));
  assert.equal(operatorPath('/standard/v1/users/balance'),'/standard/v1/users/balance');
  for(const path of ['//other.test','/../x','/x?token=fixture','https://example.test/x'])assert.throws(()=>operatorPath(path));
});
