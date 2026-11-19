/** Read-only local attribution-page scanner CLI. */
import { readFile, lstat, realpath } from 'node:fs/promises';
import { join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStaticReleaseJson, MAX_HTML_BYTES, MAX_MANIFEST_BYTES } from './static-release.mjs';
import { auditStaticRelease, compareStaticReleases } from './static-scan.mjs';
import { renderStaticText, renderStaticJson, renderStaticHtml } from './static-report.mjs';
export const STATIC_USAGE = 'Usage: static-cli.mjs <manifest.json> --root <directory> [--lang en|fr] [--format text|html|json] [--before <previous.json> --before-root <directory>]';
function value(args, index, flag) {
  const item = args[index + 1];
  if (!item || item.startsWith('--')) throw new Error(`Missing ${flag} value`);
  return item;
}
export function parseStaticArgs(args) {
  if (!Array.isArray(args) || !args.length) throw new Error(STATIC_USAGE);
  let manifest = null, root = null, locale = 'en', format = 'text', before = null, beforeRoot = null;
  const used = new Set();
  for (let i = 0; i < args.length; i += 1) {
    const item = args[i];
    if (['--root', '--lang', '--format', '--before', '--before-root'].includes(item)) {
      if (used.has(item)) throw new Error(`Repeated ${item}`);
      used.add(item);
      const next = value(args, i, item); i += 1;
      if (item === '--root') root = next;
      else if (item === '--lang') {if (!['en', 'fr'].includes(next)) throw new Error('Language must be en or fr'); locale = next;}
      else if (item === '--format') {if (!['text', 'html', 'json'].includes(next)) throw new Error('Unknown format'); format = next;}
      else if (item === '--before') before = next;
      else beforeRoot = next;
    } else if (typeof item !== 'string' || item.startsWith('-')) throw new Error(`Unsupported argument: ${String(item)}`);
    else if (!manifest) manifest = item;
    else throw new Error('Expected one manifest');
  }
  if (!manifest || !root) throw new Error(STATIC_USAGE);
  if ((before === null) !== (beforeRoot === null)) throw new Error('Baseline manifest and root must be supplied together');
  return {manifest, root, locale, format, before, beforeRoot};
}
async function readBounded(path, maximum) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum) throw new Error(`Input file unavailable or too large: ${path}`);
  const bytes = await readFile(path);
  if (bytes.byteLength > maximum) throw new Error(`Input file too large: ${path}`);
  return bytes.toString('utf8');
}
async function readPages(release, path) {
  const root = resolve(path);
  const physicalRoot = await realpath(root);
  const files = new Map();
  for (const page of release.pages) {
    const file = join(root, page.file);
    const normalized = relative(root, file);
    if (normalized.startsWith('..') || normalized.startsWith(sep)) throw new Error('Unsafe page path');
    const current = await realpath(file).catch(() => null);
    if (!current) continue;
    const inside = relative(physicalRoot, current);
    if (inside.startsWith('..') || inside.startsWith(sep)) throw new Error('Page escapes root');
    let parent = file;
    while (parent !== root) {
      const entry = await lstat(parent).catch(() => null);
      if (entry?.isSymbolicLink()) throw new Error('Symlink page component');
      const next = resolve(parent, '..');
      if (parent === next) break;
      parent = next;
    }
    files.set(page.file, await readBounded(file, MAX_HTML_BYTES));
  }
  return files;
}
export async function executeStaticCli(args) {
  let options;
  try {options = parseStaticArgs(args);} catch (error) {return {status: 2, output: '', error: error instanceof Error ? error.message : 'Invalid arguments'};}
  try {
    const raw = await readBounded(resolve(options.manifest), MAX_MANIFEST_BYTES);
    const release = parseStaticReleaseJson(raw);
    const current = auditStaticRelease(release, await readPages(release, options.root));
    let comparison = null;
    if (options.before && options.beforeRoot) {
      const earlier = parseStaticReleaseJson(await readBounded(resolve(options.before), MAX_MANIFEST_BYTES));
      comparison = compareStaticReleases(auditStaticRelease(earlier, await readPages(earlier, options.beforeRoot)), current);
    }
    const output = options.format === 'json' ? renderStaticJson(current, comparison)
      : options.format === 'html' ? renderStaticHtml(current, options.locale, comparison)
        : renderStaticText(current, options.locale, comparison);
    return {status: current.blocked || comparison?.blocked ? 1 : 0, output, error: ''};
  } catch (error) {return {status: 2, output: '', error: error instanceof Error ? error.message : 'Cannot inspect files'};}
}
function isMain() {const arg = process.argv[1]; return typeof arg === 'string' && resolve(arg) === fileURLToPath(import.meta.url);}
if (isMain()) {
  void executeStaticCli(process.argv.slice(2)).then(result => {
    if (result.output) process.stdout.write(result.output);
    if (result.error) process.stderr.write(`${result.error}\n`);
    process.exitCode = result.status;
  }).catch(error => {process.stderr.write(`${error instanceof Error ? error.message : 'Failed'}\n`); process.exitCode = 2;});
}
