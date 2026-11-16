#!/usr/bin/env node
/** Local-only release regression command, callable in CI. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditPublicationRegression, regressionText } from './p15h-regression.js';

export interface RegressionIo {
  readonly read: (file: string) => Promise<string>;
  readonly write: (file: string, text: string) => Promise<void>;
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}
export const regressionHelp = [
  'Usage: tsx tools/data-qa/p15h-cli.ts --before old.json --after new.json',
  '  [--policy removals.json] [--format json|en|fr] [--output report.txt]',
  'Local files only; exit 0 pass, 1 blocked, 2 invalid input.',
].join('\n') + '\n';

export async function runRegression(args: readonly string[], io: RegressionIo): Promise<number> {
  if (args.length === 1 && args[0] === '--help') { io.out(regressionHelp); return 0; }
  if (args.length % 2 !== 0) { io.err(regressionHelp); return 2; }
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (!flag || !value || !['--before', '--after', '--policy', '--format', '--output'].includes(flag) ||
        options.has(flag) || value.startsWith('--')) { io.err(regressionHelp); return 2; }
    options.set(flag, value);
  }
  const before = options.get('--before');
  const after = options.get('--after');
  const policy = options.get('--policy');
  const output = options.get('--output');
  const format = options.get('--format') ?? 'json';
  if (!before || !after || !['json', 'en', 'fr'].includes(format) ||
      resolve(before) === resolve(after) ||
      (output !== undefined && [before, after, policy].some(file => file && resolve(file) === resolve(output)))) {
    io.err(regressionHelp); return 2;
  }
  try {
    const paths = [before, after, ...(policy ? [policy] : [])];
    const texts = await Promise.all(paths.map(path => io.read(path)));
    if (texts.some(text => Buffer.byteLength(text, 'utf8') > 8 * 1024 * 1024)) {
      io.err('Input exceeds 8 MiB\n'); return 2;
    }
    const oldData: unknown = JSON.parse(texts[0] ?? '');
    const newData: unknown = JSON.parse(texts[1] ?? '');
    const optionsData: unknown = policy ? JSON.parse(texts[2] ?? '') : {};
    const report = auditPublicationRegression(oldData, newData, optionsData);
    const result = format === 'json' ? `${JSON.stringify(report, null, 2)}\n` :
      regressionText(report, format as 'en' | 'fr');
    if (output) await io.write(output, result);
    io.out(result);
    return report.ok ? 0 : 1;
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : 'Invalid input'}\n`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const status = await runRegression(process.argv.slice(2), {
    read: path => readFile(path, 'utf8'),
    write: (path, content) => writeFile(path, content, { encoding: 'utf8', flag: 'wx' }),
    out: text => process.stdout.write(text),
    err: text => process.stderr.write(text),
  });
  process.exitCode = status;
}
