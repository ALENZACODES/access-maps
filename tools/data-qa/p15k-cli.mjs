#!/usr/bin/env node
/** Offline data-QA CLI. Reads JSON locally; writes only when explicitly requested. */
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { auditHistory, compareHistory } from './p15k-history.mjs';
import { auditRefresh } from './p15k-refresh.mjs';
import { auditDisclosures } from './p15k-disclosure.mjs';
import { renderText } from './p15k-core.mjs';

export const COMMANDS = ['history', 'compare-history', 'refresh', 'disclosures'];
export const USAGE = [
  'Offline publication QA',
  '  history --input history.json [--format json|en|fr] [--output report.txt]',
  '  compare-history --before old.json --after new.json [--format json|en|fr]',
  '  refresh --input refresh.json [--format json|en|fr] [--output report.txt]',
  '  disclosures --input disclosures.json [--format json|en|fr] [--output report.txt]',
  '  --help',
  'Exit codes: 0 passed, 1 blocked, 2 malformed input or I/O failure.',
  'Inputs must be local files. No network request or scheduled action is made.',
].join('\n') + '\n';

export function parseArgs(args) {
  if (args.length === 1 && args[0] === '--help') return { command: 'help' };
  const command = args[0];
  if (!COMMANDS.includes(command)) throw new Error('Unknown command');
  if (args.length % 2 !== 1) throw new Error('Expected flag and value pairs');
  const values = new Map();
  const allowed = ['--input', '--before', '--after', '--format', '--output'];
  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (!allowed.includes(flag) || !value || value.startsWith('--') || values.has(flag)) {
      throw new Error('Invalid or repeated option');
    }
    values.set(flag, value);
  }
  const format = values.get('--format') ?? 'json';
  if (!['json', 'en', 'fr'].includes(format)) throw new Error('Invalid report format');
  const output = values.get('--output');
  if (command === 'compare-history') {
    if (values.has('--input')) throw new Error('Unexpected --input');
    const before = values.get('--before');
    const after = values.get('--after');
    if (!before || !after || before === after) throw new Error('Two distinct snapshot paths are required');
    if (output && [before, after].includes(output)) throw new Error('Output cannot overwrite an input');
    return { command, before, after, format, output };
  }
  if (values.has('--before') || values.has('--after')) throw new Error('Unexpected comparison flags');
  const input = values.get('--input');
  if (!input) throw new Error('Missing --input');
  if (input === output) throw new Error('Output cannot overwrite the input');
  return { command, input, format, output };
}

export function formatReport(report, format) {
  return format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : renderText(report, format);
}

async function loadJson(io, file) {
  const content = await io.load(file);
  if (Buffer.byteLength(content, 'utf8') > 8 * 1024 * 1024) throw new Error('Input exceeds 8 MiB');
  return JSON.parse(content);
}

export async function runP15k(args, io) {
  let request;
  try { request = parseArgs(args); }
  catch (error) {
    io.err(`${error instanceof Error ? error.message : 'Invalid arguments'}\n${USAGE}`);
    return 2;
  }
  if (request.command === 'help') { io.out(USAGE); return 0; }
  try {
    let report;
    if (request.command === 'compare-history') {
      const before = await loadJson(io, request.before);
      const after = await loadJson(io, request.after);
      report = compareHistory(before, after);
    } else {
      const input = await loadJson(io, request.input);
      report = request.command === 'history' ? auditHistory(input) :
        request.command === 'refresh' ? auditRefresh(input) : auditDisclosures(input);
    }
    const output = formatReport(report, request.format);
    if (request.output) await io.save(request.output, output);
    io.out(output);
    return report.ok ? 0 : 1;
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : 'Local audit failed'}\n`);
    return 2;
  }
}

const calledDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (calledDirectly) {
  const code = await runP15k(process.argv.slice(2), {
    load: path => readFile(path, 'utf8'),
    save: (path, value) => writeFile(path, value, { flag: 'wx', encoding: 'utf8' }),
    out: value => process.stdout.write(value),
    err: value => process.stderr.write(value),
  });
  process.exitCode = code;
}
