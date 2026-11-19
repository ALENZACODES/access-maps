import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fixturePack } from './reference-fixtures.mjs';
import { executeReferenceCli, parseReferenceArgs, REFERENCE_USAGE } from './reference-cli.mjs';
const executable=fileURLToPath(new URL('./reference-cli.mjs',import.meta.url));
async function workspace(fn){const dir=await mkdtemp(join(tmpdir(),'reference-gate-'));try{return await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
async function packFile(dir,pack=fixturePack(),name='pack.json'){const path=join(dir,name);await writeFile(path,JSON.stringify(pack),'utf8');return path;}
function run(args){return spawnSync(process.execPath,[executable,...args],{encoding:'utf8',timeout:10000});}
test('usage is explicit and read-only',()=>assert.match(REFERENCE_USAGE,/Usage:/u));
test('default CLI options',()=>assert.deepEqual(parseReferenceArgs(['pack.json']),{pack:'pack.json',lang:'en',format:'text',before:null}));
test('CLI supports French JSON and a baseline',()=>assert.deepEqual(parseReferenceArgs(['--lang','fr','pack.json','--format','json','--before','old.json']),{pack:'pack.json',lang:'fr',format:'json',before:'old.json'}));
for(const args of [[],['--format'],['file.json','--lang'],['file.json','--before'],['a','b'],['--bad','a'],['a','--format','xml'],['a','--lang','es'],['a','--lang','en','--lang','fr'],['a','--format','text','--format','json'],['a','--before','old','--before','old2']])test(`rejects CLI arguments ${JSON.stringify(args)}`,()=>assert.throws(()=>parseReferenceArgs(args)));
test('missing argument result is exit 2',async()=>{const r=await executeReferenceCli([]);assert.equal(r.status,2);assert.ok(r.stderr);});
test('invalid file result is exit 2',async()=>{const r=await executeReferenceCli(['/missing/path']);assert.equal(r.status,2);});
test('valid file returns exit 0 and a report',async()=>workspace(async dir=>{const file=await packFile(dir);const r=await executeReferenceCli([file]);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/release-one/u);}));
test('explicit source loss returns exit 1',async()=>workspace(async dir=>{const p=fixturePack();p.sources[0].permission='NO';const file=await packFile(dir,p);const r=await executeReferenceCli([file]);assert.equal(r.status,1);assert.match(r.stdout,/PERMISSION_NO/u);}));
test('JSON output includes structured audit',async()=>workspace(async dir=>{const file=await packFile(dir);const r=await executeReferenceCli([file,'--format','json']);assert.equal(r.status,0);const obj=JSON.parse(r.stdout);assert.equal(obj.schema,'attribution-reference-report/1');assert.equal(obj.audit.blocked,false);}));
test('French HTML includes a language tag',async()=>workspace(async dir=>{const file=await packFile(dir);const r=await executeReferenceCli([file,'--format','html','--lang','fr']);assert.equal(r.status,0);assert.match(r.stdout,/<html lang="fr">/u);}));
test('CLI compares baseline when explicitly requested',async()=>workspace(async dir=>{const old=await packFile(dir,fixturePack(),'old.json');const changed=fixturePack();changed.sources[0].permission='UNKNOWN';const candidate=await packFile(dir,changed,'new.json');const r=await executeReferenceCli([candidate,'--before',old,'--format','json']);assert.equal(r.status,1);const obj=JSON.parse(r.stdout);assert.equal(obj.comparison.blocked,true);}));
test('CLI does not write reports by default',async()=>workspace(async dir=>{const file=await packFile(dir);const before=await readdir(dir);const r=await executeReferenceCli([file]);assert.equal(r.status,0);assert.deepEqual(await readdir(dir),before);}));
test('CLI rejects oversized files',async()=>workspace(async dir=>{const file=join(dir,'large.json');await writeFile(file,' '.repeat(2_097_153));const r=await executeReferenceCli([file]);assert.equal(r.status,2);}));
test('CLI rejects unknown schema',async()=>workspace(async dir=>{const p=fixturePack();p.schema='wrong';const file=await packFile(dir,p);const r=await executeReferenceCli([file]);assert.equal(r.status,2);}));
test('CLI rejects malformed JSON',async()=>workspace(async dir=>{const file=join(dir,'bad.json');await writeFile(file,'{');const r=await executeReferenceCli([file]);assert.equal(r.status,2);}));
test('CLI import has no process exit or output side effect',()=>{const child=spawnSync(process.execPath,['--input-type=module','-e',`import(${JSON.stringify(new URL('./reference-cli.mjs',import.meta.url).href)})`],{encoding:'utf8',timeout:10000});assert.equal(child.status,0,child.stderr);assert.equal(child.stdout,'');assert.equal(child.stderr,'');});
test('CLI process executes mjs directly without a compiled JS path',async()=>workspace(async dir=>{const file=await packFile(dir);const child=run([file]);assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/release-one/u);}));
test('CLI process blocks release on missing permission',async()=>workspace(async dir=>{const p=fixturePack();p.sources[0].permission='NO';const file=await packFile(dir,p);const child=run([file]);assert.equal(child.status,1,child.stderr);assert.match(child.stdout,/PERMISSION_NO/u);}));
test('CLI process returns 2 for invalid file',()=>{const child=run(['/missing/file.json']);assert.equal(child.status,2);assert.ok(child.stderr);});
test('CLI process returns 2 for invalid flag',()=>{const child=run(['fake.json','--bad']);assert.equal(child.status,2);assert.ok(child.stderr);});
test('CLI process prints French output',async()=>workspace(async dir=>{const file=await packFile(dir);const child=run([file,'--lang','fr']);assert.equal(child.status,0,child.stderr);assert.ok(child.stdout.includes('Version\u00a0: release-one'));}));
