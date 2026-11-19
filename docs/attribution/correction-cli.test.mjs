import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { CorrectionCliError, CORRECTION_USAGE, parseCorrectionArguments,
  readCorrectionFile, executeCorrectionCli } from './correction-cli.mjs';
import { register, clone } from './correction-fixtures.mjs';
const currentDir=dirname(fileURLToPath(import.meta.url));
async function temporary(run) {
  const directory=await mkdtemp(join(tmpdir(),'attribution-correction-'));
  try { return await run(directory); } finally { await rm(directory,{recursive:true,force:true}); }
}
async function fixtureFile(directory,input=register()) {
  const file=join(directory,'register.json');
  await writeFile(file,JSON.stringify(input),'utf8');
  return file;
}
test('usage is available as a constant',()=>assert.match(CORRECTION_USAGE,/correction-cli\.mjs/u));
test('no arguments fail with usage',()=>assert.throws(()=>parseCorrectionArguments([]),CorrectionCliError));
test('help option fails with usage',()=>assert.throws(()=>parseCorrectionArguments(['--help']),CorrectionCliError));
test('one positional register succeeds',()=>assert.equal(parseCorrectionArguments(['file.json']).file,'file.json'));
test('default language is English',()=>assert.equal(parseCorrectionArguments(['file.json']).lang,'en'));
test('default output is text',()=>assert.equal(parseCorrectionArguments(['file.json']).format,'text'));
test('default comparison is absent',()=>assert.equal(parseCorrectionArguments(['file.json']).before,null));
test('default date remains UNKNOWN',()=>assert.equal(parseCorrectionArguments(['file.json']).date,'UNKNOWN'));
test('offline requirement defaults to false',()=>assert.equal(parseCorrectionArguments(['file.json']).requireOffline,false));
test('explicit previous register accepted',()=>assert.equal(parseCorrectionArguments(['file.json','--before','old.json']).before,'old.json'));
test('explicit French language accepted',()=>assert.equal(parseCorrectionArguments(['file.json','--lang','fr']).lang,'fr'));
test('explicit English language accepted',()=>assert.equal(parseCorrectionArguments(['file.json','--lang','en']).lang,'en'));
test('explicit HTML output accepted',()=>assert.equal(parseCorrectionArguments(['file.json','--format','html']).format,'html'));
test('explicit JSON output accepted',()=>assert.equal(parseCorrectionArguments(['file.json','--format','json']).format,'json'));
test('offline requirement accepted',()=>assert.equal(parseCorrectionArguments(['file.json','--require-offline']).requireOffline,true));
test('explicit date accepted',()=>assert.equal(parseCorrectionArguments(['file.json','--date','2026-11-19']).date,'2026-11-19'));
test('option order is independent',()=>assert.equal(parseCorrectionArguments(['--lang','fr','file.json']).file,'file.json'));
test('missing --before argument fails',()=>assert.throws(()=>parseCorrectionArguments(['file.json','--before']),CorrectionCliError));
test('missing --lang argument fails',()=>assert.throws(()=>parseCorrectionArguments(['file.json','--lang']),CorrectionCliError));
test('missing --format argument fails',()=>assert.throws(()=>parseCorrectionArguments(['file.json','--format']),CorrectionCliError));
test('missing --date argument fails',()=>assert.throws(()=>parseCorrectionArguments(['file.json','--date']),CorrectionCliError));
test('second register positional argument fails',()=>assert.throws(()=>parseCorrectionArguments(['a.json','b.json']),CorrectionCliError));
test('unknown flag fails',()=>assert.throws(()=>parseCorrectionArguments(['a.json','--remote']),CorrectionCliError));
test('unsupported locale fails',()=>assert.throws(()=>parseCorrectionArguments(['a.json','--lang','es']),CorrectionCliError));
test('unsupported output format fails',()=>assert.throws(()=>parseCorrectionArguments(['a.json','--format','pdf']),CorrectionCliError));
test('bad reference date fails',()=>assert.throws(()=>parseCorrectionArguments(['a.json','--date','tomorrow']),CorrectionCliError));
test('duplicate language option fails',()=>assert.throws(()=>parseCorrectionArguments(['a.json','--lang','fr','--lang','en']),CorrectionCliError));
test('duplicate format option fails',()=>assert.throws(()=>parseCorrectionArguments(['a.json','--format','text','--format','json']),CorrectionCliError));
test('duplicate previous option fails',()=>assert.throws(()=>parseCorrectionArguments(['a.json','--before','one','--before','two']),CorrectionCliError));
test('duplicate offline flag fails',()=>assert.throws(()=>parseCorrectionArguments(['a.json','--require-offline','--require-offline']),CorrectionCliError));
test('empty positional name fails',()=>assert.throws(()=>parseCorrectionArguments(['']),CorrectionCliError));
test('valid bounded file parses',async()=>temporary(async dir=>{
  const file=await fixtureFile(dir);assert.equal((await readCorrectionFile(file)).releaseId,'release-one');
}));
test('missing local file rejects',async()=>temporary(async dir=>{
  await assert.rejects(readCorrectionFile(join(dir,'missing.json')));
}));
test('directory cannot be parsed as register',async()=>temporary(async dir=>{
  await assert.rejects(readCorrectionFile(dir),CorrectionCliError);
}));
test('malformed JSON rejects',async()=>temporary(async dir=>{
  const file=join(dir,'bad.json');await writeFile(file,'{');await assert.rejects(readCorrectionFile(file));
}));
test('oversized local file rejects',async()=>temporary(async dir=>{
  const file=join(dir,'large.json');await writeFile(file,'x'.repeat(2_097_153));
  await assert.rejects(readCorrectionFile(file),CorrectionCliError);
}));
test('CLI zero for valid correction record',async()=>temporary(async dir=>{
  const file=await fixtureFile(dir);const result=await executeCorrectionCli([file]);
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/release-one/u);assert.equal(result.stderr,'');
}));
test('CLI one for unknown source permission',async()=>temporary(async dir=>{
  const input=register();input.sources[0].permission='UNKNOWN';
  const file=await fixtureFile(dir,input);const result=await executeCorrectionCli([file]);
  assert.equal(result.status,1);assert.match(result.stdout,/SOURCE_PERMISSION/u);
}));
test('CLI two for invalid file',async()=>temporary(async dir=>{
  const file=join(dir,'bad.json');await writeFile(file,'not-json');
  const result=await executeCorrectionCli([file]);assert.equal(result.status,2);assert.ok(result.stderr.length>0);
}));
test('CLI two for missing file',async()=>temporary(async dir=>{
  const result=await executeCorrectionCli([join(dir,'missing.json')]);assert.equal(result.status,2);
}));
test('CLI two for invalid options',async()=>{
  const result=await executeCorrectionCli(['--format','pdf']);assert.equal(result.status,2);
});
test('CLI French output has nonbreaking colon',async()=>temporary(async dir=>{
  const file=await fixtureFile(dir);const result=await executeCorrectionCli([file,'--lang','fr']);
  assert.equal(result.status,0);assert.match(result.stdout,/Données en date du\u00a0: UNKNOWN/u);
}));
test('CLI HTML output is self-contained',async()=>temporary(async dir=>{
  const file=await fixtureFile(dir);const result=await executeCorrectionCli([file,'--format','html']);
  assert.equal(result.status,0);assert.match(result.stdout,/<!doctype html>/u);
  assert.doesNotMatch(result.stdout,/<script\b/iu);
}));
test('CLI JSON output carries audit object',async()=>temporary(async dir=>{
  const file=await fixtureFile(dir);const result=await executeCorrectionCli([file,'--format','json']);
  assert.equal(result.status,0);assert.equal(JSON.parse(result.stdout).audit.releaseId,'release-one');
}));
test('CLI can compare previous and current records',async()=>temporary(async dir=>{
  const oldFile=join(dir,'old.json');await writeFile(oldFile,JSON.stringify(register()));
  const next=clone(register());next.sources[0].permission='NO';const file=await fixtureFile(dir,next);
  const result=await executeCorrectionCli([file,'--before',oldFile,'--format','json']);
  assert.equal(result.status,1);assert.ok(JSON.parse(result.stdout).comparison.changes.length>0);
}));
test('CLI offline flag blocks missing offline evidence',async()=>temporary(async dir=>{
  const input=register();input.surfaces[0].offline='UNKNOWN';
  const file=await fixtureFile(dir,input);const result=await executeCorrectionCli([file,'--require-offline']);
  assert.equal(result.status,1);assert.match(result.stdout,/SURFACE_OFFLINE/u);
}));
test('CLI does not save reports automatically',async()=>temporary(async dir=>{
  const file=await fixtureFile(dir);await executeCorrectionCli([file,'--format','html']);
  assert.deepEqual(await readdir(dir),['register.json']);
}));
test('CLI does not alter supplied JSON file',async()=>temporary(async dir=>{
  const file=await fixtureFile(dir);const original=await readFile(file,'utf8');
  await executeCorrectionCli([file]);assert.equal(await readFile(file,'utf8'),original);
}));
test('CLI module import produces no stdout',()=>{
  const url=new URL('./correction-cli.mjs',import.meta.url);
  const child=spawnSync(process.execPath,['--input-type=module','-e',`import(${JSON.stringify(url.href)})`],{encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);assert.equal(child.stdout,'');assert.equal(child.stderr,'');
});
test('CLI process exits zero on good manifest',async()=>temporary(async dir=>{
  const file=await fixtureFile(dir);
  const exe=fileURLToPath(new URL('./correction-cli.mjs',import.meta.url));
  const child=spawnSync(process.execPath,[exe,file],{encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/release-one/u);
}));
test('CLI process exits one on blocking evidence',async()=>temporary(async dir=>{
  const input=register();input.sources[0].permission='NO';
  const file=await fixtureFile(dir,input);
  const exe=fileURLToPath(new URL('./correction-cli.mjs',import.meta.url));
  const child=spawnSync(process.execPath,[exe,file],{encoding:'utf8'});
  assert.equal(child.status,1,child.stderr);assert.match(child.stdout,/SOURCE_PERMISSION/u);
}));
test('CLI process exits two on missing file',async()=>temporary(async dir=>{
  const exe=fileURLToPath(new URL('./correction-cli.mjs',import.meta.url));
  const child=spawnSync(process.execPath,[exe,join(dir,'missing.json')],{encoding:'utf8'});
  assert.equal(child.status,2);assert.ok(child.stderr.length>0);
}));
test('CLI process accepts French JSON output',async()=>temporary(async dir=>{
  const file=await fixtureFile(dir);
  const exe=fileURLToPath(new URL('./correction-cli.mjs',import.meta.url));
  const child=spawnSync(process.execPath,[exe,file,'--lang','fr','--format','json'],{encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);assert.equal(JSON.parse(child.stdout).release,'release-one');
}));
