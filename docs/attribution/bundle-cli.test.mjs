import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs,runBundleCli,main,HELP} from './bundle-cli.mjs';
import {fixture,changedFixture} from './bundle-fixture.mjs';
const cli=fileURLToPath(new URL('./bundle-cli.mjs',import.meta.url));
const changed=fn=>changedFixture(fn);

test('CLI help describes local file usage',()=>assert.match(HELP,/inventory\.json/u));
test('CLI rejects absent file argument',()=>assert.throws(()=>parseArgs([])));
test('CLI accepts plain positional file',()=>{
  const x=parseArgs(['bundle.json']);
  assert.equal(x.file,'bundle.json');assert.equal(x.format,'audit');assert.equal(x.lang,'en');
});
test('CLI accepts bilingual HTML export arguments',()=>{
  const x=parseArgs(['bundle.json','--view','fictional-map','--lang','fr','--format','html','--output','output.html']);
  assert.equal(x.view,'fictional-map');assert.equal(x.lang,'fr');assert.equal(x.format,'html');
  assert.equal(x.output,'output.html');
});
test('CLI rejects repeated positional paths',()=>assert.throws(()=>parseArgs(['a.json','b.json'])));
test('CLI rejects unsupported flags',()=>assert.throws(()=>parseArgs(['a.json','--retry','3'])));
test('CLI rejects missing flag arguments',()=>assert.throws(()=>parseArgs(['a.json','--output'])));
test('CLI rejects invented locale',()=>assert.throws(()=>parseArgs(['a.json','--lang','fr-CA'])));
test('CLI rejects unsupported output type',()=>assert.throws(()=>parseArgs(['a.json','--format','zip'])));
test('CLI HTML requires view',()=>assert.throws(()=>parseArgs(['a.json','--format','html'])));
test('CLI manifest requires view',()=>assert.throws(()=>parseArgs(['a.json','--format','manifest'])));
test('CLI disallows comparing exported HTML',()=>assert.throws(()=>parseArgs(['a.json','--format','html','--view','fictional-map','--before','old.json'])));
test('CLI audit returns zero for complete metadata',()=>{
  const output=runBundleCli(fixture(),{format:'audit'});
  assert.equal(output.exitCode,0);
  assert.equal(JSON.parse(output.text).audit.status,'manual-review');
});
test('CLI audit fails closed when permission is absent',()=>{
  const output=runBundleCli(changed(b=>{b.sources[0].permission='UNKNOWN';}),{format:'audit'});
  assert.equal(output.exitCode,1);
  assert.equal(output.blocked,true);
});
test('CLI audit includes a selected earlier comparison',()=>{
  const current=changed(b=>{b.notices=[];});
  const output=runBundleCli(current,{format:'audit'},fixture());
  assert.equal(output.exitCode,1);
  assert.equal(JSON.parse(output.text).comparison.blocking,true);
});
test('CLI audit comparison accepts resolved gaps',()=>{
  const prior=changed(b=>{b.notices=[];});
  const output=runBundleCli(fixture(),{format:'audit'},prior);
  assert.equal(output.exitCode,0);
  assert.ok(JSON.parse(output.text).comparison.resolved.length>0);
});
test('CLI generates standalone English HTML',()=>{
  const output=runBundleCli(fixture(),{format:'html',view:'fictional-map',lang:'en'});
  assert.ok(output.text.includes('<html lang="en">'));
  assert.ok(!output.text.includes('<script'));
});
test('CLI generates standalone French HTML',()=>{
  const output=runBundleCli(fixture(),{format:'html',view:'fictional-map',lang:'fr'});
  assert.ok(output.text.includes('<html lang="fr">'));
  assert.ok(output.text.includes('Carte fictive'));
});
test('CLI generates versioned source manifest',()=>{
  const output=runBundleCli(fixture(),{format:'manifest',view:'fictional-map'});
  assert.equal(JSON.parse(output.text).schema,'map-notice-disclosure-manifest/1');
});
test('CLI generates bilingual findings report',()=>{
  const output=runBundleCli(fixture(),{format:'text',lang:'fr'});
  assert.ok(output.text.includes('Composition locale'));
  assert.ok(output.text.includes('\u00a0:'));
});
test('CLI generates spreadsheet-safe TSV',()=>{
  const output=runBundleCli(fixture(),{format:'tsv'});
  assert.ok(output.text.includes('viewId'));
  assert.ok(output.text.includes('fictional-map'));
});
test('CLI returns error for unsupported rendering format',()=>{
  assert.throws(()=>runBundleCli(fixture(),{format:'pdf'}));
});
test('CLI rejects invalid register before any export',()=>{
  assert.throws(()=>runBundleCli({schema:'bad'},{format:'audit'}));
});
test('CLI does not modify the input record',()=>{
  const input=fixture(),snapshot=structuredClone(input);
  runBundleCli(input,{format:'audit'});
  assert.deepEqual(input,snapshot);
});
test('CLI program handles parsing errors with exit 2',async()=>{
  let stderr='';
  const status=await main(['--unknown'],{stderr:{write:value=>{stderr+=value;}}});
  assert.equal(status,2);assert.ok(stderr.length>0);
});
test('CLI program produces JSON through injected filesystem',async()=>{
  let output='';
  const status=await main(['fixture.json','--format','audit'],{
    read:async()=>JSON.stringify(fixture()),write:async()=>{},stdout:{write:chunk=>{output+=chunk;}},stderr:{write:()=>{}},
  });
  assert.equal(status,0);
  assert.equal(JSON.parse(output).audit.status,'manual-review');
});
test('CLI program writes deliberately requested output file',async()=>{
  const writes=[];
  const status=await main(['fixture.json','--format','html','--view','fictional-map','--output','notice.html'],{
    read:async()=>JSON.stringify(fixture()),write:async(...args)=>{writes.push(args);},stdout:{write:()=>{}},stderr:{write:()=>{}},
  });
  assert.equal(status,0);
  assert.equal(writes.length,1);
  assert.ok(writes[0][0].endsWith('notice.html'));
});
test('CLI reports missing file as invalid input',async()=>{
  let message='';
  const status=await main(['missing.json'],{
    read:async()=>{throw new Error('Missing fixture');},write:async()=>{},stdout:{write:()=>{}},stderr:{write:x=>{message+=x;}},
  });
  assert.equal(status,2);
  assert.ok(message.includes('Missing fixture'));
});
test('CLI Node process exits 0 with complete fictional evidence',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'bundle-cli-'));
  try {
    const input=join(folder,'fixture.json');
    await writeFile(input,JSON.stringify(fixture()));
    const process=spawnSync(processExec(),[cli,input,'--format','audit'],{encoding:'utf8'});
    assert.equal(process.status,0,process.stderr);
    assert.equal(JSON.parse(process.stdout).audit.totals.block,0);
  } finally {await rm(folder,{recursive:true,force:true});}
});
test('CLI Node process exits 1 when metadata blocks',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'bundle-cli-'));
  try {
    const input=join(folder,'blocked.json');
    const state=changed(b=>{b.notices=[];});
    await writeFile(input,JSON.stringify(state));
    const process=spawnSync(processExec(),[cli,input],{encoding:'utf8'});
    assert.equal(process.status,1,process.stderr);
    assert.ok(process.stdout.includes('NOTICE_MISSING'));
  } finally {await rm(folder,{recursive:true,force:true});}
});
test('CLI Node process writes HTML when explicitly requested',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'bundle-cli-'));
  try {
    const input=join(folder,'fixture.json'),output=join(folder,'out.html');
    await writeFile(input,JSON.stringify(fixture()));
    const process=spawnSync(processExec(),[cli,input,'--view','fictional-map','--format','html','--output',output],{encoding:'utf8'});
    assert.equal(process.status,0,process.stderr);
    assert.ok((await readFile(output,'utf8')).includes('<!doctype html>'));
  } finally {await rm(folder,{recursive:true,force:true});}
});
function processExec(){return process.execPath;}
