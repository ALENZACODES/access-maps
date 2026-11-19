import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_IDS } from './attribution-utils.mjs';
const dir=dirname(fileURLToPath(import.meta.url));
const root=resolve(dir,'../..');
async function file(name){return readFile(join(dir,name),'utf8');}
test('authoritative catalogue contains only supported providers',()=>assert.deepEqual(SOURCE_IDS,['osm','metrolinx','ltc']));
test('root package uses the exact documented bilingual command',async()=>{const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));assert.equal(pkg.scripts['audit:bilingual-attribution'],'tsx docs/attribution/offline-parity-cli.ts');});
test('root tests already discover .test.mjs in attribution directory',async()=>{const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));assert.match(pkg.scripts.test,/node --test docs\/attribution\/\*\.test\.mjs/u);});
test('reference route exists and loads the real modules',async()=>{
 const page=await file('reference.html');const route=await file('reference-route.mjs');
 assert.match(page,/reference-route\.mjs/u);
 for(const module of ['reference-core.mjs','reference-audit.mjs','reference-report.mjs'])assert.ok(route.includes(`./${module}`));
});
test('static page has no remote URL dependencies',async()=>{const page=await file('reference.html');assert.doesNotMatch(page,/<script[^>]+https?:/iu);assert.doesNotMatch(page,/<link[^>]+https?:/iu);});
test('static page includes restrictive CSP',async()=>{const page=await file('reference.html');assert.match(page,/connect-src 'none'/u);assert.match(page,/form-action 'none'/u);});
test('static page has named navigation and main landmarks',async()=>{const page=await file('reference.html');assert.match(page,/<main id="main">/u);assert.match(page,/aria-label="Report actions"/u);});
test('static page has file pickers instead of remote forms',async()=>{const page=await file('reference.html');assert.match(page,/type="file"/u);assert.doesNotMatch(page,/<form\b/iu);});
test('static page provides bilingual controls',async()=>{const page=await file('reference.html');assert.match(page,/Français/u);assert.match(page,/English/u);});
test('all interactive controls have >=44px minimum target',async()=>{const css=await file('reference.css');assert.match(css,/min-height:44px/u);assert.match(css,/min-width:44px/u);});
test('keyboard focus has visible treatment',async()=>{const css=await file('reference.css');assert.match(css,/:focus-visible/u);});
test('reduced motion preference is included',async()=>{const css=await file('reference.css');assert.match(css,/prefers-reduced-motion/u);});
test('browser route uses textContent and not innerHTML',async()=>{const route=await file('reference-route.mjs');assert.match(route,/textContent/u);assert.doesNotMatch(route,/\.innerHTML\s*=/u);});
test('browser route exposes no network calls',async()=>{const route=await file('reference-route.mjs');assert.doesNotMatch(route,/\bfetch\s*\(/u);assert.doesNotMatch(route,/XMLHttpRequest/u);});
test('reference audit depends on shared legal notices',async()=>{const code=await file('reference-audit.mjs');assert.match(code,/from '\.\/attribution-utils\.mjs'/u);});
test('reference parser does not import a separate provider catalogue',async()=>{const code=await file('reference-core.mjs');assert.match(code,/from '\.\/attribution-utils\.mjs'/u);});
test('README shows executable commands actually present',async()=>{const readme=await file('REFERENCE_PACK_README.md');assert.match(readme,/reference-cli\.mjs/u);assert.match(readme,/reference-\*\.test\.mjs/u);});
test('new source files do not embed persistent or scheduled operations',async()=>{for(const name of ['reference-core.mjs','reference-audit.mjs','reference-report.mjs','reference-route.mjs','reference-cli.mjs']){const code=await file(name);assert.doesNotMatch(code,/\bsetInterval\s*\(/u);assert.doesNotMatch(code,/\b(localStorage|sessionStorage|indexedDB)\b/u);}});

test('French language field uses a no-break space before colon',async()=>{const route=await file('reference-route.mjs');assert.match(route,/Langue\\u00a0:/u);});
