/** Manual only. No timers, network calls, or automatic publication. */
import {readFile,writeFile} from 'node:fs/promises';
import {parseChain} from './chain-core.mjs';
import {auditChain} from './chain-audit.mjs';
import {compareChains} from './chain-diff.mjs';
import {reportText,diffText,summaryJson,tsvMatrix} from './chain-report.mjs';
export const HELP='Usage: node chain-cli.mjs input.json [--before old.json] [--lang en|fr] [--format text|json|tsv] [--output report.txt]\n';
function options(args){
  if(!args.length||args.includes('--help'))return {help:true};
  if(args[0].startsWith('-'))throw new TypeError('Input filename required');
  const opts={input:args[0],before:null,lang:'en',format:'text',output:null};
  const seen=new Set();
  for(let i=1;i<args.length;i+=2){
    const flag=args[i],value=args[i+1];
    if(!['--before','--lang','--format','--output'].includes(flag)||seen.has(flag)||!value||value.startsWith('--'))throw new TypeError(`Invalid argument ${flag}`);
    seen.add(flag);
    if(flag==='--before')opts.before=value;
    if(flag==='--lang')opts.lang=value;
    if(flag==='--format')opts.format=value;
    if(flag==='--output')opts.output=value;
  }
  if(!['en','fr'].includes(opts.lang))throw new TypeError('Language must be en or fr');
  if(!['text','json','tsv'].includes(opts.format))throw new TypeError('Format must be text, json or tsv');
  return opts;
}
export async function run(args,io={readFile,writeFile,stdout:process.stdout,stderr:process.stderr}){
  let opts;
  try{opts=options(args);}catch(error){io.stderr.write(`${error.message}\n${HELP}`);return 2;}
  if(opts.help){io.stdout.write(HELP);return 0;}
  let chain,previous;
  try{chain=parseChain(await io.readFile(opts.input,'utf8'));
    if(opts.before)previous=parseChain(await io.readFile(opts.before,'utf8'));
  }catch(error){io.stderr.write(`Invalid input: ${error.message}\n`);return 2;}
  const audit=auditChain(chain);
  const diff=previous?compareChains(previous,chain):null;
  let output;
  if(opts.format==='json')output=diff?`${JSON.stringify(diff,null,2)}\n`:summaryJson(chain);
  else if(opts.format==='tsv')output=tsvMatrix(chain);
  else output=diff?diffText(previous,chain,opts.lang):reportText(chain,opts.lang);
  if(opts.output){try{await io.writeFile(opts.output,output,'utf8');}catch(error){io.stderr.write(`Unable to write report: ${error.message}\n`);return 2;}}
  else io.stdout.write(output);
  return audit.counts.block||diff?.regression?1:0;
}
if(import.meta.url===`file://${process.argv[1]}`)process.exitCode=await run(process.argv.slice(2));
