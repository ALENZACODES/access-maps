/** Read-only local coverage gate. Importing this module never starts the CLI. */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_DOCUMENT_BYTES, parseCoverageJson } from './coverage-core.mjs';
import { auditCoverage } from './coverage-audit.mjs';
import { compareCoverage } from './coverage-change.mjs';
import { renderCoverage } from './coverage-report.mjs';

export const USAGE = [
  'Usage: coverage-cli <candidate.json> [--previous <previous.json>] [--lang en|fr] [--format text|html|json]',
  '       coverage-cli <candidate.json> [--date YYYY-MM-DD] [--allow-online]',
  'Exit 0: no blocking findings; 1: publication blocked; 2: invalid input or file error.',
].join('\n');
export class CoverageCliError extends Error {
  constructor(message) { super(message); this.name = 'CoverageCliError'; }
}
export function parseCoverageArgs(args) {
  if (!Array.isArray(args) || !args.length) throw new CoverageCliError(USAGE);
  if (args.length === 1 && args[0] === '--help') throw new CoverageCliError(USAGE);
  let candidate = null; let previous = null; let language = 'en'; let format = 'text';
  let date = 'UNKNOWN'; let requireOffline = true;
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--previous' || arg === '--lang' || arg === '--format' || arg === '--date') {
      if (seen.has(arg)) throw new CoverageCliError(`Repeated option: ${arg}`);
      seen.add(arg);
      const value = args[i + 1];
      if (!value || value.startsWith('--')) throw new CoverageCliError(`Missing value for ${arg}`);
      i++;
      if (arg === '--previous') previous = value;
      if (arg === '--lang') { if (!['en','fr'].includes(value)) throw new CoverageCliError('Language must be en or fr'); language = value; }
      if (arg === '--format') { if (!['text','html','json'].includes(value)) throw new CoverageCliError('Format must be text, html or json'); format = value; }
      if (arg === '--date') { if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new CoverageCliError('Date must be YYYY-MM-DD'); date = value; }
    } else if (arg === '--allow-online') {
      if (seen.has(arg)) throw new CoverageCliError('Repeated option');
      seen.add(arg); requireOffline = false;
    } else if (typeof arg !== 'string' || arg.startsWith('-')) throw new CoverageCliError(`Unexpected option: ${String(arg)}`);
    else if (!candidate) candidate = arg;
    else throw new CoverageCliError('Exactly one candidate file is required');
  }
  if (!candidate) throw new CoverageCliError('Candidate JSON file required');
  if (candidate === previous) throw new CoverageCliError('Previous and candidate files must differ');
  return Object.freeze({candidate, previous, language, format, date, requireOffline});
}

async function readBounded(file) {
  const path = resolve(file);
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size > MAX_DOCUMENT_BYTES) throw new CoverageCliError('File is missing, not regular or too large');
  const raw = await readFile(path, 'utf8');
  if (new TextEncoder().encode(raw).length > MAX_DOCUMENT_BYTES) throw new CoverageCliError('File exceeds size limit');
  return parseCoverageJson(raw);
}

export async function runCoverageCli(args, dependencies = {}) {
  let options;
  try { options = parseCoverageArgs(args); }
  catch (error) { return {status: 2, stdout: '', stderr: error instanceof Error ? error.message : 'Invalid arguments'}; }
  try {
    const read = dependencies.read ?? readBounded;
    const candidate = await read(options.candidate);
    const previous = options.previous === null ? null : await read(options.previous);
    const auditOptions = {today: options.date, requireOffline: options.requireOffline};
    const audit = auditCoverage(candidate, auditOptions);
    const comparison = previous ? compareCoverage(previous, candidate, auditOptions) : null;
    const reports = renderCoverage(candidate, audit, options.language, comparison);
    return {status: audit.blocked || comparison?.blocked ? 1 : 0,
      stdout: reports[options.format], stderr: ''};
  } catch (error) {
    return {status: 2, stdout: '', stderr: error instanceof Error ? error.message : 'Cannot inspect coverage'};
  }
}

function isEntrypoint() {
  const argument = process.argv[1];
  return typeof argument === 'string' && resolve(argument) === fileURLToPath(import.meta.url);
}
if (isEntrypoint()) {
  void runCoverageCli(process.argv.slice(2)).then((result) => {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(`${result.stderr}\n`);
    process.exitCode = result.status;
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Cannot inspect coverage'}\n`);
    process.exitCode = 2;
  });
}
