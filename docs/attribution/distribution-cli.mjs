/** Explicit command-line gate. No writes, network operations or scheduled work. */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DISTRIBUTION_MAX_BYTES, parseDistributionJson } from './distribution-core.mjs';
import { auditDistribution } from './distribution-audit.mjs';
import { compareDistributions } from './distribution-change.mjs';
import { renderDistributionReport } from './distribution-report.mjs';
export const DISTRIBUTION_USAGE = 'Usage: distribution-cli.mjs <manifest.json> [--before old.json] [--lang en|fr] [--format text|html|json] [--require-pairs]';
export function parseDistributionArgs(args) {
  if (!Array.isArray(args) || !args.length) throw new Error(DISTRIBUTION_USAGE);
  let current = null;
  let before = null;
  let locale = 'en';
  let format = 'text';
  let requirePairs = false;
  const used = new Set();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--require-pairs') { if (used.has(arg)) throw new Error('Repeated option'); used.add(arg); requirePairs = true; continue; }
    if (['--lang', '--format', '--before'].includes(arg)) {
      if (used.has(arg)) throw new Error(`Repeated option: ${arg}`);
      used.add(arg);
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing ${arg} value`);
      if (arg === '--lang') { if (!['en', 'fr'].includes(value)) throw new Error('Unknown language'); locale = value; }
      if (arg === '--format') { if (!['text', 'html', 'json'].includes(value)) throw new Error('Unknown format'); format = value; }
      if (arg === '--before') before = value;
    } else if (typeof arg !== 'string' || arg.startsWith('-')) throw new Error(`Unexpected option: ${String(arg)}`);
    else if (current !== null) throw new Error('Only one current manifest is accepted');
    else current = arg;
  }
  if (!current) throw new Error(DISTRIBUTION_USAGE);
  return { current, before, locale, format, requirePairs };
}
async function loadLocal(path) {
  const location = resolve(path);
  const meta = await stat(location);
  if (!meta.isFile() || meta.size > DISTRIBUTION_MAX_BYTES) throw new Error('Input must be a bounded local file');
  const content = await readFile(location, 'utf8');
  return parseDistributionJson(content);
}
export async function executeDistributionCli(args) {
  let options;
  try { options = parseDistributionArgs(args); }
  catch (error) { return { status: 2, stdout: '', stderr: error instanceof Error ? error.message : 'Invalid arguments' }; }
  try {
    const current = await loadLocal(options.current);
    const flags = { requirePairs: options.requirePairs };
    const audit = auditDistribution(current, flags);
    const comparison = options.before ? compareDistributions(await loadLocal(options.before), current, flags) : null;
    const report = renderDistributionReport(current, audit, options.locale, comparison);
    return { status: audit.blocked || comparison?.blocked ? 1 : 0, stdout: report[options.format], stderr: '' };
  } catch (error) { return { status: 2, stdout: '', stderr: error instanceof Error ? error.message : 'Unable to inspect local manifest' }; }
}
function isEntrypoint() { const arg = process.argv[1]; return Boolean(arg && resolve(arg) === fileURLToPath(import.meta.url)); }
if (isEntrypoint()) {
  void executeDistributionCli(process.argv.slice(2)).then(result => {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(`${result.stderr}\n`);
    process.exitCode = result.status;
  }).catch(error => { process.stderr.write(`${error instanceof Error ? error.message : 'Unexpected error'}\n`); process.exitCode = 2; });
}
