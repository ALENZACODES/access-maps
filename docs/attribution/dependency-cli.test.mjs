import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArguments, run, HELP} from './dependency-cli.mjs';
import {fixture, cloneFixture} from './dependency-fixture.mjs';
const cli=fileURLToPath(new URL('./dependency-cli.mjs',import.meta.url));
async function simulated(argv, datasets={}) {
  let stdout='',stderr='',written='';
  const code=await run(argv,{read:async path=>{
    if(!Object.hasOwn(datasets,path))throw new Error('File unavailable');
    return datasets[path];},write:async(_,content)=>{written=content;},
    stdout:value=>{stdout+=value;},stderr:value=>{stderr+=value;}});
  return {code,stdout,stderr,written};
}
test('CLI help is explicit',()=>assert.match(HELP,/Usage:/u));
test('CLI accepts one input',()=>assert.equal(parseArguments(['input.json']).input,'input.json'));
test('CLI accepts bilingual output settings',()=>assert.equal(parseArguments(['file.json','--lang','fr']).lang,'fr'));
test('CLI rejects missing input',()=>assert.throws(()=>parseArguments([])));
test('CLI rejects repeated file positionals',()=>assert.throws(()=>parseArguments(['one','two'])));
test('CLI rejects unknown options',()=>assert.throws(()=>parseArguments(['one','--skip-gates'])));
test('CLI rejects repeated options',()=>assert.throws(()=>parseArguments(['one','--lang','fr','--lang','en'])));
test('CLI rejects missing option value',()=>assert.throws(()=>parseArguments(['one','--lang'])));
test('CLI rejects missing prior inventory for comparison',()=>assert.throws(()=>parseArguments(['one','--format','comparison'])));
test('CLI rejects unsupported language',()=>assert.throws(()=>parseArguments(['one','--lang','es'])));
test('CLI rejects unsupported report format',()=>assert.throws(()=>parseArguments(['one','--format','html'])));
test('CLI supports --help without opening file',async()=>{
  const result=await simulated(['--help']);
  assert.equal(result.code,0);
  assert.ok(result.stdout.includes('Usage:'));
});
test('CLI invalid options exit 2',async()=>{
  const result=await simulated(['--format']);
  assert.equal(result.code,2);
  assert.ok(result.stderr.includes(HELP));
});
test('CLI accepts valid fictional inventory',async()=>{
  const result=await simulated(['file.json'],{'file.json':JSON.stringify(fixture())});
  assert.equal(result.code,0);
  assert.ok(result.stdout.includes('Blocking gaps: 0'));
});
test('CLI exits 1 when source retrieval date is UNKNOWN',async()=>{
  const data=cloneFixture();data.sources[0].retrievedOn='UNKNOWN';
  const result=await simulated(['file.json'],{'file.json':JSON.stringify(data)});
  assert.equal(result.code,1);
  assert.ok(result.stdout.includes('RETRIEVAL_UNKNOWN'));
});
test('CLI exits 1 when OSM credit is misplaced',async()=>{
  const data=cloneFixture();data.surfaces[0].notices[0].position='details-only';
  const result=await simulated(['file.json'],{'file.json':JSON.stringify(data)});
  assert.equal(result.code,1);
  assert.ok(result.stdout.includes('OSM_NOT_ADJACENT'));
});
test('CLI returns 2 for invalid JSON',async()=>{
  const result=await simulated(['file.json'],{'file.json':'{' });
  assert.equal(result.code,2);
  assert.ok(result.stderr.includes('Invalid JSON'));
});
test('CLI returns 2 for file read failure',async()=>{
  const result=await simulated(['absent.json']);
  assert.equal(result.code,2);
  assert.ok(result.stderr.includes('File unavailable'));
});
test('CLI JSON output can be parsed',async()=>{
  const result=await simulated(['file.json','--format','json'],{'file.json':JSON.stringify(fixture())});
  const json=JSON.parse(result.stdout);
  assert.equal(json.inventory,fixture().schema);
  assert.equal(json.audit.counts.block,0);
});
test('CLI French output preserves label typography',async()=>{
  const result=await simulated(['file.json','--lang','fr'],{'file.json':JSON.stringify(fixture())});
  assert.ok(result.stdout.includes('Lacunes bloquantes\u00a0:'));
});
test('CLI coverage output is TSV',async()=>{
  const result=await simulated(['file.json','--format','coverage'],{'file.json':JSON.stringify(fixture())});
  assert.ok(result.stdout.startsWith('surfaceId\t'));
});
test('CLI edges output includes relationships',async()=>{
  const result=await simulated(['file.json','--format','edges'],{'file.json':JSON.stringify(fixture())});
  assert.ok(result.stdout.includes('sourced-from'));
});
test('CLI comparison includes changed source evidence',async()=>{
  const data=cloneFixture();data.sources[0].tier='UNKNOWN';
  const result=await simulated(['current.json','--before','past.json','--format','comparison'],{
    'current.json':JSON.stringify(data),'past.json':JSON.stringify(fixture())});
  assert.equal(result.code,1);
  assert.ok(result.stdout.includes('SOURCE_CHANGED'));
});
test('CLI --output writes file rather than printing',async()=>{
  const result=await simulated(['file.json','--output','result.txt'],{'file.json':JSON.stringify(fixture())});
  assert.equal(result.code,0);
  assert.equal(result.stdout,'');
  assert.ok(result.written.includes('Blocking gaps: 0'));
});
test('CLI output failure exits 2',async()=>{
  const result=await run(['file.json','--output','out.txt'],{read:async()=>JSON.stringify(fixture()),
    write:async()=>{throw new Error('Write denied');},stdout:()=>{},stderr:()=>{}});
  assert.equal(result,2);
});
test('CLI invoked as a subprocess succeeds with complete source file',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'dep-cli-'));
  try{
    const path=join(directory,'inventory.json');
    await writeFile(path,JSON.stringify(fixture()));
    const result=spawnSync(process.execPath,[cli,path,'--format','json'],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.equal(JSON.parse(result.stdout).audit.counts.block,0);
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('CLI subprocess blocks missing evidence with exit 1',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'dep-cli-'));
  try{
    const path=join(directory,'inventory.json');
    const data=cloneFixture();data.sources[0].licence='UNKNOWN';
    await writeFile(path,JSON.stringify(data));
    const result=spawnSync(process.execPath,[cli,path],{encoding:'utf8'});
    assert.equal(result.status,1);
    assert.ok(result.stdout.includes('LICENCE_UNKNOWN'));
  } finally {await rm(directory,{recursive:true,force:true});}
});
test('CLI subprocess writes a local output file when requested',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'dep-cli-'));
  try{
    const path=join(directory,'inventory.json');
    const out=join(directory,'report.txt');
    await writeFile(path,JSON.stringify(fixture()));
    const result=spawnSync(process.execPath,[cli,path,'--output',out],{encoding:'utf8'});
    assert.equal(result.status,0);
    assert.ok((await readFile(out,'utf8')).includes('Blocking gaps: 0'));
  } finally {await rm(directory,{recursive:true,force:true});}
});
