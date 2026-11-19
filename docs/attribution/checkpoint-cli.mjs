/** Read-only CLI for manual source-terms checkpoints. */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKPOINT_MAX_BYTES, parseCheckpointJson } from './checkpoint-core.mjs';
import { auditCheckpoint, compareCheckpoints } from './checkpoint-audit.mjs';
import { renderCheckpointHtml, renderCheckpointJson, renderCheckpointText } from './checkpoint-report.mjs';
export const CHECKPOINT_USAGE = 'Usage: checkpoint-cli.mjs <release.json> [--before old.json] [--lang en|fr] [--format text|json|html]';
export function parseCheckpointArgs(args) {
  if (!Array.isArray(args) || !args.length) throw new Error(CHECKPOINT_USAGE);
  const result = { file: null, before: null, lang: 'en', format: 'text' };
  const used = new Set();
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (['--before', '--lang', '--format'].includes(argument)) {
      if (used.has(argument)) throw new Error(`Repeated ${argument}`);
      used.add(argument);
      const next = args[++i];
      if (!next || next.startsWith('-')) throw new Error(`Missing ${argument} value`);
      if (argument === '--lang' && !['en', 'fr'].includes(next)) throw new Error('Language must be en or fr');
      if (argument === '--format' && !['text', 'json', 'html'].includes(next)) throw new Error('Format must be text, json or html');
      if (argument === '--before') result.before = next;
      if (argument === '--lang') result.lang = next;
      if (argument === '--format') result.format = next;
    } else if (typeof argument !== 'string' || argument.startsWith('-')) throw new Error(`Unsupported argument: ${String(argument)}`);
    else if (result.file !== null) throw new Error('Exactly one current release file required');
    else result.file = argument;
  }
  if (!result.file) throw new Error(CHECKPOINT_USAGE);
  return result;
}
async function readCheckpoint(path) {
  const filename = resolve(path);
  const info = await stat(filename);
  if (!info.isFile() || info.size > CHECKPOINT_MAX_BYTES) throw new Error('Input must be a bounded regular file');
  return parseCheckpointJson(await readFile(filename, 'utf8'));
}
export async function executeCheckpointCli(args) {
  let options;
  try { options = parseCheckpointArgs(args); } catch (error) { return { status: 2, output: '', error: error instanceof Error ? error.message : 'Invalid input' }; }
  try {
    const current = await readCheckpoint(options.file);
    const prior = options.before ? await readCheckpoint(options.before) : null;
    const audit = auditCheckpoint(current);
    const comparison = prior ? compareCheckpoints(prior, current) : null;
    const output = options.format === 'json' ? renderCheckpointJson(current, audit, comparison)
      : options.format === 'html' ? renderCheckpointHtml(current, audit, options.lang, comparison)
        : renderCheckpointText(current, audit, options.lang, comparison);
    return { status: audit.blocked || comparison?.blocked ? 1 : 0, output, error: '' };
  } catch (error) { return { status: 2, output: '', error: error instanceof Error ? error.message : 'Cannot read checkpoint' }; }
}
function entrypoint() { return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url); }
if (entrypoint()) void executeCheckpointCli(process.argv.slice(2)).then(result => {
  if (result.output) process.stdout.write(result.output);
  if (result.error) process.stderr.write(`${result.error}\n`);
  process.exitCode = result.status;
}).catch(error => { process.stderr.write(`${String(error)}\n`); process.exitCode = 2; });
