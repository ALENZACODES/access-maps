import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {COPY,ISSUE_COPY,localeCopy,findingLabel} from './trace-copy.mjs';
import {TRACE_SCHEMA,OSM_CREDIT} from './trace-core.mjs';
const here=dirname(fileURLToPath(import.meta.url));
const file=name=>readFile(resolve(here,name),'utf8');
test('English and French have matching interface keys',()=>assert.deepEqual(Object.keys(COPY.en).sort(),Object.keys(COPY.fr).sort()));
test('finding labels match between English and French',()=>assert.deepEqual(Object.keys(ISSUE_COPY.en).sort(),Object.keys(ISSUE_COPY.fr).sort()));
test('locale fallback is English',()=>assert.equal(localeCopy('xx'),COPY.en));
test('French locale is explicitly available',()=>assert.equal(localeCopy('fr'),COPY.fr));
test('unknown findings remain visible as codes',()=>assert.equal(findingLabel('fr','OTHER_CODE'),'OTHER_CODE'));
test('schema is stable',()=>assert.equal(TRACE_SCHEMA,'map-notice-trace/1'));
test('OSM credit remains exact',()=>assert.equal(OSM_CREDIT,'© OpenStreetMap contributors'));
test('French copy contains typographic apostrophe',()=>assert.match(COPY.fr.subtitle,/’/u));
test('French copy does not use verify words',()=>assert.doesNotMatch(JSON.stringify(COPY.fr),/vérif/iu));
test('interface avoids real-time and endorsement claims',()=>{
  const body=JSON.stringify(COPY);
  assert.doesNotMatch(body,/real-time|partnership|guarantee|endorse[s]?\s+the App/iu);
});
test('route imports every included new source module',async()=>{
  const route=await file('trace-route.mjs');
  for (const name of ['trace-core.mjs','trace-audit.mjs','trace-copy.mjs']) assert.ok(route.includes(`'./${name}'`));
});
test('browser HTML links the real route and stylesheet',async()=>{
  const html=await file('trace.html');
  assert.match(html,/src="trace-route.mjs"/u);
  assert.match(html,/href="trace.css"/u);
});
test('browser HTML has network-denying CSP',async()=>{
  const html=await file('trace.html');
  assert.match(html,/connect-src 'none'/u);
  assert.match(html,/default-src 'none'/u);
  assert.match(html,/form-action 'none'/u);
});
test('browser HTML has language and fallback main landmark',async()=>{
  const html=await file('trace.html');
  assert.match(html,/<html lang="en">/u);
  assert.match(html,/<main id="trace-fallback">/u);
  assert.match(html,/lang="fr"/u);
});
test('stylesheet includes explicit visible keyboard focus',async()=>{
  const css=await file('trace.css');
  assert.match(css,/:focus-visible/u);
  assert.match(css,/outline: 3px/u);
});
test('stylesheet keeps controls at least 44 pixels',async()=>{
  const css=await file('trace.css');
  assert.match(css,/min-width: 44px/u);
  assert.match(css,/min-height: 44px/u);
});
test('page supports reduced motion and high contrast',async()=>{
  const css=await file('trace.css');
  assert.match(css,/prefers-reduced-motion/u);
  assert.match(css,/prefers-contrast/u);
});
test('route renders a live announcement region and labels',async()=>{
  const route=await file('trace-route.mjs');
  assert.match(route,/'aria-live':'polite'/u);
  assert.match(route,/htmlFor/u);
  assert.match(route,/focusVisible/u);
});
test('no network fetch or persistence operations in route',async()=>{
  const route=await file('trace-route.mjs');
  assert.doesNotMatch(route, /\bfetch\s*\(|\bXMLHttpRequest\b|\blocalStorage\b|\bsessionStorage\b|\bWebSocket\b/iu);
});
test('no external scripts or tracking services',async()=>{
  const html=await file('trace.html');
  assert.doesNotMatch(html,/<script[^>]+src="https?:/u);
});
test('readme points to feature entry and actual schema',async()=>{
  const readme=await file('TRACE_README.md');
  assert.ok(readme.includes('trace.html'));
  assert.ok(readme.includes('map-notice-trace/1'));
});

test('attribution index mounts the trace explorer in both languages',async()=>{
  const index=await file('index.html');
  assert.match(index,/href="trace.html"/u);
  assert.match(index,/href="trace.html\?lang=fr"/u);
  assert.match(index,/href="trace-link.css"/u);
});
test('existing catalogue entrypoint remains unchanged in the index',async()=>{
  const index=await file('index.html');
  assert.match(index,/src="route.mjs"/u);
  assert.match(index,/id="attribution-root"/u);
});
test('link styles give keyboard targets 44px minimum',async()=>{
  const css=await file('trace-link.css');
  assert.match(css,/min-height: 44px/u);
  assert.match(css,/:focus-visible/u);
});

test('coverage matrix is mounted and its import exists',async()=>{
  const route=await file('trace-route.mjs');
  assert.ok(route.includes("from './trace-matrix.mjs'"));
  assert.match(route,/main.append\(controls\(t\),stats\(t\),register\(t\),matrix\(t\),findings\(t\)\)/u);
});
