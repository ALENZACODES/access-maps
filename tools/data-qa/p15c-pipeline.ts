/** Offline-only, fail-closed audit of static regional data packages. */
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { checkStrictData, OPEN_LICENCES, type Silo } from './index.js';
import { reportStaleAndMissingLicences } from './stale-licence-report.js';

export type IssueSeverity = 'ERROR' | 'NOTICE';
export type AuditCode =
  | 'MANIFEST_JSON' | 'MANIFEST_SCHEMA' | 'MANIFEST_FIELD' | 'MANIFEST_DATE'
  | 'ASSET_SCHEMA' | 'ASSET_DUPLICATE' | 'ASSET_PATH' | 'ASSET_MISSING'
  | 'ASSET_SYMLINK' | 'ASSET_SIZE' | 'ASSET_HASH' | 'ASSET_READ'
  | 'ASSET_LICENCE' | 'ASSET_SOURCE' | 'ASSET_DATE' | 'ASSET_STALE'
  | 'ASSET_HELD' | 'ASSET_SILO' | 'ASSET_LINEAGE' | 'ASSET_CONTENT'
  | 'ASSET_METADATA' | 'REGION_SCHEMA' | 'REGION_DUPLICATE'
  | 'CELL_SCHEMA' | 'CELL_DUPLICATE' | 'CELL_UNKNOWN' | 'CELL_ASSET'
  | 'CELL_UNREFERENCED' | 'TOTAL_BYTES' | 'INPUT_LIMIT';

export interface AuditIssue {
  readonly code: AuditCode;
  readonly severity: IssueSeverity;
  readonly path: string;
  readonly en: string;
  readonly fr: string;
}

export interface AuditTotals {
  readonly assets: number;
  readonly regions: number;
  readonly cellsPresent: number;
  readonly cellsUnknown: number;
  readonly bytesRead: number;
}

export interface AuditResult {
  readonly ok: boolean;
  readonly schemaVersion: 1;
  readonly asOf: string;
  readonly issues: readonly AuditIssue[];
  readonly totals: AuditTotals;
}

export interface AuditOptions {
  readonly root: string;
  readonly manifestPath: string;
  readonly asOf: string;
  readonly maxAgeDays: number;
  readonly maxAssetBytes?: number;
  readonly maxTotalBytes?: number;
}

type Dictionary = Readonly<Record<AuditCode, readonly [string, string]>>;

const messages: Dictionary = {
  MANIFEST_JSON: ['Manifest is not valid JSON.', 'Le manifeste n’est pas un JSON valide.'],
  MANIFEST_SCHEMA: ['Manifest must be an object.', 'Le manifeste doit être un objet.'],
  MANIFEST_FIELD: ['Manifest has missing or unexpected fields.', 'Le manifeste contient des champs manquants ou inattendus.'],
  MANIFEST_DATE: ['Manifest date is not a valid calendar date.', 'La date du manifeste n’est pas une date civile valide.'],
  ASSET_SCHEMA: ['Asset entry has invalid fields.', 'L’entrée du fichier comporte des champs non valides.'],
  ASSET_DUPLICATE: ['Asset identifier or path is duplicated.', 'L’identifiant ou le chemin du fichier est en double.'],
  ASSET_PATH: ['Asset path must stay inside the offline root.', 'Le chemin du fichier doit rester dans le dossier hors ligne.'],
  ASSET_MISSING: ['Offline asset is missing.', 'Le fichier hors ligne est manquant.'],
  ASSET_SYMLINK: ['Symbolic links are not accepted.', 'Les liens symboliques ne sont pas acceptés.'],
  ASSET_SIZE: ['Asset size does not match or exceeds the limit.', 'La taille du fichier ne correspond pas ou dépasse la limite.'],
  ASSET_HASH: ['Asset SHA-256 does not match.', 'L’empreinte SHA-256 du fichier ne correspond pas.'],
  ASSET_READ: ['Asset cannot be read locally.', 'Le fichier ne peut pas être lu localement.'],
  ASSET_LICENCE: ['Asset licence is absent or unsupported.', 'La licence du fichier est absente ou non prise en charge.'],
  ASSET_SOURCE: ['Asset source is missing.', 'La source du fichier est manquante.'],
  ASSET_DATE: ['Asset observation date is missing or invalid.', 'La date d’observation du fichier est absente ou non valide.'],
  ASSET_STALE: ['Asset observation date is stale or in the future.', 'La date d’observation du fichier est trop ancienne ou future.'],
  ASSET_HELD: ['Held feed is excluded.', 'Le flux retenu est exclu.'],
  ASSET_SILO: ['ODbL material must remain in its separate export.', 'Les données ODbL doivent rester dans leur exportation distincte.'],
  ASSET_LINEAGE: ['Asset lineage is incomplete or incompatible.', 'La provenance du fichier est incomplète ou incompatible.'],
  ASSET_CONTENT: ['Records do not pass the strict data gate.', 'Les enregistrements ne passent pas le contrôle strict des données.'],
  ASSET_METADATA: ['Record provenance is absent from the package declaration.', 'La provenance de l’enregistrement est absente de la déclaration du paquet.'],
  REGION_SCHEMA: ['Region entry has invalid fields.', 'L’entrée de la région comporte des champs non valides.'],
  REGION_DUPLICATE: ['Region identifier is duplicated.', 'L’identifiant de région est en double.'],
  CELL_SCHEMA: ['Cell entry has invalid fields.', 'L’entrée de la cellule comporte des champs non valides.'],
  CELL_DUPLICATE: ['Cell identifier is duplicated in a region.', 'L’identifiant de cellule est en double dans une région.'],
  CELL_UNKNOWN: ['Missing coverage must remain UNKNOWN.', 'La couverture manquante doit rester UNKNOWN.'],
  CELL_ASSET: ['Present cell has no matching offline asset.', 'La cellule présente n’a aucun fichier hors ligne correspondant.'],
  CELL_UNREFERENCED: ['Asset is not referenced by a region cell.', 'Le fichier n’est référencé par aucune cellule de région.'],
  TOTAL_BYTES: ['Total offline bytes exceed the limit.', 'Le total des octets hors ligne dépasse la limite.'],
  INPUT_LIMIT: ['Manifest is larger than the limit.', 'Le manifeste dépasse la limite.'],
};

const ASSET_KEYS = ['id', 'path', 'sha256', 'bytes', 'kind', 'silo', 'source', 'licence', 'observedOn', 'lineage'];
const PROVENANCE_KEYS = ['source', 'licence', 'observedOn'];
const REGION_KEYS = ['id', 'cells'];
const CELL_KEYS = ['id', 'status', 'assetId'];
const MANIFEST_KEYS = ['schemaVersion', 'generatedOn', 'assets', 'regions'];
const DEFAULT_ASSET_MAX = 8 * 1024 * 1024;
const DEFAULT_TOTAL_MAX = 64 * 1024 * 1024;
const MANIFEST_MAX = 1024 * 1024;
const DAY = 86_400_000;

interface Provenance { source: string; licence: string; observedOn: string }
interface Asset extends Provenance {
  id: string;
  path: string;
  sha256: string;
  bytes: number;
  kind: 'records' | 'tiles' | 'text';
  silo: Silo;
  lineage: Provenance[];
}
interface Cell { id: string; status: 'PRESENT' | 'UNKNOWN'; assetId?: string }
interface Region { id: string; cells: Cell[] }
interface Manifest { schemaVersion: 1; generatedOn: string; assets: Asset[]; regions: Region[] }

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key));
}
function dateDay(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(0);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCFullYear(year, month - 1, day);
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
    ? d.getTime() / DAY : null;
}
function held(value: string): boolean {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '').includes('miway');
}
function licence(value: unknown): value is string {
  return typeof value === 'string' && (OPEN_LICENCES as readonly string[]).includes(value);
}
function pathSafe(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0')) return false;
  if (isAbsolute(value) || value.includes('://') || value.startsWith('//')) return false;
  const segments = value.split('/');
  return segments.every(part => part !== '' && part !== '.' && part !== '..' && !part.includes(':'));
}
function relativeInside(root: string, child: string): boolean {
  const rel = relative(root, child);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
function parseProvenance(value: unknown): value is Provenance {
  return object(value) && exactKeys(value, PROVENANCE_KEYS) &&
    nonempty(value.source) && licence(value.licence) && dateDay(value.observedOn) !== null;
}
function parseAsset(value: unknown): value is Asset {
  if (!object(value) || !exactKeys(value, ASSET_KEYS)) return false;
  return nonempty(value.id) && pathSafe(value.path) &&
    typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256) &&
    Number.isSafeInteger(value.bytes) && (value.bytes as number) >= 0 &&
    (value.kind === 'records' || value.kind === 'tiles' || value.kind === 'text') &&
    (value.silo === 'open' || value.silo === 'odbl') &&
    nonempty(value.source) && licence(value.licence) && dateDay(value.observedOn) !== null &&
    Array.isArray(value.lineage) && value.lineage.length > 0 && value.lineage.every(parseProvenance);
}
function parseCell(value: unknown): value is Cell {
  if (!object(value) || !exactKeys(value, CELL_KEYS) || !nonempty(value.id)) return false;
  if (value.status === 'UNKNOWN') return !Object.hasOwn(value, 'assetId');
  return value.status === 'PRESENT' && nonempty(value.assetId);
}
function parseRegion(value: unknown): value is Region {
  return object(value) && exactKeys(value, REGION_KEYS) && nonempty(value.id) &&
    Array.isArray(value.cells) && value.cells.every(parseCell);
}

/** The report is diagnostic; only `ok` permits a subsequent export step. */
export async function auditOfflineBundle(options: AuditOptions): Promise<AuditResult> {
  const asOfDay = dateDay(options.asOf);
  if (asOfDay === null || !Number.isSafeInteger(options.maxAgeDays) || options.maxAgeDays < 0) {
    throw new RangeError('Invalid asOf or maxAgeDays');
  }
  const maxAsset = options.maxAssetBytes ?? DEFAULT_ASSET_MAX;
  const maxTotal = options.maxTotalBytes ?? DEFAULT_TOTAL_MAX;
  if (![maxAsset, maxTotal].every(n => Number.isSafeInteger(n) && n > 0)) {
    throw new RangeError('Invalid byte limit');
  }
  const issues: AuditIssue[] = [];
  const totals = { assets: 0, regions: 0, cellsPresent: 0, cellsUnknown: 0, bytesRead: 0 };
  const add = (code: AuditCode, path: string, severity: IssueSeverity = 'ERROR'): void => {
    const [en, fr] = messages[code];
    issues.push({ code, path, severity, en, fr });
  };
  const finish = (): AuditResult => ({
    ok: !issues.some(issue => issue.severity === 'ERROR'),
    schemaVersion: 1,
    asOf: options.asOf,
    totals: { ...totals },
    issues: [...issues].sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code)),
  });
  const root = resolve(options.root);
  const manifestFile = resolve(root, options.manifestPath);
  if (!relativeInside(root, manifestFile)) {
    add('ASSET_PATH', 'manifestPath');
    return finish();
  }
  let raw: Buffer;
  try {
    const st = await lstat(manifestFile);
    if (st.isSymbolicLink() || !st.isFile()) {
      add('ASSET_SYMLINK', 'manifestPath');
      return finish();
    }
    if (st.size > MANIFEST_MAX) {
      add('INPUT_LIMIT', 'manifestPath');
      return finish();
    }
    raw = await readFile(manifestFile);
    if (raw.length > MANIFEST_MAX) {
      add('INPUT_LIMIT', 'manifestPath');
      return finish();
    }
  } catch {
    add('ASSET_MISSING', 'manifestPath');
    return finish();
  }
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)) as unknown;
  } catch {
    add('MANIFEST_JSON', 'manifestPath');
    return finish();
  }
  if (!object(input)) {
    add('MANIFEST_SCHEMA', '$');
    return finish();
  }
  if (!exactKeys(input, MANIFEST_KEYS) || input.schemaVersion !== 1 ||
      !Array.isArray(input.assets) || !Array.isArray(input.regions)) {
    add('MANIFEST_FIELD', '$');
    return finish();
  }
  if (dateDay(input.generatedOn) === null || (dateDay(input.generatedOn) ?? 0) > asOfDay) {
    add('MANIFEST_DATE', '$.generatedOn');
  }
  const assets: Asset[] = [];
  const regions: Region[] = [];
  input.assets.forEach((entry: unknown, i: number) => {
    const at = `$.assets[${i}]`;
    if (parseAsset(entry)) { assets.push(entry); return; }
    add('ASSET_SCHEMA', at);
    if (!object(entry)) return;
    if (!nonempty(entry.source)) add('ASSET_SOURCE', at);
    else if (held(entry.source)) add('ASSET_HELD', at);
    if (!licence(entry.licence)) add('ASSET_LICENCE', at);
    if (dateDay(entry.observedOn) === null) add('ASSET_DATE', at);
    if (!Array.isArray(entry.lineage)) { add('ASSET_LINEAGE', at); return; }
    entry.lineage.forEach((part: unknown, j: number) => {
      const where = `${at}.lineage[${j}]`;
      if (!object(part)) { add('ASSET_LINEAGE', where); return; }
      if (!nonempty(part.source)) add('ASSET_SOURCE', where);
      else if (held(part.source)) add('ASSET_HELD', where);
      if (!licence(part.licence)) add('ASSET_LICENCE', where);
      if (dateDay(part.observedOn) === null) add('ASSET_DATE', where);
    });
  });
  input.regions.forEach((entry: unknown, i: number) => {
    if (!parseRegion(entry)) add('REGION_SCHEMA', `$.regions[${i}]`);
    else regions.push(entry);
  });
  totals.assets = input.assets.length;
  totals.regions = input.regions.length;
  const assetIds = new Map<string, Asset>();
  const assetPaths = new Set<string>();
  for (const [i, asset] of assets.entries()) {
    const path = `$.assets[${i}]`;
    if (assetIds.has(asset.id) || assetPaths.has(asset.path)) add('ASSET_DUPLICATE', path);
    else assetIds.set(asset.id, asset);
    assetPaths.add(asset.path);
    const sources = [asset, ...asset.lineage];
    for (const [j, part] of sources.entries()) {
      const at = j === 0 ? path : `${path}.lineage[${j - 1}]`;
      if (!part.source.trim()) add('ASSET_SOURCE', at);
      if (!licence(part.licence)) add('ASSET_LICENCE', at);
      const observed = dateDay(part.observedOn);
      if (observed === null) add('ASSET_DATE', at);
      else if (observed > asOfDay || asOfDay - observed > options.maxAgeDays) add('ASSET_STALE', at);
      if (held(part.source)) add('ASSET_HELD', at);
    }
    const odbl = sources.some(part => part.licence === 'ODbL-1.0');
    if ((odbl && (asset.silo !== 'odbl' || asset.licence !== 'ODbL-1.0')) ||
        (!odbl && asset.silo === 'odbl')) add('ASSET_SILO', path);
    if (!asset.lineage.some(part => part.source === asset.source && part.licence === asset.licence &&
                                 part.observedOn === asset.observedOn)) add('ASSET_LINEAGE', path);
  }
  const regionIds = new Set<string>();
  const referenced = new Set<string>();
  for (const [i, region] of regions.entries()) {
    const path = `$.regions[${i}]`;
    if (regionIds.has(region.id)) add('REGION_DUPLICATE', path);
    regionIds.add(region.id);
    const cells = new Set<string>();
    for (const [j, cell] of region.cells.entries()) {
      const at = `${path}.cells[${j}]`;
      if (cells.has(cell.id)) add('CELL_DUPLICATE', at);
      cells.add(cell.id);
      if (cell.status === 'UNKNOWN') {
        totals.cellsUnknown++;
        // UNKNOWN has no asset and is never promoted by a nearby known cell.
        if (cell.assetId !== undefined) add('CELL_UNKNOWN', at);
      } else {
        totals.cellsPresent++;
        if (!cell.assetId || !assetIds.has(cell.assetId)) add('CELL_ASSET', at);
        else referenced.add(cell.assetId);
      }
    }
  }
  for (const [i, asset] of assets.entries()) {
    if (!referenced.has(asset.id)) add('CELL_UNREFERENCED', `$.assets[${i}]`, 'NOTICE');
  }
  // Missing or invalid metadata must never be repaired using the report output.
  const report = reportStaleAndMissingLicences(assets, { asOf: options.asOf, maxAgeDays: options.maxAgeDays });
  for (const issue of report.issues) {
    const code: AuditCode = issue.code === 'DATE_FUTURE'
      ? 'ASSET_STALE' : issue.code.startsWith('DATE_') ? 'ASSET_DATE'
        : issue.code.startsWith('LICENCE_') ? 'ASSET_LICENCE' : 'ASSET_SOURCE';
    const path = `$.assets[${issue.index}]`;
    if (!issues.some(other => other.code === code && other.path === path)) add(code, path);
  }
  let realRoot: string;
  try { realRoot = await realpath(root); }
  catch { add('ASSET_PATH', 'root'); return finish(); }
  for (const [i, asset] of assets.entries()) {
    const at = `$.assets[${i}]`;
    const absolute = resolve(root, asset.path);
    if (!relativeInside(root, absolute)) { add('ASSET_PATH', at); continue; }
    if (asset.bytes > maxAsset) { add('ASSET_SIZE', at); continue; }
    let bytes: Buffer;
    try {
      // Reject symlinked parents as well as a symlinked leaf.
      let current = absolute;
      while (current !== root) {
        if ((await lstat(current)).isSymbolicLink()) throw new Error('symlink');
        current = dirname(current);
      }
      const actual = await realpath(absolute);
      if (!relativeInside(realRoot, actual)) { add('ASSET_PATH', at); continue; }
      const stat = await lstat(absolute);
      if (!stat.isFile()) { add('ASSET_READ', at); continue; }
      if (stat.size !== asset.bytes || stat.size > maxAsset) { add('ASSET_SIZE', at); continue; }
      if (totals.bytesRead + stat.size > maxTotal) { add('TOTAL_BYTES', at); continue; }
      bytes = await readFile(absolute);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      add(message === 'symlink' ? 'ASSET_SYMLINK' : 'ASSET_MISSING', at);
      continue;
    }
    totals.bytesRead += bytes.length;
    if (bytes.length !== asset.bytes) { add('ASSET_SIZE', at); continue; }
    if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
      add('ASSET_HASH', at);
      continue;
    }
    if (asset.kind !== 'records') continue;
    let data: unknown;
    try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; }
    catch { add('ASSET_CONTENT', at); continue; }
    const strict = checkStrictData(data, asset.silo);
    if (!strict.ok) { add('ASSET_CONTENT', at); continue; }
    const declared = new Set(asset.lineage.map(p => `${p.source}\0${p.licence}\0${p.observedOn}`));
    for (const [j, record] of strict.records.entries()) {
      const parts = [record, ...record.lineage];
      if (parts.some(p => !declared.has(`${p.source}\0${p.licence}\0${p.observedOn}`))) {
        add('ASSET_METADATA', `${at}.records[${j}]`);
      }
    }
  }
  return finish();
}

/** Stable, machine-readable output for local QA and CI artifacts. */
export function renderAuditJson(result: AuditResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

/** Plain-text report uses only the requested language, never borrowed claims. */
export function renderAuditText(result: AuditResult, language: 'en' | 'fr'): string {
  const title = language === 'en' ? 'Offline data QA' : 'Contrôle des données hors ligne';
  const state = result.ok ? (language === 'en' ? 'PASS' : 'RÉUSSI') :
    (language === 'en' ? 'BLOCKED' : 'BLOQUÉ');
  const rows = result.issues.map(issue =>
    `${issue.severity} ${issue.code} ${issue.path}: ${language === 'en' ? issue.en : issue.fr}`);
  return [title, `${state} (${result.asOf})`, ...rows].join('\n') + '\n';
}
