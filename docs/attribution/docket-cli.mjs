/** Explicit local review gate: no network, no background work, no writes. */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocketJson, isoDate, MAX_BYTES } from './docket-core.mjs';
import { auditDocket } from './docket-audit.mjs';
import { compareDockets } from './docket-change.mjs';
import { renderDocketText, renderDocketHtml, renderDocketJson } from './docket-report.mjs';

export const DOCKET_USAGE = [
  'Usage: docket-cli.mjs release.json [--as-of YYYY-MM-DD] [--before old.json]',
  '       docket-cli.mjs release.json [--lang en|fr] [--format text|html|json]',
  'Reads local evidence only. Status 0: no blocks; 1: blocked; 2: input error.',
].join('\n');
export function parseDocketArgs(args) {
  if (!Array.isArray(args) || args.length === 0 || args.includes('--help')) {
    throw new Error(DOCKET_USAGE);
  }
  const result = { file: null, before: null, locale: 'en', format: 'text', asOf: null };
  const flags = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const part = args[index];
    if (['--before', '--lang', '--format', '--as-of'].includes(part)) {
      if (flags.has(part)) throw new Error(`Repeated option ${part}`);
      flags.add(part);
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${part}`);
      if (part === '--before') result.before = value;
      if (part === '--lang') {
        if (!['en', 'fr'].includes(value)) throw new Error('Language must be en or fr');
        result.locale = value;
      }
      if (part === '--format') {
        if (!['text', 'html', 'json'].includes(value)) throw new Error('Format must be text, html or json');
        result.format = value;
      }
      if (part === '--as-of') result.asOf = isoDate(value, '--as-of');
    } else if (typeof part !== 'string' || part.startsWith('-')) {
      throw new Error(`Unexpected option ${String(part)}`);
    } else if (result.file !== null) {
      throw new Error('Only one current docket may be supplied');
    } else result.file = part;
  }
  if (!result.file) throw new Error(DOCKET_USAGE);
  return result;
}
async function readLocal(filename) {
  const path = resolve(filename);
  const info = await stat(path);
  if (!info.isFile() || info.size > MAX_BYTES) throw new Error('Input must be a bounded regular file');
  const raw = await readFile(path, 'utf8');
  return parseDocketJson(raw);
}
export async function executeDocketCli(args) {
  let options;
  try { options = parseDocketArgs(args); }
  catch (error) {
    return { status: 2, output: '', error: error instanceof Error ? error.message : 'Invalid command' };
  }
  try {
    const docket = await readLocal(options.file);
    const audit = auditDocket(docket, { asOf: options.asOf ?? docket.asOf });
    const comparison = options.before ? compareDockets(await readLocal(options.before), docket) : null;
    const output = options.format === 'json'
      ? renderDocketJson(docket, audit, comparison)
      : options.format === 'html'
        ? renderDocketHtml(docket, audit, options.locale, comparison)
        : renderDocketText(docket, audit, options.locale, comparison);
    return { status: audit.blocked || comparison?.blocked ? 1 : 0, output, error: '' };
  } catch (error) {
    return { status: 2, output: '', error: error instanceof Error ? error.message : 'Unable to inspect docket' };
  }
}
function isEntryPoint() {
  const arg = process.argv[1];
  return typeof arg === 'string' && resolve(arg) === fileURLToPath(import.meta.url);
}
if (isEntryPoint()) {
  void executeDocketCli(process.argv.slice(2)).then(({ status, output, error }) => {
    if (output) process.stdout.write(output);
    if (error) process.stderr.write(`${error}\n`);
    process.exitCode = status;
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Unable to inspect docket'}\n`);
    process.exitCode = 2;
  });
}
