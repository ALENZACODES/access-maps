#!/usr/bin/env node
/** Explicit local attribution observation gate; no network, clocks or background tasks. */
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { parseJournal } from './observation-core.mjs';
import { auditJournal, auditComparison, renderAuditText } from './observation-audit.mjs';

export const HELP = [
  'Usage: node docs/attribution/observation-cli.mjs JOURNAL.json [options]',
  'Options:',
  '  --language en|fr       Language for the text report (default en)',
  '  --format text|json     Report format (default text)',
  '  --before EARLIER.json  Compare with an earlier journal',
  '  --output FILE          Write the report to this local file',
  '  --help                 Show this help',
  '',
  'Exit 0: supplied included views have no blocking evidence gaps.',
  'Exit 1: evidence gaps or removed included views.',
  'Exit 2: invalid arguments, input or file operation.',
  'Nothing is retrieved from a provider or transmitted over the network.',
].join('\n');
export function parseOptions(args) {
  const options = {file:null, language:'en', format:'text', before:null, output:null, help:false};
  for (let i=0;i<args.length;i++) {
    const token=args[i];
    if (token==='--help') { options.help=true; continue; }
    if (token==='--language'||token==='--format'||token==='--before'||token==='--output') {
      const value=args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
      const key=token==='--language'?'language':token==='--format'?'format':token==='--before'?'before':'output';
      if (options[key] !== (key==='language'?'en':key==='format'?'text':null)) throw new Error(`Repeated ${token}`);
      options[key]=value;
      continue;
    }
    if (token.startsWith('-')) throw new Error(`Unknown option ${token}`);
    if (options.file) throw new Error('Exactly one journal filename is expected');
    options.file=token;
  }
  if (!options.help && !options.file) throw new Error('Journal filename is required');
  if (!['en','fr'].includes(options.language)) throw new Error('Unsupported language');
  if (!['text','json'].includes(options.format)) throw new Error('Unsupported format');
  return options;
}
function formatComparison(value, locale) {
  const heading=locale==='fr'?'Comparaison des observations':'Observation comparison';
  const separator=locale==='fr'?'\u00a0:':':';
  const entries=[heading, '',
    `${locale==='fr'?'Nouveaux écarts':'New gaps'}${separator} ${value.introduced.length}`,
    `${locale==='fr'?'Écarts résolus':'Resolved gaps'}${separator} ${value.resolved.length}`,
    `${locale==='fr'?'Vues incluses retirées':'Removed included views'}${separator} ${value.removedIncludedViews.join(', ')||'none'}`, ''];
  for (const issue of value.introduced) entries.push(`+ ${issue.code} ${issue.viewId}/${issue.sourceId}/${issue.method}`);
  for (const issue of value.resolved) entries.push(`- ${issue.code} ${issue.viewId}/${issue.sourceId}/${issue.method}`);
  return `${entries.join('\n')}\n`;
}
export async function run(args, io={read:readFile,write:writeFile,out:x=>process.stdout.write(x),err:x=>process.stderr.write(x)}) {
  let options;
  try { options=parseOptions(args); }
  catch(error) {io.err(`${error.message}\n${HELP}\n`);return 2;}
  if(options.help) {io.out(`${HELP}\n`);return 0;}
  try {
    const current=parseJournal(await io.read(resolve(options.file),'utf8'));
    const audit=auditJournal(current);
    const previous=options.before?parseJournal(await io.read(resolve(options.before),'utf8')):null;
    const comparison=previous?auditComparison(previous,current):null;
    const report=options.format==='json'?JSON.stringify({audit,comparison},null,2)+'\n':
      renderAuditText(current,options.language)+(comparison?'\n'+formatComparison(comparison,options.language):'');
    if(options.output) await io.write(resolve(options.output),report,'utf8');
    else io.out(report);
    return audit.totals.blocking||audit.totals.included===0||comparison?.worsened||comparison?.removedIncludedViews.length?1:0;
  } catch(error) {
    io.err(`Observation journal could not be assessed: ${error.message}\n`);
    return 2;
  }
}
function invokedDirectly() {
  return process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href;
}
if(invokedDirectly()) process.exitCode=await run(process.argv.slice(2));
