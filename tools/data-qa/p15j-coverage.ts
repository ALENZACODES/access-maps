/** Bilingual offline coverage parity, source retention, and UNKNOWN preservation. */
import {
  access, array, current, day, exact, finish, frenchText, identifier, integer,
  object, pathLocal, printable, push, safeText, silo, stamp, stampSilo,
  unique, type Access, type Finding, type Report, type Silo, type Stamp,
} from './p15j-core.js';

export interface CoverageSource extends Stamp { readonly id: string }
export interface CoveragePoint {
  readonly id: string;
  readonly feature: string;
  readonly access: Access;
  readonly sourceIds: readonly string[];
  readonly labelEn: string;
  readonly labelFr: string;
  readonly descriptionEn: string;
  readonly descriptionFr: string;
  readonly silo: Silo;
}
export interface RegionLanguage {
  readonly id: string;
  readonly locale: 'en' | 'fr';
  readonly path: string;
  readonly pointIds: readonly string[];
  readonly sizeBytes: number;
}
export interface CoverageInput {
  readonly schemaVersion: 1;
  readonly asOf: string;
  readonly maxAgeDays: number;
  readonly sources: readonly CoverageSource[];
  readonly points: readonly CoveragePoint[];
  readonly regions: readonly RegionLanguage[];
}
export interface CoverageTotals {
  readonly points: number;
  readonly regions: number;
  readonly regionPairs: number;
  readonly unknown: number;
  readonly known: number;
  readonly sources: number;
  readonly maxRegionBytes: number;
}
export type CoverageReport = Report<CoverageTotals>;
const WORDS = {
  ROOT: ['Coverage inventory has an invalid structure.', 'L’inventaire de couverture a une structure non valide.'],
  POLICY: ['Observation review date or age is invalid.', 'La date de contrôle ou l’ancienneté est non valide.'],
  SOURCE: ['Source metadata must name an open licence and date.', 'La source doit indiquer une licence ouverte et une date.'],
  POINT: ['Coverage point contains incomplete or unexpected fields.', 'Le point de couverture contient des champs incomplets ou inattendus.'],
  REGION: ['Offline regional language entry is incomplete.', 'L’entrée linguistique de la région hors ligne est incomplète.'],
  DATE: ['Source observation is stale or future-dated.', 'La date d’observation de la source est ancienne ou future.'],
  DUPLICATE: ['A point, source or language path occurs more than once.', 'Un point, une source ou un chemin linguistique est en double.'],
  MISSING: ['Coverage reference points to a missing item.', 'Une référence de couverture vise un élément manquant.'],
  PARITY: ['English and French offline coverage must contain the same points.', 'Les couvertures hors ligne en anglais et en français doivent contenir les mêmes points.'],
  LANGUAGE: ['Each region must have one English and one French page.', 'Chaque région doit avoir une page anglaise et une page française.'],
  PATH: ['English and French pages need distinct local paths.', 'Les pages anglaises et françaises exigent des chemins locaux distincts.'],
  UNKNOWN: ['UNKNOWN must remain visible without inferred access.', 'UNKNOWN doit rester visible sans accès déduit.'],
  TEXT: ['English and French descriptions must be present and safe.', 'Les descriptions anglaises et françaises doivent être présentes et sûres.'],
  SILO: ['ODbL source material must stay in its own export.', 'Les sources ODbL doivent rester dans leur exportation distincte.'],
  SOURCELESS: ['A known access state needs recorded source evidence.', 'Un état d’accès connu exige une source enregistrée.'],
  UNUSED: ['The coverage source is not referenced by any point.', 'La source de couverture n’est référencée par aucun point.'],
  UNPUBLISHED: ['A point does not appear in any offline region.', 'Un point n’apparaît dans aucune région hors ligne.'],
  TOO_LARGE: ['An offline page exceeds the configured size limit.', 'Une page hors ligne dépasse la limite de taille configurée.'],
  LIMIT: ['Coverage inventory exceeds the supported size.', 'L’inventaire de couverture dépasse la taille prise en charge.'],
} as const;
const SOURCE_FIELDS = ['id', 'source', 'licence', 'observedOn', 'reference'];
const POINT_FIELDS = ['id', 'feature', 'access', 'sourceIds', 'labelEn', 'labelFr', 'descriptionEn', 'descriptionFr', 'silo'];
const REGION_FIELDS = ['id', 'locale', 'path', 'pointIds', 'sizeBytes'];
function identifiers(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 10000 && value.every(identifier);
}
function parseSource(value: unknown): value is CoverageSource {
  return object(value) && exact(value, SOURCE_FIELDS) && identifier(value.id) &&
    stamp({ source: value.source, licence: value.licence, observedOn: value.observedOn, reference: value.reference });
}
function parsePoint(value: unknown): value is CoveragePoint {
  return object(value) && exact(value, POINT_FIELDS) && identifier(value.id) &&
    identifier(value.feature) && access(value.access) && identifiers(value.sourceIds) &&
    safeText(value.labelEn) && frenchText(value.labelFr) &&
    safeText(value.descriptionEn) && frenchText(value.descriptionFr) && silo(value.silo);
}
function parseRegion(value: unknown): value is RegionLanguage {
  return object(value) && exact(value, REGION_FIELDS) && identifier(value.id) &&
    (value.locale === 'en' || value.locale === 'fr') && pathLocal(value.path) &&
    identifiers(value.pointIds) && integer(value.sizeBytes, 0, 32 * 1024 * 1024);
}
function duplicate(values: readonly string[]): boolean {
  return !unique(values);
}

/** Checks that downloadable EN/FR coverage cannot disagree about published records. */
export function auditCoverage(input: unknown, maxRegionBytes = 4 * 1024 * 1024): CoverageReport {
  const findings: Finding[] = [];
  const add = (code: keyof typeof WORDS, path: string, severity: 'ERROR' | 'NOTICE' = 'ERROR'): void =>
    push(findings, WORDS, code, path, severity);
  const zero: CoverageTotals = { points: 0, regions: 0, regionPairs: 0,
    unknown: 0, known: 0, sources: 0, maxRegionBytes: 0 };
  if (!object(input) || !exact(input, ['schemaVersion', 'asOf', 'maxAgeDays', 'sources', 'points', 'regions']) ||
      input.schemaVersion !== 1) { add('ROOT', '$'); return finish(findings, zero); }
  if (day(input.asOf) === null || !integer(input.maxAgeDays, 0, 3650) ||
      !integer(maxRegionBytes, 1, 32 * 1024 * 1024)) {
    add('POLICY', '$'); return finish(findings, zero);
  }
  const rawSources = array(input.sources, 10000);
  const rawPoints = array(input.points, 10000);
  const rawRegions = array(input.regions, 10000);
  if (!rawSources || !rawPoints || !rawRegions) {
    add('LIMIT', '$'); return finish(findings, zero);
  }
  const sources: CoverageSource[] = [];
  const points: CoveragePoint[] = [];
  const regions: RegionLanguage[] = [];
  rawSources.forEach((value, index) => {
    if (!parseSource(value)) add('SOURCE', `$.sources[${index}]`);
    else sources.push(value);
  });
  rawPoints.forEach((value, index) => {
    if (!parsePoint(value)) add('POINT', `$.points[${index}]`);
    else points.push(value);
  });
  rawRegions.forEach((value, index) => {
    if (!parseRegion(value)) add('REGION', `$.regions[${index}]`);
    else regions.push(value);
  });
  const bySource = new Map<string, CoverageSource>();
  const byPoint = new Map<string, CoveragePoint>();
  sources.forEach((source, index) => {
    if (bySource.has(source.id)) add('DUPLICATE', `$.sources[${index}].id`);
    bySource.set(source.id, source);
    if (!current(source.observedOn, input.asOf, input.maxAgeDays)) add('DATE', `$.sources[${index}].observedOn`);
  });
  const usedSources = new Set<string>();
  points.forEach((point, index) => {
    const location = `$.points[${index}]`;
    if (byPoint.has(point.id)) add('DUPLICATE', `${location}.id`);
    byPoint.set(point.id, point);
    if (duplicate(point.sourceIds)) add('DUPLICATE', `${location}.sourceIds`);
    if (point.access !== 'UNKNOWN' && point.sourceIds.length === 0) add('SOURCELESS', `${location}.access`);
    const linked: CoverageSource[] = [];
    point.sourceIds.forEach((id, j) => {
      const source = bySource.get(id);
      if (!source) add('MISSING', `${location}.sourceIds[${j}]`);
      else { usedSources.add(id); linked.push(source); }
    });
    if (linked.length && stampSilo(linked) !== point.silo) add('SILO', `${location}.silo`);
  });
  const localePaths = new Set<string>();
  const byRegion = new Map<string, Map<string, RegionLanguage>>();
  const seenPoints = new Set<string>();
  regions.forEach((region, index) => {
    const location = `$.regions[${index}]`;
    if (localePaths.has(region.path)) add('DUPLICATE', `${location}.path`);
    localePaths.add(region.path);
    if (region.sizeBytes > maxRegionBytes) add('TOO_LARGE', `${location}.sizeBytes`);
    if (duplicate(region.pointIds)) add('DUPLICATE', `${location}.pointIds`);
    region.pointIds.forEach((id, j) => {
      if (!byPoint.has(id)) add('MISSING', `${location}.pointIds[${j}]`);
      else seenPoints.add(id);
    });
    const languages = byRegion.get(region.id) ?? new Map<string, RegionLanguage>();
    if (languages.has(region.locale)) add('DUPLICATE', `${location}.locale`);
    languages.set(region.locale, region);
    byRegion.set(region.id, languages);
  });
  byRegion.forEach((pair, key) => {
    const en = pair.get('en');
    const fr = pair.get('fr');
    if (!en || !fr) { add('LANGUAGE', `$.regions.${key}`); return; }
    if (en.path === fr.path) add('PATH', `$.regions.${key}`);
    const enIds = new Set(en.pointIds);
    const frIds = new Set(fr.pointIds);
    if (enIds.size !== frIds.size || [...enIds].some(id => !frIds.has(id))) {
      add('PARITY', `$.regions.${key}`);
    }
  });
  points.forEach((point, index) => {
    if (!seenPoints.has(point.id)) add('UNPUBLISHED', `$.points[${index}].id`);
  });
  sources.forEach((source, index) => {
    if (!usedSources.has(source.id)) add('UNUSED', `$.sources[${index}].id`, 'NOTICE');
  });
  return finish(findings, {
    points: rawPoints.length, regions: byRegion.size,
    regionPairs: [...byRegion.values()].filter(pair => pair.has('en') && pair.has('fr')).length,
    unknown: points.filter(point => point.access === 'UNKNOWN').length,
    known: points.filter(point => point.access !== 'UNKNOWN').length,
    sources: rawSources.length,
    maxRegionBytes: Math.max(0, ...regions.map(region => region.sizeBytes)),
  });
}
