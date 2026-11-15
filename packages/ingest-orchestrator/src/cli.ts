#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { plan, run, type ImportHooks, type RegistryEntry } from './index.js';

export function parseArgs(argv: string[]): { registry: string; outputDir?: string; dryRun: boolean } {
  if (argv.some((arg) => /^--?(?:schedule|cron|crontab|interval|poll)(?:=|$)/i.test(arg))) {
    throw new Error('Scheduling and polling are forbidden; run this command manually.');
  }
  let registry = '';
  let outputDir: string | undefined;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--registry' && argv[i + 1]) registry = argv[++i] ?? registry;
    else if (arg === '--output-dir' && argv[i + 1]) outputDir = argv[++i];
    else if (!arg.startsWith('-') && !registry) registry = arg;
    else throw new Error(`Unrecognised argument: ${arg}`);
  }
  if (!registry) throw new Error('Usage: node dist/cli.js <registry.json> [--dry-run] [--output-dir DIR]');
  return { registry, outputDir, dryRun };
}

export async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const registryPath = resolve(args.registry);
  const parsed: unknown = JSON.parse(await readFile(registryPath, 'utf8'));
  if (!Array.isArray(parsed) || !parsed.every((item) =>
    item && typeof item === 'object' &&
    typeof item.sourceId === 'string' && typeof item.name === 'string' &&
    typeof item.licence === 'string' && typeof item.licenceUrl === 'string' &&
    typeof item.shareAlike === 'boolean' &&
    ['confirmed', 'held', 'rejected'].includes(item.status))) {
    throw new Error('Invalid registry JSON');
  }
  const registry = parsed as RegistryEntry[];
  if (args.dryRun) {
    process.stdout.write(`${JSON.stringify({ dryRun: true, sources: plan(registry) }, null, 2)}\n`);
    return;
  }
  const hooks: ImportHooks = {};
  for (const source of registry) {
    if (plan([source])[0]?.status !== 'completed' || !source.importerModule) continue;
    // Only operators author registry files. Modules are local trusted code, not downloaded feeds.
    const moduleUrl = new URL(source.importerModule, pathToFileURL(registryPath));
    if (moduleUrl.protocol !== 'file:') throw new Error('Importer module must be a local file');
    const imported: unknown = await import(moduleUrl.href);
    if (!imported || typeof imported !== 'object' ||
        !('default' in imported) || typeof imported.default !== 'function') {
      throw new Error(`Importer ${source.sourceId} must export a default function`);
    }
    hooks[source.sourceId] = imported.default as ImportHooks[string];
  }
  const report = await run(registry, hooks, { outputDir: args.outputDir });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.errors.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
