#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {parseRegister} from './integrity-core.mjs';
import {auditRegister,compareRegisters} from './integrity-audit.mjs';
import {reportText,reportJson,reportTsv,reviewHtml,comparisonText} from './integrity-report.mjs';

export const HELP=`Local source file integrity review
Usage: node docs/attribution/integrity-cli.mjs REGISTER.json [--format text|json|tsv|html] [--lang en|fr] [--previous OLD.json] [--output FILE]
Exit 0: no blocking gaps; 1: blocking gaps or introduced regression; 2: malformed input/arguments.
The command reads only files supplied on the command line. It does not fetch or submit data.
`;
export function parseArgs(args) {
  const result={file:null,previous:null,format:'text',lang:'en',output:null,help:false};
  if(!Array.isArray(args)) throw new TypeError('Expected argument list');
  for(let i=0;i<args.length;i++) {
    const arg=args[i];
    if(arg==='--help'||arg==='-h') {result.help=true;continue;}
    if(['--format','--lang','--previous','--output'].includes(arg)) {
      const next=args[++i];
      if(!next||next.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      const field={'--format':'format','--lang':'lang','--previous':'previous','--output':'output'}[arg];
      if(result[field]!==null&&(['previous','output'].includes(field))) throw new Error('Repeated argument');
      result[field]=next;
      continue;
    }
    if(arg.startsWith('-')||result.file!==null) throw new Error(`Unexpected argument ${arg}`);
    result.file=arg;
  }
  if(!result.help&&!result.file) throw new Error('A register path is required');
  if(!['text','json','tsv','html'].includes(result.format)) throw new Error('Unsupported format');
  if(!['en','fr'].includes(result.lang)) throw new Error('Unsupported language');
  return result;
}
export function renderCli(state,opts,previous=null) {
  const audit=auditRegister(state);
  const compare=previous===null?null:compareRegisters(previous,state);
  let body;
  if(opts.format==='text') body=reportText(state,opts.lang)+(compare?`\n${comparisonText(previous,state,opts.lang)}`:'');
  else if(opts.format==='json') body=JSON.stringify({schema:'map-source-file-integrity-cli/1',register:parseRegister(state),audit,comparison:compare},null,2)+'\n';
  else if(opts.format==='tsv') body=reportTsv(state);
  else body=reviewHtml(state,opts.lang);
  return {body,exitCode:audit.totals.block>0||compare?.worsened?1:0};
}
export async function runCli(argv,io={read:readFile,write:writeFile,out:text=>process.stdout.write(text),err:text=>process.stderr.write(text)}) {
  let options;
  try {options=parseArgs(argv);} catch(error) {io.err(`${error.message}\n${HELP}`);return 2;}
  if(options.help) {io.out(HELP);return 0;}
  try {
    const content=await io.read(options.file,'utf8');
    const state=parseRegister(content);
    const previous=options.previous===null?null:parseRegister(await io.read(options.previous,'utf8'));
    const result=renderCli(state,options,previous);
    if(options.output) await io.write(options.output,result.body,'utf8');
    else io.out(result.body);
    return result.exitCode;
  } catch(error) {
    io.err(`Input or export could not be processed: ${error.message}\n`);
    return 2;
  }
}
if(process.argv[1]&&import.meta.url===new URL(`file://${process.argv[1]}`).href) {
  process.exitCode=await runCli(process.argv.slice(2));
}
