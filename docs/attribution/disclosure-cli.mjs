#!/usr/bin/env node
/** Command-line publication gate, using precisely the browser audit contract. */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { UNKNOWN, isKnownDate, parseInventoryText } from './provenance-core.mjs';
import {
  parseRegisterText, parseReleasePackageText, combineReleaseFiles,
} from './disclosure-core.mjs';
import {
  auditDisclosures, disclosureReportText, disclosureReportJson,
} from './disclosure-audit.mjs';

export function parseDisclosureArguments(argv) {
  if (!Array.isArray(argv)) throw new Error('Options must be an array.');
  const values = { files: [], referenceDate: UNKNOWN, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      if (values.json) throw new Error('Repeated --json option.');
      values.json = true;
      continue;
    }
    if (arg === '--date') {
      const referenceDate = argv[++index];
      if (!isKnownDate(referenceDate)) throw new Error('Expected --date YYYY-MM-DD.');
      if (values.referenceDate !== UNKNOWN) throw new Error('Repeated --date option.');
      values.referenceDate = referenceDate;
      continue;
    }
    if (typeof arg !== 'string' || arg.startsWith('-') || arg.trim().length === 0) {
      throw new Error(`Unexpected option: ${String(arg)}`);
    }
    values.files.push(arg);
  }
  if (values.files.length !== 1 && values.files.length !== 2) {
    throw new Error('Supply a combined package OR an inventory and register.');
  }
  return Object.freeze(values);
}

async function readBounded(path, limit) {
  const text = await readFile(path, 'utf8');
  if (new TextEncoder().encode(text).byteLength > limit) {
    throw new Error('Document exceeds size limit.');
  }
  return text;
}

export async function runDisclosureGate(argv, io = {}) {
  const write = io.write ?? ((value) => process.stdout.write(value));
  const error = io.error ?? ((value) => process.stderr.write(value));
  const read = io.read ?? readBounded;
  try {
    const options = parseDisclosureArguments(argv);
    let bundle;
    if (options.files.length === 1) {
      const raw = await read(options.files[0], 2_097_152);
      bundle = parseReleasePackageText(raw);
    } else {
      const inventory = await read(options.files[0], 1_048_576);
      const register = await read(options.files[1], 1_048_576);
      bundle = combineReleaseFiles(inventory, register);
    }
    const report = auditDisclosures(bundle, { referenceDate: options.referenceDate });
    write(options.json ? disclosureReportJson(report) : disclosureReportText(report));
    return report.passed ? 0 : 1;
  } catch (cause) {
    error(`Publication audit input error: ${cause instanceof Error ? cause.message : 'Unknown error'}\n`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runDisclosureGate(process.argv.slice(2));
}
