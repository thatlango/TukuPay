import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { authorizedProviderFetch, credentialKey, parseToken, TokenCache } from './tokens.js';

test('token refresh is single-flight and credential scopes are separate', async () => {
  const cache = new TokenCache();
  let count = 0;
  const load = async () => ({ token: `token-${++count}`, expiresAt: Date.now() + 3600_000 });
  assert.deepEqual(await Promise.all(Array.from({ length: 20 }, () => cache.get('a', load))), Array(20).fill('token-1'));
  assert.equal(await cache.get('b', load), 'token-2');
  cache.invalidate('a', 'stale-token');
  assert.equal(await cache.get('a', load), 'token-1');
  cache.invalidate('a', 'token-1');
  assert.equal(await cache.get('a', load), 'token-3');
  assert.notEqual(credentialKey(['UG', 'collection', 'old']), credentialKey(['UG', 'collection', 'new']));
});

test('malformed tokens fail and a rejected refresh is recoverable', async () => {
  assert.throws(() => parseToken({ access_token: 'x', expires_in: -1 }));
  assert.throws(() => parseToken({ access_token: '', expires_in: 3600 }));
  const cache = new TokenCache();
  await assert.rejects(cache.get('a', async () => { throw new Error('unavailable'); }));
  assert.equal(await cache.get('a', async () => parseToken({ access_token: 'ok', expires_in: 3600 })), 'ok');
});

test('401 renews a read once but never replays a payment write', async () => {
  let calls = 0;
  let loads = 0;
  const server = createServer((req, res) => {
    calls++;
    res.writeHead(req.method === 'POST' || req.headers.authorization === 'Bearer token-1' ? 401 : 200);
    res.end('{}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert(address && typeof address === 'object');
    const url = `http://127.0.0.1:${address.port}`;
    const cache = new TokenCache();
    const load = async () => ({ token: `token-${++loads}`, expiresAt: Date.now() + 3600_000 });
    assert.equal((await authorizedProviderFetch(cache, 'a', load, url)).status, 200);
    assert.equal(calls, 2);
    assert.equal(loads, 2);
    assert.equal((await authorizedProviderFetch(cache, 'a', load, url, { method: 'POST' })).status, 401);
    assert.equal(calls, 3);
    assert.equal(loads, 2);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
