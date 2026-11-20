import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parseDistributionArgs,executeDistributionCli,DISTRIBUTION_USAGE} from './distribution-cli.mjs';
import {manifest,source,view,deepCopy} from './distribution-fixtures.mjs';
import {UNKNOWN} from './distribution-core.mjs';
const bin=fileURLToPath(new URL('./distribution-cli.mjs',import.meta.url));
async function temporary(run) {
  const root=await mkdtemp(join(tmpdir(),'distribution-gate-'));
  try {return await run(root);}finally {await rm(root,{recursive:true,force:true});}
}
async function save(root,data,name='manifest.json') {
  const path=join(root,name);
  await writeFile(path,JSON.stringify(data),'utf8');
  return path;
}
const runSync=(args=[])=>spawnSync(process.execPath,[bin,...args],{encoding:'utf8',timeout:10000});

test('usage message names actual command entry point',()=>assert.match(DISTRIBUTION_USAGE,/distribution-cli.mjs/u));
test('usage message describes mandatory manifest argument',()=>assert.match(DISTRIBUTION_USAGE,/manifest.json/u));
test('usage message describes French locale option',()=>assert.match(DISTRIBUTION_USAGE,/--lang en\|fr/u));
test('usage message describes English/French pair option',()=>assert.match(DISTRIBUTION_USAGE,/--require-pairs/u));
test('CLI defaults to English',()=>assert.equal(parseDistributionArgs(['manifest.json']).locale,'en'));
test('CLI defaults to text format',()=>assert.equal(parseDistributionArgs(['manifest.json']).format,'text'));
test('CLI defaults to no baseline',()=>assert.equal(parseDistributionArgs(['manifest.json']).before,null));
test('CLI defaults to optional language pairing',()=>assert.equal(parseDistributionArgs(['manifest.json']).requirePairs,false));
test('CLI accepts French explicitly',()=>assert.equal(parseDistributionArgs(['manifest.json','--lang','fr']).locale,'fr'));
test('CLI accepts JSON format explicitly',()=>assert.equal(parseDistributionArgs(['manifest.json','--format','json']).format,'json'));
test('CLI accepts HTML format explicitly',()=>assert.equal(parseDistributionArgs(['manifest.json','--format','html']).format,'html'));
test('CLI accepts an earlier release path',()=>assert.equal(parseDistributionArgs(['manifest.json','--before','older.json']).before,'older.json'));
test('CLI accepts explicit pairing requirement',()=>assert.equal(parseDistributionArgs(['manifest.json','--require-pairs']).requirePairs,true));
test('CLI accepts arguments in alternative order',()=>{
  const args=parseDistributionArgs(['--format','html','--lang','fr','--require-pairs','manifest.json']);
  assert.equal(args.locale,'fr');assert.equal(args.format,'html');assert.equal(args.requirePairs,true);
});
test('CLI rejects no arguments',()=>assert.throws(()=>parseDistributionArgs([]),/Usage:/u));
test('CLI rejects absent manifest after flags',()=>assert.throws(()=>parseDistributionArgs(['--lang','en']),/Usage:/u));
test('CLI rejects two manifests',()=>assert.throws(()=>parseDistributionArgs(['one.json','two.json']),/Only one current/u));
test('CLI rejects unknown option',()=>assert.throws(()=>parseDistributionArgs(['file.json','--write']),/Unexpected option/u));
test('CLI rejects unknown language',()=>assert.throws(()=>parseDistributionArgs(['file.json','--lang','es']),/Unknown language/u));
test('CLI rejects case-mismatched French label',()=>assert.throws(()=>parseDistributionArgs(['file.json','--lang','FR']),/Unknown language/u));
test('CLI rejects unsupported YAML format',()=>assert.throws(()=>parseDistributionArgs(['file.json','--format','yaml']),/Unknown format/u));
test('CLI rejects unsupported CSV format',()=>assert.throws(()=>parseDistributionArgs(['file.json','--format','csv']),/Unknown format/u));
test('CLI rejects duplicate language flags',()=>assert.throws(()=>parseDistributionArgs(['file.json','--lang','fr','--lang','en']),/Repeated option/u));
test('CLI rejects duplicate format flags',()=>assert.throws(()=>parseDistributionArgs(['file.json','--format','text','--format','json']),/Repeated option/u));
test('CLI rejects duplicate baseline flags',()=>assert.throws(()=>parseDistributionArgs(['file.json','--before','a','--before','b']),/Repeated option/u));
test('CLI rejects duplicate pairing flags',()=>assert.throws(()=>parseDistributionArgs(['file.json','--require-pairs','--require-pairs']),/Repeated option/u));
test('CLI rejects language flag missing value',()=>assert.throws(()=>parseDistributionArgs(['file.json','--lang']),/Missing/u));
test('CLI rejects format flag missing value',()=>assert.throws(()=>parseDistributionArgs(['file.json','--format']),/Missing/u));
test('CLI rejects baseline flag missing value',()=>assert.throws(()=>parseDistributionArgs(['file.json','--before']),/Missing/u));
test('CLI rejects flag in place of option value',()=>assert.throws(()=>parseDistributionArgs(['file.json','--lang','--require-pairs']),/Missing/u));
test('CLI does not write if no manifest is supplied',async()=>{
  const result=await executeDistributionCli([]);
  assert.equal(result.status,2);assert.equal(result.stdout,'');
});
test('CLI returns exit 2 on invalid arguments',async()=>assert.equal((await executeDistributionCli(['--missing'])).status,2));
test('CLI returns exit 2 on absent local file',async()=>{
  await temporary(async root=>assert.equal((await executeDistributionCli([join(root,'absent.json')])).status,2));
});
test('CLI returns exit 2 on invalid JSON file',async()=>{
  await temporary(async root=>{
    const path=join(root,'bad.json');await writeFile(path,'not valid JSON');
    assert.equal((await executeDistributionCli([path])).status,2);
  });
});
test('CLI returns exit 2 on unknown schema',async()=>{
  await temporary(async root=>{
    const path=await save(root,{...manifest(),schema:'unknown'});
    assert.equal((await executeDistributionCli([path])).status,2);
  });
});
test('CLI returns exit 2 on unsupported field',async()=>{
  await temporary(async root=>{
    const path=await save(root,{...manifest(),secret:'data'});
    assert.equal((await executeDistributionCli([path])).status,2);
  });
});
test('CLI returns exit 0 on complete manifest',async()=>{
  await temporary(async root=>{
    const path=await save(root,manifest());
    const result=await executeDistributionCli([path]);
    assert.equal(result.status,0,result.stderr);
  });
});
test('CLI returns exit 1 on permission UNKNOWN',async()=>{
  await temporary(async root=>{
    const path=await save(root,manifest({sources:[source({permission:UNKNOWN})]}));
    const result=await executeDistributionCli([path]);
    assert.equal(result.status,1);assert.match(result.stdout,/PERMISSION_UNRESOLVED/u);
  });
});
test('CLI returns exit 1 when pairing required and French route missing',async()=>{
  await temporary(async root=>{
    const path=await save(root,manifest());
    const result=await executeDistributionCli([path,'--require-pairs']);
    assert.equal(result.status,1);assert.match(result.stdout,/LANGUAGE_PAIR_MISSING/u);
  });
});
test('CLI outputs parseable JSON data',async()=>{
  await temporary(async root=>{
    const path=await save(root,manifest());
    const result=await executeDistributionCli([path,'--format','json']);
    assert.equal(JSON.parse(result.stdout).schema,'attribution-distribution-report/1');
  });
});
test('CLI outputs standalone HTML document',async()=>{
  await temporary(async root=>{
    const path=await save(root,manifest());
    const result=await executeDistributionCli([path,'--format','html']);
    assert.match(result.stdout,/<!doctype html>/u);
  });
});
test('CLI French text uses no-break space before colon',async()=>{
  await temporary(async root=>{
    const path=await save(root,manifest());
    const result=await executeDistributionCli([path,'--lang','fr']);
    assert.match(result.stdout,/Données en date du\u00a0: UNKNOWN/u);
  });
});
test('CLI French HTML includes lang attribute',async()=>{
  await temporary(async root=>{
    const path=await save(root,manifest());
    const result=await executeDistributionCli([path,'--lang','fr','--format','html']);
    assert.match(result.stdout,/lang="fr"/u);
  });
});
test('CLI compares an earlier release when requested',async()=>{
  await temporary(async root=>{
    const before=await save(root,manifest(),'before.json');
    const after=await save(root,manifest({sources:[source({name:'Updated'})]}),'after.json');
    const result=await executeDistributionCli([after,'--before',before,'--format','json']);
    const data=JSON.parse(result.stdout);
    assert.equal(data.comparison.changes[0].field,'name');
  });
});
test('CLI regression change to licence blocks release',async()=>{
  await temporary(async root=>{
    const before=await save(root,manifest(),'before.json');
    const after=await save(root,manifest({sources:[source({licenceUrl:'https://example.org/new'})]}),'after.json');
    const result=await executeDistributionCli([after,'--before',before]);
    assert.equal(result.status,1);
  });
});
test('CLI regression with improved target remains nonblocking',async()=>{
  await temporary(async root=>{
    const before=await save(root,manifest(),'before.json');
    const after=await save(root,manifest({views:[view({targetPx:48})]}),'after.json');
    const result=await executeDistributionCli([after,'--before',before]);
    assert.equal(result.status,0,result.stdout);
  });
});
test('CLI does not modify input manifest',async()=>{
  await temporary(async root=>{
    const path=await save(root,manifest());
    const before=await readFile(path,'utf8');
    await executeDistributionCli([path]);
    assert.equal(await readFile(path,'utf8'),before);
  });
});
test('CLI does not write files to working directory',async()=>{
  await temporary(async root=>{
    const path=await save(root,manifest());
    await executeDistributionCli([path,'--format','html']);
    assert.deepEqual(await readdir(root),['manifest.json']);
  });
});
test('CLI executable import has no side effects',()=>{
  const result=spawnSync(process.execPath,['--input-type=module','-e',`import(${JSON.stringify(new URL('./distribution-cli.mjs',import.meta.url).href)})`],{encoding:'utf8',timeout:10000});
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout,'');
  assert.equal(result.stderr,'');
});
test('CLI executable process succeeds on complete manifest',async()=>{
  await temporary(async root=>{
    const path=await save(root,manifest());
    const result=runSync([path]);
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/release-one/u);
  });
});
test('CLI executable process blocks missing permission',async()=>{
  await temporary(async root=>{
    const path=await save(root,manifest({sources:[source({permission:UNKNOWN})]}));
    const result=runSync([path]);
    assert.equal(result.status,1,result.stderr);
    assert.match(result.stdout,/PERMISSION_UNRESOLVED/u);
  });
});
test('CLI executable process returns 2 on malformed JSON',async()=>{
  await temporary(async root=>{
    const path=join(root,'bad.json');await writeFile(path,'{');
    const result=runSync([path]);
    assert.equal(result.status,2);
    assert.match(result.stderr,/Invalid JSON/u);
  });
});
test('CLI executable process returns 2 on absent input',()=>{
  const result=runSync(['missing-distribution-input.json']);
  assert.equal(result.status,2);
  assert.ok(result.stderr.length>0);
});
test('CLI executable process reads French without extra assets',async()=>{
  await temporary(async root=>{
    const path=await save(root,manifest());
    const result=runSync([path,'--lang','fr','--format','text']);
    assert.equal(result.status,0,result.stderr);
    assert.match(result.stdout,/Données en date du\u00a0:/u);
  });
});
test('CLI executable process detects absent language pair',async()=>{
  await temporary(async root=>{
    const path=await save(root,manifest());
    const result=runSync([path,'--require-pairs']);
    assert.equal(result.status,1,result.stderr);
    assert.match(result.stdout,/LANGUAGE_PAIR_MISSING/u);
  });
});
