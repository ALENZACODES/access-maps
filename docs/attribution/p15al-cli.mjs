// @ts-check
import { createReadStream } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { LIMITS, SourceReviewError, fromRegistry } from './p15al-input.mjs';
import { buildReview, replayReview, toQueueCandidates } from './p15al-review.mjs';
import { importReceipts } from './p15al-receipts.mjs';
import { compareReviews, summarizeReview } from './p15al-summary.mjs';

const HELP = {
  en: [
    'Offline source review',
    '  --input FILE     Read a review input or a saved report (default: standard input).',
    '  --registry FILE  Start from a local copy of sources/registry.json.',
    '  --as-of DATE     Set the review date for a registry in YYYY-MM-DD form.',
    '  --valid-days N   Set the registry review interval (1–3650 days).',
    '  --lead-days N    Set the due-soon window (0–3650 days).',
    '  --receipts FILE  Import a local receipt batch before review.',
    '  --format FORMAT  Output report, candidates or summary (default: report).',
    '  --previous FILE  Compare a saved report with this review. Outputs JSON.',
    '  --lang LANG      Use en or fr for text output and errors.',
  ].join('\n'),
  fr: [
    'Contrôle des sources hors ligne',
    '  --input FICHIER     Lire un dossier ou un rapport enregistré (par défaut\u00a0: entrée standard).',
    '  --registry FICHIER  Utiliser une copie locale du fichier sources/registry.json.',
    '  --as-of DATE        Fixer la date du contrôle du registre au format AAAA-MM-JJ.',
    '  --valid-days N      Fixer la période de contrôle du registre (1 à 3650 jours).',
    '  --lead-days N       Fixer le délai de rappel (0 à 3650 jours).',
    '  --receipts FICHIER  Importer un lot de justificatifs avant le contrôle.',
    '  --format FORMAT     Produire report, candidates ou summary (par défaut\u00a0: report).',
    '  --previous FICHIER  Comparer avec un rapport antérieur. Le résultat est au format JSON.',
    '  --lang LANG         Utiliser en ou fr pour le texte et les erreurs.',
  ].join('\n'),
};

const ARGS = new Set([
  '--input', '--registry', '--as-of', '--valid-days', '--lead-days', '--format', '--previous', '--lang', '--receipts',
]);

class Usage extends Error {}

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {Map<string, string>} */
  const options = new Map();
  const help = argv.includes('--help');
  const args = argv.filter(arg => arg !== '--help');
  if (help && (args.length !== 0 && (args.length !== 2 || args[0] !== '--lang'))) throw new Usage();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!key || !ARGS.has(key) || !value || value.startsWith('--') || options.has(key)) throw new Usage();
    options.set(key, value);
  }
  const format = options.get('--format') ?? 'report';
  const lang = options.get('--lang') ?? 'en';
  if ((lang !== 'en' && lang !== 'fr') || !['report', 'candidates', 'summary'].includes(format)) throw new Usage();
  const registry = options.get('--registry');
  const input = options.get('--input') ?? '-';
  const asOf = options.get('--as-of');
  const valid = options.get('--valid-days');
  const lead = options.get('--lead-days');
  if (registry) {
    if (options.has('--input') || !asOf || !valid || lead === undefined) throw new Usage();
    if (!/^\d{1,4}$/u.test(valid) || !/^\d{1,4}$/u.test(lead)) throw new Usage();
  } else if (asOf !== undefined || valid !== undefined || lead !== undefined) throw new Usage();
  const previous = options.get('--previous');
  const receipts = options.get('--receipts');
  if (previous && options.has('--format')) throw new Usage();
  if ([previous, receipts, registry ?? input].filter(path => path === '-').length > 1) throw new Usage();
  return { help, format, lang, path: registry ?? input, registry, asOf, valid, lead, previous, receipts };
}

/** One bounded stream reader for pipes, files and saved reports. Decode the complete UTF-8
 * buffer once so a split multibyte character never becomes a replacement character.
 * @param {string} path */
async function readJson(path) {
  const stream = path === '-' ? process.stdin : createReadStream(path);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > LIMITS.bytes) throw new SourceReviewError('limit', 'input');
    chunks.push(buffer);
  }
  const value = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes));
  return /** @type {unknown} */ (JSON.parse(value));
}

/** @param {unknown} value */
function isSaved(value) {
  return value !== null && typeof value === 'object' && 'sourceReviews' in value;
}

/* A file emitted by this command must be within the limit for a subsequent replay. */
function writeJson(/** @type {unknown} */ value) {
  const text = JSON.stringify(value) + '\n';
  if (Buffer.byteLength(text) > LIMITS.bytes) throw new SourceReviewError('limit', 'output');
  process.stdout.write(text);
}

/** @param {string[]} argv */
export async function runSourceReview(argv) {
  let language = argv[argv.indexOf('--lang') + 1] === 'fr' ? /** @type {const} */ ('fr') : /** @type {const} */ ('en');
  try {
    const opts = parseArgs(argv);
    language = opts.lang === 'fr' ? 'fr' : 'en';
    if (opts.help) {
      process.stdout.write(HELP[language] + '\n');
      return 0;
    }
    const raw = await readJson(opts.path);
    const input = opts.registry ? fromRegistry(raw, {
      asOf: /** @type {string} */ (opts.asOf), validForDays: Number(opts.valid), leadDays: Number(opts.lead),
    }) : raw;
    const baseline = isSaved(input) ? replayReview(input).input : input;
    const merged = opts.receipts ? importReceipts(baseline, await readJson(opts.receipts)).input : baseline;
    const report = buildReview(merged);
    if (opts.previous) {
      const comparison = compareReviews(await readJson(opts.previous), report);
      writeJson(comparison);
    } else if (opts.format === 'summary') {
      process.stdout.write(summarizeReview(report, language));
    } else {
      const result = opts.format === 'candidates' ? toQueueCandidates(report) : report;
      writeJson(result);
    }
    return 0;
  } catch (error) {
    const generic = language === 'fr' ? 'Lecture du fichier JSON impossible.' : 'Could not read the JSON file.';
    const message = error instanceof SourceReviewError ? error.localize(language) :
      error instanceof Usage ? HELP[language] : generic;
    process.stderr.write(message + '\n');
    return error instanceof Usage ? 2 : 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runSourceReview(process.argv.slice(2));
}
