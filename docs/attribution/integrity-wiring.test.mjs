import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {basename} from 'node:path';
import {readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {editorRecord} from './integrity-route.mjs';
import {fixture} from './integrity-fixture.mjs';
import {blankRegister,UNKNOWN,parseRegister} from './integrity-core.mjs';
import {COPY,FIELDS} from './integrity-copy.mjs';

const read=name=>readFile(new URL(`./${name}`,import.meta.url),'utf8');
const appFiles=[
 'integrity-core.mjs','integrity-audit.mjs','integrity-copy.mjs','integrity-hash.mjs',
 'integrity-report.mjs','integrity-route.mjs','integrity-cli.mjs','integrity-fixture.mjs',
 'integrity-core.test.mjs','integrity-audit.test.mjs','integrity-report.test.mjs',
 'integrity-hash.test.mjs','integrity-cli.test.mjs','integrity-wiring.test.mjs',
];

test('new feature route is linked in the final homepage in English',async()=>{
  const html=await read('index.html');
  assert.ok(html.includes('href="integrity.html?lang=en"'));
});
test('new feature route is linked in the final homepage in French',async()=>{
  const html=await read('index.html');
  assert.ok(html.includes('href="integrity.html?lang=fr"'));
});
test('new homepage stylesheet is actually linked',async()=>{
  assert.ok((await read('index.html')).includes('href="integrity-link.css"'));
});
for(const [name,reference] of [
 ['placement','placement.html?lang=fr'],
 ['trace','trace.html?lang=fr'],
 ['observation','observation.html?lang=fr'],
 ['conflict','conflict.html?lang=fr'],
 ['parity','parity.html?lang=fr'],
 ['dependency','dependency.html?lang=fr'],
]) {
  test(`merged ${name} navigation remains on homepage`,async()=>{
    assert.ok((await read('index.html')).includes(`href="${reference}"`));
  });
}
for(const stylesheet of [
 'attribution.css','placement-link.css','trace-link.css','observation-link.css',
 'conflict-link.css','parity-link.css','dependency-link.css','integrity-link.css',
]) {
  test(`merged homepage links the ${stylesheet} stylesheet`,async()=>{
    assert.ok((await read('index.html')).includes(`href="${stylesheet}"`));
  });
}
test('homepage retains its original script rather than replacing it',async()=>{
  assert.ok((await read('index.html')).includes('src="route.mjs"'));
});
test('homepage retains its original restrictive CSP',async()=>{
  assert.ok((await read('index.html')).includes("connect-src 'none'"));
  assert.ok((await read('index.html')).includes("script-src 'self'"));
});
test('new route imports its included module and CSS',async()=>{
  const html=await read('integrity.html');
  assert.ok(html.includes('src="integrity-route.mjs"'));
  assert.ok(html.includes('href="integrity.css"'));
});
test('new route denies all scripted network requests in its CSP',async()=>{
  const html=await read('integrity.html');
  assert.ok(html.includes("connect-src 'none'"));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(html.includes("form-action 'none'"));
});
test('new route includes an initial main landmark',async()=>{
  const html=await read('integrity.html');
  assert.ok(html.includes('<main id="integrity-main">'));
});
test('new route includes a keyboard skip link',async()=>{
  const html=await read('integrity.html');
  assert.ok(html.includes('href="#integrity-main"'));
});
test('new route provides English and French fallback content',async()=>{
  const html=await read('integrity.html');
  assert.ok(html.includes('Local source file integrity'));
  assert.ok(html.includes('Intégrité locale des fichiers sources'));
});
test('new route does not reference any remote fonts or tile requests',async()=>{
  const html=await read('integrity.html');
  assert.ok(!/https:\/\//u.test(html));
  assert.ok(!/fonts\.google|mapbox|openstreetmap\.org\/tile/u.test(html));
});
test('form controls meet the 44 CSS pixel target requirement',async()=>{
  const css=await read('integrity.css');
  assert.match(css,/min-height:44px/u);
});
test('navigation link targets meet 44 CSS pixels',async()=>{
  const css=await read('integrity-link.css');
  assert.match(css,/min-height:44px/u);
});
test('new page controls have visible keyboard focus',async()=>{
  const css=await read('integrity.css');
  assert.match(css,/:focus-visible/u);
  assert.match(css,/outline:3px/u);
});
test('new navigation links have visible keyboard focus',async()=>{
  const css=await read('integrity-link.css');
  assert.match(css,/:focus-visible/u);
  assert.match(css,/outline:3px/u);
});
test('new styles include reduced motion and narrow screen layout',async()=>{
  const css=await read('integrity.css');
  assert.ok(css.includes('prefers-reduced-motion'));
  assert.ok(css.includes('max-width:600px'));
});
test('new styles support dark mode without solely relying on colour',async()=>{
  const css=await read('integrity.css');
  assert.ok(css.includes('prefers-color-scheme:dark'));
  assert.ok(css.includes('color:#'));
});
test('record display uses textContent rather than inserting unchecked HTML',async()=>{
  const module=await read('integrity-route.mjs');
  assert.ok(module.includes('textContent=text'));
  assert.ok(!module.includes('innerHTML'));
});
test('new page includes a polite status announcement',async()=>{
  const module=await read('integrity-route.mjs');
  assert.ok(module.includes("'aria-live':'polite'"));
  assert.ok(module.includes("'aria-atomic':'true'"));
});
test('rendering retains main landmark after JavaScript enhancement',async()=>{
  const module=await read('integrity-route.mjs');
  assert.ok(module.includes("node(doc,'main'"));
  assert.ok(module.includes("id:'integrity-main'"));
});
test('no automatic timed changes or polling are added',async()=>{
  const source=await read('integrity-route.mjs');
  assert.ok(!/setInterval\(|setTimeout\(|requestAnimationFrame\(/u.test(source));
});
test('no browser storage of source filenames or evidence',async()=>{
  const source=await read('integrity-route.mjs');
  assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/u.test(source));
});
test('no remote fetch, WebSocket, beacon or XHR calls',async()=>{
  const source=await read('integrity-route.mjs');
  assert.ok(!/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/u.test(source));
});
test('file bytes are read only after a deliberate click',async()=>{
  const source=await read('integrity-route.mjs');
  assert.ok(source.includes('digestFile(file)'));
  assert.ok(source.includes('t().measureAction'));
  assert.ok(source.includes("input.type='file'"));
});
test('file measurement must be explicitly recorded',async()=>{
  const source=await read('integrity-route.mjs');
  assert.ok(source.includes('t().recordMeasurement'));
  assert.ok(source.includes("openEditor('measurements',record)"));
});
test('new feature file has no import from an unmerged feature branch',async()=>{
  const source=await read('integrity-route.mjs');
  assert.ok(!/checklist-|bundle-|incident-|trace-packet|concordance-|p18-r67/u.test(source));
});
test('all runtime module imports resolve to files in the same directory',async()=>{
  for(const name of appFiles) {
    const source=await read(name);
    for(const match of source.matchAll(/(?:from\s*|import\s*)['"]\.\/([^'"\n]+)['"]/gu)) {
      const moduleName=match[1];
      assert.ok(await read(moduleName),`${name} -> ${moduleName}`);
    }
  }
});
test('all included local CSS and HTML is present',async()=>{
  for(const name of ['integrity.html','integrity.css','integrity-link.css','index.html']) {
    assert.ok((await read(name)).length>0,name);
  }
});
test('no code is silently changing an install-budget script',async()=>{
  const names=await readdir(fileURLToPath(new URL('.',import.meta.url)));
  assert.ok(!names.some(x=>x==='check-install-budget.ts'));
});
test('source code has no cron workflow or keep-awake logic',async()=>{
  for(const name of appFiles.filter(x=>!x.endsWith('.test.mjs'))) {
    const code=await read(name);
    assert.ok(!/schedule:\s*\n|keep-awake|cron:|ping-loop/iu.test(code),name);
  }
});
test('field conversion preserves UNKNOWN byte length',()=>{
  const row=editorRecord('assets',{sourceIds:'source-osm',byteLength:UNKNOWN});
  assert.equal(row.byteLength,UNKNOWN);
});
test('field conversion parses a numeric byte length',()=>{
  const row=editorRecord('assets',{sourceIds:'source-osm',byteLength:'150'});
  assert.equal(row.byteLength,150);
});
test('field conversion parses comma separated provenance IDs',()=>{
  const row=editorRecord('assets',{sourceIds:'source-osm, second-source,  '});
  assert.deepEqual(row.sourceIds,['source-osm','second-source']);
});
test('field conversion parses touch target as a number',()=>{
  const row=editorRecord('checks',{targetPx:'44'});
  assert.equal(row.targetPx,44);
});
test('field conversion retains UNKNOWN touch target',()=>{
  const row=editorRecord('checks',{targetPx:UNKNOWN});
  assert.equal(row.targetPx,UNKNOWN);
});
test('field conversion parses measured byte length',()=>{
  const row=editorRecord('measurements',{byteLength:'0'});
  assert.equal(row.byteLength,0);
});
test('field conversion does not mutate the input object',()=>{
  const input={sourceIds:'a,b',byteLength:'45'};
  editorRecord('assets',input);
  assert.deepEqual(input,{sourceIds:'a,b',byteLength:'45'});
});
test('empty register remains a local draft on load',()=>{
  const empty=blankRegister();
  assert.equal(parseRegister(empty).assets.length,0);
});
test('fixture is synthetic and does not assert real-world access',async()=>{
  const fixtureFile=await read('integrity-fixture.mjs');
  assert.ok(fixtureFile.includes('Fictional'));
  assert.ok(!/accessible station|step-free confirmed/u.test(fixtureFile));
});
test('bilingual copy preserves consistent input keys',()=>{
  assert.deepEqual(Object.keys(COPY.en).sort(),Object.keys(COPY.fr).sort());
  for(const key of Object.values(FIELDS).flat()) {
    assert.equal(typeof COPY.en[key] === 'string' || key==='id',true,key);
    assert.equal(typeof COPY.fr[key] === 'string' || key==='id',true,key);
  }
});
test('local review is explicitly not an access or rights certification',()=>{
  assert.ok(COPY.en.warning.includes('does not establish permission'));
  assert.ok(COPY.fr.warning.includes('ne démontre'));
});
test('file hashing and exports require deliberate user controls',async()=>{
  const source=await read('integrity-route.mjs');
  for(const label of ['t().measureAction','t().export','t().exportText','t().exportMatrix','t().exportHtml']) assert.ok(source.includes(label));
});
test('the entry HTML is not an automatic redirect',async()=>{
  const html=await read('integrity.html');
  assert.ok(!/http-equiv="refresh"/u.test(html));
  assert.ok(!/window\.location\s*=/u.test(html));
});
test('new source code does not depend on unapproved external packages',async()=>{
  for(const name of appFiles.filter(x=>!x.includes('.test.'))) {
    const source=await read(name);
    const imports=[...source.matchAll(/from\s+['"]([^'"\n]+)['"]/gu)].map(x=>x[1]);
    assert.ok(imports.every(x=>x.startsWith('./')||x.startsWith('node:')),name);
  }
});
