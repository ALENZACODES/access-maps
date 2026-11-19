/** Explicit local command. It never sends, persists, or schedules source records. */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHandoffJson, MAX_HANDOFF_BYTES } from './handoff-core.mjs';
import { auditHandoffPack } from './handoff-audit.mjs';
import { compareHandoffPacks } from './handoff-change.mjs';
import { renderHandoffReport } from './handoff-report.mjs';

export const HANDOFF_USAGE = [
  'Usage: handoff-cli.mjs <pack.json> [--lang en|fr] [--format text|html|json]',
  '       handoff-cli.mjs <pack.json> --before <previous.json> [--date YYYY-MM-DD]',
  'Uses supplied local records only. Exit 0: no blockers, 1: blocked, 2: invalid input.',
].join('\n');
export class HandoffCliError extends Error {
  constructor(message) { super(message); this.name = 'HandoffCliError'; }
}
function requiredValue(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new HandoffCliError(`Missing value for ${flag}`);
  return value;
}
export function parseHandoffArgs(args) {
  if (!Array.isArray(args) || args.length === 0 || (args.length === 1 && args[0] === '--help')) {
    throw new HandoffCliError(HANDOFF_USAGE);
  }
  let input = null;
  let before = null;
  let locale = 'en';
  let format = 'text';
  let referenceDate = 'UNKNOWN';
  const flags = new Set();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (['--lang', '--format', '--before', '--date'].includes(arg)) {
      if (flags.has(arg)) throw new HandoffCliError(`Repeated ${arg}`);
      flags.add(arg);
      const value = requiredValue(args, i, arg);
      i += 1;
      if (arg === '--lang') {
        if (!['en', 'fr'].includes(value)) throw new HandoffCliError('Language must be en or fr');
        locale = value;
      } else if (arg === '--format') {
        if (!['text', 'html', 'json'].includes(value)) throw new HandoffCliError('Format must be text, html or json');
        format = value;
      } else if (arg === '--before') before = value;
      else if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) referenceDate = value;
      else throw new HandoffCliError('Date must use YYYY-MM-DD');
    } else if (typeof arg !== 'string' || arg.startsWith('-')) {
      throw new HandoffCliError(`Unexpected argument: ${String(arg)}`);
    } else if (input === null) input = arg;
    else throw new HandoffCliError('Supply exactly one current pack');
  }
  if (!input) throw new HandoffCliError(HANDOFF_USAGE);
  return { input, before, locale, format, referenceDate };
}
async function readBounded(path) {
  const full = resolve(path);
  const info = await stat(full);
  if (!info.isFile() || info.size > MAX_HANDOFF_BYTES) throw new HandoffCliError('Input must be a bounded regular file');
  const content = await readFile(full, 'utf8');
  if (Buffer.byteLength(content, 'utf8') > MAX_HANDOFF_BYTES) throw new HandoffCliError('File exceeds input limit');
  return parseHandoffJson(content);
}
export async function executeHandoffCli(args) {
  let parsed;
  try { parsed = parseHandoffArgs(args); }
  catch (error) {
    return { status: 2, stdout: '', stderr: error instanceof Error ? error.message : 'Invalid arguments' };
  }
  try {
    const pack = await readBounded(parsed.input);
    const audit = auditHandoffPack(pack, { referenceDate: parsed.referenceDate });
    const comparison = parsed.before
      ? compareHandoffPacks(await readBounded(parsed.before), pack, { referenceDate: parsed.referenceDate })
      : null;
    const result = renderHandoffReport(pack, audit, parsed.locale, comparison);
    return {
      status: audit.blocked || comparison?.blocked ? 1 : 0,
      stdout: result[parsed.format], stderr: '',
    };
  } catch (error) {
    return { status: 2, stdout: '', stderr: error instanceof Error ? error.message : 'Cannot read handoff file' };
  }
}
function isEntrypoint() {
  const path = process.argv[1];
  return typeof path === 'string' && resolve(path) === fileURLToPath(import.meta.url);
}
if (isEntrypoint()) {
  void executeHandoffCli(process.argv.slice(2)).then((result) => {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(`${result.stderr}\n`);
    process.exitCode = result.status;
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Cannot inspect file'}\n`);
    process.exitCode = 2;
  });
}
