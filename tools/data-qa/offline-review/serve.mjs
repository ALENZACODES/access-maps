#!/usr/bin/env node
/** Loopback-only server for browser module loading; serves a fixed list of local assets. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ALLOWED = Object.freeze(new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']],
  ['/schema.mjs', ['schema.mjs', 'text/javascript; charset=utf-8']],
  ['/compare.mjs', ['compare.mjs', 'text/javascript; charset=utf-8']],
  ['/copy.mjs', ['copy.mjs', 'text/javascript; charset=utf-8']],
  ['/report.mjs', ['report.mjs', 'text/javascript; charset=utf-8']],
]));

export function findPageAsset(path) {
  if (typeof path !== 'string' || path.includes('?') || path.includes('#') ||
    path.includes('%') || path.includes('\\') || path.includes('..')) return null;
  const match = ALLOWED.get(path);
  return match ? { name: match[0], mime: match[1] } : null;
}

export function pageHeaders(mime) {
  return {
    'content-type': mime,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
    'content-security-policy': [
      "default-src 'none'", "script-src 'self'", "style-src 'self'",
      "img-src 'self' blob:", "font-src 'none'", "connect-src 'none'",
      "form-action 'none'", "frame-src 'none'", "object-src 'none'",
      "base-uri 'none'", "frame-ancestors 'none'",
    ].join('; '),
  };
}

export async function serveRequest(request, response, root = DIRECTORY) {
  const path = request.url;
  const asset = findPageAsset(path);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD', ...pageHeaders('text/plain; charset=utf-8') });
    response.end('Method not permitted');
    return;
  }
  if (!asset) {
    response.writeHead(404, pageHeaders('text/plain; charset=utf-8'));
    response.end('Not found');
    return;
  }
  try {
    const file = join(root, asset.name);
    const info = await stat(file);
    if (!info.isFile() || info.size > 2 * 1024 * 1024) throw new Error('Invalid local asset');
    const bytes = await readFile(file);
    response.writeHead(200, { ...pageHeaders(asset.mime), 'content-length': bytes.length });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch {
    response.writeHead(500, pageHeaders('text/plain; charset=utf-8'));
    response.end('Local page file unavailable');
  }
}

export function createLocalServer(root = DIRECTORY) {
  return createServer((request, response) => {
    void serveRequest(request, response, root);
  });
}

export async function startOfflineServer(port = 8765) {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new RangeError('Invalid local port');
  }
  const server = createLocalServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) ===
  resolve(process.argv[1]);
if (invoked) {
  const port = process.argv[2] === undefined ? 8765 : Number(process.argv[2]);
  try {
    const server = await startOfflineServer(port);
    const address = server.address();
    const selected = typeof address === 'object' && address ? address.port : port;
    process.stdout.write(`Offline review available at http://127.0.0.1:${selected}/\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Cannot start local page'}\n`);
    process.exitCode = 1;
  }
}
