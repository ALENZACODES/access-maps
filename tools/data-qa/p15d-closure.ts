/** Offline export closure: every local dependency must exist in the package. */
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';

export type ClosureCode =
  | 'BAD_INDEX' | 'BAD_PATH' | 'DUPLICATE' | 'MISSING' | 'LINK'
  | 'OUTSIDE' | 'REMOTE' | 'UNDECLARED' | 'UNUSED' | 'BYTES'
  | 'HASH' | 'SIZE' | 'CYCLE' | 'ENCODING' | 'DYNAMIC'
  | 'BUDGET' | 'MIME' | 'NO_ENTRY';
export interface ClosureFinding {
  readonly code: ClosureCode;
  readonly file: string;
  readonly en: string;
  readonly fr: string;
}
export interface ClosureEntry {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly mediaType: 'text/html' | 'text/css' | 'application/javascript' |
    'application/json' | 'image/svg+xml' | 'image/png' | 'image/jpeg' |
    'image/webp' | 'font/woff2';
}
export interface ClosureOptions {
  readonly root: string;
  readonly entries: readonly ClosureEntry[];
  readonly pagePaths: readonly string[];
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
}
export interface ClosureReport {
  readonly ok: boolean;
  readonly findings: readonly ClosureFinding[];
  readonly files: number;
  readonly bytesRead: number;
  readonly reachableFiles: number;
}
const phrases: Record<ClosureCode, readonly [string, string]> = {
  BAD_INDEX: ['File inventory is malformed.', 'L’inventaire des fichiers est mal formé.'],
  BAD_PATH: ['A local filename is unsafe.', 'Un nom de fichier local est non sûr.'],
  DUPLICATE: ['A filename occurs more than once.', 'Un nom de fichier est en double.'],
  MISSING: ['A required local file is missing.', 'Un fichier local requis est absent.'],
  LINK: ['A symlink is not allowed inside an offline export.', 'Un lien symbolique n’est pas autorisé dans une exportation hors ligne.'],
  OUTSIDE: ['A file reference leaves the export directory.', 'Une référence de fichier sort du dossier d’exportation.'],
  REMOTE: ['Offline pages cannot request remote assets.', 'Les pages hors ligne ne peuvent pas demander de ressources distantes.'],
  UNDECLARED: ['A local dependency is missing from inventory.', 'Une dépendance locale est absente de l’inventaire.'],
  UNUSED: ['An inventoried file is unreachable from the entry pages.', 'Un fichier inventorié est inaccessible depuis les pages d’entrée.'],
  BYTES: ['A local file exceeds the byte limit.', 'Un fichier local dépasse la limite d’octets.'],
  HASH: ['A local file digest does not match the inventory.', 'L’empreinte du fichier local diffère de l’inventaire.'],
  SIZE: ['A local file size does not match inventory.', 'La taille du fichier local diffère de l’inventaire.'],
  CYCLE: ['A stylesheet import cycle was found.', 'Un cycle d’importation de feuilles de style a été trouvé.'],
  ENCODING: ['A text file is not UTF-8.', 'Un fichier texte n’est pas en UTF-8.'],
  DYNAMIC: ['A dynamic asset loader cannot be assessed offline.', 'Un chargeur de ressources dynamique ne peut pas être évalué hors ligne.'],
  BUDGET: ['The offline file budget was exceeded.', 'Le budget des fichiers hors ligne a été dépassé.'],
  MIME: ['The file extension does not match the declared type.', 'L’extension du fichier ne correspond pas au type déclaré.'],
  NO_ENTRY: ['An entry page was not declared.', 'Une page d’entrée n’a pas été déclarée.'],
};
const types: Record<ClosureEntry['mediaType'], readonly string[]> = {
  'text/html': ['.html', '.htm'],
  'text/css': ['.css'],
  'application/javascript': ['.js', '.mjs'],
  'application/json': ['.json'],
  'image/svg+xml': ['.svg'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'font/woff2': ['.woff2'],
};
const textTypes = new Set<ClosureEntry['mediaType']>([
  'text/html', 'text/css', 'application/javascript', 'application/json', 'image/svg+xml',
]);
function safe(path: string): boolean {
  return !!path && !isAbsolute(path) && !path.includes('\\') && !path.includes('\0') &&
    !path.startsWith('/') && !path.includes('://') &&
    path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..' &&
      !segment.includes(':'));
}
function inside(root: string, file: string): boolean {
  const rel = relative(root, file);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function external(value: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value);
}
function normalizeDependency(base: string, link: string): string | null {
  const withoutQuery = link.split(/[?#]/)[0] ?? '';
  if (!withoutQuery) return null;
  try {
    const decoded = decodeURIComponent(withoutQuery);
    if (decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('\0')) return null;
    const absolute = resolve('/export', dirname(base), decoded);
    if (!inside('/export', absolute)) return null;
    return relative('/export', absolute).split(sep).join('/');
  } catch { return null; }
}
function htmlReferences(value: string): string[] {
  const refs: string[] = [];
  const tags = /<(?:script|link|img|source|video|audio|track|iframe|object|embed|a)\b[^>]*>/gi;
  for (const tag of value.matchAll(tags)) {
    const attributes = tag[0];
    for (const attr of attributes.matchAll(/\b(?:src|href|poster|data)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      refs.push(attr[1] ?? attr[2] ?? '');
    }
    for (const attr of attributes.matchAll(/\bsrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      for (const variant of (attr[1] ?? attr[2] ?? '').split(',')) {
        const path = variant.trim().split(/\s+/)[0];
        if (path) refs.push(path);
      }
    }
  }
  return refs;
}
function cssReferences(value: string): string[] {
  const refs: string[] = [];
  for (const match of value.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
    refs.push((match[1] ?? match[2] ?? match[3] ?? '').trim());
  }
  for (const match of value.matchAll(/@import\s+(?:"([^"]+)"|'([^']+)')/gi)) {
    refs.push(match[1] ?? match[2] ?? '');
  }
  return refs;
}
function scriptReferences(value: string): string[] {
  const refs: string[] = [];
  for (const match of value.matchAll(/\bimport\s*(?:[^;]*?\s+from\s*)?["']([^"']+)["']/g)) {
    refs.push(match[1] ?? '');
  }
  for (const match of value.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    refs.push(match[1] ?? '');
  }
  return refs;
}
function references(entry: ClosureEntry, content: string): string[] {
  if (entry.mediaType === 'text/html') return htmlReferences(content);
  if (entry.mediaType === 'text/css') return cssReferences(content);
  if (entry.mediaType === 'application/javascript') return scriptReferences(content);
  return [];
}

/** Inventory-only offline closure; reject remote links, symlinks, mismatched files and escape paths. */
export async function auditOfflineClosure(options: ClosureOptions): Promise<ClosureReport> {
  if (!Number.isSafeInteger(options.maxFileBytes) || options.maxFileBytes < 1 ||
      !Number.isSafeInteger(options.maxTotalBytes) || options.maxTotalBytes < 1) {
    throw new RangeError('Invalid offline byte limits');
  }
  const findings: ClosureFinding[] = [];
  const add = (code: ClosureCode, file: string): void => {
    const [en, fr] = phrases[code];
    findings.push({ code, file, en, fr });
  };
  const inventory = new Map<string, ClosureEntry>();
  const root = resolve(options.root);
  let bytesRead = 0;
  const contents = new Map<string, string>();
  for (const [i, entry] of options.entries.entries()) {
    const file = `entries[${i}]`;
    if (!entry || typeof entry.path !== 'string' || !safe(entry.path) ||
        !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 ||
        typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
        !Object.hasOwn(types, entry.mediaType)) {
      add('BAD_INDEX', file);
      continue;
    }
    if (inventory.has(entry.path)) add('DUPLICATE', entry.path);
    inventory.set(entry.path, entry);
    if (!types[entry.mediaType].includes(extname(entry.path).toLowerCase())) add('MIME', entry.path);
  }
  const realRoot = await realpath(root);
  for (const entry of inventory.values()) {
    const file = resolve(root, entry.path);
    if (!inside(root, file)) { add('BAD_PATH', entry.path); continue; }
    if (entry.bytes > options.maxFileBytes) { add('BYTES', entry.path); continue; }
    try {
      let walk = file;
      while (walk !== root) {
        const stat = await lstat(walk);
        if (stat.isSymbolicLink()) throw new Error('symlink');
        walk = dirname(walk);
      }
      const actual = await realpath(file);
      if (!inside(realRoot, actual)) { add('OUTSIDE', entry.path); continue; }
      const stat = await lstat(file);
      if (!stat.isFile()) { add('MISSING', entry.path); continue; }
      if (stat.size !== entry.bytes) { add('SIZE', entry.path); continue; }
      if (bytesRead + entry.bytes > options.maxTotalBytes) { add('BUDGET', entry.path); continue; }
      const bytes = await readFile(file);
      bytesRead += bytes.length;
      if (bytes.length !== entry.bytes) { add('SIZE', entry.path); continue; }
      if (createHash('sha256').update(bytes).digest('hex') !== entry.sha256) {
        add('HASH', entry.path);
        continue;
      }
      if (textTypes.has(entry.mediaType)) {
        try { contents.set(entry.path, new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
        catch { add('ENCODING', entry.path); }
      }
    } catch (error) {
      add(error instanceof Error && error.message === 'symlink' ? 'LINK' : 'MISSING', entry.path);
    }
  }
  const reachable = new Set<string>();
  const active = new Set<string>();
  const visit = (file: string): void => {
    if (active.has(file)) { add('CYCLE', file); return; }
    if (reachable.has(file)) return;
    reachable.add(file);
    const entry = inventory.get(file);
    const body = contents.get(file);
    if (!entry || body === undefined) return;
    active.add(file);
    if (entry.mediaType === 'application/javascript' &&
        (/\bimport\s*\(\s*[^"'\s]/.test(body) || /\bfetch\s*\(/.test(body))) {
      add('DYNAMIC', file);
    }
    for (const link of references(entry, body)) {
      if (link.startsWith('#') || link === '' || link.startsWith('mailto:') || link.startsWith('tel:')) continue;
      if (external(link)) { add('REMOTE', file); continue; }
      const target = normalizeDependency(file, link);
      if (!target) { add('BAD_PATH', file); continue; }
      if (!inventory.has(target)) { add('UNDECLARED', `${file} -> ${target}`); continue; }
      visit(target);
    }
    active.delete(file);
  };
  if (options.pagePaths.length === 0) add('NO_ENTRY', 'pagePaths');
  for (const page of options.pagePaths) {
    if (!safe(page) || inventory.get(page)?.mediaType !== 'text/html') {
      add('NO_ENTRY', page);
      continue;
    }
    visit(page);
  }
  for (const entry of inventory.values()) if (!reachable.has(entry.path)) add('UNUSED', entry.path);
  return { ok: findings.length === 0, files: inventory.size, bytesRead,
    reachableFiles: reachable.size,
    findings: findings.sort((a, b) => a.file.localeCompare(b.file) || a.code.localeCompare(b.code)) };
}

export function closureText(report: ClosureReport, language: 'en' | 'fr'): string {
  const title = language === 'en' ? 'Offline dependency check' : 'Contrôle des dépendances hors ligne';
  const result = report.ok ? (language === 'en' ? 'PASS' : 'RÉUSSI') :
    (language === 'en' ? 'BLOCKED' : 'BLOQUÉ');
  return [title, result, ...report.findings.map(issue =>
    `${issue.code} ${issue.file}: ${issue[language]}`)].join('\n') + '\n';
}
