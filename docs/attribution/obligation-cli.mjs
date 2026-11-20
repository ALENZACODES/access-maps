/** Read-only local CLI; no network, persistent data, or scheduled processing. */
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_OBLIGATION_BYTES, parseObligationJson } from './obligation-core.mjs';
import { auditObligationRegister } from './obligation-audit.mjs';
import { compareObligationRegisters } from './obligation-change.mjs';
import { renderObligationReport } from './obligation-report.mjs';

export const OBLIGATION_USAGE = [
  'Usage: obligation-cli.mjs <register.json> [--lang en|fr] [--format text|html|json]',
  '       obligation-cli.mjs <register.json> --before previous.json [--require-pairs]',
  'Reads only explicit local JSON files; no network requests or automatic scheduling.',
  'Exit 0: no blocking findings; 1: publication blocked; 2: invalid input.',
].join('\n');
export class ObligationCliError extends Error {
  constructor(message) { super(message); this.name = 'ObligationCliError'; }
}
function value(args, index, flag) {
  const next = args[index + 1];
  if (typeof next !== 'string' || !next.length || next.startsWith('--')) {
    throw new ObligationCliError(`Missing value for ${flag}`);
  }
  return next;
}
export function parseObligationArgs(args) {
  if (!Array.isArray(args) || args.length === 0 || (args.length === 1 && args[0] === '--help')) {
    throw new ObligationCliError(OBLIGATION_USAGE);
  }
  let current = null;
  let before = null;
  let locale = 'en';
  let format = 'text';
  let requirePairs = false;
  const seen = new Set();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (typeof arg !== 'string' || !arg.length) throw new ObligationCliError('Empty argument');
    if (['--lang', '--format', '--before'].includes(arg)) {
      if (seen.has(arg)) throw new ObligationCliError(`Repeated option ${arg}`);
      seen.add(arg);
      const next = value(args, i, arg);
      i += 1;
      if (arg === '--lang') {
        if (!['en', 'fr'].includes(next)) throw new ObligationCliError('Language must be en or fr');
        locale = next;
      } else if (arg === '--format') {
        if (!['text', 'html', 'json'].includes(next)) throw new ObligationCliError('Format must be text, html or json');
        format = next;
      } else before = next;
    } else if (arg === '--require-pairs') {
      if (seen.has(arg)) throw new ObligationCliError('Repeated --require-pairs');
      seen.add(arg);
      requirePairs = true;
    } else if (arg.startsWith('-')) {
      throw new ObligationCliError(`Unrecognised option ${arg}`);
    } else if (current !== null) {
      throw new ObligationCliError('Exactly one current register is required');
    } else current = arg;
  }
  if (current === null) throw new ObligationCliError('Current register path is required');
  return { current, before, locale, format, requirePairs };
}
async function readBounded(file) {
  const filename = resolve(file);
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink()) throw new ObligationCliError('Input must be a regular file');
  if (info.size > MAX_OBLIGATION_BYTES) throw new ObligationCliError('Input file exceeds maximum bytes');
  const raw = await readFile(filename, 'utf8');
  if (Buffer.byteLength(raw, 'utf8') > MAX_OBLIGATION_BYTES) throw new ObligationCliError('Input file exceeds maximum bytes');
  return parseObligationJson(raw);
}
export async function executeObligationCli(args) {
  let options;
  try { options = parseObligationArgs(args); } catch (error) {
    return { status: 2, stdout: '', stderr: error instanceof Error ? error.message : 'Invalid arguments' };
  }
  try {
    const current = await readBounded(options.current);
    const audit = auditObligationRegister(current, { requirePairs: options.requirePairs });
    const previous = options.before === null ? null : await readBounded(options.before);
    const comparison = previous === null ? null : compareObligationRegisters(previous, current, { requirePairs: options.requirePairs });
    const report = renderObligationReport(current, audit, options.locale, comparison);
    return { status: audit.blocked || comparison?.blocked ? 1 : 0, stdout: report[options.format], stderr: '' };
  } catch (error) {
    return { status: 2, stdout: '', stderr: error instanceof Error ? error.message : 'Unable to inspect register' };
  }
}
function isEntry() {
  const arg = process.argv[1];
  return typeof arg === 'string' && resolve(arg) === fileURLToPath(import.meta.url);
}
if (isEntry()) {
  void executeObligationCli(process.argv.slice(2)).then(({ status, stdout, stderr }) => {
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(`${stderr}\n`);
    process.exitCode = status;
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Unable to inspect register'}\n`);
    process.exitCode = 2;
  });
}
