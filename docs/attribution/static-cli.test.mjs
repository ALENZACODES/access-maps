import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm, symlink, readFile, readdir} from 'node:fs/promises';
import {join, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {SOURCES} from './attribution-utils.mjs';
import {parseStaticArgs, executeStaticCli} from './static-cli.mjs';

async function temp(callback) {
  const root = await mkdtemp(join(tmpdir(),'attribution-static-'));
  try {return await callback(root);} finally {await rm(root,{recursive:true,force:true});}
}
function sample() {
  return {schema:'attribution-static-pages/1',releaseId:'sample-one',pages:[{
    id:'sample-en',file:'en/index.html',locale:'en',offline:'YES',minimumTargetPx:44,
    navigationLabel:'Navigation',mapView:'YES',credits:[{
      id:'osm-one',provider:'osm',licence:'ODbL-1.0',permission:'YES',tier:'primary',
      sourceUrl:SOURCES.osm.sourceUrl,licenceUrl:SOURCES.osm.licenceUrl,
      datasetDate:'UNKNOWN',collectedDate:'2026-11-15',termsDate:'2026-11-15',
      notice:SOURCES.osm.notices.en.join(' '),
    }],
  }]};
}
function markup() {
  return `<!doctype html><html lang="en"><head><title>Sources</title></head><body><nav>Navigation</nav><main><h1>Attribution</h1><p>${SOURCES.osm.notices.en.join(' ')}</p><a href="${SOURCES.osm.sourceUrl}">Open source terms</a></main></body></html>`;
}
async function create(root, candidate = sample(), html = markup()) {
  await mkdir(join(root,'en'),{recursive:true});
  await writeFile(join(root,'manifest.json'),JSON.stringify(candidate),'utf8');
  await writeFile(join(root,'en/index.html'),html,'utf8');
  return join(root,'manifest.json');
}
const exe = fileURLToPath(new URL('./static-cli.mjs',import.meta.url));
const base = ['--root','/tmp/build'];
test('CLI accepts required arguments',()=>assert.deepEqual(parseStaticArgs(['release.json',...base]),{manifest:'release.json',root:'/tmp/build',locale:'en',format:'text',before:null,beforeRoot:null}));
test('CLI accepts French and HTML',()=>assert.equal(parseStaticArgs(['release.json',...base,'--lang','fr','--format','html']).locale,'fr'));
test('CLI accepts baseline pair',()=>assert.equal(parseStaticArgs(['release.json',...base,'--before','old.json','--before-root','/tmp/old']).before,'old.json'));
test('CLI rejects omitted manifest',()=>assert.throws(()=>parseStaticArgs(base)));
test('CLI rejects omitted root',()=>assert.throws(()=>parseStaticArgs(['release.json'])));
test('CLI rejects duplicate manifest',()=>assert.throws(()=>parseStaticArgs(['a.json','b.json',...base])));
test('CLI rejects duplicate root',()=>assert.throws(()=>parseStaticArgs(['a.json',...base,'--root','/tmp/other'])));
test('CLI rejects unknown options',()=>assert.throws(()=>parseStaticArgs(['a.json',...base,'--write'])));
test('CLI rejects invalid language',()=>assert.throws(()=>parseStaticArgs(['a.json',...base,'--lang','es'])));
test('CLI rejects invalid format',()=>assert.throws(()=>parseStaticArgs(['a.json',...base,'--format','pdf'])));
test('CLI rejects unmatched before',()=>assert.throws(()=>parseStaticArgs(['a.json',...base,'--before','old.json'])));
test('CLI rejects unmatched before-root',()=>assert.throws(()=>parseStaticArgs(['a.json',...base,'--before-root','/tmp/old'])));
test('CLI rejects missing flag value',()=>assert.throws(()=>parseStaticArgs(['a.json',...base,'--lang'])));
test('CLI handles missing argv without reading files',async()=>assert.equal((await executeStaticCli([])).status,2));
test('CLI reads valid local page and returns zero',async()=>temp(async root=>{const file=await create(root);const res=await executeStaticCli([file,'--root',root]);assert.equal(res.status,0,res.error);assert.match(res.output,/sample-one/u);}));
test('CLI blocks missing HTML file',async()=>temp(async root=>{const file=await create(root);await rm(join(root,'en/index.html'));const res=await executeStaticCli([file,'--root',root]);assert.equal(res.status,1);assert.match(res.output,/PAGE_FILE_MISSING/u);}));
test('CLI blocks lost notice',async()=>temp(async root=>{const file=await create(root,sample(),'<html lang="en"><nav>Navigation</nav><main><h1>Sources</h1></main></html>');const res=await executeStaticCli([file,'--root',root]);assert.equal(res.status,1);assert.match(res.output,/LEGAL_TEXT_MISSING/u);}));
test('CLI returns invalid input for absent manifest',async()=>temp(async root=>{const res=await executeStaticCli([join(root,'missing.json'),'--root',root]);assert.equal(res.status,2);}));
test('CLI returns invalid input for corrupt JSON',async()=>temp(async root=>{const file=await create(root);await writeFile(file,'not-json');const res=await executeStaticCli([file,'--root',root]);assert.equal(res.status,2);}));
test('CLI refuses oversized manifest',async()=>temp(async root=>{const file=await create(root);await writeFile(file,'a'.repeat(1_048_577));const res=await executeStaticCli([file,'--root',root]);assert.equal(res.status,2);}));
test('CLI refuses symlink manifest',async()=>temp(async root=>{const file=await create(root);await symlink(file,join(root,'link.json'));const res=await executeStaticCli([join(root,'link.json'),'--root',root]);assert.equal(res.status,2);}));
test('CLI refuses symlink page',async()=>temp(async root=>{const file=await create(root);await writeFile(join(root,'outside.html'),markup());await rm(join(root,'en/index.html'));await symlink(join(root,'outside.html'),join(root,'en/index.html'));const res=await executeStaticCli([file,'--root',root]);assert.equal(res.status,2);}));
test('CLI refuses escaped directory link',async()=>temp(async root=>{const file=await create(root);await rm(join(root,'en'),{recursive:true});await symlink('/tmp',join(root,'en'));const res=await executeStaticCli([file,'--root',root]);assert.ok([1,2].includes(res.status));}));
test('CLI French text includes required colon spacing',async()=>temp(async root=>{const file=await create(root);const res=await executeStaticCli([file,'--root',root,'--lang','fr']);assert.equal(res.status,0);assert.match(res.output,/Version\u00a0:/u);}));
test('CLI HTML report uses lang fr',async()=>temp(async root=>{const file=await create(root);const res=await executeStaticCli([file,'--root',root,'--lang','fr','--format','html']);assert.equal(res.status,0);assert.match(res.output,/<html lang="fr">/u);}));
test('CLI JSON report is parseable',async()=>temp(async root=>{const file=await create(root);const res=await executeStaticCli([file,'--root',root,'--format','json']);assert.equal(res.status,0);assert.equal(JSON.parse(res.output).schema,'attribution-static-report/1');}));
test('CLI comparison exposes removed page',async()=>temp(async root=>{const file=await create(root);const earlier=join(root,'before.json');const old=sample();old.pages[0].id='old-en';await writeFile(earlier,JSON.stringify(old));const res=await executeStaticCli([file,'--root',root,'--before',earlier,'--before-root',root]);assert.equal(res.status,1);assert.match(res.output,/PAGE_REMOVED/u);}));
test('CLI import has no execution side effect',()=>{const child=spawnSync(process.execPath,['--input-type=module','-e',`import(${JSON.stringify(new URL('./static-cli.mjs',import.meta.url).href)});`],{encoding:'utf8'});assert.equal(child.status,0,child.stderr);assert.equal(child.stdout,'');});
test('CLI process exits zero on a valid page',async()=>temp(async root=>{const file=await create(root);const child=spawnSync(process.execPath,[exe,file,'--root',root],{encoding:'utf8'});assert.equal(child.status,0,child.stderr);}));
test('CLI process exits one when a page loses notice',async()=>temp(async root=>{const file=await create(root,sample(),'<html lang="en"><nav>Navigation</nav><main><h1>Sources</h1></main></html>');const child=spawnSync(process.execPath,[exe,file,'--root',root],{encoding:'utf8'});assert.equal(child.status,1,child.stderr);}));
test('CLI process exits two for missing input',()=>{const child=spawnSync(process.execPath,[exe,'missing.json','--root','/tmp'],{encoding:'utf8'});assert.equal(child.status,2);});
test('CLI does not write a report file',async()=>temp(async root=>{const file=await create(root);await executeStaticCli([file,'--root',root]);assert.deepEqual((await readdir(root)).sort(),['en','manifest.json']);}));
test('all locally imported modules have matching source files',async()=>{for(const name of ['static-release.mjs','static-scan.mjs','static-report.mjs','static-cli.mjs']){const src=await readFile(join(dirname(exe),name),'utf8');for(const match of src.matchAll(/from\s+['"](\.\/[^'"]+)['"]/gu)){assert.ok(await readFile(join(dirname(exe),match[1]),'utf8'),`${name}: ${match[1]}`);}}});
test('the missing README regression is covered',async()=>{const readme=await readFile(join(dirname(exe),'REFERENCE_PACK_README.md'),'utf8');assert.match(readme,/reference-cli\.mjs/u);assert.match(readme,/reference-\*\.test\.mjs/u);});
test('static route guide names actual executable modules',async()=>{const readme=await readFile(join(dirname(exe),'STATIC_PAGE_AUDIT_README.md'),'utf8');for(const name of ['static-cli.mjs','static-release.mjs','static-scan.mjs'])assert.ok(readme.includes(name));});
