#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {parseChecklist} from './checklist-core.mjs';
import {auditChecklist,compareChecklists,checklistMatrix,matrixTsv} from './checklist-audit.mjs';
import {reportText} from './checklist-copy.mjs';

export const USAGE='Usage: node checklist-cli.mjs checklist.json [--before prior.json] [--lang en|fr] [--format text|json|tsv]\n';
export function parseArgs(args){
  if(!Array.isArray(args)||!args.length||!args[0]||args[0].startsWith('--'))throw new Error(USAGE);
  const config={file:args[0],before:null,lang:'en',format:'text'};
  const seen=new Set();
  for(let i=1;i<args.length;i+=2){
    const key=args[i],value=args[i+1];
    if(!['--before','--lang','--format'].includes(key)||!value||seen.has(key))throw new Error(USAGE);
    seen.add(key);
    if(key==='--before')config.before=value;
    if(key==='--lang'){if(!['en','fr'].includes(value))throw new Error(USAGE);config.lang=value;}
    if(key==='--format'){if(!['text','json','tsv'].includes(value))throw new Error(USAGE);config.format=value;}
  }
  if(args.length%2===0)throw new Error(USAGE);
  return config;
}
export function formatAudit(input,options={}){
  const audit=auditChecklist(input);
  const comparison=options.before?compareChecklists(options.before,input):null;
  const format=options.format??'text';
  const lang=options.lang==='fr'?'fr':'en';
  if(format==='tsv')return matrixTsv(checklistMatrix(input));
  if(format==='json')return JSON.stringify({audit,comparison},null,2)+'\n';
  let text=reportText(audit,lang);
  if(comparison){
    const labels=lang==='fr'?['Nouvelles lacunes','Lacunes résolues','Vues retirées']:['Introduced gaps','Resolved gaps','Removed views'];
    const sep=lang==='fr'?'\u00a0:':':';
    text+='\n'+`${labels[0]}${sep} ${comparison.introduced.length}\n${labels[1]}${sep} ${comparison.resolved.length}\n${labels[2]}${sep} ${comparison.droppedViews.join(', ')||'UNKNOWN'}\n`;
  }
  return text;
}
export async function run(args,io={}){
  const write=io.write??(value=>process.stdout.write(value));
  const error=io.error??(value=>process.stderr.write(value));
  const read=io.read??(path=>readFile(path,'utf8'));
  let options;
  try{options=parseArgs(args);}catch(err){error(err.message);return 2;}
  try{
    const input=parseChecklist(await read(options.file));
    const before=options.before?parseChecklist(await read(options.before)):null;
    const audit=auditChecklist(input);
    const comparison=before?compareChecklists(before,input):null;
    write(formatAudit(input,{...options,before}));
    return audit.totals.block||comparison?.blocking?1:0;
  }catch(err){error(`${err.name||'Error'}: ${err.message}\n`);return 2;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const code=await run(process.argv.slice(2));process.exitCode=code;
}
