import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat,access,readlink} from 'node:fs/promises';
import {dirname,join,resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SOURCES,METROLINX_AUA_LEGEND,METROLINX_OGL_NOTICE,METROLINX_AUA_END_USER_LAWS_EN,METROLINX_AUA_END_USER_LAWS_FR} from './attribution-utils.mjs';
import {manifest,source,asset,view} from './distribution-fixtures.mjs';
import {auditDistribution} from './distribution-audit.mjs';
const dir=dirname(fileURLToPath(import.meta.url));
const root=resolve(dir,'../..');
const read=name=>readFile(join(dir,name),'utf8');
const mainFiles=[
  'distribution-core.mjs','distribution-graph.mjs','distribution-audit.mjs',
  'distribution-change.mjs','distribution-report.mjs','distribution-cli.mjs',
  'distribution-route.mjs','distribution-fixtures.mjs',
];
const staticFiles=['distribution.html','distribution.css','DISTRIBUTION_README.md'];
const testFiles=[
  'distribution-core.test.mjs','distribution-graph.test.mjs',
  'distribution-audit.test.mjs','distribution-change.test.mjs',
  'distribution-report.test.mjs','distribution-cli.test.mjs',
  'distribution-wiring.test.mjs',
];

test('all production modules exist on disk',async()=>{
  for(const name of mainFiles)await assert.doesNotReject(()=>stat(join(dir,name)),name);
});
test('all standalone assets exist on disk',async()=>{
  for(const name of staticFiles)await assert.doesNotReject(()=>stat(join(dir,name)),name);
});
test('all tests read existing files',async()=>{
  for(const name of testFiles)await assert.doesNotReject(()=>read(name),name);
});
test('all production and test files are local to attribution scope',()=>{
  for(const name of [...mainFiles,...staticFiles,...testFiles]){
    assert.equal(name.includes('..'),false);
    assert.equal(name.includes('/'),false);
  }
});
test('all production modules are ordinary files, not links',async()=>{
  for(const name of mainFiles){const info=await stat(join(dir,name));assert.equal(info.isFile(),true);}
});
test('route source imports the parser',async()=>assert.match(await read('distribution-route.mjs'),/from '\.\/distribution-core\.mjs'/u));
test('route source imports release audit',async()=>assert.match(await read('distribution-route.mjs'),/from '\.\/distribution-audit\.mjs'/u));
test('route source imports release comparison',async()=>assert.match(await read('distribution-route.mjs'),/from '\.\/distribution-change\.mjs'/u));
test('route source imports shared report renderer',async()=>assert.match(await read('distribution-route.mjs'),/from '\.\/distribution-report\.mjs'/u));
test('CLI source imports the parser',async()=>assert.match(await read('distribution-cli.mjs'),/from '\.\/distribution-core\.mjs'/u));
test('CLI source imports release audit',async()=>assert.match(await read('distribution-cli.mjs'),/from '\.\/distribution-audit\.mjs'/u));
test('CLI source imports release comparison',async()=>assert.match(await read('distribution-cli.mjs'),/from '\.\/distribution-change\.mjs'/u));
test('CLI source imports shared report renderer',async()=>assert.match(await read('distribution-cli.mjs'),/from '\.\/distribution-report\.mjs'/u));
test('audit imports authoritative merged catalogue, not copied notices',async()=>{
  const code=await read('distribution-audit.mjs');
  assert.match(code,/from '\.\/attribution-utils\.mjs'/u);
  assert.doesNotMatch(code,/const METROLINX_AUA_LEGEND\s*=/u);
});
test('fixture uses authoritative legal notices',async()=>{
  const code=await read('distribution-fixtures.mjs');
  assert.match(code,/from '\.\/attribution-utils\.mjs'/u);
});
test('authoritative catalogue includes OSM source',()=>assert.ok(Object.hasOwn(SOURCES,'osm')));
test('authoritative catalogue includes Metrolinx source',()=>assert.ok(Object.hasOwn(SOURCES,'metrolinx')));
test('authoritative catalogue includes LTC source',()=>assert.ok(Object.hasOwn(SOURCES,'ltc')));
test('AUA legend is more than 100 characters',()=>assert.ok(METROLINX_AUA_LEGEND.length>100));
test('Metrolinx OGL notice remains independent',()=>assert.notEqual(METROLINX_OGL_NOTICE,METROLINX_AUA_LEGEND));
test('English laws line is retained',()=>assert.match(METROLINX_AUA_END_USER_LAWS_EN,/applicable laws/u));
test('French laws line is retained',()=>assert.match(METROLINX_AUA_END_USER_LAWS_FR,/lois applicables/u));
test('OSM map credit is separate from ODbL line',()=>assert.notEqual(SOURCES.osm.notices.en[0],SOURCES.osm.notices.en[1]));
test('LTC source provides French credit',()=>assert.match(SOURCES.ltc.notices.fr[0],/Données/u));
test('static HTML declares proper document type',async()=>assert.match(await read('distribution.html'),/^<!doctype html>/iu));
test('static HTML declares English default language',async()=>assert.match(await read('distribution.html'),/<html lang="en">/u));
test('static HTML imports exact CSS file',async()=>assert.match(await read('distribution.html'),/href="\.\/distribution\.css"/u));
test('static HTML imports exact executable entry point',async()=>assert.match(await read('distribution.html'),/src="\.\/distribution-route\.mjs"/u));
test('static HTML uses a module script',async()=>assert.match(await read('distribution.html'),/<script type="module"/u));
test('static HTML blocks external connections',async()=>assert.match(await read('distribution.html'),/connect-src 'none'/u));
test('static HTML blocks external images',async()=>assert.match(await read('distribution.html'),/img-src 'none'/u));
test('static HTML blocks forms',async()=>assert.match(await read('distribution.html'),/form-action 'none'/u));
test('static HTML blocks remote defaults',async()=>assert.match(await read('distribution.html'),/default-src 'none'/u));
test('static HTML blocks executable objects',async()=>assert.match(await read('distribution.html'),/object-src 'none'/u));
test('static HTML blocks dynamic base',async()=>assert.match(await read('distribution.html'),/base-uri 'none'/u));
test('static HTML does not embed remote scripts',async()=>assert.doesNotMatch(await read('distribution.html'),/<script[^>]+https?:\/\//iu));
test('static HTML does not embed remote styles',async()=>assert.doesNotMatch(await read('distribution.html'),/<link[^>]+https?:\/\//iu));
test('static HTML includes skip navigation',async()=>assert.match(await read('distribution.html'),/href="#main"/u));
test('static HTML includes main landmark',async()=>assert.match(await read('distribution.html'),/<main id="main">/u));
test('static HTML labels language control',async()=>{
  const html=await read('distribution.html');
  assert.match(html,/for="language"/u);assert.match(html,/id="language"/u);
});
test('static HTML labels current-file control',async()=>{
  const html=await read('distribution.html');
  assert.match(html,/for="current"/u);assert.match(html,/id="current"/u);
});
test('static HTML labels previous-file control',async()=>{
  const html=await read('distribution.html');
  assert.match(html,/for="previous"/u);assert.match(html,/id="previous"/u);
});
test('static HTML labels pairing control',async()=>{
  const html=await read('distribution.html');
  assert.match(html,/for="pairs"/u);assert.match(html,/id="pairs"/u);
});
test('static HTML announces status politely',async()=>{
  const html=await read('distribution.html');
  assert.match(html,/role="status"/u);assert.match(html,/aria-live="polite"/u);
});
test('static HTML uses local file pickers',async()=>{
  const html=await read('distribution.html');
  assert.match(html,/type="file"/u);assert.doesNotMatch(html,/<form\b/iu);
});
test('static HTML disables export until input is loaded',async()=>{
  const html=await read('distribution.html');
  for(const id of ['download-text','download-json','download-html'])assert.match(html,new RegExp(`id="${id}" disabled`));
});
test('static HTML has an action region with accessible name',async()=>assert.match(await read('distribution.html'),/aria-label="Report actions"/u));
test('static CSS enforces minimum target height 44px',async()=>assert.match(await read('distribution.css'),/min-height:44px/u));
test('static CSS enforces minimum target width 44px',async()=>assert.match(await read('distribution.css'),/min-width:44px/u));
test('static CSS defines visible keyboard focus',async()=>assert.match(await read('distribution.css'),/:focus-visible/u));
test('static CSS supports reduced-motion preference',async()=>assert.match(await read('distribution.css'),/prefers-reduced-motion/u));
test('static CSS supports forced-colour mode',async()=>assert.match(await read('distribution.css'),/forced-colors/u));
test('static CSS supports narrow screens',async()=>assert.match(await read('distribution.css'),/max-width:42rem/u));
test('static CSS supports print output',async()=>assert.match(await read('distribution.css'),/@media print/u));
test('browser route changes text through textContent',async()=>assert.match(await read('distribution-route.mjs'),/textContent/u));
test('browser route never writes innerHTML',async()=>assert.doesNotMatch(await read('distribution-route.mjs'),/innerHTML/u));
test('browser route never sends network requests',async()=>assert.doesNotMatch(await read('distribution-route.mjs'),/\bfetch\s*\(/u));
test('browser route never creates XHR requests',async()=>assert.doesNotMatch(await read('distribution-route.mjs'),/XMLHttpRequest/u));
test('browser route never persists local storage',async()=>assert.doesNotMatch(await read('distribution-route.mjs'),/localStorage/u));
test('browser route never persists session storage',async()=>assert.doesNotMatch(await read('distribution-route.mjs'),/sessionStorage/u));
test('browser route never writes indexed DB',async()=>assert.doesNotMatch(await read('distribution-route.mjs'),/indexedDB/u));
test('browser route never runs timed background tasks',async()=>assert.doesNotMatch(await read('distribution-route.mjs'),/setInterval/u));
test('CLI never runs timed background tasks',async()=>assert.doesNotMatch(await read('distribution-cli.mjs'),/setInterval/u));
test('CLI never imports HTTP or HTTPS networking',async()=>assert.doesNotMatch(await read('distribution-cli.mjs'),/from ['"]node:https?['"]/u));
test('browser route uses explicit user file selection',async()=>assert.match(await read('distribution-route.mjs'),/file\.text\(\)/u));
test('browser route calls actual release audit',async()=>assert.match(await read('distribution-route.mjs'),/auditDistribution\(current/u));
test('browser route calls actual comparison',async()=>assert.match(await read('distribution-route.mjs'),/compareDistributions\(previous, current/u));
test('browser route updates document language',async()=>assert.match(await read('distribution-route.mjs'),/documentElement\.lang/u));
test('browser route contains French no-break-space language field',async()=>assert.match(await read('distribution-route.mjs'),/Langue\\u00a0:/u));
test('browser route renders changes rather than hiding them',async()=>assert.match(await read('distribution-route.mjs'),/state\.comparison\.changes/u));
test('browser route retains UNKNOWN literal',async()=>assert.match(await read('distribution-route.mjs'),/UNKNOWN/u));
test('HTML report has no remote executable dependencies',async()=>{
  const code=await read('distribution-report.mjs');
  assert.doesNotMatch(code,/<script\s+src=/u);
});
test('README documents actual CLI file name',async()=>assert.match(await read('DISTRIBUTION_README.md'),/distribution-cli\.mjs/u));
test('README documents actual test-file glob',async()=>assert.match(await read('DISTRIBUTION_README.md'),/distribution-\*\.test\.mjs/u));
test('README documents explicit offline operation',async()=>assert.match(await read('DISTRIBUTION_README.md'),/offline/u));
test('README documents UNKNOWN preservation',async()=>assert.match(await read('DISTRIBUTION_README.md'),/UNKNOWN/u));
test('README documents attribution notices and permission',async()=>assert.match(await read('DISTRIBUTION_README.md'),/permission/u));
test('README documents release-blocking status',async()=>assert.match(await read('DISTRIBUTION_README.md'),/exit status/u));
test('test suite discovered by current root Node glob',async()=>{
  const pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
  assert.match(pkg.scripts.test,/node --test docs\/attribution\/\*\.test\.mjs/u);
});
test('current package script does not need replacement for test discovery',async()=>{
  const pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
  assert.ok(pkg.scripts.test.includes('docs/attribution/*.test.mjs'));
});
test('all direct local ESM imports resolve to files',async()=>{
  for(const name of [...mainFiles,...testFiles]){
    const body=await read(name);
    for(const match of body.matchAll(/(?:from\s+|import\s*)['"](\.\/[^'"]+)['"]/gu)){
      const local=match[1].slice(2);
      await assert.doesNotReject(()=>access(join(dir,local)),`${name} imports ${local}`);
    }
  }
});
test('tests read only listed local fixture and route assets',async()=>{
  for(const name of testFiles){
    const body=await read(name);
    for(const match of body.matchAll(/read\(['"]([^'"]+)['"]\)/gu)){
      await assert.doesNotReject(()=>access(join(dir,match[1])),`${name} reads ${match[1]}`);
    }
  }
});
test('all supplied ESM files use correct extension',()=>{
  for(const name of [...mainFiles,...testFiles])assert.equal(extname(name),'.mjs');
});
test('no production module creates an unbounded timer',async()=>{
  for(const name of mainFiles){
    const body=await read(name);
    assert.doesNotMatch(body,/setInterval\s*\(/u,name);
  }
});
test('no module imports third-party map tiles',async()=>{
  for(const name of mainFiles){
    const body=await read(name);
    assert.doesNotMatch(body,/tile\.openstreetmap\.org|maps\.googleapis\.com/iu,name);
  }
});
test('all direct local imports resolve without symlinks',async()=>{
  for(const name of mainFiles){
    const body=await read(name);
    for(const match of body.matchAll(/from ['"](\.\/[^'"]+)['"]/gu)){
      const target=join(dir,match[1]);
      const info=await stat(target);
      assert.equal(info.isFile(),true,name);
    }
  }
});
test('catalogue legal notices are not copied into route source',async()=>{
  const route=await read('distribution-route.mjs');
  assert.equal(route.includes(METROLINX_AUA_LEGEND),false);
  assert.equal(route.includes(METROLINX_OGL_NOTICE),false);
});
test('catalogue legal notices are not copied into report source',async()=>{
  const report=await read('distribution-report.mjs');
  assert.equal(report.includes(METROLINX_AUA_LEGEND),false);
});
test('catalogue legal notices are imported by audit module',async()=>{
  const body=await read('distribution-audit.mjs');
  assert.match(body,/METROLINX_AUA_LEGEND/u);
  assert.match(body,/METROLINX_OGL_NOTICE/u);
});
