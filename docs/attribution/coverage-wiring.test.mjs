import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTE_COPY, createNode, clearNode, loadCoverageFile } from './coverage-route.mjs';
import { register } from './coverage-fixture.test.mjs';
const dir=dirname(fileURLToPath(import.meta.url));
const read=(name)=>readFile(join(dir,name),'utf8');

test('standalone route contains semantic landmarks and language selector',async()=>{
  const html=await read('coverage.html');
  for(const value of ['<main','<header','<footer','<form','<label','lang="en"','id="locale"','id="status"','aria-live="polite"']){
    assert.ok(html.includes(value),value);
  }
});
test('static route loads its real source entry point',async()=>{
  const html=await read('coverage.html');assert.ok(html.includes('src="./coverage-route.mjs"'));
  const route=await read('coverage-route.mjs');
  for(const value of ['./coverage-core.mjs','./coverage-audit.mjs','./coverage-change.mjs','./coverage-report.mjs']){
    assert.ok(route.includes(value));
  }
});
test('route forbids network script connections in its CSP',async()=>{
  const html=await read('coverage.html');assert.ok(html.includes("connect-src 'none'"));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(html.includes("form-action 'none'"));
});
test('CSS explicitly enforces 44px minimum input, button and link targets',async()=>{
  const css=await read('coverage.css');
  assert.ok(css.includes('min-width:44px;min-height:44px'));
  assert.ok(css.includes('button:focus-visible'));
  assert.ok(css.includes('prefers-reduced-motion'));
});
test('EN and FR route strings share identical keys',()=>{
  assert.deepEqual(Object.keys(ROUTE_COPY.en).sort(),Object.keys(ROUTE_COPY.fr).sort());
});
test('French page does not use prohibited confirmation phrasing',()=>{
  for(const value of Object.values(ROUTE_COPY.fr))assert.doesNotMatch(value,/v[eé]rif/iu);
});
test('route does not transmit local release contents',async()=>{
  const route=await read('coverage-route.mjs');
  for(const pattern of [/\bfetch\s*\(/u,/XMLHttpRequest/u,/navigator\.sendBeacon/u,/WebSocket\s*\(/u,/localStorage/u,/sessionStorage/u]){
    assert.doesNotMatch(route,pattern);
  }
});
test('route never injects source strings through innerHTML',async()=>{
  const route=await read('coverage-route.mjs');assert.doesNotMatch(route,/\.innerHTML\s*=/u);
});
test('plain nodes use textContent',()=>{
  const element={textContent:'',className:''};
  const doc={createElement:()=>element};
  assert.equal(createNode(doc,'p','<script>'),element);
  assert.equal(element.textContent,'<script>');
});
test('clearNode removes every child',()=>{
  const node={children:[1,2,3],get firstChild(){return this.children[0]},removeChild(){this.children.shift()}};
  clearNode(node);assert.equal(node.children.length,0);
});
test('selected JSON file is parsed in memory without network access',async()=>{
  const raw=JSON.stringify(register());
  const fake={size:new TextEncoder().encode(raw).length,text:async()=>raw};
  const result=await loadCoverageFile(fake);assert.equal(result.releaseId,'release-one');
});
test('oversize file is rejected before reading text',async()=>{
  let read=false;const fake={size:2_097_153,text:async()=>{read=true;return '{}'}};
  await assert.rejects(()=>loadCoverageFile(fake));assert.equal(read,false);
});
test('README accurately names live route, CLI and test entry points',async()=>{
  const readme=await read('COVERAGE_README.md');
  for(const value of ['coverage.html','coverage-route.mjs','coverage-cli.mjs','coverage-*.test.mjs'])assert.ok(readme.includes(value));
});
test('all local executable modules are present',async()=>{
  for(const name of ['coverage-core.mjs','coverage-audit.mjs','coverage-change.mjs','coverage-report.mjs','coverage-cli.mjs','coverage-route.mjs']){
    assert.ok((await read(name)).length>200,name);
  }
});
