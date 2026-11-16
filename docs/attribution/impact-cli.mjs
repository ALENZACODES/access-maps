#!/usr/bin/env node
/** Local change review command, with nonzero exit codes on release blockers. */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { UNKNOWN } from './provenance-core.mjs';
import { parseImpactPackageText, IMPACT_MAX_BYTES, normalizeDate } from './impact-core.mjs';
import { auditImpact, impactReportJson, impactReportText } from './impact-audit.mjs';

export function parseImpactArguments(argv) {
  if (!Array.isArray(argv)) throw new Error('Expected arguments.');
  const result = { files: [], referenceDate: UNKNOWN, json: false };
  let dateSet = false;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--json') {
      if (result.json) throw new Error('Repeated --json.');
      result.json = true;
    } else if (value === '--date') {
      if (dateSet) throw new Error('Repeated --date.');
      dateSet = true;
      result.referenceDate = normalizeDate(argv[++index]);
    } else if (typeof value === 'string' && value.length && !value.startsWith('-')) {
      result.files.push(value);
    } else {
      throw new Error('Unrecognized option.');
    }
  }
  if (result.files.length !== 2) throw new Error('Supply previous and candidate packages.');
  return Object.freeze(result);
}

export async function readImpactFile(path) {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size > IMPACT_MAX_BYTES) {
    throw new Error('File missing or too large.');
  }
  return readFile(path, 'utf8');
}

export async function runImpactGate(argv, io = {}) {
  const read = io.read ?? readImpactFile;
  const write = io.write ?? ((value) => process.stdout.write(value));
  const error = io.error ?? ((value) => process.stderr.write(value));
  try {
    const args = parseImpactArguments(argv);
    const previous = parseImpactPackageText(await read(args.files[0]));
    const candidate = parseImpactPackageText(await read(args.files[1]));
    const report = auditImpact(previous, candidate, { referenceDate: args.referenceDate });
    write(args.json ? impactReportJson(report) : impactReportText(report));
    return report.passed ? 0 : 1;
  } catch (cause) {
    error(`Change review input error: ${cause instanceof Error ? cause.message : 'UNKNOWN'}\n`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runImpactGate(process.argv.slice(2));
}
