#!/usr/bin/env node
/** Offline-only CLI for the handoff, resume and bilingual parity gates. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditHandoff } from './p15j-handoff.js';
import { auditResume } from './p15j-resume.js';
import { auditCoverage } from './p15j-coverage.js';
import { render, type Locale, type Report } from './p15j-core.js';

export type Command = 'handoff' | 'resume' | 'coverage';
export interface Request {
  readonly command: Command;
  readonly input: string;
  readonly output?: string;
  readonly format: 'json' | Locale;
}
export interface IO {
  readonly read: (path: string) => Promise<string>;
  readonly write: (path: string, content: string) => Promise<void>;
  readonly out: (content: string) => void;
  readonly err: (content: string) => void;
}
export const HELP = [
  'Local data QA commands:',
  '  handoff --input handoff.json [--format json|en|fr] [--output report.txt]',
  '  resume --input resume.json [--format json|en|fr] [--output report.txt]',
  '  coverage --input coverage.json [--format json|en|fr] [--output report.txt]',
  'Input must be local UTF-8 JSON. No network access or publishing occurs.',
  'Exit: 0 passed, 1 blocked, 2 invalid options or local I/O failure.',
].join('\n') + '\n';

export function parse(args: readonly string[]): Request | 'help' {
  if (args.length === 1 && args[0] === '--help') return 'help';
  const command = args[0];
  if (command !== 'handoff' && command !== 'resume' && command !== 'coverage') {
    throw new Error('Unknown command');
  }
  if ((args.length - 1) % 2 !== 0) throw new Error('Expected option/value pairs');
  const options = new Map<string, string>();
  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (!flag || !value || !['--input', '--output', '--format'].includes(flag) ||
        value.startsWith('--') || options.has(flag)) throw new Error('Unexpected option');
    options.set(flag, value);
  }
  const input = options.get('--input');
  if (!input) throw new Error('Missing --input');
  const format = options.get('--format') ?? 'json';
  if (format !== 'json' && format !== 'en' && format !== 'fr') throw new Error('Invalid format');
  const output = options.get('--output');
  if (output && resolve(input) === resolve(output)) throw new Error('Input and output must differ');
  return { command, input, format, ...(output ? { output } : {}) };
}
export async function run(args: readonly string[], io: IO): Promise<number> {
  let request: Request | 'help';
  try { request = parse(args); }
  catch (error) {
    io.err(`${error instanceof Error ? error.message : 'Invalid options'}\n${HELP}`);
    return 2;
  }
  if (request === 'help') { io.out(HELP); return 0; }
  try {
    const raw = await io.read(request.input);
    if (Buffer.byteLength(raw, 'utf8') > 8 * 1024 * 1024) throw new Error('Input exceeds 8 MiB');
    const input: unknown = JSON.parse(raw);
    const report = request.command === 'handoff' ? auditHandoff(input) :
      request.command === 'resume' ? auditResume(input) : auditCoverage(input);
    const content = request.format === 'json' ? `${JSON.stringify(report, null, 2)}\n` :
      render(report as Report<unknown>, request.format);
    if (request.output) await io.write(request.output, content);
    io.out(content);
    return report.ok ? 0 : 1;
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : 'Local audit failed'}\n`);
    return 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await run(process.argv.slice(2), {
    read: path => readFile(path, 'utf8'),
    write: (path, content) => writeFile(path, content, { encoding: 'utf8', flag: 'wx' }),
    out: content => process.stdout.write(content),
    err: content => process.stderr.write(content),
  });
  process.exitCode = result;
}
