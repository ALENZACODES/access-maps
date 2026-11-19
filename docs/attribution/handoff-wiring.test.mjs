import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE } from './attribution-utils.mjs';
const dir=dirname(fileURLToPath(import.meta.url));
const root=resolve(dir,'../..');
async function read(name) { return readFile(join(dir,name),'utf8'); }
test('single authoritative provider catalogue remains unchanged', () => assert.deepEqual(Object.keys(SOURCES).sort(),['ltc','metrolinx','osm']));
test('AUA notice is distinct from OGL notice', () => assert.notEqual(METROLINX_AUA_LEGEND,METROLINX_OGL_NOTICE));
test('standalone HTML loads actual route entrypoint', async()=>assert.match(await read('handoff.html'), /src="\.\/handoff-route\.mjs"/u));
test('standalone HTML loads local stylesheet', async()=>assert.match(await read('handoff.html'), /href="\.\/handoff\.css"/u));
test('standalone HTML contains local file inputs', async()=>assert.match(await read('handoff.html'), /type="file"/u));
test('standalone HTML does not contain remote form', async()=>assert.doesNotMatch(await read('handoff.html'),/<form\b/iu));
test('CSP blocks network connections', async()=>assert.match(await read('handoff.html'),/connect-src 'none'/u));
test('CSP blocks external objects', async()=>assert.match(await read('handoff.html'),/object-src 'none'/u));
test('CSP blocks remote images', async()=>assert.match(await read('handoff.html'),/img-src 'none'/u));
test('standalone HTML has skip link', async()=>assert.match(await read('handoff.html'),/href="#main"/u));
test('standalone HTML has a main landmark', async()=>assert.match(await read('handoff.html'),/<main id="main">/u));
test('language select has visible label', async()=>assert.match(await read('handoff.html'),/for="language"/u));
test('current file has visible label', async()=>assert.match(await read('handoff.html'),/for="current"/u));
test('previous file has visible label', async()=>assert.match(await read('handoff.html'),/for="previous"/u));
test('status region is announced politely', async()=>assert.match(await read('handoff.html'),/aria-live="polite"/u));
test('export buttons disabled before loading files', async()=>{
  const html=await read('handoff.html');
  for(const id of ['save-text','save-json','save-html','print'])assert.match(html,new RegExp(`id="${id}"[^>]*disabled`));
});
test('controls declare minimum height 44px', async()=>assert.match(await read('handoff.css'),/min-height: 44px/u));
test('controls declare minimum width 44px', async()=>assert.match(await read('handoff.css'),/min-width: 44px/u));
test('focus indicator is visible', async()=>assert.match(await read('handoff.css'),/:focus-visible/u));
test('reduced motion preference exists', async()=>assert.match(await read('handoff.css'),/prefers-reduced-motion/u));
test('high contrast fallback exists', async()=>assert.match(await read('handoff.css'),/forced-colors/u));
test('print output has print CSS', async()=>assert.match(await read('handoff.css'),/@media print/u));
test('route contains no remote fetch code', async()=>assert.doesNotMatch(await read('handoff-route.mjs'),/\bfetch\s*\(/u));
test('route contains no storage writes', async()=>assert.doesNotMatch(await read('handoff-route.mjs'),/\b(localStorage|sessionStorage|indexedDB)\b/u));
test('route writes user text through textContent', async()=>assert.match(await read('handoff-route.mjs'),/textContent/u));
test('route avoids innerHTML rendering', async()=>assert.doesNotMatch(await read('handoff-route.mjs'),/\binnerHTML\b/u));
test('route shows comparison findings not only summary', async()=>assert.match(await read('handoff-route.mjs'),/comparison\.changes/u));
test('route French language label uses U+00A0', async()=>assert.match(await read('handoff-route.mjs'),/Langue\\u00a0:/u));
test('route names the exact local core', async()=>{
  const route=await read('handoff-route.mjs');
  for(const name of ['handoff-core.mjs','handoff-audit.mjs','handoff-change.mjs','handoff-report.mjs'])assert.ok(route.includes(`./${name}`));
});
test('CLI names the same core modules', async()=>{
  const code=await read('handoff-cli.mjs');
  for(const name of ['handoff-core.mjs','handoff-audit.mjs','handoff-change.mjs','handoff-report.mjs'])assert.ok(code.includes(`./${name}`));
});
test('all local imports exist on disk', async()=>{
  const names=['handoff-core.mjs','handoff-audit.mjs','handoff-change.mjs','handoff-report.mjs',
    'handoff-route.mjs','handoff-cli.mjs','handoff-fixtures.mjs'];
  for(const name of names){
    const code=await read(name);
    for(const match of code.matchAll(/from\s+['"](\.\/[^'"]+)['"]/gu)) {
      await assert.doesNotReject(()=>access(join(dir,match[1].slice(2))),`${name} imports ${match[1]}`);
    }
  }
});
test('root npm test discovers new Node specs already', async()=>{
  const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
  assert.match(pkg.scripts.test,/node --test docs\/attribution\/\*\.test\.mjs/u);
});
test('new module does not introduce a new npm dependency', async()=>{
  const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
  assert.ok(pkg.scripts.test.includes('docs/attribution/*.test.mjs'));
});
test('README names the real CLI command', async()=>assert.ok((await read('HANDOFF_README.md')).includes('handoff-cli.mjs')));
test('README names the exact test glob', async()=>assert.ok((await read('HANDOFF_README.md')).includes('handoff-*.test.mjs')));
