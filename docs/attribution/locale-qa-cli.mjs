/** Explicit local-only gate: exit 0 clear, 1 blocked, 2 invalid input. */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_BYTES, parseLocaleQaJson, auditLocaleQa, compareLocaleQa, renderLocaleQaReport } from './locale-qa-index.mjs';

export const USAGE = [
  'Usage: locale-qa-cli.mjs <release.json> [--before earlier.json] [--lang en|fr] [--format text|html|json]',
  'Reads only selected local files. Prints a report to stdout.',
  'Exit 0: no release blockers; 1: blocked; 2: invalid input or unreadable file.',
].join('\n');
export class LocaleQaCliError extends Error {
  constructor(message) { super(message); this.name = 'LocaleQaCliError'; }
}
export function parseLocaleQaArgs(args) {
  if (!Array.isArray(args) || args.length === 0) throw new LocaleQaCliError(USAGE);
  const seen = new Set();
  let input = null;
  let before = null;
  let locale = 'en';
  let format = 'text';
  for (let i = 0; i < args.length; i += 1) {
    const name = args[i];
    if (!name) throw new LocaleQaCliError('Empty argument');
    if (name === '--lang' || name === '--format' || name === '--before') {
      if (seen.has(name)) throw new LocaleQaCliError(`Repeated option ${name}`);
      seen.add(name);
      const value = args[i + 1];
      if (!value || value.startsWith('-')) throw new LocaleQaCliError(`Missing value for ${name}`);
      i += 1;
      if (name === '--lang') {
        if (!['en','fr'].includes(value)) throw new LocaleQaCliError('Language must be en or fr');
        locale = value;
      } else if (name === '--format') {
        if (!['text','html','json'].includes(value)) throw new LocaleQaCliError('Format must be text, html or json');
        format = value;
      } else before = value;
    } else if (name.startsWith('-')) throw new LocaleQaCliError(`Unknown option ${name}`);
    else if (input !== null) throw new LocaleQaCliError('Expected one release JSON path');
    else input = name;
  }
  if (!input) throw new LocaleQaCliError(USAGE);
  return { input, before, locale, format };
}
async function readBoundedJson(path) {
  const absolute = resolve(path);
  const info = await stat(absolute);
  if (!info.isFile() || info.size > MAX_BYTES) throw new LocaleQaCliError('A bounded regular local file is required');
  const contents = await readFile(absolute, 'utf8');
  return parseLocaleQaJson(contents);
}
export async function executeLocaleQaCli(args) {
  let options;
  try { options = parseLocaleQaArgs(args); }
  catch (error) { return { status: 2, stdout: '', stderr: error instanceof Error ? error.message : 'Invalid arguments' }; }
  try {
    const release = await readBoundedJson(options.input);
    const previous = options.before === null ? null : await readBoundedJson(options.before);
    const audit = auditLocaleQa(release);
    const comparison = previous ? compareLocaleQa(previous, release) : null;
    const reports = renderLocaleQaReport(release, audit, options.locale, comparison);
    return { status: audit.blocked || comparison?.blocked ? 1 : 0, stdout: reports[options.format], stderr: '' };
  } catch (error) {
    return { status: 2, stdout: '', stderr: error instanceof Error ? error.message : 'Cannot read local release' };
  }
}
export function isCliEntrypoint(argv = process.argv[1]) {
  return typeof argv === 'string' && resolve(argv) === fileURLToPath(import.meta.url);
}
if (isCliEntrypoint()) {
  void executeLocaleQaCli(process.argv.slice(2)).then(({ status, stdout, stderr }) => {
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(`${stderr}\n`);
    process.exitCode = status;
  }).catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Local audit error'}\n`);
    process.exitCode = 2;
  });
}
