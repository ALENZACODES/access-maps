/** Loopback-only static server for the offline ES module UI. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const BASE = dirname(fileURLToPath(import.meta.url));
export const ALLOWED = Object.freeze(new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.mjs', ['app.mjs', 'text/javascript; charset=utf-8']],
  ['/audit.mjs', ['audit.mjs', 'text/javascript; charset=utf-8']],
  ['/contract.mjs', ['contract.mjs', 'text/javascript; charset=utf-8']],
  ['/compare.mjs', ['compare.mjs', 'text/javascript; charset=utf-8']],
  ['/report.mjs', ['report.mjs', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]));
export function createOfflineServer(root = BASE) {
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    const target = ALLOWED.get(req.url ?? '');
    if (!target) { res.writeHead(404); res.end(); return; }
    try {
      const content = await readFile(join(root, target[0]));
      res.writeHead(200, { 'Content-Type': target[1], 'Content-Length': content.length });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch { res.writeHead(404); res.end(); }
  });
}
export async function listenOnLoopback(server = createOfflineServer(), port = 0) {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new RangeError('Invalid port');
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}/` };
}
const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  listenOnLoopback(createOfflineServer(), Number(process.env.PORT ?? 0)).then(({ url }) => {
    process.stdout.write(`Offline review: ${url}\n`);
  }).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
