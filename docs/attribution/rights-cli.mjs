/** Read-only rights matrix CLI with release-blocking exit codes. */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RIGHTS_MAX_BYTES, parseRightsMatrixJson } from './rights-core.mjs';
import { auditRightsMatrix } from './rights-audit.mjs';
import { compareRightsMatrices } from './rights-change.mjs';
import { renderRightsReport } from './rights-report.mjs';
export const RIGHTS_USAGE = 'Usage: rights-cli.mjs <matrix.json> [--lang en|fr] [--format text|html|json] [--before prior.json]';
export function parseRightsArgs(args) {
  if (!Array.isArray(args) || args.length === 0 || args.length === 1 && args[0] === '--help') {
    throw new Error(RIGHTS_USAGE);
  }
  let current = null;
  let before = null;
  let lang = 'en';
  let format = 'text';
  const seen = new Set();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (['--lang', '--format', '--before'].includes(arg)) {
      if (seen.has(arg)) throw new Error(`Repeated option: ${arg}`);
      seen.add(arg);
      const value = args[++i];
      if (typeof value !== 'string' || !value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      if (arg === '--lang') {
        if (value !== 'en' && value !== 'fr') throw new Error('Language must be en or fr');
        lang = value;
      } else if (arg === '--format') {
        if (!['text', 'html', 'json'].includes(value)) throw new Error('Format must be text, html or json');
        format = value;
      } else before = value;
    } else if (typeof arg !== 'string' || arg.startsWith('-')) throw new Error('Unknown argument');
    else if (current !== null) throw new Error('Only one current matrix is allowed');
    else current = arg;
  }
  if (!current) throw new Error('A current matrix path is required');
  return {current, before, lang, format};
}
async function load(path) {
  const full = resolve(path);
  const info = await stat(full);
  if (!info.isFile() || info.size > RIGHTS_MAX_BYTES) throw new Error('Expected bounded regular input file');
  const raw = await readFile(full, 'utf8');
  return parseRightsMatrixJson(raw);
}
export async function executeRightsCli(args) {
  try {
    const options = parseRightsArgs(args);
    const current = await load(options.current);
    const previous = options.before ? await load(options.before) : null;
    const audit = auditRightsMatrix(current);
    const comparison = previous ? compareRightsMatrices(previous, current) : null;
    const report = renderRightsReport(current, audit, options.lang, comparison);
    return {status: audit.blocked || comparison?.blocked ? 1 : 0, stdout: report[options.format], stderr: ''};
  } catch (error) {
    return {status: 2, stdout: '', stderr: error instanceof Error ? error.message : 'Unable to examine rights matrix'};
  }
}
function entry() {
  const path = process.argv[1];
  return typeof path === 'string' && resolve(path) === fileURLToPath(import.meta.url);
}
if (entry()) {
  void executeRightsCli(process.argv.slice(2)).then(result => {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(`${result.stderr}\n`);
    process.exitCode = result.status;
  }).catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Unable to examine rights matrix'}\n`);
    process.exitCode = 2;
  });
}
