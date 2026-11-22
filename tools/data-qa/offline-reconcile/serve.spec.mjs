import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createOfflineServer, listenOnLoopback, ALLOWED } from './serve.mjs';

async function withServer(fn) {
  const { server, url } = await listenOnLoopback();
  try { return await fn(url, server); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

describe('loopback-only local HTML server', () => {
  it('serves offline index page', async () => withServer(async url => {
    const response = await fetch(url);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Offline evidence reconciliation/u);
  }));
  it('serves browser source', async () => withServer(async url => {
    const response = await fetch(`${url}app.mjs`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /function mount/u);
  }));
  it('serves JS as JavaScript content type', async () => withServer(async url => {
    const response = await fetch(`${url}audit.mjs`);
    assert.match(response.headers.get('content-type'), /text\/javascript/u);
  }));
  it('serves CSS as text/css', async () => withServer(async url => {
    const response = await fetch(`${url}styles.css`);
    assert.match(response.headers.get('content-type'), /text\/css/u);
  }));
  it('rejects GET for repo package manifest', async () => withServer(async url => {
    const response = await fetch(`${url}package.json`);
    assert.equal(response.status, 404);
  }));
  it('rejects GET for source test files', async () => withServer(async url => {
    const response = await fetch(`${url}audit.spec.mjs`);
    assert.equal(response.status, 404);
  }));
  it('rejects GET for hidden dotfiles', async () => withServer(async url => {
    const response = await fetch(`${url}.env`);
    assert.equal(response.status, 404);
  }));
  it('rejects traversal attempts', async () => withServer(async url => {
    const response = await fetch(`${url}%2e%2e/%2e%2e/package.json`);
    assert.equal(response.status, 404);
  }));
  it('rejects unexpected query strings', async () => withServer(async url => {
    const response = await fetch(`${url}audit.mjs?track=1`);
    assert.equal(response.status, 404);
  }));
  it('rejects POST requests', async () => withServer(async url => {
    const response = await fetch(url, { method: 'POST', body: 'x' });
    assert.equal(response.status, 405);
  }));
  it('HEAD returns headers without body', async () => withServer(async url => {
    const response = await fetch(url, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '');
  }));
  it('does not cache source files', async () => withServer(async url => {
    const response = await fetch(url);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }));
  it('prevents MIME sniffing', async () => withServer(async url => {
    const response = await fetch(url);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }));
  it('does not send referrer', async () => withServer(async url => {
    const response = await fetch(url);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  }));
  it('supports fixed loopback hostname', async () => withServer(async url => {
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/u);
  }));
  it('rejects negative port number', async () => {
    await assert.rejects(listenOnLoopback(createOfflineServer(), -1), RangeError);
  });
  it('rejects fractional port number', async () => {
    await assert.rejects(listenOnLoopback(createOfflineServer(), 1.25), RangeError);
  });
  it('rejects port out of range', async () => {
    await assert.rejects(listenOnLoopback(createOfflineServer(), 65536), RangeError);
  });
  it('only serves explicit asset names', () => {
    assert.equal(ALLOWED.has('/audit.mjs'), true);
    assert.equal(ALLOWED.has('/secrets.json'), false);
  });
  it('serves all registered paths successfully', async () => withServer(async url => {
    for (const path of ALLOWED.keys()) {
      const response = await fetch(`${url}${path.slice(1)}`);
      assert.equal(response.status, 200, path);
    }
  }));
});
