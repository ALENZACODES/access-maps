import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { parseTrace } from './trace-core.mjs';
import { parsePairs } from './parity-core.mjs';
import { auditParity } from './parity-audit.mjs';
import { findingReport, findingsTsv } from './parity-copy.mjs';

/** Deliberate local audit, never scheduled and never calls remote services. */
export function parseArgs(args) {
  if(args.length<2)throw new Error('Usage: parity-cli.mjs trace.json pairs.json [--locale en|fr] [--format text|json|tsv]');
  const [traceFile,pairsFile,...rest]=args;
  if(!traceFile||!pairsFile||traceFile.startsWith('--')||pairsFile.startsWith('--'))throw new Error('Two local files are required');
  let locale='en',format='text';
  for(let i=0;i<rest.length;i+=2){
    const key=rest[i],value=rest[i+1];
    if(key==='--locale'&&['en','fr'].includes(value))locale=value;
    else if(key==='--format'&&['text','json','tsv'].includes(value))format=value;
    else throw new Error(`Invalid option ${key}`);
  }
  return {traceFile,pairsFile,locale,format};
}
export async function runCli(args,read=readFile,write=text=>process.stdout.write(text),error=text=>process.stderr.write(text)) {
  let options;try {options=parseArgs(args);}catch(e){error(`${e.message}\n`);return 2;}
  try {
    const [traceText,pairsText]=await Promise.all([read(options.traceFile,'utf8'),read(options.pairsFile,'utf8')]);
    const trace=parseTrace(traceText),pairs=parsePairs(pairsText),result=auditParity(trace,pairs);
    const text=options.format==='json'?`${JSON.stringify(result,null,2)}\n`:
      options.format==='tsv'?findingsTsv(result):findingReport(result,options.locale);
    write(text);return result.blocked?1:0;
  }catch(e){error(`${e.message}\n`);return 2;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  process.exitCode=await runCli(process.argv.slice(2));
}
