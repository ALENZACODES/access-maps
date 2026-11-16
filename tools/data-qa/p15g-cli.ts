#!/usr/bin/env node
/** Local-only CLI for the publication gate. */
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { auditPublication, publicationText } from './p15g-publication.js';

export interface PublicationIo {
  readonly load: (path: string) => Promise<string>;
  readonly save: (path: string, text: string) => Promise<void>;
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}
export const publicationHelp = [
  'Usage: tsx tools/data-qa/p15g-cli.ts --input package.json [--format json|en|fr] [--output report.txt]',
  'All inputs are local. Exit 0 means permitted, 1 means blocked, 2 means invalid input.',
].join('\n') + '\n';

export async function runPublication(args: readonly string[], io: PublicationIo): Promise<number> {
  if (args.length === 1 && args[0] === '--help') {
    io.out(publicationHelp);
    return 0;
  }
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!key || !value || !['--input', '--format', '--output'].includes(key) ||
        values.has(key) || value.startsWith('--')) {
      io.err(publicationHelp);
      return 2;
    }
    values.set(key, value);
  }
  const input = values.get('--input');
  const format = values.get('--format') ?? 'json';
  const output = values.get('--output');
  if (!input || !['json', 'en', 'fr'].includes(format) ||
      (output !== undefined && resolve(output) === resolve(input))) {
    io.err(publicationHelp);
    return 2;
  }
  try {
    const raw = await io.load(input);
    if (Buffer.byteLength(raw, 'utf8') > 8 * 1024 * 1024) {
      io.err('Input exceeds 8 MiB\n');
      return 2;
    }
    const report = auditPublication(JSON.parse(raw) as unknown);
    const text = format === 'json' ? `${JSON.stringify(report, null, 2)}\n` :
      publicationText(report, format as 'en' | 'fr');
    if (output) await io.save(output, text);
    io.out(text);
    return report.ok ? 0 : 1;
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : 'Invalid local input'}\n`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const code = await runPublication(process.argv.slice(2), {
    load: path => readFile(path, 'utf8'),
    save: (path, text) => writeFile(path, text, { encoding: 'utf8', flag: 'wx' }),
    out: text => process.stdout.write(text),
    err: text => process.stderr.write(text),
  });
  process.exitCode = code;
}
