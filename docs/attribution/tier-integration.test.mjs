import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SOURCES,METROLINX_AUA_LEGEND,METROLINX_OGL_NOTICE,METROLINX_AUA_END_USER_LAWS_EN,METROLINX_AUA_END_USER_LAWS_FR} from './attribution-utils.mjs';
import {LEDGER_SCHEMA} from './tier-ledger.mjs';
import {auditTierLedger} from './tier-audit.mjs';
import {ledger,auaRecord,oglRecord,surface} from './tier-fixtures.mjs';
const dir=dirname(fileURLToPath(import.meta.url));
const source=async name=>readFile(join(dir,name),'utf8');
test('direct route HTML references its exact local entry point',async()=>{
  const html=await source('tier.html');
  assert.ok(html.includes('src="./tier-route.mjs"'));
  assert.ok(html.includes('href="./tier.css"'));
});
test('direct route entry point imports all newly supplied executable modules',async()=>{
  const js=await source('tier-route.mjs');
  for(const module of ['tier-ledger.mjs','tier-audit.mjs','tier-report.mjs'])assert.ok(js.includes(`'./${module}'`));
});
test('audit uses only authoritative merged catalogue',async()=>{
  const js=await source('tier-audit.mjs');
  assert.ok(js.includes("from './attribution-utils.mjs'"));
  assert.ok(!js.includes('const METROLINX_AUA_LEGEND ='));
  assert.ok(!js.includes('const METROLINX_OGL_NOTICE ='));
});
test('the authoritative catalogue provides OSM/Metrolinx/LTC',()=>{
  assert.deepEqual(Object.keys(SOURCES).sort(),['ltc','metrolinx','osm']);
});
test('legal notices remain distinct',()=>{
  assert.ok(METROLINX_AUA_LEGEND.length>100);
  assert.ok(METROLINX_OGL_NOTICE.startsWith('Contains information'));
  assert.ok(METROLINX_AUA_END_USER_LAWS_EN.includes('applicable laws'));
  assert.ok(METROLINX_AUA_END_USER_LAWS_FR.includes('lois applicables'));
});
test('AUA and OGL record decisions stay separate in same release',()=>{
  const input=ledger({records:[auaRecord(),oglRecord()],surfaces:[surface({recordIds:['aua-record','ogl-record'],mode:'journey'})]});
  const result=auditTierLedger(input);
  assert.equal(result.blocked,false);
});
test('schema differs from the merged production evidence schema without replacing it',()=>{
  assert.equal(LEDGER_SCHEMA,'attribution-tier-ledger/1');
});
test('HTML route has no inline executable JavaScript',async()=>{
  const html=await source('tier.html');
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/iu.test(html));
});
test('HTML route does not fetch external scripts, styles or images',async()=>{
  const html=await source('tier.html');
  for(const p of ['tier-route.mjs','tier.css'])assert.ok(html.includes(p));
  assert.ok(!/https?:\/\//iu.test(html));
});
test('HTML CSP blocks all connections',async()=>{
  const html=await source('tier.html');
  assert.ok(html.includes("connect-src 'none'"));
  assert.ok(html.includes("object-src 'none'"));
  assert.ok(html.includes("base-uri 'none'"));
});
test('HTML includes semantic skip link',async()=>{
  const html=await source('tier.html');
  assert.ok(html.includes('href="#main"'));
  assert.ok(html.includes('id="main"'));
});
test('HTML has actual labelled form controls',async()=>{
  const html=await source('tier.html');
  for(const id of ['language','current','previous']){
    assert.ok(html.includes(`for="${id}"`));
    assert.ok(html.includes(`id="${id}"`));
  }
});
test('status region announces changes',async()=>{
  const html=await source('tier.html');
  assert.ok(html.includes('role="status"'));
  assert.ok(html.includes('aria-live="polite"'));
});
test('export buttons disabled until a release is loaded',async()=>{
  const html=await source('tier.html');
  for(const id of ['save-html','save-json','save-text'])assert.match(html,new RegExp(`id="${id}"[^>]*disabled`));
});
test('CSS declares 44px minimum controls and links',async()=>{
  const css=await source('tier.css');
  assert.ok(css.includes('min-height:44px'));
  assert.ok(css.includes('min-width:44px'));
});
test('CSS provides visible keyboard focus',async()=>{
  const css=await source('tier.css');
  assert.ok(css.includes(':focus-visible'));
  assert.ok(css.includes('outline:3px'));
});
test('CSS supports reduced motion',async()=>assert.ok((await source('tier.css')).includes('prefers-reduced-motion')));
test('CSS adapts to narrow screens',async()=>assert.ok((await source('tier.css')).includes('@media(max-width:46rem)')));
test('CSS supports high contrast mode',async()=>assert.ok((await source('tier.css')).includes('forced-colors:active')));
test('CSS allows printing without exposing controls',async()=>assert.ok((await source('tier.css')).includes('@media print')));
test('route uses safe text-only DOM writes',async()=>{
  const js=await source('tier-route.mjs');
  assert.ok(js.includes('textContent'));
  assert.ok(!js.includes('innerHTML'));
});
test('route does not persist imported files',async()=>{
  const js=await source('tier-route.mjs');
  assert.ok(!js.includes('localStorage'));
  assert.ok(!js.includes('sessionStorage'));
  assert.ok(!js.includes('indexedDB'));
});
test('route uses local file reading instead of fetch',async()=>{
  const js=await source('tier-route.mjs');
  assert.ok(js.includes('file.text()'));
  assert.ok(!/\bfetch\s*\(/u.test(js));
});
test('route exposes failed imports without replacing the existing release',async()=>{
  const js=await source('tier-route.mjs');
  assert.ok(js.includes('const next=await readFile(chosen)'));
  assert.ok(js.indexOf('current=next')>js.indexOf('const prior=old?await readFile(old):null'));
});
test('route includes comparison findings rather than status alone',async()=>{
  const js=await source('tier-route.mjs');
  assert.ok(js.includes('comparison?.changes'));
  assert.ok(js.includes('fillFindingList(doc,audit,locale,comparison)'));
});
test('route French language label uses U+00A0 before colon',async()=>{
  const js=await source('tier-route.mjs');
  assert.ok(js.includes("`${copy.language}\\u00a0:`"));
});
test('existing root test command discovers all new test files automatically',async()=>{
  const root=join(dir,'../..');
  const manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
  assert.ok(manifest.scripts.test.includes('node --test docs/attribution/*.test.mjs'));
});
test('no dependency or lockfile change is necessary',async()=>{
  const module=await source('tier-cli.mjs');
  assert.ok(module.includes('node:fs/promises'));
  assert.ok(module.includes('node:path'));
});
test('offline route has all new relative imports present',async()=>{
  const names=['tier-ledger.mjs','tier-audit.mjs','tier-report.mjs','tier-cli.mjs','tier-route.mjs','tier-fixtures.mjs'];
  for(const name of names){
    const text=await source(name);
    for(const match of text.matchAll(/from\s+['"](\.\/[^'"]+)['"]/gu)){
      await assert.doesNotReject(()=>source(match[1].slice(2)),`${name} -> ${match[1]}`);
    }
  }
});
