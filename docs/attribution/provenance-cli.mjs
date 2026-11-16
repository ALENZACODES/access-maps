#!/usr/bin/env node
/** Release gate for local inventories; no network operations or schedules. */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { parseInventoryText } from './provenance-core.mjs';
import { auditInventory, reportAsJson, reportAsText } from './provenance-audit.mjs';

export function parseArgs(args) {
  let file = null;
  let referenceDate = 'UNKNOWN';
  let json = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--json') json = true;
    else if (arg === '--date') {
      if (++i >= args.length) throw new Error('--date requires YYYY-MM-DD or UNKNOWN');
      referenceDate = args[i];
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (file !== null) {
      throw new Error('Only one inventory path is accepted');
    } else file = arg;
  }
  if (!file) throw new Error('Usage: node provenance-cli.mjs inventory.json [--date YYYY-MM-DD] [--json]');
  return { file, referenceDate, json };
}

export async function runGate(args, io = {}) {
  const read = io.read ?? ((path) => readFile(path, 'utf8'));
  const output = io.output ?? ((text) => process.stdout.write(text));
  const error = io.error ?? ((text) => process.stderr.write(text));
  try {
    const parsed = parseArgs(args);
    const content = await read(parsed.file);
    const inventory = parseInventoryText(content);
    const result = auditInventory(inventory, { referenceDate: parsed.referenceDate });
    output(parsed.json ? reportAsJson(result) : reportAsText(result));
    return result.passed ? 0 : 1;
  } catch (cause) {
    error(`Provenance gate error: ${cause instanceof Error ? cause.message : String(cause)}\n`);
    return 2;
  }
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) {
  process.exitCode = await runGate(process.argv.slice(2));
}
