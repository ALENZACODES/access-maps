import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {element,readFields,decodeForm,fieldSchema} from './bundle-route.mjs';
import {queryLocale,COPY} from './bundle-copy.mjs';
import {REQUIRED,UNKNOWN} from './bundle-core.mjs';
const read=name=>readFile(new URL(`./${name}`,import.meta.url),'utf8');
const file=name=>fileURLToPath(new URL(`./${name}`,import.meta.url));

test('the merged attribution page retains the original script',async()=>{
  const html=await read('index.html');
  assert.ok(html.includes('src="route.mjs"'));
});
test('merged placement links survive the new feature',async()=>{
  const html=await read('index.html');
  assert.ok(html.includes('placement.html?lang=en'));
  assert.ok(html.includes('placement.html?lang=fr'));
  assert.ok(html.includes('placement-link.css'));
});
test('merged trace links survive the new feature',async()=>{
  const html=await read('index.html');
  assert.ok(html.includes('href="trace.html"'));
  assert.ok(html.includes('trace.html?lang=fr'));
  assert.ok(html.includes('trace-link.css'));
});
test('merged observation links survive the new feature',async()=>{
  const html=await read('index.html');
  assert.ok(html.includes('observation.html?lang=en'));
  assert.ok(html.includes('observation.html?lang=fr'));
  assert.ok(html.includes('observation-link.css'));
});
test('merged conflict wording retains the Open prefix',async()=>{
  const html=await read('index.html');
  assert.ok(html.includes('Open attribution conflict review'));
  assert.ok(html.includes('Ouvrir l’examen des divergences d’attribution'));
});
test('merged parity navigation survives the new feature',async()=>{
  const html=await read('index.html');
  assert.ok(html.includes('parity.html?lang=en'));
  assert.ok(html.includes('parity.html?lang=fr'));
  assert.ok(html.includes('parity-link.css'));
});
test('new bundle links exist in both supported locales',async()=>{
  const html=await read('index.html');
  assert.ok(html.includes('href="bundle.html?lang=en"'));
  assert.ok(html.includes('href="bundle.html?lang=fr"'));
  assert.ok(html.includes('href="bundle-link.css"'));
});
test('new index keeps the original restrictive CSP',async()=>{
  const html=await read('index.html');
  assert.ok(html.includes("connect-src 'none'"));
  assert.ok(html.includes("form-action 'none'"));
});
test('standalone page imports its real local module',async()=>{
  const html=await read('bundle.html');
  assert.ok(html.includes('src="bundle-route.mjs"'));
});
test('standalone page imports its real local stylesheet',async()=>{
  const html=await read('bundle.html');
  assert.ok(html.includes('href="bundle.css"'));
});
test('standalone page retains a main landmark',async()=>{
  const html=await read('bundle.html');
  assert.ok(html.includes('<main id="bundle-main">'));
});
test('standalone page has a skip link',async()=>{
  const html=await read('bundle.html');
  assert.ok(html.includes('href="#bundle-main"'));
});
test('standalone page forbids remote connections',async()=>{
  const html=await read('bundle.html');
  assert.ok(html.includes("connect-src 'none'"));
});
test('standalone page forbids external image loading',async()=>{
  const html=await read('bundle.html');
  assert.ok(html.includes("img-src 'none'"));
});
test('standalone page supports French fallback',async()=>{
  const html=await read('bundle.html');
  assert.ok(html.includes('Composition locale des mentions'));
});
test('editor controls have 44 CSS pixel minimum height',async()=>{
  const css=await read('bundle.css');
  assert.match(css,/min-height:44px/u);
});
test('homepage links have 44 CSS pixel minimum height',async()=>{
  const css=await read('bundle-link.css');
  assert.match(css,/min-height:44px/u);
});
test('editor controls have visible keyboard focus',async()=>{
  const css=await read('bundle.css');
  assert.match(css,/:focus-visible/u);
});
test('homepage links have visible keyboard focus',async()=>{
  const css=await read('bundle-link.css');
  assert.match(css,/:focus-visible/u);
});
test('editor respects reduced motion preferences',async()=>{
  const css=await read('bundle.css');
  assert.match(css,/prefers-reduced-motion/u);
});
test('UI provides a status announcement region',async()=>{
  const code=await read('bundle-route.mjs');
  assert.ok(code.includes("role:'status'"));
  assert.ok(code.includes("'aria-live':'polite'"));
});
test('UI keeps source text in textContent',async()=>{
  const code=await read('bundle-route.mjs');
  assert.ok(code.includes('textContent='));
});
test('UI never uses innerHTML for supplied text',async()=>{
  const code=await read('bundle-route.mjs');
  assert.ok(!code.includes('innerHTML'));
});
test('UI does not request a remote service',async()=>{
  const code=await read('bundle-route.mjs');
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/u.test(code));
});
test('UI does not schedule or persist work',async()=>{
  const code=await read('bundle-route.mjs');
  assert.ok(!/setInterval|setTimeout|localStorage|sessionStorage|indexedDB/u.test(code));
});
test('UI only exports after a button action',async()=>{
  const code=await read('bundle-route.mjs');
  assert.ok(code.includes("button(doc,t().download"));
});
test('new module imports are all included',async()=>{
  for(const name of ['bundle-core.mjs','bundle-audit.mjs','bundle-copy.mjs','bundle-export.mjs',
    'bundle-route.mjs','bundle-cli.mjs','bundle-fixture.mjs',
    'bundle-core.test.mjs','bundle-audit.test.mjs','bundle-export.test.mjs',
    'bundle-cli.test.mjs','bundle-wiring.test.mjs']) {
    const content=await read(name);
    for(const match of content.matchAll(/from ['"]\.\/([^'"]+)['"]/gu)) {
      assert.ok(existsSync(file(match[1])),`${name} imports missing ${match[1]}`);
    }
  }
});
test('editor source form has all source schema fields',()=>{
  assert.deepEqual(fieldSchema('sources').map(x=>x.name),REQUIRED.source);
});
test('editor view form has all view schema fields',()=>{
  assert.deepEqual(fieldSchema('views').map(x=>x.name),REQUIRED.view);
});
test('editor asset form has all asset schema fields',()=>{
  assert.deepEqual(fieldSchema('assets').map(x=>x.name),REQUIRED.asset);
});
test('editor notice form has all notice schema fields',()=>{
  assert.deepEqual(fieldSchema('notices').map(x=>x.name),REQUIRED.notice);
});
test('editor observation form has all observation schema fields',()=>{
  assert.deepEqual(fieldSchema('observations').map(x=>x.name),REQUIRED.observation);
});
test('CSV-style source IDs are split only in asset form',()=>{
  const parsed=decodeForm('assets',{sourceIds:'a,b',geometrySourceIds:'a'});
  assert.deepEqual(parsed.sourceIds,['a','b']);
  assert.deepEqual(parsed.geometrySourceIds,['a']);
});
test('unknown touch size remains UNKNOWN in editor',()=>{
  assert.equal(decodeForm('observations',{minimumTargetPx:UNKNOWN}).minimumTargetPx,UNKNOWN);
});
test('numeric touch size is converted by editor',()=>{
  assert.equal(decodeForm('observations',{minimumTargetPx:'44'}).minimumTargetPx,44);
});
test('the French locale query selects French',()=>assert.equal(queryLocale('?lang=fr'),'fr'));
test('unknown locale query selects English',()=>assert.equal(queryLocale('?lang=fr-CA'),'en'));
test('all French labels are provided for same keys as English',()=>{
  assert.deepEqual(Object.keys(COPY.en).sort(),Object.keys(COPY.fr).sort());
});
test('new French strings avoid unsupported claims',()=>{
  assert.ok(!/vérif|verify|real-time|partnership|guarantee/iu.test(JSON.stringify(COPY.fr)));
});
test('fixture is fictional rather than a real-place claim',async()=>{
  assert.ok((await read('bundle-fixture.mjs')).includes('Fictional'));
});
test('HTML template has no unsupported branding',async()=>{
  const html=await read('bundle.html');
  assert.ok(html.includes('the App'));
  assert.ok(!/endorsed|partnership|guarantee/iu.test(html));
});
test('no new workflows are packaged in this directory',async()=>{
  const doc=await read('BUNDLE_README.md');
  assert.ok(doc.includes('No scheduled workflow'));
});
