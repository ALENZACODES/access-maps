import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { HANDOFF_USAGE, parseHandoffArgs, executeHandoffCli, HandoffCliError } from './handoff-cli.mjs';
import { pack, source, handoff } from './handoff-fixtures.mjs';
const cliPath = fileURLToPath(new URL('./handoff-cli.mjs', import.meta.url));
async function temp(run) {
  const root=await mkdtemp(join(tmpdir(),'handoff-test-'));
  try { return await run(root); }
  finally { await rm(root,{recursive:true,force:true}); }
}
async function writePack(root, name='current.json', payload=pack()) {
  const path=join(root,name);
  await writeFile(path,JSON.stringify(payload),'utf8');
  return path;
}
test('CLI accepts a single JSON path', () => assert.equal(parseHandoffArgs(['pack.json']).input,'pack.json'));
test('CLI defaults to English', () => assert.equal(parseHandoffArgs(['pack.json']).locale,'en'));
test('CLI defaults to text output', () => assert.equal(parseHandoffArgs(['pack.json']).format,'text'));
test('CLI defaults to UNKNOWN comparison date', () => assert.equal(parseHandoffArgs(['pack.json']).referenceDate,'UNKNOWN'));
test('CLI supports French and JSON output', () => assert.deepEqual(parseHandoffArgs(['pack.json','--lang','fr','--format','json']).locale,'fr'));
test('CLI accepts explicit date', () => assert.equal(parseHandoffArgs(['pack.json','--date','2026-04-01']).referenceDate,'2026-04-01'));
test('CLI accepts a prior release path', () => assert.equal(parseHandoffArgs(['pack.json','--before','older.json']).before,'older.json'));
test('CLI refuses no argument', () => assert.throws(()=>parseHandoffArgs([]),HandoffCliError));
test('CLI help exposes correct entrypoint', () => assert.ok(HANDOFF_USAGE.includes('handoff-cli.mjs')));
test('CLI refuses duplicate language flag', () => assert.throws(()=>parseHandoffArgs(['x','--lang','en','--lang','fr']),HandoffCliError));
test('CLI refuses duplicate format flag', () => assert.throws(()=>parseHandoffArgs(['x','--format','html','--format','text']),HandoffCliError));
test('CLI refuses duplicate before flag', () => assert.throws(()=>parseHandoffArgs(['x','--before','a','--before','b']),HandoffCliError));
test('CLI refuses duplicate date flag', () => assert.throws(()=>parseHandoffArgs(['x','--date','2026-01-01','--date','2026-01-02']),HandoffCliError));
test('CLI refuses unknown option', () => assert.throws(()=>parseHandoffArgs(['x','--output','file']),HandoffCliError));
test('CLI refuses multiple input packs', () => assert.throws(()=>parseHandoffArgs(['a.json','b.json']),HandoffCliError));
test('CLI refuses missing value', () => assert.throws(()=>parseHandoffArgs(['x','--lang']),HandoffCliError));
test('CLI refuses extra unsupported language', () => assert.throws(()=>parseHandoffArgs(['x','--lang','es']),HandoffCliError));
test('CLI refuses unsupported report format', () => assert.throws(()=>parseHandoffArgs(['x','--format','pdf']),HandoffCliError));
test('CLI refuses invalid date syntax', () => assert.throws(()=>parseHandoffArgs(['x','--date','today']),HandoffCliError));
test('CLI returns usage error for no input', async () => assert.equal((await executeHandoffCli([])).status,2));
test('CLI returns error 2 for unreadable file', async () => {
  await temp(async(root)=> assert.equal((await executeHandoffCli([join(root,'missing.json')])).status,2));
});
test('CLI returns error 2 for invalid JSON', async () => {
  await temp(async(root)=>{
    const path=join(root,'bad.json');await writeFile(path,'not JSON');
    assert.equal((await executeHandoffCli([path])).status,2);
  });
});
test('CLI returns success for clean pack', async () => {
  await temp(async(root)=>{
    const path=await writePack(root);
    const result=await executeHandoffCli([path]);
    assert.equal(result.status,0,result.stderr);
    assert.ok(result.stdout.includes('sample-release'));
  });
});
test('CLI returns block for denied permission', async () => {
  await temp(async(root)=>{
    const path=await writePack(root,'blocked.json',pack({sources:[source({permission:'NO'})]}));
    const result=await executeHandoffCli([path]);
    assert.equal(result.status,1,result.stderr);
    assert.ok(result.stdout.includes('PERMISSION_DENIED'));
  });
});
test('CLI renders French nonbreaking spaces', async () => {
  await temp(async(root)=>{
    const path=await writePack(root);
    const result=await executeHandoffCli([path,'--lang','fr']);
    assert.equal(result.status,0);
    assert.ok(result.stdout.includes('Données en date du\u00a0: UNKNOWN'));
  });
});
test('CLI renders HTML when selected', async () => {
  await temp(async(root)=>{
    const path=await writePack(root);
    const result=await executeHandoffCli([path,'--format','html']);
    assert.equal(result.status,0);
    assert.ok(result.stdout.includes('<!doctype html>'));
  });
});
test('CLI renders machine-readable JSON', async () => {
  await temp(async(root)=>{
    const path=await writePack(root);
    const result=await executeHandoffCli([path,'--format','json']);
    assert.equal(result.status,0);
    assert.equal(JSON.parse(result.stdout).schema,'attribution-handoff-report/1');
  });
});
test('CLI compares a prior release', async () => {
  await temp(async(root)=>{
    const old=await writePack(root,'old.json');
    const current=await writePack(root,'new.json',pack({sources:[source({permission:'NO'})]}));
    const result=await executeHandoffCli([current,'--before',old,'--format','json']);
    assert.equal(result.status,1);
    assert.ok(JSON.parse(result.stdout).comparison.changes.length>0);
  });
});
test('CLI explicit reference date blocks expired delivery', async () => {
  await temp(async(root)=>{
    const current=await writePack(root);
    const result=await executeHandoffCli([current,'--date','2028-01-01']);
    assert.equal(result.status,1);
    assert.ok(result.stdout.includes('DELIVERY_EXPIRED'));
  });
});
test('CLI never writes an output file automatically', async () => {
  await temp(async(root)=>{
    const input=await writePack(root);
    await executeHandoffCli([input,'--format','html']);
    assert.deepEqual(await readdir(root),['current.json']);
  });
});
test('CLI import has no stdout effects', () => {
  const child=spawnSync(process.execPath,['--input-type=module','-e',`import(${JSON.stringify(new URL('./handoff-cli.mjs',import.meta.url).href)});`],{encoding:'utf8',timeout:10000});
  assert.equal(child.status,0,child.stderr);
  assert.equal(child.stdout,'');
});
test('CLI process returns zero for a good pack', async () => {
  await temp(async(root)=>{
    const path=await writePack(root);
    const child=spawnSync(process.execPath,[cliPath,path],{encoding:'utf8',timeout:10000});
    assert.equal(child.status,0,child.stderr);
    assert.ok(child.stdout.includes('sample-release'));
  });
});
test('CLI process returns one for a blocked pack', async () => {
  await temp(async(root)=>{
    const path=await writePack(root,'bad.json',pack({handoffs:[handoff({approval:'NO'})]}));
    const child=spawnSync(process.execPath,[cliPath,path],{encoding:'utf8',timeout:10000});
    assert.equal(child.status,1,child.stderr);
    assert.ok(child.stdout.includes('DELIVERY_PERMISSION_DENIED'));
  });
});
test('CLI process returns two for malformed input', async () => {
  await temp(async(root)=>{
    const child=spawnSync(process.execPath,[cliPath,join(root,'absent.json')],{encoding:'utf8',timeout:10000});
    assert.equal(child.status,2);
    assert.ok(child.stderr.length>0);
  });
});
test('CLI entry point is .mjs and exists', () => assert.ok(cliPath.endsWith('handoff-cli.mjs')));
test('test fixture does not rely on external network', () => {
  const child=spawnSync(process.execPath,['--check',cliPath],{encoding:'utf8',timeout:10000});
  assert.equal(child.status,0,child.stderr);
});
