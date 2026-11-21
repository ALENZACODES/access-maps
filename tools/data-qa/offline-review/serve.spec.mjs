import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { request } from 'node:http';
import { findPageAsset, pageHeaders, startOfflineServer } from './serve.mjs';

function get(server, path, method = 'GET') {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: address.port, path, method }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('P15L loopback-only page asset policy', () => {
  it('allows the offline HTML root', () => assert.equal(findPageAsset('/').name, 'index.html'));
  it('allows the app module', () => assert.equal(findPageAsset('/app.mjs').name, 'app.mjs'));
  it('allows the stylesheet', () => assert.equal(findPageAsset('/styles.css').name, 'styles.css'));
  it('allows the schema dependency', () => assert.equal(findPageAsset('/schema.mjs').name, 'schema.mjs'));
  it('allows the comparison dependency', () => assert.equal(findPageAsset('/compare.mjs').name, 'compare.mjs'));
  it('blocks the test fixture file', () => assert.equal(findPageAsset('/test-helpers.mjs'), null));
  it('blocks the test runner source', () => assert.equal(findPageAsset('/serve.spec.mjs'), null));
  it('blocks the documentation file', () => assert.equal(findPageAsset('/README.md'), null));
  it('blocks a credential file path', () => assert.equal(findPageAsset('/.env'), null));
  it('blocks parent path traversal', () => assert.equal(findPageAsset('/../package.json'), null));
  it('blocks encoded path traversal', () => assert.equal(findPageAsset('/%2e%2e/package.json'), null));
  it('blocks URL parameters', () => assert.equal(findPageAsset('/app.mjs?token=1'), null));
  it('blocks backslash path segments', () => assert.equal(findPageAsset('/..\\package.json'), null));
  it('sets a no-store response header', () => assert.equal(pageHeaders('text/html')['cache-control'], 'no-store'));
  it('disables network connections from the page', () => assert.match(pageHeaders('text/html')['content-security-policy'], /connect-src 'none'/));
  it('disables form submission destinations', () => assert.match(pageHeaders('text/html')['content-security-policy'], /form-action 'none'/));
  it('disables inline scripts', () => assert.match(pageHeaders('text/html')['content-security-policy'], /script-src 'self'/));
  it('disables framing', () => assert.equal(pageHeaders('text/html')['x-frame-options'], 'DENY'));
  it('disables content sniffing', () => assert.equal(pageHeaders('text/html')['x-content-type-options'], 'nosniff'));
  it('rejects negative port numbers', async () => await assert.rejects(() => startOfflineServer(-1), RangeError));
  it('rejects ports beyond the TCP range', async () => await assert.rejects(() => startOfflineServer(65536), RangeError));
});

describe('P15L HTTP page integration on localhost only', () => {
  let server;
  after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });
  it('starts on a loopback address', async () => {
    server = await startOfflineServer(0);
    assert.equal(server.address().address, '127.0.0.1');
  });
  it('serves HTML without remote references', async () => {
    const response = await get(server, '/');
    assert.equal(response.status, 200);
    assert.match(response.body, /<html lang="en">/);
    assert.match(response.headers['content-type'], /text\/html/);
  });
  it('serves the ES module entry point', async () => {
    const response = await get(server, '/app.mjs');
    assert.equal(response.status, 200);
    assert.match(response.body, /mountOfflineReview/);
  });
  it('serves relative CSS', async () => {
    const response = await get(server, '/styles.css');
    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /text\/css/);
  });
  it('serves module dependency paths', async () => {
    for (const path of ['/schema.mjs', '/copy.mjs', '/compare.mjs', '/report.mjs']) {
      assert.equal((await get(server, path)).status, 200);
    }
  });
  it('does not expose test source files', async () => assert.equal((await get(server, '/schema.spec.mjs')).status, 404));
  it('does not expose parent repository files', async () => assert.equal((await get(server, '/package.json')).status, 404));
  it('does not expose query-based dynamic URLs', async () => assert.equal((await get(server, '/app.mjs?a=1')).status, 404));
  it('rejects modifying requests', async () => assert.equal((await get(server, '/', 'POST')).status, 405));
  it('supports HEAD without a response body', async () => {
    const response = await get(server, '/app.mjs', 'HEAD');
    assert.equal(response.status, 200);
    assert.equal(response.body, '');
  });
  it('sets a privacy-sensitive content policy on HTML', async () => {
    const response = await get(server, '/');
    assert.match(response.headers['content-security-policy'], /connect-src 'none'/);
  });
});
