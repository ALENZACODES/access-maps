import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {auditBundle,compareBundles} from './bundle-audit.mjs';
import {disclosureHtml,manifestJson,findingsText,coverageTsv} from './bundle-export.mjs';
import {parseBundle} from './bundle-core.mjs';

export const HELP='Usage: node bundle-cli.mjs inventory.json [--view id] [--lang en|fr] [--format audit|html|manifest|text|tsv] [--before previous.json] [--output path]';
export function parseArgs(args) {
  if(!Array.isArray(args)||args.length===0)throw new Error(HELP);
  const out={file:null,view:null,lang:'en',format:'audit',before:null,output:null};
  for(let i=0;i<args.length;i++) {
    const token=args[i];
    if(!token.startsWith('--')) {if(out.file!==null)throw new Error('Only one input file is allowed');out.file=token;continue;}
    if(!['--view','--lang','--format','--before','--output'].includes(token))throw new Error(`Unexpected option ${token}`);
    if(i+1===args.length||args[i+1].startsWith('--'))throw new Error(`Missing ${token} value`);
    out[{ '--view':'view','--lang':'lang','--format':'format','--before':'before','--output':'output'}[token]]=args[++i];
  }
  if(!out.file)throw new Error('Input filename is required');
  if(!['en','fr'].includes(out.lang))throw new Error('Language must be en or fr');
  if(!['audit','html','manifest','text','tsv'].includes(out.format))throw new Error('Invalid output format');
  if(['html','manifest'].includes(out.format)&&!out.view)throw new Error('A view ID is required');
  if(out.format==='html'&&out.before)throw new Error('Comparison is unavailable for HTML');
  return out;
}
export function runBundleCli(input,args={},beforeInput=null) {
  const bundle=parseBundle(input);
  const format=args.format??'audit';
  const language=args.lang??'en';
  const view=args.view??null;
  const audit=auditBundle(bundle);
  const prior=beforeInput===null?null:compareBundles(beforeInput,bundle);
  let text;
  if(format==='audit')text=`${JSON.stringify({audit,comparison:prior},null,2)}\n`;
  else if(format==='html')text=disclosureHtml(bundle,view,language);
  else if(format==='manifest')text=manifestJson(bundle,view,language);
  else if(format==='text')text=findingsText(bundle,language,view);
  else if(format==='tsv')text=coverageTsv(bundle);
  else throw new Error('Unsupported format');
  return {text,exitCode:audit.totals.block||prior?.blocking?1:0,blocked:audit.totals.block>0,format};
}
export async function main(argv=process.argv.slice(2), io={read:readFile,write:writeFile,stdout:process.stdout,stderr:process.stderr}) {
  let options;
  try {options=parseArgs(argv);}catch(err) {io.stderr.write(`${err.message}\n`);return 2;}
  try {
    const input=await io.read(resolve(options.file),'utf8');
    const previous=options.before?await io.read(resolve(options.before),'utf8'):null;
    const result=runBundleCli(input,options,previous);
    if(options.output)await io.write(resolve(options.output),result.text,'utf8');
    else io.stdout.write(result.text);
    return result.exitCode;
  } catch(err) {io.stderr.write(`${err.name}: ${err.message}\n`);return 2;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await main();
