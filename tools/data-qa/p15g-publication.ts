/** Fail-closed gate for offline, bilingual location publication packages. */
import { OPEN_LICENCES } from './index.js';

export type AccessState = 'YES' | 'NO' | 'UNKNOWN';
export type ExportSilo = 'open' | 'odbl';
export type AuditLocale = 'en' | 'fr';
export interface PublicationFinding {
  readonly code: string;
  readonly path: string;
  readonly en: string;
  readonly fr: string;
}
export interface PublicationSummary {
  sources: number;
  places: number;
  unknown: number;
  asserted: number;
  assets: number;
}
export interface PublicationReport {
  readonly ok: boolean;
  readonly findings: readonly PublicationFinding[];
  readonly summary: PublicationSummary;
}

const LABELS = {
  ROOT: ['Package schema is invalid.', 'Le schéma du paquet est non valide.'],
  DATE: ['Publication date is not a calendar date.', 'La date de publication n’est pas une date civile.'],
  LIMIT: ['The package exceeds its safe record limit.', 'Le paquet dépasse la limite autorisée.'],
  SOURCE: ['Source metadata is incomplete.', 'Les renseignements de source sont incomplets.'],
  LICENCE: ['Source licence is absent or not open.', 'La licence de la source est absente ou non ouverte.'],
  HELD: ['A held transport feed cannot be published.', 'Un flux de transport retenu ne peut pas être publié.'],
  STALE: ['Source date is old or in the future.', 'La date de la source est ancienne ou future.'],
  REFERENCE: ['A local source reference is required.', 'Une référence de source locale est requise.'],
  DUPLICATE: ['An identifier is repeated.', 'Un identifiant est répété.'],
  PLACE: ['Place record is incomplete.', 'La fiche du lieu est incomplète.'],
  UNKNOWN: ['Missing access information must remain UNKNOWN.', 'L’information d’accès manquante doit rester UNKNOWN.'],
  EVIDENCE: ['A stated access value requires matching dated evidence.', 'Un état d’accès déclaré exige une observation datée correspondante.'],
  CONFLICT: ['Conflicting evidence must result in UNKNOWN.', 'Des observations contradictoires doivent donner UNKNOWN.'],
  ORPHAN: ['Evidence refers to a different place or feature.', 'L’observation renvoie à un autre lieu ou élément.'],
  SILO: ['ODbL sources belong in a separate ODbL export.', 'Les sources ODbL doivent rester dans une exportation distincte.'],
  TRANSLATION: ['English and French labels are required.', 'Les libellés en anglais et en français sont obligatoires.'],
  CONTENT: ['Labels contain unsafe or misleading text.', 'Les libellés contiennent un texte dangereux ou trompeur.'],
  PUNCTUATION: ['French typography needs nonbreaking spacing.', 'La typographie française exige des espaces insécables.'],
  TARGET: ['Interactive target must be at least 44 px.', 'La cible interactive doit mesurer au moins 44 px.'],
  ASSET: ['Offline asset metadata is incomplete.', 'Les renseignements sur le fichier hors ligne sont incomplets.'],
  LINK: ['Offline references must be local and safe.', 'Les références hors ligne doivent être locales et sûres.'],
  HASH: ['Offline asset needs a SHA-256 digest.', 'Le fichier hors ligne exige une empreinte SHA-256.'],
  ASSET_SOURCE: ['Offline asset points to an unknown source.', 'Le fichier hors ligne renvoie à une source inconnue.'],
  ASSET_SILO: ['Asset export silo does not match its sources.', 'L’exportation du fichier ne correspond pas à ses sources.'],
  ASSET_LINK: ['A place references an unavailable offline asset.', 'Un lieu renvoie à un fichier hors ligne indisponible.'],
  MISSING_SOURCE: ['Place evidence refers to an unknown source.', 'L’observation du lieu renvoie à une source inconnue.'],
} as const;
type FindingCode = keyof typeof LABELS;
const LICENCES: ReadonlySet<string> = new Set(OPEN_LICENCES);
const FIELDS = new Set(['entrance', 'washroom', 'lift', 'parking', 'path', 'seating']);
const ACCESS = new Set(['YES', 'NO', 'UNKNOWN']);
const SILOS = new Set(['open', 'odbl']);
const MAX_SOURCES = 5000;
const MAX_PLACES = 20000;
const MAX_ASSETS = 20000;
const DAY_MS = 86_400_000;
const UNSAFE = /<\s*\/?\s*[a-z]|javascript\s*:|data\s*:|\bon\w+\s*=|[\u0000-\u001f\u007f]/i;
const PERSONAL = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:token|password|secret|apikey)\s*[:=]/i;
const OVERCLAIM = /\b(?:verified|verify|guaranteed|real[- ]time|partnership|vérifié|garanti|temps réel|partenariat)\b/i;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  return required.every(k => Object.hasOwn(value, k)) &&
    Object.keys(value).every(k => required.includes(k) || optional.includes(k));
}
function nonempty(value: unknown, max = 512): value is string {
  return typeof value === 'string' && value.trim() === value && value.length > 0 &&
    value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}
function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 96 &&
    /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/.test(value);
}
function dateDay(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day ? date.getTime() / DAY_MS : null;
}
function localPath(value: unknown): value is string {
  if (!nonempty(value, 512) || value.startsWith('/') || value.includes('\\') ||
      value.includes('%') || value.includes('?') || value.includes('#') || value.includes(':')) return false;
  return value.split('/').every(p => p !== '' && p !== '.' && p !== '..');
}
function held(value: string): boolean {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '').includes('miway');
}
function frenchTypography(value: string): boolean {
  if (/[a-zÀ-ÿ]'[a-zÀ-ÿ]/i.test(value)) return false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === ':' && i > 0 && value[i - 1] !== '\u00a0') return false;
    if (char !== undefined && ';!?'.includes(char) && i > 0 && value[i - 1] !== '\u202f') return false;
    if (char === '«' && value[i + 1] !== '\u202f') return false;
    if (char === '»' && value[i - 1] !== '\u202f') return false;
  }
  return true;
}
function safeLabel(value: unknown): value is string {
  return nonempty(value, 280) && !UNSAFE.test(value) && !PERSONAL.test(value) && !OVERCLAIM.test(value);
}
interface Source {
  id: string;
  name: string;
  licence: string;
  observedOn: string;
  reference: string;
}
interface Evidence {
  feature: string;
  access: AccessState;
  sourceId: string;
  observedOn: string;
}
interface Place {
  id: string;
  en: string;
  fr: string;
  feature: string;
  access: AccessState;
  sourceIds: string[];
  evidence: Evidence[];
  assetIds: string[];
  targetPx: number;
  silo: ExportSilo;
}
interface Asset {
  id: string;
  path: string;
  sha256: string;
  bytes: number;
  sourceIds: string[];
  silo: ExportSilo;
}

/** Publication is permitted only if every diagnostic is empty. */
export function auditPublication(input: unknown): PublicationReport {
  const findings: PublicationFinding[] = [];
  const summary: PublicationSummary = { sources: 0, places: 0, unknown: 0, asserted: 0, assets: 0 };
  const add = (code: FindingCode, path: string): void => {
    const [en, fr] = LABELS[code];
    findings.push({ code, path, en, fr });
  };
  const finish = (): PublicationReport => ({
    ok: findings.length === 0,
    findings: [...findings].sort((a, b) => a.path.localeCompare(b.path, 'en') ||
      a.code.localeCompare(b.code, 'en')),
    summary: { ...summary },
  });
  if (!record(input) || !keys(input, ['schemaVersion', 'asOf', 'maxAgeDays', 'sources', 'places', 'assets']) ||
      input.schemaVersion !== 1 || !Array.isArray(input.sources) || !Array.isArray(input.places) ||
      !Array.isArray(input.assets)) {
    add('ROOT', '$');
    return finish();
  }
  const asOf = dateDay(input.asOf);
  if (asOf === null || !Number.isSafeInteger(input.maxAgeDays) ||
      (input.maxAgeDays as number) < 0 || (input.maxAgeDays as number) > 3650) {
    add('DATE', '$.asOf');
    return finish();
  }
  if (input.sources.length > MAX_SOURCES || input.places.length > MAX_PLACES ||
      input.assets.length > MAX_ASSETS) {
    add('LIMIT', '$');
    return finish();
  }
  summary.sources = input.sources.length;
  summary.places = input.places.length;
  summary.assets = input.assets.length;
  const sources = new Map<string, Source>();
  for (const [i, value] of input.sources.entries()) {
    const at = `$.sources[${i}]`;
    if (!record(value) || !keys(value, ['id', 'name', 'licence', 'observedOn', 'reference']) ||
        !identifier(value.id) || !nonempty(value.name)) {
      add('SOURCE', at);
      continue;
    }
    if (sources.has(value.id)) add('DUPLICATE', `${at}.id`);
    if (held(value.name)) add('HELD', `${at}.name`);
    if (!LICENCES.has(value.licence as string)) add('LICENCE', `${at}.licence`);
    if (!localPath(value.reference)) add('REFERENCE', `${at}.reference`);
    const observed = dateDay(value.observedOn);
    if (observed === null || observed > asOf || asOf - observed > (input.maxAgeDays as number)) {
      add('STALE', `${at}.observedOn`);
    }
    if (nonempty(value.licence) && nonempty(value.observedOn) && nonempty(value.reference)) {
      sources.set(value.id, { id: value.id, name: value.name, licence: value.licence,
        observedOn: value.observedOn, reference: value.reference });
    }
  }
  const assets = new Map<string, Asset>();
  const assetPaths = new Set<string>();
  for (const [i, value] of input.assets.entries()) {
    const at = `$.assets[${i}]`;
    if (!record(value) || !keys(value, ['id', 'path', 'sha256', 'bytes', 'sourceIds', 'silo']) ||
        !identifier(value.id) || !Array.isArray(value.sourceIds) || value.sourceIds.length === 0 ||
        !value.sourceIds.every(identifier) || !SILOS.has(value.silo as string) ||
        !Number.isSafeInteger(value.bytes) || (value.bytes as number) <= 0) {
      add('ASSET', at);
      continue;
    }
    if (assets.has(value.id)) add('DUPLICATE', `${at}.id`);
    if (!localPath(value.path)) add('LINK', `${at}.path`);
    else if (assetPaths.has(value.path)) add('DUPLICATE', `${at}.path`);
    else assetPaths.add(value.path);
    if (typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)) {
      add('HASH', `${at}.sha256`);
    }
    if (new Set(value.sourceIds).size !== value.sourceIds.length) add('DUPLICATE', `${at}.sourceIds`);
    for (const sourceId of value.sourceIds as string[]) {
      if (!sources.has(sourceId)) add('ASSET_SOURCE', `${at}.sourceIds`);
    }
    const needsOdbl = value.sourceIds.some((id: string) => sources.get(id)?.licence === 'ODbL-1.0');
    if ((needsOdbl ? 'odbl' : 'open') !== value.silo) add('ASSET_SILO', `${at}.silo`);
    if (localPath(value.path) && typeof value.sha256 === 'string') {
      assets.set(value.id, { id: value.id, path: value.path, sha256: value.sha256,
        bytes: value.bytes as number, sourceIds: value.sourceIds as string[], silo: value.silo as ExportSilo });
    }
  }
  const places = new Set<string>();
  for (const [i, value] of input.places.entries()) {
    const at = `$.places[${i}]`;
    if (!record(value) || !keys(value, ['id', 'en', 'fr', 'feature', 'access', 'sourceIds',
        'evidence', 'assetIds', 'targetPx', 'silo']) || !identifier(value.id) ||
        !FIELDS.has(value.feature as string) || !ACCESS.has(value.access as string) ||
        !SILOS.has(value.silo as string) || !Array.isArray(value.sourceIds) ||
        !value.sourceIds.every(identifier) || !Array.isArray(value.evidence) ||
        !Array.isArray(value.assetIds) || !value.assetIds.every(identifier)) {
      add('PLACE', at);
      continue;
    }
    if (places.has(value.id)) add('DUPLICATE', `${at}.id`);
    places.add(value.id);
    if (!safeLabel(value.en) || !safeLabel(value.fr)) add('CONTENT', `${at}.labels`);
    else if (!frenchTypography(value.fr)) add('PUNCTUATION', `${at}.fr`);
    if (!nonempty(value.en) || !nonempty(value.fr)) add('TRANSLATION', `${at}.labels`);
    if (typeof value.targetPx !== 'number' || !Number.isFinite(value.targetPx) || value.targetPx < 44) {
      add('TARGET', `${at}.targetPx`);
    }
    if (value.access === 'UNKNOWN') summary.unknown++;
    else summary.asserted++;
    const ids = value.sourceIds as string[];
    if (new Set(ids).size !== ids.length) add('DUPLICATE', `${at}.sourceIds`);
    for (const id of ids) if (!sources.has(id)) add('MISSING_SOURCE', `${at}.sourceIds`);
    const needsOdbl = ids.some(id => sources.get(id)?.licence === 'ODbL-1.0');
    if ((needsOdbl ? 'odbl' : 'open') !== value.silo) add('SILO', `${at}.silo`);
    const evidence: Evidence[] = [];
    for (const [j, item] of value.evidence.entries()) {
      const where = `${at}.evidence[${j}]`;
      if (!record(item) || !keys(item, ['feature', 'access', 'sourceId', 'observedOn']) ||
          !FIELDS.has(item.feature as string) || !ACCESS.has(item.access as string) ||
          !identifier(item.sourceId)) {
        add('EVIDENCE', where);
        continue;
      }
      if (item.feature !== value.feature || !ids.includes(item.sourceId)) add('ORPHAN', where);
      const day = dateDay(item.observedOn);
      const source = sources.get(item.sourceId);
      if (!source) add('MISSING_SOURCE', `${where}.sourceId`);
      if (day === null || day > asOf || asOf - day > (input.maxAgeDays as number) ||
          (source && day < (dateDay(source.observedOn) ?? Infinity))) add('STALE', `${where}.observedOn`);
      if (day !== null) evidence.push({ feature: item.feature as string,
        access: item.access as AccessState, sourceId: item.sourceId, observedOn: item.observedOn as string });
    }
    const yes = evidence.some(e => e.access === 'YES');
    const no = evidence.some(e => e.access === 'NO');
    if (yes && no && value.access !== 'UNKNOWN') add('CONFLICT', `${at}.access`);
    if (value.access !== 'UNKNOWN' && !evidence.some(e => e.access === value.access)) {
      add('EVIDENCE', `${at}.access`);
    }
    if (value.access !== 'UNKNOWN' && (yes && no || evidence.length === 0)) {
      add('UNKNOWN', `${at}.access`);
    }
    const assetIds = value.assetIds as string[];
    if (new Set(assetIds).size !== assetIds.length) add('DUPLICATE', `${at}.assetIds`);
    for (const id of assetIds) {
      const asset = assets.get(id);
      if (!asset) add('ASSET_LINK', `${at}.assetIds`);
      else if (asset.silo !== value.silo || !asset.sourceIds.every(sourceId => ids.includes(sourceId))) {
        add('ASSET_SILO', `${at}.assetIds`);
      }
    }
  }
  return finish();
}

export function publicationText(report: PublicationReport, locale: AuditLocale): string {
  const header = locale === 'fr' ? (report.ok ? 'Contrôle réussi' : 'Exportation bloquée') :
    (report.ok ? 'Check passed' : 'Export blocked');
  return [header, ...report.findings.map(f => `${f.code} ${f.path}: ${f[locale]}`)].join('\n') + '\n';
}
