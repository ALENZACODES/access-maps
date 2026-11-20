/** Explicit local-file release gate. No network calls or write side effects. */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAccessReviewJson, REVIEW_MAX_BYTES } from './access-review-core.mjs';
import { auditAccessReview } from './access-review-audit.mjs';
import { compareAccessReviews } from './access-review-change.mjs';
import { renderAccessReviewText, renderAccessReviewHtml, renderAccessReviewJson } from './access-review-report.mjs';

export const ACCESS_REVIEW_USAGE = [
  'Usage: access-review-cli.mjs <release.json> [--before prior.json] [--lang en|fr] [--format text|json|html]',
  'Optional: --require-paired --require-offline --require-evidence-links',
  'Exit 0: no blockers; 1: blocking evidence gap; 2: invalid input or arguments.',
].join('\n');
export class ReviewCliError extends Error {
  constructor(reason) { super(reason); this.name = 'ReviewCliError'; }
}
function optionValue(args, i, key) {
  const value = args[i + 1];
  if (typeof value !== 'string' || !value || value.startsWith('-')) throw new ReviewCliError(`Missing argument for ${key}`);
  return value;
}
export function parseAccessReviewArgs(args) {
  if (!Array.isArray(args) || !args.length || args.includes('--help')) throw new ReviewCliError(ACCESS_REVIEW_USAGE);
  const used = new Set();
  let current = null;
  let before = null;
  let lang = 'en';
  let format = 'text';
  let requirePaired = false;
  let requireOffline = false;
  let requireEvidenceUrls = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (typeof arg !== 'string' || !arg) throw new ReviewCliError('Empty argument');
    if (['--before', '--lang', '--format'].includes(arg)) {
      if (used.has(arg)) throw new ReviewCliError(`Repeated option ${arg}`);
      used.add(arg);
      const v = optionValue(args, i, arg);
      i += 1;
      if (arg === '--before') before = v;
      if (arg === '--lang') {
        if (!['en', 'fr'].includes(v)) throw new ReviewCliError('Language must be en or fr');
        lang = v;
      }
      if (arg === '--format') {
        if (!['text', 'html', 'json'].includes(v)) throw new ReviewCliError('Format must be text, html or json');
        format = v;
      }
    } else if (['--require-paired', '--require-offline', '--require-evidence-links'].includes(arg)) {
      if (used.has(arg)) throw new ReviewCliError(`Repeated option ${arg}`);
      used.add(arg);
      if (arg === '--require-paired') requirePaired = true;
      if (arg === '--require-offline') requireOffline = true;
      if (arg === '--require-evidence-links') requireEvidenceUrls = true;
    } else if (arg.startsWith('-')) throw new ReviewCliError(`Unknown option ${arg}`);
    else if (current !== null) throw new ReviewCliError('Exactly one current release path required');
    else current = arg;
  }
  if (current === null) throw new ReviewCliError(ACCESS_REVIEW_USAGE);
  return { current, before, lang, format, requirePaired, requireOffline, requireEvidenceUrls };
}
async function readBounded(path) {
  const full = resolve(path);
  const info = await stat(full);
  if (!info.isFile() || info.size > REVIEW_MAX_BYTES) throw new ReviewCliError('Input must be a bounded regular file');
  const content = await readFile(full, 'utf8');
  return parseAccessReviewJson(content);
}
export async function executeAccessReviewCli(args) {
  let opts;
  try { opts = parseAccessReviewArgs(args); }
  catch (error) { return { status: 2, stdout: '', stderr: error instanceof Error ? error.message : 'Invalid arguments' }; }
  try {
    const review = await readBounded(opts.current);
    const options = { requirePaired: opts.requirePaired, requireOffline: opts.requireOffline, requireEvidenceUrls: opts.requireEvidenceUrls };
    const audit = auditAccessReview(review, options);
    let comparison = null;
    if (opts.before) comparison = compareAccessReviews(await readBounded(opts.before), review, options);
    const outputs = {
      text: () => renderAccessReviewText(review, audit, opts.lang, comparison),
      html: () => renderAccessReviewHtml(review, audit, opts.lang, comparison),
      json: () => renderAccessReviewJson(review, audit, comparison),
    };
    return { status: audit.blocked || comparison?.blocked ? 1 : 0, stdout: outputs[opts.format](), stderr: '' };
  } catch (error) {
    return { status: 2, stdout: '', stderr: error instanceof Error ? error.message : 'Unable to read local evidence' };
  }
}
export function isReviewCliEntrypoint() {
  const path = process.argv[1];
  return typeof path === 'string' && resolve(path) === fileURLToPath(import.meta.url);
}
if (isReviewCliEntrypoint()) {
  void executeAccessReviewCli(process.argv.slice(2)).then(result => {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(`${result.stderr}\n`);
    process.exitCode = result.status;
  }).catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Unexpected error'}\n`);
    process.exitCode = 2;
  });
}
