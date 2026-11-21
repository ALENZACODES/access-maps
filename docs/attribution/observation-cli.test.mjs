import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {parseOptions,run,HELP} from './observation-cli.mjs';
import {OBSERVATION_SCHEMA,OSM_CREDIT,newObservation} from './observation-core.mjs';
const dir=dirname(fileURLToPath(import.meta.url));
function journal() {
  const record=(method,id)=>({...newObservation('view1','osm',method,id),date:'2026-11-20',placement:'beside-map',
    creditSeen:'yes',licenceSeen:'yes',legible:'yes',focusVisible:'yes',targetPx:44,noticeText:OSM_CREDIT,evidence:'Fictional test'});
  return {schema:OBSERVATION_SCHEMA,title:'Synthetic release',sources:[{
    id:'osm',provider:'OpenStreetMap',sourceUrl:'https://www.openstreetmap.org/copyright',licence:'ODbL-1.0',
    licenceUrl:'https://www.openstreetmap.org/copyright',retrievedOn:'2026-11-20',tier:'imported',credit:OSM_CREDIT,permission:'yes'}],
    views:[{id:'view1',title:'Fictional surface',route:'/demo',locale:'fr',kind:'map',sourceIds:['osm'],included:'yes'}],
    observations:['visual','keyboard','screen-reader','touch'].map((method,i)=>record(method,`observation${i}`))};
}
function memory(doc,old) {
  const writes=[];const output=[];const errors=[];
  return {writes,output,errors,io:{read:async path=>path.endsWith('old.json')?JSON.stringify(old??doc):JSON.stringify(doc),
    write:async(...args)=>{writes.push(args);},out:s=>{output.push(s);},err:s=>{errors.push(s);}}};
}
test('help mentions no remote access',()=>assert.match(HELP,/Nothing is retrieved/));
test('no positional filename fails closed',()=>assert.throws(()=>parseOptions([]),/required/));
test('unknown flag fails closed',()=>assert.throws(()=>parseOptions(['a','--upload']),/Unknown option/));
test('double positional path fails',()=>assert.throws(()=>parseOptions(['a','b']),/Exactly one/));
test('French accepted',()=>assert.equal(parseOptions(['a','--language','fr']).language,'fr'));
test('JSON accepted',()=>assert.equal(parseOptions(['a','--format','json']).format,'json'));
test('format invalid rejected',()=>assert.throws(()=>parseOptions(['a','--format','pdf']),/Unsupported/));
test('language invalid rejected',()=>assert.throws(()=>parseOptions(['a','--language','es']),/Unsupported/));
test('missing flag argument rejected',()=>assert.throws(()=>parseOptions(['a','--output']),/Missing value/));
test('repeated flag rejected',()=>assert.throws(()=>parseOptions(['a','--format','json','--format','text']),/Repeated/));
test('help is accepted without journal',()=>assert.equal(parseOptions(['--help']).help,true));
test('passing fixture returns 0',async()=>{const m=memory(journal());assert.equal(await run(['candidate.json'],m.io),0);assert.match(m.output.join(''),/Blocking gaps: 0/);});
test('unknown touch target blocks release',async()=>{const f=journal();f.observations.at(-1).targetPx='UNKNOWN';const m=memory(f);assert.equal(await run(['candidate.json'],m.io),1);assert.match(m.output.join(''),/44 pixels|target size/i);});
test('unknown metadata blocks release',async()=>{const f=journal();f.sources[0].retrievedOn='UNKNOWN';const m=memory(f);assert.equal(await run(['candidate.json'],m.io),1);});
test('JSON output serializes actual findings',async()=>{const m=memory(journal());assert.equal(await run(['candidate.json','--format','json'],m.io),0);assert.equal(JSON.parse(m.output.join('')).audit.totals.blocking,0);});
test('comparison reports newly absent credit',async()=>{const f=journal();const next=structuredClone(f);next.observations[0].creditSeen='no';const m=memory(next,f);assert.equal(await run(['candidate.json','--before','old.json'],m.io),1);assert.match(m.output.join(''),/CREDIT_NOT_SEEN/);});
test('output file is written only when explicitly requested',async()=>{const m=memory(journal());assert.equal(await run(['candidate.json','--output','report.txt'],m.io),0);assert.equal(m.writes.length,1);assert.equal(m.output.length,0);});
test('invalid JSON input is a separate exit 2',async()=>{const m=memory(journal());m.io.read=async()=>'{';assert.equal(await run(['candidate.json'],m.io),2);assert.match(m.errors.join(''),/could not be assessed/);});
test('read error is a separate exit 2',async()=>{const m=memory(journal());m.io.read=async()=>{throw Error('missing');};assert.equal(await run(['candidate.json'],m.io),2);});
test('write error is a separate exit 2',async()=>{const m=memory(journal());m.io.write=async()=>{throw Error('read-only');};assert.equal(await run(['candidate.json','--output','report.txt'],m.io),2);});
test('no included views is not reported as ready',async()=>{const f=journal();f.views[0].included='no';const m=memory(f);assert.equal(await run(['candidate.json'],m.io),1);});
test('direct CLI help exits successfully',()=>{const child=spawnSync(process.execPath,[join(dir,'observation-cli.mjs'),'--help'],{encoding:'utf8'});assert.equal(child.status,0);assert.match(child.stdout,/Usage:/);});
test('direct CLI processes actual file and exits 0',async()=>{const temp=await mkdtemp(join(tmpdir(),'p18-observation-'));try{
  const input=join(temp,'journal.json');await writeFile(input,JSON.stringify(journal()));
  const child=spawnSync(process.execPath,[join(dir,'observation-cli.mjs'),input,'--language','fr'],{encoding:'utf8'});
  assert.equal(child.status,0);assert.match(child.stdout,/Écarts bloquants\u00a0: 0/);
}finally{await rm(temp,{recursive:true,force:true});}});
test('direct CLI refuses invalid input with exit 2',async()=>{const temp=await mkdtemp(join(tmpdir(),'p18-observation-'));try{
  const input=join(temp,'journal.json');await writeFile(input,'invalid json');
  const child=spawnSync(process.execPath,[join(dir,'observation-cli.mjs'),input],{encoding:'utf8'});
  assert.equal(child.status,2);assert.match(child.stderr,/could not be assessed/);
}finally{await rm(temp,{recursive:true,force:true});}});
test('direct CLI blocks incomplete journal with exit 1',async()=>{const temp=await mkdtemp(join(tmpdir(),'p18-observation-'));try{
  const input=join(temp,'journal.json');const f=journal();f.sources[0].permission='UNKNOWN';await writeFile(input,JSON.stringify(f));
  const child=spawnSync(process.execPath,[join(dir,'observation-cli.mjs'),input],{encoding:'utf8'});
  assert.equal(child.status,1);assert.match(child.stdout,/Distribution permission/);
}finally{await rm(temp,{recursive:true,force:true});}});
test('direct CLI writes requested report with no other output',async()=>{const temp=await mkdtemp(join(tmpdir(),'p18-observation-'));try{
  const input=join(temp,'journal.json');const output=join(temp,'report.txt');await writeFile(input,JSON.stringify(journal()));
  const child=spawnSync(process.execPath,[join(dir,'observation-cli.mjs'),input,'--output',output],{encoding:'utf8'});
  assert.equal(child.status,0);assert.equal(child.stdout,'');assert.match(await readFile(output,'utf8'),/Attribution observation journal/);
}finally{await rm(temp,{recursive:true,force:true});}});
