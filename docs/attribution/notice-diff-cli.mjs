/** Explicit local CLI. No network access, persistence, or background work. */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_DOCUMENT_BYTES, parseNoticeReleaseJson } from './notice-diff-core.mjs';
import { auditNoticeRelease } from './notice-diff-audit.mjs';
import { compareNoticeReleases } from './notice-diff-change.mjs';
import { renderNoticeReport } from './notice-diff-report.mjs';

export const NOTICE_CLI_USAGE = [
  'Usage: notice-diff-cli.mjs <release.json> [--before previous.json] [--lang en|fr] [--format text|json|html]',
  '       notice-diff-cli.mjs <release.json> --today YYYY-MM-DD --require-pairs --format json',
  'Checks only locally supplied evidence. No files are written.',
  'Exit 0: no blocking findings; 1: publication blocked; 2: invalid input.',
].join('\n');
export class NoticeCliError extends Error {
  constructor(message) { super(message); this.name = 'NoticeCliError'; }
}
function value(args, pos, flag) {
  const val = args[pos + 1];
  if (typeof val !== 'string' || !val || val.startsWith('--')) throw new NoticeCliError(`Missing value for ${flag}`);
  return val;
}
export function parseNoticeCliArgs(args) {
  if (!Array.isArray(args) || args.length === 0) throw new NoticeCliError(NOTICE_CLI_USAGE);
  let current = null, before = null, lang = 'en', format = 'text', today = 'UNKNOWN';
  let requirePairs = false, allowOnline = false;
  const seen = new Set();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (typeof arg !== 'string' || !arg) throw new NoticeCliError('Invalid argument');
    if (['--before', '--lang', '--format', '--today'].includes(arg)) {
      if (seen.has(arg)) throw new NoticeCliError(`Duplicate option ${arg}`);
      seen.add(arg);
      const next = value(args, i, arg);
      i += 1;
      if (arg === '--before') before = next;
      if (arg === '--lang') {
        if (!['en', 'fr'].includes(next)) throw new NoticeCliError('Language must be en or fr');
        lang = next;
      }
      if (arg === '--format') {
        if (!['text', 'json', 'html'].includes(next)) throw new NoticeCliError('Format must be text, json or html');
        format = next;
      }
      if (arg === '--today') {
        if (!/^\d{4}-\d{2}-\d{2}$/u.test(next)) throw new NoticeCliError('Expected YYYY-MM-DD');
        today = next;
      }
    } else if (arg === '--require-pairs' || arg === '--allow-online') {
      if (seen.has(arg)) throw new NoticeCliError(`Duplicate option ${arg}`);
      seen.add(arg);
      if (arg === '--require-pairs') requirePairs = true;
      else allowOnline = true;
    } else if (arg.startsWith('-')) throw new NoticeCliError(`Unexpected option ${arg}`);
    else if (current !== null) throw new NoticeCliError('Expected exactly one current release file');
    else current = arg;
  }
  if (!current) throw new NoticeCliError(NOTICE_CLI_USAGE);
  return Object.freeze({ current, before, lang, format, today, requirePairs, allowOnline });
}
async function readBounded(file) {
  const path = resolve(file);
  const info = await stat(path);
  if (!info.isFile() || info.size > MAX_DOCUMENT_BYTES) throw new NoticeCliError('Input must be a bounded regular local file');
  const raw = await readFile(path, 'utf8');
  if (new TextEncoder().encode(raw).byteLength > MAX_DOCUMENT_BYTES) throw new NoticeCliError('Input exceeds maximum bytes');
  return parseNoticeReleaseJson(raw);
}
export async function executeNoticeCli(args) {
  let opts;
  try { opts = parseNoticeCliArgs(args); }
  catch (err) { return { status: 2, stdout: '', stderr: err instanceof Error ? err.message : 'Invalid arguments' }; }
  try {
    const current = await readBounded(opts.current);
    const settings = { today: opts.today, requireOffline: !opts.allowOnline, requireLanguagePairs: opts.requirePairs };
    const audit = auditNoticeRelease(current, settings);
    const comparison = opts.before === null ? null : compareNoticeReleases(await readBounded(opts.before), current, settings);
    const report = renderNoticeReport(current, audit, opts.lang, comparison);
    return { status: audit.blocked || comparison?.blocked ? 1 : 0, stdout: report[opts.format], stderr: '' };
  } catch (err) {
    return { status: 2, stdout: '', stderr: err instanceof Error ? err.message : 'Could not read supplied evidence' };
  }
}
function entrypoint() {
  return typeof process.argv[1] === 'string' && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
if (entrypoint()) {
  void executeNoticeCli(process.argv.slice(2)).then(result => {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(`${result.stderr}\n`);
    process.exitCode = result.status;
  }).catch(err => {
    process.stderr.write(`${err instanceof Error ? err.message : 'Unexpected failure'}\n`);
    process.exitCode = 2;
  });
}
