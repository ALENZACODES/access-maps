/** Explicit local release gate. Read-only, no network or background actions. */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLAIM_MAX_BYTES, parseClaimTraceJson } from './claim-trace-core.mjs';
import { auditClaimTrace } from './claim-trace-audit.mjs';
import { compareClaimTraces } from './claim-trace-change.mjs';
import { renderClaimReport } from './claim-trace-report.mjs';

export const CLAIM_TRACE_USAGE = 'Usage: claim-trace-cli.mjs <release.json> [--before previous.json] [--lang en|fr] [--format text|json|html]';
function parseArgs(args) {
  if (!Array.isArray(args) || !args.length) throw new Error(CLAIM_TRACE_USAGE);
  let current = null; let before = null; let lang = 'en'; let format = 'text';
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--before', '--lang', '--format'].includes(arg)) {
      if (seen.has(arg)) throw new Error(`Repeated ${arg}`);
      seen.add(arg);
      const value = args[++i];
      if (!value || value.startsWith('-')) throw new Error(`Missing value for ${arg}`);
      if (arg === '--before') before = value;
      if (arg === '--lang') { if (!['en', 'fr'].includes(value)) throw new Error('Language must be en or fr'); lang = value; }
      if (arg === '--format') { if (!['text', 'json', 'html'].includes(value)) throw new Error('Format must be text, json or html'); format = value; }
    } else if (typeof arg !== 'string' || arg.startsWith('-')) throw new Error(`Unexpected argument ${String(arg)}`);
    else if (current !== null) throw new Error('Only one release file is supported');
    else current = arg;
  }
  if (!current) throw new Error(CLAIM_TRACE_USAGE);
  return {current, before, lang, format};
}
async function readBounded(path) {
  const absolute = resolve(path);
  const fileInfo = await stat(absolute);
  if (!fileInfo.isFile() || fileInfo.size > CLAIM_MAX_BYTES) throw new Error('Expected bounded regular file');
  const raw = await readFile(absolute, 'utf8');
  return parseClaimTraceJson(raw);
}
export async function executeClaimTraceCli(args) {
  let options;
  try { options = parseArgs(args); } catch (error) { return {status: 2, stdout: '', stderr: error instanceof Error ? error.message : 'Invalid arguments'}; }
  try {
    const trace = await readBounded(options.current);
    const audit = auditClaimTrace(trace);
    const comparison = options.before ? compareClaimTraces(await readBounded(options.before), trace) : null;
    const report = renderClaimReport(trace, audit, options.lang, comparison);
    return {status: audit.blocked || comparison?.blocked ? 1 : 0, stdout: report[options.format], stderr: ''};
  } catch (error) {
    return {status: 2, stdout: '', stderr: error instanceof Error ? error.message : 'Could not read local file'};
  }
}
function calledDirectly() {
  return typeof process.argv[1] === 'string' && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
if (calledDirectly()) {
  void executeClaimTraceCli(process.argv.slice(2)).then(({status, stdout, stderr}) => {
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(`${stderr}\n`);
    process.exitCode = status;
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Unable to examine trace'}\n`);
    process.exitCode = 2;
  });
}
