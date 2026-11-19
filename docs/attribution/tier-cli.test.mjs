import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {executeTierCli,parseTierCliArgs,TierCliError} from './tier-cli.mjs';
import {ledger,record,surface} from './tier-fixtures.mjs';
async function temp(run){const root=await mkdtemp(join(tmpdir(),'attribution-tier-'));try{return await run(root);}finally{await rm(root,{recursive:true,force:true});}}
async function manifest(root,value=ledger(),name='ledger.json'){const file=join(root,name);await writeFile(file,JSON.stringify(value),'utf8');return file;}
const executable=fileURLToPath(new URL('./tier-cli.mjs',import.meta.url));
test('CLI requires one manifest',()=>assert.throws(()=>parseTierCliArgs([]),TierCliError));
test('CLI parses default arguments',()=>assert.deepEqual(parseTierCliArgs(['source.json']),{file:'source.json',before:null,locale:'en',format:'text',date:'UNKNOWN'}));
test('CLI parses all options',()=>assert.deepEqual(parseTierCliArgs(['a.json','--lang','fr','--format','json','--date','2026-11-19','--before','b.json']),{file:'a.json',before:'b.json',locale:'fr',format:'json',date:'2026-11-19'}));
test('CLI rejects multiple manifests',()=>assert.throws(()=>parseTierCliArgs(['a.json','b.json']),TierCliError));
test('CLI rejects unknown flags',()=>assert.throws(()=>parseTierCliArgs(['a.json','--write']),TierCliError));
for(const flag of ['--lang','--format','--before','--date']){
  test(`CLI rejects missing ${flag}`,()=>assert.throws(()=>parseTierCliArgs(['a.json',flag]),TierCliError));
  test(`CLI rejects repeated ${flag}`,()=>assert.throws(()=>parseTierCliArgs(['a.json',flag,'fr',flag,'en']),TierCliError));
}
for(const value of ['es','fr-CA','FR','','UNKNOWN'])test(`CLI rejects language ${JSON.stringify(value)}`,()=>assert.throws(()=>parseTierCliArgs(['a.json','--lang',value]),TierCliError));
for(const value of ['pdf','csv','yaml','','TEXT'])test(`CLI rejects format ${JSON.stringify(value)}`,()=>assert.throws(()=>parseTierCliArgs(['a.json','--format',value]),TierCliError));
for(const value of ['yesterday','2026-1-1','11/19/2026'])test(`CLI rejects date ${value}`,()=>assert.throws(()=>parseTierCliArgs(['a.json','--date',value]),TierCliError));
test('missing manifest returns status 2',async()=>{const result=await executeTierCli([]);assert.equal(result.status,2);assert.ok(result.error);});
test('valid manifest returns status 0 and local text',async()=>temp(async(root)=>{const file=await manifest(root);const result=await executeTierCli([file]);assert.equal(result.status,0,result.error);assert.ok(result.output.includes('release-one'));}));
test('source with missing permission returns status 1',async()=>temp(async(root)=>{const file=await manifest(root,ledger({records:[record({permission:'UNKNOWN'})]}));const result=await executeTierCli([file]);assert.equal(result.status,1);assert.ok(result.output.includes('PERMISSION_UNKNOWN'));}));
test('bad JSON returns status 2',async()=>temp(async(root)=>{const file=join(root,'bad.json');await writeFile(file,'{broken');const result=await executeTierCli([file]);assert.equal(result.status,2);assert.equal(result.output,'');}));
test('unreadable path returns status 2',async()=>temp(async(root)=>{const result=await executeTierCli([join(root,'absent.json')]);assert.equal(result.status,2);assert.ok(result.error);}));
test('JSON format parses with current ledger and audit',async()=>temp(async(root)=>{const file=await manifest(root);const result=await executeTierCli([file,'--format','json']);assert.equal(result.status,0);const payload=JSON.parse(result.output);assert.equal(payload.ledger.release,'release-one');assert.equal(payload.comparison,null);}));
test('French HTML output declares lang and CSP',async()=>temp(async(root)=>{const file=await manifest(root);const result=await executeTierCli([file,'--lang','fr','--format','html']);assert.equal(result.status,0);assert.ok(result.output.includes('<html lang="fr">'));assert.ok(result.output.includes("default-src 'none'"));}));
test('French text contains exact nonbreaking colon separator',async()=>temp(async(root)=>{const file=await manifest(root);const result=await executeTierCli([file,'--lang','fr']);assert.equal(result.status,0);assert.ok(result.output.includes('Données en date du\u00a0: UNKNOWN'));}));
test('previous release does not cause a silent overwrite',async()=>temp(async(root)=>{const file=await manifest(root),before=await manifest(root,ledger({release:'release-old'}),'before.json');const result=await executeTierCli([file,'--before',before]);assert.equal(result.status,0);assert.ok(result.output.includes('release-old'));assert.deepEqual((await readdir(root)).sort(),['before.json','ledger.json']);}));
test('regression in accessibility evidence returns status 1',async()=>temp(async(root)=>{const file=await manifest(root,ledger({surfaces:[surface({targetPx:43})]})),before=await manifest(root,ledger({release:'release-old'}),'before.json');const result=await executeTierCli([file,'--before',before]);assert.equal(result.status,1);assert.ok(result.output.includes('TARGET_TOO_SMALL'));}));
test('CLI imported as a module does not execute process exit',()=>{const proc=spawnSync(process.execPath,['--input-type=module','-e',`import(${JSON.stringify(new URL('./tier-cli.mjs',import.meta.url).href)})`],{encoding:'utf8',timeout:10000});assert.equal(proc.status,0,proc.stderr);assert.equal(proc.stdout,'');assert.equal(proc.stderr,'');});
test('CLI entrypoint success process exit is zero',async()=>temp(async(root)=>{const file=await manifest(root);const proc=spawnSync(process.execPath,[executable,file],{encoding:'utf8',timeout:10000});assert.equal(proc.status,0,proc.stderr);assert.ok(proc.stdout.includes('release-one'));}));
test('CLI entrypoint blocked process exit is one',async()=>temp(async(root)=>{const file=await manifest(root,ledger({records:[record({permission:'UNKNOWN'})]}));const proc=spawnSync(process.execPath,[executable,file],{encoding:'utf8',timeout:10000});assert.equal(proc.status,1);assert.ok(proc.stdout.includes('PERMISSION_UNKNOWN'));}));
test('CLI entrypoint invalid input exit is two',()=>{const proc=spawnSync(process.execPath,[executable],{encoding:'utf8',timeout:10000});assert.equal(proc.status,2);assert.ok(proc.stderr.includes('Usage'));});
test('CLI handles an injected read failure without crash',async()=>{const result=await executeTierCli(['file.json'],async()=>{throw new Error('denied');});assert.equal(result.status,2);assert.ok(result.error.includes('denied'));});
test('CLI reads only the requested files',async()=>{let count=0;const result=await executeTierCli(['file.json'],async()=>{count++;return JSON.stringify(ledger());});assert.equal(count,1);assert.equal(result.status,0);});
test('CLI reads two files for explicit comparison',async()=>{let count=0;const result=await executeTierCli(['file.json','--before','before.json'],async()=>{count++;return JSON.stringify(ledger());});assert.equal(count,2);assert.equal(result.status,0);});
test('HTML comparison export includes before-and-after findings',async()=>temp(async(root)=>{
  const current=await manifest(root,ledger({surfaces:[surface({targetPx:43})]}));
  const prior=await manifest(root,ledger({release:'old-release'}),'before.json');
  const result=await executeTierCli([current,'--before',prior,'--format','html']);
  assert.equal(result.status,1);
  assert.ok(result.output.includes('Release changes'));
  assert.ok(result.output.includes('targetPx'));
}));
test('French HTML comparison labels use NBSP separators',async()=>temp(async(root)=>{
  const current=await manifest(root);
  const prior=await manifest(root,ledger({release:'old-release'}),'before.json');
  const result=await executeTierCli([current,'--before',prior,'--format','html','--lang','fr']);
  assert.equal(result.status,0);
  assert.ok(result.output.includes('Avant\u00a0:'));
}));
