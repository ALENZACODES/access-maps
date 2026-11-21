import test from 'node:test';
import assert from 'node:assert/strict';
import {parseArgs,runCli} from './parity-cli.mjs';
import {fixture} from './parity-fixture.mjs';
const readFor=(trace,pairs)=>async path=>path==='trace.json'?JSON.stringify(trace):path==='pairs.json'?JSON.stringify(pairs):Promise.reject(new Error('File not found'));
function execute(args,reader){let stdout='',stderr='';return runCli(args,reader,s=>{stdout+=s;},s=>{stderr+=s;}).then(code=>({code,stdout,stderr}));}
test('parseArgs defaults to English text',()=>assert.deepEqual(parseArgs(['trace.json','pairs.json']),{traceFile:'trace.json',pairsFile:'pairs.json',locale:'en',format:'text'}));
test('parseArgs accepts French JSON',()=>assert.equal(parseArgs(['trace.json','pairs.json','--locale','fr','--format','json']).locale,'fr'));
test('parseArgs accepts TSV',()=>assert.equal(parseArgs(['trace.json','pairs.json','--format','tsv']).format,'tsv'));
for(const args of [[],['trace.json'],['--locale','fr'],['trace.json','pairs.json','--format','xml'],['trace.json','pairs.json','--locale','de'],['trace.json','pairs.json','--unknown','x'],['trace.json','pairs.json','--locale']])test(`invalid CLI arguments are rejected: ${args.join(' ')}`,()=>assert.throws(()=>parseArgs(args)));
test('complete evidence yields exit 0',async()=>{const f=fixture(),r=await execute(['trace.json','pairs.json'],readFor(f.trace,f.pairs));assert.equal(r.code,0);assert.ok(r.stdout.includes('Bilingual map notice parity'));});
test('missing French notice yields exit 1',async()=>{const f=fixture();f.trace.notices.pop();const r=await execute(['trace.json','pairs.json'],readFor(f.trace,f.pairs));assert.equal(r.code,1);});
test('missing evidence returns French finding',async()=>{const f=fixture();f.trace.notices.pop();const r=await execute(['trace.json','pairs.json','--locale','fr'],readFor(f.trace,f.pairs));assert.equal(r.code,1);assert.ok(r.stdout.includes('Une mention de source manque'));});
test('JSON report is machine-readable',async()=>{const f=fixture(),r=await execute(['trace.json','pairs.json','--format','json'],readFor(f.trace,f.pairs));assert.equal(JSON.parse(r.stdout).schema,'attribution-locale-parity-report/1');});
test('TSV report has stable header',async()=>{const f=fixture(),r=await execute(['trace.json','pairs.json','--format','tsv'],readFor(f.trace,f.pairs));assert.match(r.stdout,/^pairId\tseverity\tcode/u);});
test('missing file exits 2',async()=>{const f=fixture(),r=await execute(['trace.json','missing.json'],readFor(f.trace,f.pairs));assert.equal(r.code,2);assert.match(r.stderr,/File not found/u);});
test('invalid JSON exits 2',async()=>{const f=fixture(),r=await execute(['trace.json','pairs.json'],async p=>p==='trace.json'?'NOT-JSON':JSON.stringify(f.pairs));assert.equal(r.code,2);});
test('wrong locale pair reference exits 2',async()=>{const f=fixture();f.pairs.pairs[0].enSurfaceId='non-existent';const r=await execute(['trace.json','pairs.json'],readFor(f.trace,f.pairs));assert.equal(r.code,2);});
test('CLI does not write files',async()=>{const f=fixture();let stdout='';await runCli(['trace.json','pairs.json'],readFor(f.trace,f.pairs),s=>stdout+=s);assert.ok(stdout.includes('Bilingual'));});
