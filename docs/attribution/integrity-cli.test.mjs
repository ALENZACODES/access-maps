import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs,renderCli,runCli,HELP} from './integrity-cli.mjs';
import {fixture,clone,HASH_B} from './integrity-fixture.mjs';

const modulePath=fileURLToPath(new URL('./integrity-cli.mjs',import.meta.url));

test('CLI help contains instructions for four export formats',()=>{
  for(const item of ['text','json','tsv','html','--previous','--lang','--output']) assert.ok(HELP.includes(item),item);
});
test('CLI accepts a local manifest path without network flags',()=>{
  const opts=parseArgs(['register.json']);
  assert.equal(opts.file,'register.json');
  assert.equal(opts.format,'text');
  assert.equal(opts.lang,'en');
});
test('CLI parses explicit French HTML export',()=>{
  const opts=parseArgs(['register.json','--format','html','--lang','fr']);
  assert.equal(opts.format,'html');
  assert.equal(opts.lang,'fr');
});
test('CLI parses a previous manifest path',()=>{
  const opts=parseArgs(['current.json','--previous','old.json']);
  assert.equal(opts.previous,'old.json');
});
test('CLI parses local output file path',()=>{
  const opts=parseArgs(['current.json','--output','report.txt']);
  assert.equal(opts.output,'report.txt');
});
test('CLI help requires no register path',()=>{
  assert.equal(parseArgs(['--help']).help,true);
  assert.equal(parseArgs(['-h']).help,true);
});
for(const bad of [
  [],['--format'],['--lang'],['--previous'],['--output'],
  ['--format','unknown','source.json'],['--lang','es','source.json'],
  ['file.json','more.json'],['--unknown','file.json'],['file.json','--previous','a','--previous','b'],
  ['file.json','--output','a','--output','b'],
]) {
  test(`CLI rejects invalid arguments ${JSON.stringify(bad)}`,()=>{
    assert.throws(()=>parseArgs(bad));
  });
}
test('CLI with no blocking gaps returns code 0',()=>{
  const result=renderCli(fixture(),{format:'text',lang:'en'});
  assert.equal(result.exitCode,0);
});
test('CLI with missing measurement returns code 1',()=>{
  const model=fixture();model.measurements=[];
  const result=renderCli(model,{format:'text',lang:'en'});
  assert.equal(result.exitCode,1);
  assert.ok(result.body.includes('MEASUREMENT_MISSING'));
});
test('CLI JSON export embeds audit and source records',()=>{
  const result=renderCli(fixture(),{format:'json',lang:'en'});
  const parsed=JSON.parse(result.body);
  assert.equal(parsed.schema,'map-source-file-integrity-cli/1');
  assert.equal(parsed.register.sources.length,1);
  assert.equal(parsed.audit.totals.block,0);
});
test('CLI TSV exports header and four method rows',()=>{
  const result=renderCli(fixture(),{format:'tsv',lang:'fr'});
  assert.equal(result.body.trim().split('\n').length,5);
});
test('CLI HTML export cannot run scripts',()=>{
  const result=renderCli(fixture(),{format:'html',lang:'en'});
  assert.match(result.body,/script-src 'none'/u);
  assert.ok(!/<script\b/u.test(result.body));
});
test('CLI French text report uses nonbreaking spacing',()=>{
  const result=renderCli(fixture(),{format:'text',lang:'fr'});
  assert.match(result.body,/Lacunes dans les preuves\u00a0:/u);
});
test('CLI compares two registers without misclassifying missing evidence',()=>{
  const old=fixture(),next=clone(old);
  next.measurements[0].sha256=HASH_B;
  const result=renderCli(next,{format:'text',lang:'en'},old);
  assert.equal(result.exitCode,1);
  assert.ok(result.body.includes('MEASUREMENT_CHANGED'));
});
test('CLI comparison produces a structured list in JSON output',()=>{
  const old=fixture(),next=clone(old);
  next.measurements[0].sha256=HASH_B;
  const result=JSON.parse(renderCli(next,{format:'json',lang:'en'},old).body);
  assert.ok(result.comparison.worsened);
  assert.ok(result.comparison.introduced.length>0);
});
test('CLI without an earlier register has a null comparison',()=>{
  const result=JSON.parse(renderCli(fixture(),{format:'json',lang:'en'}).body);
  assert.equal(result.comparison,null);
});
test('CLI print output remains deterministic for unchanged input',()=>{
  assert.equal(renderCli(fixture(),{format:'text',lang:'en'}).body,renderCli(fixture(),{format:'text',lang:'en'}).body);
});
test('CLI returns code 2 on malformed file data without printing a report',async()=>{
  let body='',error='';
  const status=await runCli(['bad.json'],{
    read:async()=>'{ invalid',write:async()=>{},out:x=>{body+=x;},err:x=>{error+=x;}
  });
  assert.equal(status,2);
  assert.equal(body,'');
  assert.ok(error.includes('could not be processed'));
});
test('CLI returns code 2 when file cannot be read',async()=>{
  let error='';
  const code=await runCli(['missing.json'],{
    read:async()=>{throw new Error('ENOENT');},write:async()=>{},out:()=>{},err:x=>{error+=x;}
  });
  assert.equal(code,2);
  assert.ok(error.includes('ENOENT'));
});
test('CLI help prints no file content and exits 0',async()=>{
  let body='';
  const code=await runCli(['--help'],{
ead:async()=>{throw Error('Should not read');},write:async()=>{},out:x=>{body+=x;},err:()=>{}});
  assert.equal(code,0);
  assert.ok(body.includes('Usage:'));
});
test('CLI rejects unknown arguments before attempting file reads',async()=>{
  let reads=0;
  const code=await runCli(['manifest.json','--network'],{read:async()=>{reads++;},write:async()=>{},out:()=>{},err:()=>{}});
  assert.equal(code,2);
  assert.equal(reads,0);
});
test('CLI can write a report without logging the contents',async()=>{
  let written='',out='';
  const code=await runCli(['manifest.json','--output','local.txt'],{
    read:async()=>JSON.stringify(fixture()),write:async(_path,content)=>{written=content;},out:x=>{out+=x;},err:()=>{}
  });
  assert.equal(code,0);
  assert.ok(written.includes('Fictional source'));
  assert.equal(out,'');
});
test('CLI also parses previous register before generating comparison',async()=>{
  const old=fixture(),next=clone(old);next.measurements[0].sha256=HASH_B;
  const reads=[];let printed='';
  const code=await runCli(['new.json','--previous','old.json'],{
    read:async path=>{reads.push(path);return JSON.stringify(path==='old.json'?old:next);},
    write:async()=>{},out:x=>{printed+=x;},err:()=>{}
  });
  assert.equal(code,1);
  assert.deepEqual(reads,['new.json','old.json']);
  assert.ok(printed.includes('MEASUREMENT_CHANGED'));
});
test('real Node process returns 0 for valid synthetic file',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'integrity-cli-'));
  try {
    const path=join(dir,'input.json');
    await writeFile(path,JSON.stringify(fixture()));
    const run=spawnSync(process.execPath,[modulePath,path,'--format','json'],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    assert.equal(JSON.parse(run.stdout).audit.totals.block,0);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('real Node process returns 1 on a mismatching local digest',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'integrity-cli-'));
  try {
    const path=join(dir,'input.json');
    const model=fixture();model.measurements[0].sha256=HASH_B;
    await writeFile(path,JSON.stringify(model));
    const run=spawnSync(process.execPath,[modulePath,path,'--format','text'],{encoding:'utf8'});
    assert.equal(run.status,1,run.stderr);
    assert.ok(run.stdout.includes('FILE_HASH_MISMATCH'));
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('real Node process writes an HTML file only on request',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'integrity-cli-'));
  try {
    const input=join(dir,'input.json'),output=join(dir,'page.html');
    await writeFile(input,JSON.stringify(fixture()));
    const run=spawnSync(process.execPath,[modulePath,input,'--format','html','--output',output],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    const html=await readFile(output,'utf8');
    assert.ok(html.includes('Fictional map geometry'));
    assert.equal(run.stdout,'');
  } finally {await rm(dir,{recursive:true,force:true});}
});
