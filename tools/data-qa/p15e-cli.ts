/** Local-only P15E audit dispatcher, reachable from the existing P15D CLI. */
import { auditAttribution } from './p15e-attribution.js';
import { auditEvidence } from './p15e-evidence.js';
import { auditLocaleCatalog } from './p15e-locales.js';
import { auditOfflineUpdate } from './p15e-updates.js';
import { textReport, type FindingReport, type Locale } from './p15e-core.js';

export type P15eCommand = 'evidence' | 'locales' | 'updates' | 'credits';
export interface P15eRequest {
  readonly command: P15eCommand;
  readonly input: string;
  readonly format: 'json' | Locale;
  readonly output?: string;
}
export interface P15eIO {
  readonly load: (path: string) => Promise<string>;
  readonly save: (path: string, content: string) => Promise<void>;
  readonly out: (value: string) => void;
  readonly err: (value: string) => void;
}
export const p15eHelp = [
  'Data QA additions:',
  '  evidence --input evidence.json [--format json|en|fr] [--output result.txt]',
  '  locales --input locales.json [--format json|en|fr] [--output result.txt]',
  '  updates --input plan.json [--format json|en|fr] [--output result.txt]',
  '  credits --input attribution.json [--format json|en|fr] [--output result.txt]',
  'Local JSON inputs only; status 0 pass, 1 blocked, 2 invalid input.',
].join('\n') + '\n';

export function parseP15e(args: readonly string[]): P15eRequest {
  if (args.length === 0 || !['evidence', 'locales', 'updates', 'credits'].includes(args[0] ?? '')) {
    throw new Error('Unknown P15E command');
  }
  if ((args.length - 1) % 2 !== 0) throw new Error('Expected flag/value pairs');
  const options = new Map<string, string>();
  const allowed = new Set(['--input', '--output', '--format']);
  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (!flag || !value || !allowed.has(flag) || options.has(flag) || value.startsWith('--')) {
      throw new Error('Invalid or repeated option');
    }
    options.set(flag, value);
  }
  const input = options.get('--input');
  if (!input) throw new Error('Missing --input');
  const format = options.get('--format') ?? 'json';
  if (format !== 'json' && format !== 'en' && format !== 'fr') throw new Error('Invalid format');
  const output = options.get('--output');
  if (input === output) throw new Error('Input and output must not be the same path');
  return { command: args[0] as P15eCommand, input, format, ...(output ? { output } : {}) };
}

/** A blocked audit returns 1; missing or malformed local input returns 2. */
export async function runP15e(args: readonly string[], io: P15eIO): Promise<number> {
  let request: P15eRequest;
  try { request = parseP15e(args); }
  catch (error) {
    io.err(`${error instanceof Error ? error.message : 'Invalid options'}\n${p15eHelp}`);
    return 2;
  }
  try {
    const raw = await io.load(request.input);
    if (Buffer.byteLength(raw, 'utf8') > 8 * 1024 * 1024) throw new Error('Input exceeds 8 MiB');
    const data: unknown = JSON.parse(raw);
    const report: FindingReport<unknown> = request.command === 'evidence' ?
      auditEvidence(data) : request.command === 'locales' ?
        auditLocaleCatalog(data) : request.command === 'updates' ?
          auditOfflineUpdate(data) : auditAttribution(data);
    const content = request.format === 'json' ? `${JSON.stringify(report, null, 2)}\n` :
      textReport(report, request.format);
    if (request.output) await io.save(request.output, content);
    io.out(content);
    return report.ok ? 0 : 1;
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : 'Local audit failed'}\n`);
    return 2;
  }
}
