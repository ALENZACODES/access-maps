#!/usr/bin/env node
/** Local-only entry point; exits nonzero if an export must be blocked. */
import { writeFile } from 'node:fs/promises';
import { auditOfflineBundle, renderAuditJson, renderAuditText } from './p15c-pipeline.js';
import type { AuditOptions, AuditResult } from './p15c-pipeline.js';

export interface CliRequest {
  readonly options: AuditOptions;
  readonly output: 'json' | 'en' | 'fr';
  readonly reportFile?: string;
}

const usage = [
  'Usage: node tools/data-qa/p15c-cli.ts audit --root DIR --manifest PATH --as-of YYYY-MM-DD',
  '  --max-age-days N        Maximum observation age in whole calendar days (required)',
  '  --max-asset-bytes N     Maximum bytes per file (optional)',
  '  --max-total-bytes N     Maximum total file bytes (optional)',
  '  --format json|en|fr     Output format (default json)',
  '  --report-file PATH      Write the report locally; no upload is performed',
  '  --help                  Print usage',
].join('\n') + '\n';

const optionsWithValue = new Set([
  '--root', '--manifest', '--as-of', '--max-age-days', '--max-asset-bytes',
  '--max-total-bytes', '--format', '--report-file',
]);

function positiveInt(value: string, allowZero: boolean): number {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new RangeError('Invalid integer option');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || (!allowZero && n === 0)) {
    throw new RangeError('Integer option outside bounds');
  }
  return n;
}

export function parseCli(args: readonly string[]): CliRequest | 'help' {
  if (args.length === 1 && (args[0] === '--help' || args[0] === 'help')) return 'help';
  if (args[0] !== 'audit') throw new Error('Expected audit subcommand');
  if (args.includes('--help')) return 'help';
  const values = new Map<string, string>();
  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (!flag || !optionsWithValue.has(flag) || !value || value.startsWith('--') || values.has(flag)) {
      throw new Error('Unknown, duplicate, or incomplete option');
    }
    values.set(flag, value);
  }
  const required = (name: string): string => {
    const value = values.get(name);
    if (!value) throw new Error(`Missing ${name}`);
    return value;
  };
  const format = values.get('--format') ?? 'json';
  if (format !== 'json' && format !== 'en' && format !== 'fr') {
    throw new Error('Unsupported report format');
  }
  const options: AuditOptions = {
    root: required('--root'),
    manifestPath: required('--manifest'),
    asOf: required('--as-of'),
    maxAgeDays: positiveInt(required('--max-age-days'), true),
    ...(values.has('--max-asset-bytes')
      ? { maxAssetBytes: positiveInt(required('--max-asset-bytes'), false) } : {}),
    ...(values.has('--max-total-bytes')
      ? { maxTotalBytes: positiveInt(required('--max-total-bytes'), false) } : {}),
  };
  return { options, output: format, ...(values.has('--report-file')
    ? { reportFile: values.get('--report-file') } : {}) };
}

export function outputFor(result: AuditResult, format: CliRequest['output']): string {
  return format === 'json' ? renderAuditJson(result) : renderAuditText(result, format);
}

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly audit: typeof auditOfflineBundle;
  readonly save: (path: string, text: string) => Promise<void>;
}

export async function runCli(args: readonly string[], io: CliIo): Promise<number> {
  let request: CliRequest | 'help';
  try { request = parseCli(args); }
  catch (error) {
    io.stderr(`${error instanceof Error ? error.message : 'Invalid arguments'}\n${usage}`);
    return 2;
  }
  if (request === 'help') { io.stdout(usage); return 0; }
  let result: AuditResult;
  try { result = await io.audit(request.options); }
  catch (error) {
    io.stderr(`${error instanceof Error ? error.message : 'Audit failed'}\n`);
    return 2;
  }
  const output = outputFor(result, request.output);
  if (request.reportFile) {
    try { await io.save(request.reportFile, output); }
    catch { io.stderr('Cannot write local report.\n'); return 2; }
  }
  io.stdout(output);
  return result.ok ? 0 : 1;
}

// Node 24 can execute TypeScript directly; do not run the CLI during imports.
const invoked = process.argv[1]?.replaceAll('\\', '/').endsWith('/p15c-cli.ts') ?? false;
if (invoked) {
  const code = await runCli(process.argv.slice(2), {
    stdout: text => process.stdout.write(text),
    stderr: text => process.stderr.write(text),
    audit: auditOfflineBundle,
    save: (path, text) => writeFile(path, text, { encoding: 'utf8', flag: 'wx' }),
  });
  process.exitCode = code;
}
