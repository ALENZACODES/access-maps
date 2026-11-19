import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, SOURCE_IDS } from './attribution-utils.mjs';
import { CORRECTION_SCHEMA } from './correction-core.mjs';
const dir=dirname(fileURLToPath(import.meta.url));
const read=name=>readFile(join(dir,name),'utf8');
const files=['correction-core.mjs','correction-audit.mjs','correction-change.mjs',
  'correction-report.mjs','correction-cli.mjs','correction-route.mjs',
  'correction-fixtures.mjs','correction.html','correction.css','CORRECTION_README.md'];
test('all required runtime and test support files exist',async()=>{
  for(const name of files) await assert.doesNotReject(()=>access(join(dir,name)),name);
});
test('HTML references exact local route entry point',async()=>assert.match(await read('correction.html'),/src="\.\/correction-route\.mjs"/u));
test('HTML references exact local stylesheet',async()=>assert.match(await read('correction.html'),/href="\.\/correction\.css"/u));
test('HTML has no external executable assets',async()=>{
  const value=await read('correction.html');
  assert.doesNotMatch(value,/<script[^>]*https?:/iu);
  assert.doesNotMatch(value,/<link[^>]*https?:/iu);
});
test('HTML CSP disallows network requests',async()=>assert.match(await read('correction.html'),/connect-src 'none'/u));
test('HTML CSP disallows form submission',async()=>assert.match(await read('correction.html'),/form-action 'none'/u));
test('HTML CSP disallows remote images',async()=>assert.match(await read('correction.html'),/img-src 'none'/u));
test('HTML CSP disallows object embeddings',async()=>assert.match(await read('correction.html'),/object-src 'none'/u));
test('HTML contains semantic main landmark',async()=>assert.match(await read('correction.html'),/<main id="main">/u));
test('HTML contains visible skip-navigation link',async()=>assert.match(await read('correction.html'),/href="#main"/u));
test('HTML has a labelled language selector',async()=>{
  const text=await read('correction.html');assert.match(text,/for="language"/u);assert.match(text,/id="language"/u);
});
test('HTML has labelled current file selector',async()=>{
  const text=await read('correction.html');assert.match(text,/for="current"/u);assert.match(text,/id="current"/u);
});
test('HTML has labelled previous file selector',async()=>{
  const text=await read('correction.html');assert.match(text,/for="previous"/u);assert.match(text,/id="previous"/u);
});
test('HTML has an announcement status region',async()=>{
  const text=await read('correction.html');assert.match(text,/role="status"/u);assert.match(text,/aria-live="polite"/u);
});
test('HTML has disabled exports before loading',async()=>{
  const text=await read('correction.html');
  for(const name of ['save-text','save-html','save-json'])
    assert.match(text,new RegExp(`id="${name}"[^>]*disabled`));
});
test('HTML uses a file picker and no form',async()=>{
  const text=await read('correction.html');assert.match(text,/type="file"/u);assert.doesNotMatch(text,/<form\b/iu);
});
test('CSS defines minimum height for targets',async()=>assert.match(await read('correction.css'),/min-height: 44px/u));
test('CSS defines minimum width for targets',async()=>assert.match(await read('correction.css'),/min-width: 44px/u));
test('CSS defines visible focus treatment',async()=>assert.match(await read('correction.css'),/:focus-visible/u));
test('CSS provides reduced-motion support',async()=>assert.match(await read('correction.css'),/prefers-reduced-motion/u));
test('CSS provides forced-colours support',async()=>assert.match(await read('correction.css'),/forced-colors/u));
test('CSS has print layout',async()=>assert.match(await read('correction.css'),/@media print/u));
test('browser entry point imports all shared modules',async()=>{
  const content=await read('correction-route.mjs');
  for(const file of ['correction-core.mjs','correction-audit.mjs','correction-change.mjs','correction-report.mjs'])
    assert.ok(content.includes(`'./${file}'`),file);
});
test('CLI imports same parsing and audit helpers',async()=>{
  const content=await read('correction-cli.mjs');
  for(const file of ['correction-core.mjs','correction-audit.mjs','correction-change.mjs','correction-report.mjs'])
    assert.ok(content.includes(`'./${file}'`),file);
});
test('browser does not fetch or submit evidence',async()=>assert.doesNotMatch(await read('correction-route.mjs'),/\bfetch\s*\(/u));
test('browser does not use XMLHttpRequest',async()=>assert.doesNotMatch(await read('correction-route.mjs'),/\bXMLHttpRequest\b/u));
test('browser does not persist submitted records',async()=>assert.doesNotMatch(await read('correction-route.mjs'),/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/u));
test('browser uses textContent rather than injected HTML',async()=>{
  const code=await read('correction-route.mjs');assert.match(code,/textContent/u);assert.doesNotMatch(code,/\.innerHTML\s*=/u);
});
test('browser uses local file text()',async()=>assert.match(await read('correction-route.mjs'),/file\.text\(\)/u));
test('browser French language label contains U+00A0',async()=>assert.match(await read('correction-route.mjs'),/Langue\\u00a0:/u));
test('README describes actual executable filename',async()=>assert.match(await read('CORRECTION_README.md'),/correction-cli\.mjs/u));
test('README describes actual test glob',async()=>assert.match(await read('CORRECTION_README.md'),/correction-\*\.test\.mjs/u));
test('README does not invent a scheduled runner',async()=>assert.doesNotMatch(await read('CORRECTION_README.md'),/schedule:|on:\s*schedule/u));
test('schema is versioned and independent of other inputs',()=>assert.equal(CORRECTION_SCHEMA,'attribution-corrections/1'));
test('authoritative catalogue has only the supported source IDs',()=>assert.deepEqual(SOURCE_IDS,['osm','metrolinx','ltc']));
test('no competing provider metadata is shipped by this feature',async()=>{
  const code=await read('correction-audit.mjs');
  assert.match(code,/from '\.\/attribution-utils\.mjs'/u);
});
test('OSM credit comes from the merged catalogue',()=>assert.ok(SOURCES.osm.notices.en.includes('© OpenStreetMap contributors')));
test('all new local module imports resolve',async()=>{
  for(const name of [...files.filter(f=>f.endsWith('.mjs')),...['correction-core.test.mjs','correction-audit.test.mjs','correction-change.test.mjs','correction-report.test.mjs','correction-cli.test.mjs']]) {
    const content=await read(name);
    for(const match of content.matchAll(/\bfrom\s+['"](\.\/[^'"]+)['"]/gu))
      await assert.doesNotReject(()=>read(match[1].slice(2)),`${name}: ${match[1]}`);
  }
});
