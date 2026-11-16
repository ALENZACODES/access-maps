#!/usr/bin/env node
/** Explicit CLI for receipt issuance and audits; no background tasks. */
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { parseReleasePackageText } from './disclosure-core.mjs';
import { createReceipt, encodeReceipt, receiptAsText } from './receipt-core.mjs';
import { auditReceipt, auditAllReceipts, auditReportAsText, auditReportAsJson } from './receipt-audit.mjs';

export function parseArgs(args) {
  if (!Array.isArray(args) || args.length < 1) throw new Error('INPUT_REQUIRED');
  const options = { file: args[0], surface: null, language: 'en', format: 'text', output: null,
    all: false, gate: false };
  if (!options.file || options.file.startsWith('--')) throw new Error('INPUT_REQUIRED');
  for (let i = 1; i < args.length; i += 1) {
    const flag = args[i];
    if (flag === '--all') options.all = true;
    else if (flag === '--gate') options.gate = true;
    else if (['--surface', '--language', '--format', '--output'].includes(flag)) {
      const next = args[++i];
      if (!next || next.startsWith('--')) throw new Error(`ARGUMENT_REQUIRED: ${flag}`);
      options[flag.slice(2)] = next;
    } else throw new Error(`UNKNOWN_ARGUMENT: ${flag}`);
  }
  if (!['en', 'fr'].includes(options.language)) throw new Error('UNSUPPORTED_LOCALE');
  if (!['text', 'json', 'report'].includes(options.format)) throw new Error('UNSUPPORTED_FORMAT');
  if (!options.all && !options.surface) throw new Error('SURFACE_REQUIRED');
  if (options.all && options.surface) throw new Error('CONFLICTING_SELECTION');
  return options;
}

export async function runReceiptCli(args, io = {}) {
  const read = io.read ?? ((path) => readFile(path, 'utf8'));
  const write = io.write ?? ((path, data) => writeFile(path, data, 'utf8'));
  const print = io.print ?? ((message) => process.stdout.write(message));
  const error = io.error ?? ((message) => process.stderr.write(message));
  let options;
  try { options = parseArgs(args); }
  catch (cause) {
    error(`${cause.message}\n`);
    return 2;
  }
  let release;
  try { release = parseReleasePackageText(await read(options.file)); }
  catch (cause) {
    error(`INPUT_ERROR: ${cause.message}\n`);
    return 2;
  }
  try {
    if (options.all) {
      const result = auditAllReceipts(release, options.language, { withReleaseAudit: options.gate });
      const resultText = options.format === 'json'
        ? `${JSON.stringify(result, null, 2)}\n`
        : result.results.map((item) => auditReportAsText(item, options.language)).join('\n');
      if (options.output) await write(options.output, resultText);
      else print(resultText);
      return result.blocked ? 1 : 0;
    }
    const receipt = createReceipt(release, options.surface, options.language);
    const report = auditReceipt(receipt, release, { locale: options.language,
      withReleaseAudit: options.gate });
    const output = options.format === 'json' ? encodeReceipt(receipt)
      : options.format === 'report' ? auditReportAsJson(report) : receiptAsText(receipt);
    if (options.output) await write(options.output, output);
    else print(output);
    return report.blocked ? 1 : 0;
  } catch (cause) {
    error(`RECEIPT_ERROR: ${cause.message}\n`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runReceiptCli(process.argv.slice(2));
}
