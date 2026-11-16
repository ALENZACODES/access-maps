#!/usr/bin/env node
/** P15D release and offline shell checks, wired into the same on-push CI suite. */
import { readFile, writeFile } from 'node:fs/promises';
import { runP15e, p15eHelp } from './p15e-cli.js';
import { auditOfflinePages, pageText, type PageInput } from './p15d-pages.js';
import { compareOfflineReleases, releaseText, type ReleasePolicy } from './p15d-release.js';
import { auditOfflineClosure, closureText, type ClosureOptions } from './p15d-closure.js';

export type P15dCommand =
  | { command: 'pages'; input: string; format: 'json' | 'en' | 'fr'; output?: string }
  | { command: 'compare'; before: string; after: string; policy: string;
      format: 'json' | 'en' | 'fr'; output?: string }
  | { command: 'closure'; input: string; format: 'json' | 'en' | 'fr'; output?: string };

const help = `Usage: node tools/data-qa/p15d-cli.ts COMMAND OPTIONS
  pages --input pages.json [--format json|en|fr] [--output report.txt]
  compare --before old.json --after new.json --policy policy.json
          [--format json|en|fr] [--output report.txt]
  closure --input closure.json [--format json|en|fr] [--output report.txt]
${p15eHelp}All inputs are local UTF-8 JSON. Output is written exclusively, never uploaded.
Return codes: 0 pass, 1 blocked, 2 invalid inputs or I/O failure.
`;

export function parseP15d(args: readonly string[]): P15dCommand | 'help' {
  if (args.length === 1 && args[0] === '--help') return 'help';
  const command = args[0];
  if (!['pages', 'compare', 'closure'].includes(command ?? '')) throw new Error('Unknown command');
  const values = new Map<string, string>();
  const accepted = new Set(['--input', '--before', '--after', '--policy', '--format', '--output']);
  if ((args.length - 1) % 2 !== 0) throw new Error('Expected option/value pairs');
  for (let n = 1; n < args.length; n += 2) {
    const flag = args[n];
    const value = args[n + 1];
    if (!flag || !value || !accepted.has(flag) || values.has(flag) || value.startsWith('--')) {
      throw new Error('Invalid or repeated option');
    }
    values.set(flag, value);
  }
  const required = (key: string): string => {
    const found = values.get(key);
    if (!found) throw new Error(`Missing ${key}`);
    return found;
  };
  const format = values.get('--format') ?? 'json';
  if (format !== 'json' && format !== 'en' && format !== 'fr') throw new Error('Invalid format');
  const output = values.get('--output');
  if (command === 'pages' || command === 'closure') {
    if (values.has('--before') || values.has('--after') || values.has('--policy')) {
      throw new Error('Unexpected comparison options');
    }
    return { command, input: required('--input'), format, ...(output ? { output } : {}) };
  }
  if (values.has('--input')) throw new Error('Unexpected input option');
  return { command: 'compare', before: required('--before'), after: required('--after'),
    policy: required('--policy'), format, ...(output ? { output } : {}) };
}

export interface P15dIo {
  readonly load: (file: string) => Promise<string>;
  readonly save: (file: string, content: string) => Promise<void>;
  readonly out: (content: string) => void;
  readonly err: (content: string) => void;
}
function object(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}
function pageInput(value: unknown): value is PageInput[] {
  return Array.isArray(value) && value.every(item => object(item) &&
    typeof item.file === 'string' && typeof item.html === 'string' &&
    (item.maxBytes === undefined || Number.isSafeInteger(item.maxBytes)));
}
function releasePolicy(value: unknown): value is ReleasePolicy {
  return object(value) && typeof value.asOf === 'string' &&
    typeof value.maxAgeDays === 'number' &&
    typeof value.maxLossOfPresentCells === 'number' &&
    typeof value.maxUnexplainedAssetRemoval === 'number' &&
    typeof value.maxBytes === 'number' &&
    (value.allowRemovedCellKeys === undefined ||
      (Array.isArray(value.allowRemovedCellKeys) && value.allowRemovedCellKeys.every(item => typeof item === 'string'))) &&
    (value.allowRemovedRegionIds === undefined ||
      (Array.isArray(value.allowRemovedRegionIds) && value.allowRemovedRegionIds.every(item => typeof item === 'string')));
}
function closureOptions(value: unknown): value is ClosureOptions {
  return object(value) && typeof value.root === 'string' && Array.isArray(value.entries) &&
    Array.isArray(value.pagePaths) && value.pagePaths.every(item => typeof item === 'string') &&
    typeof value.maxFileBytes === 'number' && typeof value.maxTotalBytes === 'number';
}
async function parseFile(io: P15dIo, path: string): Promise<unknown> {
  const data = await io.load(path);
  if (Buffer.byteLength(data, 'utf8') > 8 * 1024 * 1024) throw new Error('Input exceeds 8 MiB');
  return JSON.parse(data) as unknown;
}

export async function runP15d(args: readonly string[], io: P15dIo): Promise<number> {
  if (args[0] === 'evidence' || args[0] === 'locales' || args[0] === 'updates' || args[0] === 'credits') {
    return runP15e(args, io);
  }
  let request: P15dCommand | 'help';
  try { request = parseP15d(args); }
  catch (error) { io.err(`${error instanceof Error ? error.message : 'Bad options'}\n${help}`); return 2; }
  if (request === 'help') { io.out(help); return 0; }
  try {
    let data: unknown;
    let ok: boolean;
    let textOutput: string;
    if (request.command === 'pages') {
      const pages = await parseFile(io, request.input);
      if (!pageInput(pages)) throw new Error('Malformed page input');
      const report = auditOfflinePages(pages);
      data = report;
      ok = report.ok;
      textOutput = request.format === 'json' ? `${JSON.stringify(report, null, 2)}\n` :
        pageText(report, request.format);
    } else if (request.command === 'compare') {
      const [before, after, policy] = await Promise.all([
        parseFile(io, request.before), parseFile(io, request.after), parseFile(io, request.policy),
      ]);
      if (!releasePolicy(policy)) throw new Error('Malformed release policy');
      const report = compareOfflineReleases(before, after, policy);
      data = report;
      ok = report.ok;
      textOutput = request.format === 'json' ? `${JSON.stringify(report, null, 2)}\n` :
        releaseText(report, request.format);
    } else {
      const input = await parseFile(io, request.input);
      if (!closureOptions(input)) throw new Error('Malformed closure input');
      const report = await auditOfflineClosure(input);
      data = report;
      ok = report.ok;
      textOutput = request.format === 'json' ? `${JSON.stringify(report, null, 2)}\n` :
        closureText(report, request.format);
    }
    void data;
    if (request.output) await io.save(request.output, textOutput);
    io.out(textOutput);
    return ok ? 0 : 1;
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : 'Check failed'}\n`);
    return 2;
  }
}

const invoked = process.argv[1]?.replaceAll('\\', '/').endsWith('/p15d-cli.ts') ?? false;
if (invoked) {
  void runP15d(process.argv.slice(2), {
    load: path => readFile(path, 'utf8'),
    save: (path, content) => writeFile(path, content, { encoding: 'utf8', flag: 'wx' }),
    out: content => process.stdout.write(content),
    err: content => process.stderr.write(content),
  }).then(code => { process.exitCode = code; }, () => { process.exitCode = 2; });
}
