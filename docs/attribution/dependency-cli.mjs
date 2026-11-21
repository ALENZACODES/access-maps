#!/usr/bin/env node
import {readFile, writeFile} from 'node:fs/promises';
import {auditInventory, compareInventories} from './dependency-audit.mjs';
import {reportText, coverageTsv, dependencyTsv, comparisonText} from './dependency-report.mjs';
import {parseInventory} from './dependency-core.mjs';

export const HELP = 'Usage: node dependency-cli.mjs inventory.json [--before earlier.json] [--lang en|fr] [--format text|json|coverage|edges|comparison] [--output path]';
export function parseArguments(argv) {
  const args = {input:null, before:null, lang:'en', format:'text', output:null};
  const seen = new Set();
  for(let i=0;i<argv.length;i++) {
    const token=argv[i];
    if(token==='--help' && argv.length===1)return {help:true};
    if(!token.startsWith('--')) {
      if(args.input!==null)throw new Error('Only one current inventory may be supplied');
      args.input=token;
      continue;
    }
    if(!['--before','--lang','--format','--output'].includes(token)||seen.has(token))throw new Error(`Unexpected or repeated option: ${token}`);
    seen.add(token);
    const value=argv[++i];
    if(!value||value.startsWith('--'))throw new Error(`Missing value for ${token}`);
    args[{'--before':'before','--lang':'lang','--format':'format','--output':'output'}[token]]=value;
  }
  if(!args.input)throw new Error('Inventory path required');
  if(!['en','fr'].includes(args.lang))throw new Error('Language must be en or fr');
  if(!['text','json','coverage','edges','comparison'].includes(args.format))throw new Error('Unknown output format');
  if(args.format==='comparison'&&!args.before)throw new Error('Comparison requires --before');
  return args;
}
export async function run(argv, io = {}) {
  const read = io.read ?? (path => readFile(path,'utf8'));
  const write = io.write ?? ((path,body) => writeFile(path,body,'utf8'));
  const stdout = io.stdout ?? (message => process.stdout.write(message));
  const stderr = io.stderr ?? (message => process.stderr.write(message));
  let args;
  try {args=parseArguments(argv);} catch(error) {stderr(`${error.message}\n${HELP}\n`);return 2;}
  if(args.help){stdout(`${HELP}\n`);return 0;}
  try {
    const inventory=parseInventory(await read(args.input));
    const earlier=args.before?parseInventory(await read(args.before)):null;
    const audit=auditInventory(inventory);
    let output;
    if(args.format==='json')output=`${JSON.stringify({inventory:inventory.schema,audit,comparison:earlier?compareInventories(earlier,inventory):null},null,2)}\n`;
    else if(args.format==='coverage')output=coverageTsv(inventory);
    else if(args.format==='edges')output=dependencyTsv(inventory);
    else if(args.format==='comparison')output=comparisonText(earlier,inventory,args.lang);
    else output=reportText(inventory,args.lang);
    if(args.output)await write(args.output,output);else stdout(output);
    return audit.counts.block>0?1:0;
  } catch(error) {
    stderr(`${error instanceof Error?error.message:'Invalid input'}\n`);
    return 2;
  }
}
if(process.argv[1] && import.meta.url===new URL(`file://${process.argv[1]}`).href){
  process.exitCode=await run(process.argv.slice(2));
}
