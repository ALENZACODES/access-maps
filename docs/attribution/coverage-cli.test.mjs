import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCoverageArgs, runCoverageCli, CoverageCliError, USAGE } from './coverage-cli.mjs';
import { register,source,view } from './coverage-fixture.test.mjs';

async function temporary(fn) {
  const dir=await mkdtemp(join(tmpdir(),'coverage-cli-'));
  try{return await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}
}
async function save(dir,name,content) {const path=join(dir,name);await writeFile(path,content);return path;}
const parsed=(args)=>parseCoverageArgs(args);
test('CLI requires exactly one candidate JSON file',()=>{
  assert.throws(()=>parsed([]),CoverageCliError);
  assert.throws(()=>parsed(['--lang','fr']),CoverageCliError);
  assert.throws(()=>parsed(['a.json','b.json']),CoverageCliError);
});
test('CLI supports explicit report parameters',()=>{
  assert.deepEqual(parsed(['a.json','--previous','b.json','--lang','fr','--format','json','--allow-online']),{
    candidate:'a.json',previous:'b.json',language:'fr',format:'json',date:'UNKNOWN',requireOffline:false});
});
test('help prints local command usage and exit code 2',async()=>{
  const result=await runCoverageCli(['--help']);assert.equal(result.status,2);assert.ok(result.stderr.includes('Usage:'));
  assert.ok(USAGE.includes('coverage-cli'));
});
for(const option of ['--previous','--format','--lang','--date']){
  test(`${option} without value is rejected`,()=>assert.throws(()=>parsed(['a.json',option]),CoverageCliError));
  test(`${option} repeated is rejected`,()=>assert.throws(()=>parsed(['a.json',option,'x',option,'y']),CoverageCliError));
}
for(const language of ['es','FR','fr-CA','unknown']){
  test(`language ${language} is rejected`,()=>assert.throws(()=>parsed(['a.json','--lang',language]),CoverageCliError));
}
for(const format of ['csv','pdf','xml','PDF']){
  test(`format ${format} is rejected`,()=>assert.throws(()=>parsed(['a.json','--format',format]),CoverageCliError));
}
test('invalid option is not interpreted as a file name',()=>assert.throws(()=>parsed(['a.json','--unknown']),CoverageCliError));
test('previous file must differ from candidate',()=>assert.throws(()=>parsed(['a.json','--previous','a.json']),CoverageCliError));
test('default options are intentionally offline',()=>{
  const options=parsed(['candidate.json']);assert.equal(options.requireOffline,true);assert.equal(options.date,'UNKNOWN');
});
test('a complete local record exits zero, retaining UNKNOWN dataset date',async()=>{
  await temporary(async(dir)=>{
    const path=await save(dir,'good.json',JSON.stringify(register()));
    const result=await runCoverageCli([path]);assert.equal(result.status,0,result.stderr);
    assert.ok(result.stdout.includes('release-one'));assert.ok(result.stdout.includes('UNKNOWN'));
  });
});
test('blocked release returns code one and a finding',async()=>{
  await temporary(async(dir)=>{
    const path=await save(dir,'bad.json',JSON.stringify(register({sources:[source({permission:'UNKNOWN'})]})));
    const result=await runCoverageCli([path]);assert.equal(result.status,1);assert.ok(result.stdout.includes('PERMISSION_UNKNOWN'));
  });
});
test('invalid JSON returns code two without stdout',async()=>{
  await temporary(async(dir)=>{
    const path=await save(dir,'bad.json','{');const result=await runCoverageCli([path]);
    assert.equal(result.status,2);assert.equal(result.stdout,'');assert.ok(result.stderr);
  });
});
test('missing file returns code two',async()=>{
  const result=await runCoverageCli(['/file/that/is/not/here.json']);assert.equal(result.status,2);
});
test('over-size file returns code two',async()=>{
  await temporary(async(dir)=>{
    const path=await save(dir,'too-big.json',' '.repeat(2_097_153));
    const result=await runCoverageCli([path]);assert.equal(result.status,2);
  });
});
test('French output uses correct spacing and strings',async()=>{
  await temporary(async(dir)=>{
    const path=await save(dir,'fr.json',JSON.stringify(register()));
    const result=await runCoverageCli([path,'--lang','fr']);assert.equal(result.status,0);
    assert.ok(result.stdout.includes('Données en date du\u00a0: UNKNOWN'));
  });
});
test('HTML report format returns standalone offline document',async()=>{
  await temporary(async(dir)=>{
    const path=await save(dir,'good.json',JSON.stringify(register()));
    const result=await runCoverageCli([path,'--format','html']);assert.equal(result.status,0);
    assert.ok(result.stdout.includes('<!doctype html>'));assert.ok(result.stdout.includes("default-src 'none'"));
  });
});
test('JSON report output parses and carries blocker counts',async()=>{
  await temporary(async(dir)=>{
    const path=await save(dir,'good.json',JSON.stringify(register()));
    const result=await runCoverageCli([path,'--format','json']);assert.equal(result.status,0);
    assert.equal(JSON.parse(result.stdout).audit.blocks,0);
  });
});
test('previous version enables regression comparison',async()=>{
  await temporary(async(dir)=>{
    const before=await save(dir,'before.json',JSON.stringify(register()));
    const candidate=await save(dir,'after.json',JSON.stringify(register({views:[view({minimumTargetPx:43})]})));
    const result=await runCoverageCli([candidate,'--previous',before,'--format','json']);
    assert.equal(result.status,1);assert.equal(JSON.parse(result.stdout).comparison.blocked,true);
  });
});
test('explicit allow-online affects only the offline requirement',async()=>{
  await temporary(async(dir)=>{
    const path=await save(dir,'candidate.json',JSON.stringify(register({views:[view({offline:'NO'})]})));
    assert.equal((await runCoverageCli([path])).status,1);
    assert.equal((await runCoverageCli([path,'--allow-online'])).status,0);
  });
});
test('candidate input is never modified by CLI execution',async()=>{
  await temporary(async(dir)=>{
    const raw=JSON.stringify(register());const path=await save(dir,'candidate.json',raw);
    await runCoverageCli([path]);const {readFile}=await import('node:fs/promises');
    assert.equal(await readFile(path,'utf8'),raw);
  });
});
test('CLI import has no subprocess side effects',()=>{
  const file=fileURLToPath(new URL('./coverage-cli.mjs',import.meta.url));
  const child=spawnSync(process.execPath,['--input-type=module','-e',`import(${JSON.stringify(new URL('./coverage-cli.mjs',import.meta.url).href)})`],{encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);assert.equal(child.stdout,'');assert.equal(child.stderr,'');assert.ok(file.endsWith('.mjs'));
});
test('CLI executable runs source .mjs without requiring a missing compiled .js',async()=>{
  await temporary(async(dir)=>{
    const path=await save(dir,'good.json',JSON.stringify(register()));
    const executable=fileURLToPath(new URL('./coverage-cli.mjs',import.meta.url));
    const child=spawnSync(process.execPath,[executable,path],{encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);assert.ok(child.stdout.includes('release-one'));
  });
});
test('CLI executable returns one for blockers',async()=>{
  await temporary(async(dir)=>{
    const path=await save(dir,'bad.json',JSON.stringify(register({sources:[source({permission:'NO'})]})));
    const executable=fileURLToPath(new URL('./coverage-cli.mjs',import.meta.url));
    const child=spawnSync(process.execPath,[executable,path],{encoding:'utf8'});
    assert.equal(child.status,1,child.stderr);
  });
});
test('CLI executable returns two for missing file',()=>{
  const executable=fileURLToPath(new URL('./coverage-cli.mjs',import.meta.url));
  const child=spawnSync(process.execPath,[executable,'missing.json'],{encoding:'utf8'});
  assert.equal(child.status,2);assert.ok(child.stderr);
});
