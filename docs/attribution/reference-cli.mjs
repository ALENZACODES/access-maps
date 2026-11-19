/** Explicit local CLI. No network, persistence, automatic scheduling or hidden input. */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReferencePackJson, REFERENCE_MAX_BYTES } from './reference-core.mjs';
import { auditReferencePack, compareReferencePacks } from './reference-audit.mjs';
import { renderReferenceHtml, renderReferenceText, renderReferenceJson } from './reference-report.mjs';
export const REFERENCE_USAGE='Usage: reference-cli.mjs <pack.json> [--lang en|fr] [--format text|html|json] [--before old.json]';
export function parseReferenceArgs(args){
  if(!Array.isArray(args)||args.length===0)throw new Error(REFERENCE_USAGE);
  let pack=null,lang='en',format='text',before=null;
  const seen=new Set();
  for(let i=0;i<args.length;i++){
    const a=args[i];
    if(['--lang','--format','--before'].includes(a)){
      if(seen.has(a))throw new Error(`Repeated ${a}`);
      seen.add(a);
      const v=args[++i];
      if(!v||v.startsWith('--'))throw new Error(`Missing value for ${a}`);
      if(a==='--lang'){if(!['en','fr'].includes(v))throw new Error('Language must be en or fr');lang=v;}
      if(a==='--format'){if(!['text','html','json'].includes(v))throw new Error('Format must be text, html or json');format=v;}
      if(a==='--before')before=v;
    }else if(typeof a!=='string'||a.startsWith('-'))throw new Error(`Unknown argument: ${String(a)}`);
    else if(pack!==null)throw new Error('One pack path required');
    else pack=a;
  }
  if(!pack)throw new Error(REFERENCE_USAGE);
  return {pack,lang,format,before};
}
async function readBounded(path){
  const absolute=resolve(path);const info=await stat(absolute);
  if(!info.isFile()||info.size>REFERENCE_MAX_BYTES)throw new Error('Input must be a bounded local file');
  const raw=await readFile(absolute,'utf8');
  return parseReferencePackJson(raw);
}
export async function executeReferenceCli(args){
  let options;
  try{options=parseReferenceArgs(args);}catch(err){return {status:2,stdout:'',stderr:err instanceof Error?err.message:'Invalid arguments'};}
  try{
    const pack=await readBounded(options.pack);
    const audit=auditReferencePack(pack);
    const comparison=options.before?compareReferencePacks(await readBounded(options.before),pack):null;
    const stdout=options.format==='html'?renderReferenceHtml(pack,audit,options.lang,comparison):options.format==='json'?renderReferenceJson(pack,audit,comparison):renderReferenceText(pack,audit,options.lang,comparison);
    return {status:audit.blocked||comparison?.blocked?1:0,stdout,stderr:''};
  }catch(err){return {status:2,stdout:'',stderr:err instanceof Error?err.message:'Unable to inspect local pack'};}
}
function isEntry(){return Boolean(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url));}
if(isEntry())executeReferenceCli(process.argv.slice(2)).then(result=>{if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr+'\n');process.exitCode=result.status;}).catch(err=>{process.stderr.write(String(err)+'\n');process.exitCode=2;});
