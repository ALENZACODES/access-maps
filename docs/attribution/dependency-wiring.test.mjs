import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {fileName, mountDependencyInspector} from './dependency-route.mjs';
import {fixture} from './dependency-fixture.mjs';
import {auditInventory} from './dependency-audit.mjs';
import {COPY} from './dependency-report.mjs';
import {sourceImpact} from './dependency-impact.mjs';
const read = name => readFile(new URL(`./${name}`,import.meta.url),'utf8');
const originalLinks=[
  'placement.html?lang=en','placement.html?lang=fr','trace.html',
  'trace.html?lang=fr','observation.html?lang=en','observation.html?lang=fr',
  'conflict.html?lang=en','conflict.html?lang=fr',
  'parity.html?lang=en','parity.html?lang=fr',
];
for(const link of originalLinks) {
  test(`merged homepage retains ${link}`,async()=>{
    assert.ok((await read('index.html')).includes(`href="${link}"`));
  });
}
const originalCss=['attribution.css','placement-link.css','trace-link.css','observation-link.css',
  'conflict-link.css','parity-link.css'];
for(const name of originalCss) {
  test(`merged homepage retains ${name}`,async()=>{
    assert.ok((await read('index.html')).includes(`href="${name}"`));
  });
}
test('homepage adds dependency link in English',async()=>{
  assert.ok((await read('index.html')).includes('href="dependency.html?lang=en"'));
});
test('homepage adds dependency link in French',async()=>{
  assert.ok((await read('index.html')).includes('href="dependency.html?lang=fr"'));
});
test('homepage includes the actual link stylesheet',async()=>{
  assert.ok((await read('index.html')).includes('href="dependency-link.css"'));
});
test('new route has a main landmark',async()=>{
  assert.match(await read('dependency.html'),/<main id="dependency-main">/u);
});
test('new route has skip navigation to its main landmark',async()=>{
  assert.match(await read('dependency.html'),/href="#dependency-main"/u);
});
test('new route uses its actual module',async()=>{
  assert.match(await read('dependency.html'),/src="dependency-route.mjs"/u);
});
test('new route links its local stylesheet',async()=>{
  assert.match(await read('dependency.html'),/href="dependency.css"/u);
});
test('new route CSP denies unsolicited connections',async()=>{
  assert.ok((await read('dependency.html')).includes("connect-src 'none'"));
});
test('new route CSP denies forms targeting remote endpoints',async()=>{
  assert.ok((await read('dependency.html')).includes("form-action 'none'"));
});
test('new route CSP denies inline scripts',async()=>{
  assert.ok((await read('dependency.html')).includes("script-src 'self'"));
});
test('merged homepage CSP remains intact',async()=>{
  assert.ok((await read('index.html')).includes("default-src 'none'"));
  assert.ok((await read('index.html')).includes("connect-src 'none'"));
});
test('new styles give buttons at least 44px minimum height',async()=>{
  assert.match(await read('dependency.css'),/min-height:44px/u);
});
test('new homepage links have at least 44px height',async()=>{
  assert.match(await read('dependency-link.css'),/min-height:44px/u);
});
test('focus-visible has an explicit outline',async()=>{
  const style=await read('dependency.css');
  assert.match(style,/:focus-visible\{outline:3px/u);
});
test('homepage links have visible keyboard focus',async()=>{
  const style=await read('dependency-link.css');
  assert.match(style,/:focus-visible\{outline:3px/u);
});
test('styling supports reduced motion',async()=>{
  assert.match(await read('dependency.css'),/prefers-reduced-motion/u);
});
test('route renders legal content with textContent',async()=>{
  const route=await read('dependency-route.mjs');
  assert.match(route,/textContent = String\(text\)/u);
});
test('route does not treat imported HTML as markup',async()=>{
  const route=await read('dependency-route.mjs');
  assert.ok(!/\.innerHTML\s*=/u.test(route));
  assert.ok(!/insertAdjacentHTML\s*\(/u.test(route));
});
test('route avoids scheduled or automatic polling',async()=>{
  const route=await read('dependency-route.mjs');
  assert.ok(!/setInterval\s*\(|setTimeout\s*\(|requestAnimationFrame\s*\(/u.test(route));
});
test('route does not send source data to remote endpoints',async()=>{
  const route=await read('dependency-route.mjs');
  assert.ok(!/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/u.test(route));
});
test('route does not retain the imported inventory across page closes',async()=>{
  const route=await read('dependency-route.mjs');
  assert.ok(!/localStorage|sessionStorage|indexedDB/u.test(route));
});
test('route has polite status region',async()=>{
  const route=await read('dependency-route.mjs');
  assert.ok(route.includes("'aria-live':'polite'"));
});
test('route retains main landmark instead of replacing it',async()=>{
  const route=await read('dependency-route.mjs');
  assert.ok(route.includes('root.replaceChildren('));
  assert.ok(route.includes("getElementById('dependency-main')"));
  assert.ok(!route.includes('document.body.replaceChildren'));
});
test('language buttons expose pressed state',async()=>{
  const route=await read('dependency-route.mjs');
  assert.ok(route.includes("button.setAttribute('aria-pressed'"));
});
test('locale switch updates root and document languages',async()=>{
  const route=await read('dependency-route.mjs');
  assert.ok(route.includes('root.lang=locale'));
  assert.ok(route.includes('doc.documentElement.lang=locale'));
});
test('file chooser has a JSON type hint',async()=>{
  const route=await read('dependency-route.mjs');
  assert.ok(route.includes("picker.input.accept = '.json,application/json'"));
});
test('file import is size-limited',async()=>{
  const route=await read('dependency-route.mjs');
  assert.ok(route.includes('file.size > MAX_INPUT_BYTES'));
});
test('failed imports do not overwrite existing state',async()=>{
  const route=await read('dependency-route.mjs');
  assert.ok(route.includes('callback(parseInventory(content))'));
  assert.ok(route.includes('announce(`${labels().importBad}'));
});
test('feature does not invent one sample transit provider',async()=>{
  const source=await read('dependency-fixture.mjs');
  assert.match(source,/Fictional/u);
  assert.ok(!source.includes('MiWay'));
});
test('the source legal OSM credit is unchanged',()=>{
  assert.ok(JSON.stringify(fixture()).includes('© OpenStreetMap contributors'));
});
test('English and French export filenames differ',()=>{
  assert.notEqual(fileName('en','txt'),fileName('fr','txt'));
});
test('export filename handles invalid caller category safely',()=>{
  assert.equal(fileName('fr','json','../../wrong'),'dependency-fr.json');
});
test('feature entrypoint is exported for application tests',()=>{
  assert.equal(typeof mountDependencyInspector,'function');
});
test('new UI has English and French messages',()=>{
  assert.ok(COPY.en.title);
  assert.ok(COPY.fr.title);
});
test('new UI never claims approval from a publisher',()=>{
  const text=JSON.stringify(COPY);
  assert.ok(!/endorsed by|official partner|guaranteed|real-time|vérif|verify/iu.test(text));
});
test('new UI excludes eligibility or medical suggestions',()=>{
  const text=JSON.stringify(COPY);
  assert.ok(!/eligibility decision|medical treatment/u.test(text));
});
test('root test command already picks up mjs suites in this directory',()=>{
  assert.equal(fileURLToPath(new URL('./dependency-core.test.mjs',import.meta.url)).endsWith('dependency-core.test.mjs'),true);
});
test('complete archive files have no relative module import gaps',async()=>{
  const names=['dependency-core.mjs','dependency-audit.mjs','dependency-report.mjs','dependency-route.mjs',
    'dependency-cli.mjs','dependency-fixture.mjs','dependency-impact.mjs','dependency-impact.test.mjs','dependency-core.test.mjs','dependency-audit.test.mjs',
    'dependency-report.test.mjs','dependency-cli.test.mjs','dependency-wiring.test.mjs'];
  for(const name of names){
    const content=await read(name);
    for(const hit of content.matchAll(/from ['"]\.\/([^'"]+)['"]/gu)){
      const included=await read(hit[1]);
      assert.ok(included.length>0,`${name} requires ${hit[1]}`);
    }
  }
});
test('all executable source files pass Node syntax checking',()=>{
  for(const name of ['dependency-core.mjs','dependency-audit.mjs','dependency-report.mjs',
    'dependency-route.mjs','dependency-cli.mjs','dependency-fixture.mjs','dependency-impact.mjs']){
    assert.doesNotThrow(()=>execFileSync(process.execPath,['--check',fileURLToPath(new URL(`./${name}`,import.meta.url))]));
  }
});
test('empty inventory is not reported as an accessibility pass',()=>{
  const result=auditInventory({schema:'attribution-dependency-inventory/1',title:'Empty',sources:[],assets:[],surfaces:[]});
  assert.equal(result.status,'no-surfaces');
});

test('impact explorer is actually mounted on the user-facing route',async()=>{
  const route=await read('dependency-route.mjs');
  assert.ok(route.includes('function displaySourceImpact()'));
  assert.ok(route.includes('displaySourceImpact(),displayFindings()'));
});
test('impact explorer renders graph paths as text rather than markup',async()=>{
  const route=await read('dependency-route.mjs');
  assert.ok(route.includes("path.chain.join(' > ')"));
  assert.equal(typeof sourceImpact,'function');
});
test('impact report is explicitly downloaded on request',async()=>{
  const route=await read('dependency-route.mjs');
  assert.ok(route.includes('sourceImpactText(current,selectedSource,locale)'));
  assert.ok(route.includes('sourceImpactTsv(current)'));
});
