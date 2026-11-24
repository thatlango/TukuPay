import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { providerFetch, responsePayload, retryDelay } from './http.js';

test('read retries, writes do not retry, redirects are rejected', async () => {
  let reads = 0;
  let writes = 0;
  let followed = 0;
  const server = createServer((req, res) => {
    if (req.url === '/read') {
      reads += 1;
      res.writeHead(reads === 1 ? 503 : 200, { 'Retry-After': '0' });
    } else if (req.url === '/write') {
      writes += 1;
      res.writeHead(503, { 'Retry-After': '0' });
    } else if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/target' });
    } else {
      followed += 1;
      res.writeHead(200);
    }
    res.end('{}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    assert(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal((await providerFetch(base + '/read')).status, 200);
    assert.equal(reads, 2);
    assert.equal((await providerFetch(base + '/write', { method: 'POST' })).status, 503);
    assert.equal(writes, 1);
    await assert.rejects(providerFetch(base + '/redirect'), /redirect rejected/);
    assert.equal(followed, 0);
    await assert.rejects(providerFetch('http://example.com'), /HTTPS/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('response limits apply with and without content-length', async () => {
  await assert.rejects(responsePayload(new Response('x', { headers: { 'Content-Length': '1048577' } })), /size limit/);
  await assert.rejects(responsePayload(new Response('x'.repeat(1048577))), /size limit/);
  assert.deepEqual(await responsePayload(new Response('{"ok":true}')), { ok: true });
  assert.equal(await responsePayload(new Response(null)), null);
});

test('retry-after is bounded and accepts HTTP dates', () => {
  assert.equal(retryDelay('1000', 0), 30000);
  assert.equal(retryDelay('0', 0), 0);
  assert.equal(retryDelay('Thu, 01 Jan 1970 00:00:02 GMT', 0, 0), 2000);
});
