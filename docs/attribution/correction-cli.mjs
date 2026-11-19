/** Explicit local correction audit CLI. No networking, clock inference or scheduling. */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORRECTION_MAX_BYTES, parseCorrectionJson } from './correction-core.mjs';
import { auditCorrections } from './correction-audit.mjs';
import { compareCorrections } from './correction-change.mjs';
import { correctionFormats } from './correction-report.mjs';
export const CORRECTION_USAGE = [
  'Usage: correction-cli.mjs <register.json> [--before prior.json] [--lang en|fr]',
  '       [--format text|html|json] [--date YYYY-MM-DD] [--require-offline]',
  'Read local attribution correction records and block release on missing evidence.',
  'Exit 0: clear; exit 1: blocking findings; exit 2: invalid input or options.',
].join('\n');
export class CorrectionCliError extends Error {
  constructor(message) { super(message); this.name = 'CorrectionCliError'; }
}
export function parseCorrectionArguments(args) {
  if (!Array.isArray(args) || args.length === 0 || args.includes('--help')) throw new CorrectionCliError(CORRECTION_USAGE);
  const options={file:null,before:null,lang:'en',format:'text',date:'UNKNOWN',requireOffline:false};
  const seen=new Set();
  for(let i=0;i<args.length;i++) {
    const arg=args[i];
    if(typeof arg!=='string'||!arg) throw new CorrectionCliError('Invalid argument');
    if(['--before','--lang','--format','--date'].includes(arg)) {
      if(seen.has(arg)) throw new CorrectionCliError(`Repeated option ${arg}`);
      seen.add(arg);
      const value=args[++i];
      if(!value||value.startsWith('--')) throw new CorrectionCliError(`Missing value for ${arg}`);
      if(arg==='--before') options.before=value;
      if(arg==='--lang') {
        if(!['en','fr'].includes(value)) throw new CorrectionCliError('Language must be en or fr');
        options.lang=value;
      }
      if(arg==='--format') {
        if(!['text','html','json'].includes(value)) throw new CorrectionCliError('Format must be text, html or json');
        options.format=value;
      }
      if(arg==='--date') {
        if(!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new CorrectionCliError('Date must use YYYY-MM-DD');
        options.date=value;
      }
    } else if(arg==='--require-offline') {
      if(seen.has(arg)) throw new CorrectionCliError('Repeated --require-offline');
      seen.add(arg); options.requireOffline=true;
    } else if(arg.startsWith('-')) throw new CorrectionCliError(`Unknown option ${arg}`);
    else if(options.file!==null) throw new CorrectionCliError('Expected exactly one register path');
    else options.file=arg;
  }
  if(!options.file) throw new CorrectionCliError('Register file required');
  return options;
}
export async function readCorrectionFile(file) {
  const path=resolve(file);
  const info=await stat(path);
  if(!info.isFile()) throw new CorrectionCliError('Expected regular file');
  if(info.size>CORRECTION_MAX_BYTES) throw new CorrectionCliError('File too large');
  const raw=await readFile(path,'utf8');
  if(new TextEncoder().encode(raw).length>CORRECTION_MAX_BYTES) throw new CorrectionCliError('File too large');
  return parseCorrectionJson(raw);
}
export async function executeCorrectionCli(args) {
  let options;
  try { options=parseCorrectionArguments(args); }
  catch(error) {return {status:2,stdout:'',stderr:error instanceof Error?error.message:'Invalid options'};}
  try {
    const current=await readCorrectionFile(options.file);
    const auditOptions={today:options.date,requireOffline:options.requireOffline};
    const audit=auditCorrections(current,auditOptions);
    const before=options.before?await readCorrectionFile(options.before):null;
    const comparison=before?compareCorrections(before,current,auditOptions):null;
    const reports=correctionFormats(current,audit,options.lang,comparison);
    return {status:audit.blocked||comparison?.blocked?1:0,stdout:reports[options.format],stderr:''};
  } catch(error) {
    return {status:2,stdout:'',stderr:error instanceof Error?error.message:'Unable to inspect file'};
  }
}
function isEntrypoint() {
  return typeof process.argv[1]==='string' && resolve(process.argv[1])===fileURLToPath(import.meta.url);
}
if(isEntrypoint()) {
  void executeCorrectionCli(process.argv.slice(2)).then(({status,stdout,stderr})=>{
    if(stdout) process.stdout.write(stdout);
    if(stderr) process.stderr.write(`${stderr}\n`);
    process.exitCode=status;
  }).catch(error=>{
    process.stderr.write(`${error instanceof Error?error.message:'Unable to inspect correction records'}\n`);
    process.exitCode=2;
  });
}
