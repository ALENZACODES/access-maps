/** Explicit, read-only offline CLI. Node >=22. No network or scheduled activity. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTierLedgerJson } from './tier-ledger.mjs';
import { auditTierLedger, compareTierLedgers } from './tier-audit.mjs';
import { renderTierText, renderTierHtml, renderTierJson, renderComparisonText, renderComparisonHtml } from './tier-report.mjs';
export class TierCliError extends Error { constructor(message) {super(message);this.name='TierCliError';} }
const USAGE = 'Usage: node docs/attribution/tier-cli.mjs ledger.json [--lang en|fr] [--format text|html|json] [--before old.json] [--date YYYY-MM-DD]';
export function parseTierCliArgs(args) {
  if (!Array.isArray(args) || !args.length) throw new TierCliError(USAGE);
  let file=null, before=null, locale='en', format='text', date='UNKNOWN';
  const used=new Set();
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(['--lang','--format','--before','--date'].includes(arg)){
      if(used.has(arg))throw new TierCliError(`Repeated option ${arg}`);
      used.add(arg);
      const value=args[++i];
      if(!value||value.startsWith('--'))throw new TierCliError(`Missing value for ${arg}`);
      if(arg==='--lang')locale=value;
      if(arg==='--format')format=value;
      if(arg==='--before')before=value;
      if(arg==='--date')date=value;
    }else if(typeof arg==='string' && arg.startsWith('-'))throw new TierCliError(`Unknown option ${arg}`);
    else if(!file)file=arg;
    else throw new TierCliError('Expected one current ledger');
  }
  if(!file)throw new TierCliError(USAGE);
  if(!['en','fr'].includes(locale))throw new TierCliError('Language must be en or fr');
  if(!['text','html','json'].includes(format))throw new TierCliError('Unknown output format');
  if(date!=='UNKNOWN' && !/^\d{4}-\d{2}-\d{2}$/u.test(date))throw new TierCliError('Invalid date');
  return Object.freeze({file,before,locale,format,date});
}
export async function executeTierCli(args, read = readFile) {
  let options;
  try {options=parseTierCliArgs(args);}catch(error){return {status:2,output:'',error:error.message};}
  try {
    const current=parseTierLedgerJson(await read(resolve(options.file),'utf8'));
    const previous=options.before?parseTierLedgerJson(await read(resolve(options.before),'utf8')):null;
    const config={asOf:options.date};
    const audit=auditTierLedger(current,config);
    const comparison=previous?compareTierLedgers(previous,current,config):null;
    const blocked=audit.blocked||Boolean(comparison?.blocked);
    let output;
    if(options.format==='json')output=`${JSON.stringify({schema:'attribution-tier-cli/1',ledger:current,audit,comparison},null,2)}\n`;
    else if(options.format==='html'){
      output=renderTierHtml(current,options.locale,audit);
      if(previous)output=output.replace('</main>',`${renderComparisonHtml(previous,current,options.locale,config)}</main>`);
    }
    else output=renderTierText(current,options.locale,audit)+(previous?`\n${renderComparisonText(previous,current,options.locale,config)}`:'');
    return {status:blocked?1:0,output,error:''};
  }catch(error){return {status:2,output:'',error:error instanceof Error?error.message:'Unable to read ledger'};}
}
function isEntrypoint(){return Boolean(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url));}
if(isEntrypoint()){
  void executeTierCli(process.argv.slice(2)).then(({status,output,error})=>{
    if(output)process.stdout.write(output);
    if(error)process.stderr.write(`${error}\n`);
    process.exitCode=status;
  }).catch(error=>{process.stderr.write(`${error instanceof Error?error.message:'Unable to inspect ledger'}\n`);process.exitCode=2;});
}
