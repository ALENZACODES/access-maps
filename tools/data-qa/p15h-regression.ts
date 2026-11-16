/** Fail-closed comparison of two offline publication snapshots. No network access. */
import { auditPublication, type PublicationReport } from './p15g-publication.js';

export interface RegressionFinding {
  readonly code: string;
  readonly path: string;
  readonly en: string;
  readonly fr: string;
}
export interface RegressionSummary {
  readonly oldPlaces: number;
  readonly newPlaces: number;
  readonly oldSources: number;
  readonly newSources: number;
  readonly oldAssets: number;
  readonly newAssets: number;
  readonly approvedRemovals: number;
}
export interface RegressionReport {
  readonly ok: boolean;
  readonly findings: readonly RegressionFinding[];
  readonly summary: RegressionSummary;
}
export interface RegressionOptions {
  readonly removedPlaces?: readonly string[];
  readonly removedSources?: readonly string[];
  readonly removedAssets?: readonly string[];
  readonly maximumRemovals?: number;
}

type ObjectRecord = Record<string, unknown>;
const WORDS = {
  INPUT: ['Both publications must pass the publication gate.', 'Les deux publications doivent réussir le contrôle de publication.'],
  POLICY: ['The removal policy is invalid.', 'La règle de retrait est non valide.'],
  CLOCK: ['Publication dates must move forward or stay equal.', 'Les dates de publication doivent avancer ou rester identiques.'],
  REMOVAL: ['A removed record needs an explicit removal entry.', 'Une fiche retirée exige une entrée de retrait explicite.'],
  UNMATCHED: ['A removal entry does not refer to a removed record.', 'Une entrée de retrait ne correspond à aucune fiche retirée.'],
  LIMIT: ['Too many records were removed.', 'Trop de fiches ont été retirées.'],
  SOURCE: ['Source provenance changed without a new source identifier.', 'La provenance de la source a changé sans nouvel identifiant de source.'],
  AGE: ['Source observation date moved backwards.', 'La date d’observation de la source a reculé.'],
  SILO: ['A record moved between licence silos.', 'Une fiche a changé d’exportation de licence.'],
  ACCESS: ['The access statement changed without new matching evidence.', 'L’état d’accès a changé sans nouvelle observation correspondante.'],
  UNKNOWN: ['An UNKNOWN value must not become known without new evidence.', 'Une valeur UNKNOWN ne doit pas devenir connue sans nouvelle observation.'],
  EVIDENCE: ['Evidence was removed without an explicit record removal.', 'Une observation a été retirée sans retrait explicite de la fiche.'],
  TRANSLATION: ['Bilingual text must remain present.', 'Le texte bilingue doit rester présent.'],
  TARGET: ['An interactive target decreased below its previous size.', 'Une cible interactive est devenue plus petite.'],
  ASSET: ['An offline asset changed without an updated source or identifier.', 'Un fichier hors ligne a changé sans nouvelle source ou nouvel identifiant.'],
  REFERENCE: ['A reference to a removed source remains.', 'Une référence vers une source retirée demeure.'],
  DUPLICATE: ['Removal identifiers must be unique.', 'Les identifiants de retrait doivent être uniques.'],
} as const;
type Code = keyof typeof WORDS;

function object(input: unknown): input is ObjectRecord {
  return input !== null && typeof input === 'object' && !Array.isArray(input);
}
function values(input: unknown, name: string): ObjectRecord[] {
  if (!object(input) || !Array.isArray(input[name])) return [];
  return (input[name] as unknown[]).filter(object);
}
function indexById(input: unknown, name: string): ReadonlyMap<string, ObjectRecord> {
  return new Map(values(input, name).filter(item => typeof item.id === 'string')
    .map(item => [item.id as string, item]));
}
function arrayStrings(input: unknown): string[] {
  return Array.isArray(input) ? input.filter((item): item is string => typeof item === 'string') : [];
}
function newEvidence(before: ObjectRecord, after: ObjectRecord): boolean {
  const old = new Set((Array.isArray(before.evidence) ? before.evidence : [])
    .filter(object).map(e => JSON.stringify([e.feature, e.access, e.sourceId, e.observedOn])));
  return (Array.isArray(after.evidence) ? after.evidence : [])
    .filter(object).some(e => !old.has(JSON.stringify([e.feature, e.access, e.sourceId, e.observedOn])) &&
      e.feature === after.feature && e.access === after.access);
}
function evidenceKeys(value: ObjectRecord): string[] {
  return (Array.isArray(value.evidence) ? value.evidence : []).filter(object)
    .map(e => JSON.stringify([e.feature, e.access, e.sourceId, e.observedOn]));
}
function allowedRemovals(input: unknown): input is RegressionOptions {
  if (!object(input)) return false;
  const keys = ['removedPlaces', 'removedSources', 'removedAssets', 'maximumRemovals'];
  if (Object.keys(input).some(key => !keys.includes(key))) return false;
  for (const key of keys.slice(0, 3)) {
    const list = input[key];
    if (list !== undefined && (!Array.isArray(list) || list.length > 5000 ||
        !list.every(id => typeof id === 'string' && /^[a-z][a-z0-9_-]*$/.test(id)) ||
        new Set(list).size !== list.length)) return false;
  }
  return input.maximumRemovals === undefined ||
    (Number.isSafeInteger(input.maximumRemovals) && (input.maximumRemovals as number) >= 0);
}

/** Compare two already-valid packages. Invalid inputs never produce an allowed release. */
export function auditPublicationRegression(before: unknown, after: unknown,
  options: unknown = {}): RegressionReport {
  const findings: RegressionFinding[] = [];
  const add = (code: Code, path: string): void => {
    const [en, fr] = WORDS[code];
    findings.push({ code, path, en, fr });
  };
  const previous: PublicationReport = auditPublication(before);
  const next: PublicationReport = auditPublication(after);
  const summary: { -readonly [K in keyof RegressionSummary]: RegressionSummary[K] } = {
    oldPlaces: values(before, 'places').length,
    newPlaces: values(after, 'places').length,
    oldSources: values(before, 'sources').length,
    newSources: values(after, 'sources').length,
    oldAssets: values(before, 'assets').length,
    newAssets: values(after, 'assets').length,
    approvedRemovals: 0,
  };
  const finish = (): RegressionReport => ({
    ok: findings.length === 0,
    findings: [...findings].sort((a, b) => a.path.localeCompare(b.path, 'en') ||
      a.code.localeCompare(b.code, 'en')),
    summary: { ...summary },
  });
  if (!previous.ok || !next.ok) { add('INPUT', '$'); return finish(); }
  if (!allowedRemovals(options)) { add('POLICY', '$.options'); return finish(); }
  if (!object(before) || !object(after)) { add('INPUT', '$'); return finish(); }
  if ((after.asOf as string) < (before.asOf as string)) add('CLOCK', '$.asOf');
  const oldSources = indexById(before, 'sources');
  const newSources = indexById(after, 'sources');
  const oldPlaces = indexById(before, 'places');
  const newPlaces = indexById(after, 'places');
  const oldAssets = indexById(before, 'assets');
  const newAssets = indexById(after, 'assets');
  const removalGroups: ReadonlyArray<readonly [string, ReadonlyMap<string, ObjectRecord>,
    ReadonlyMap<string, ObjectRecord>, readonly string[]]> = [
    ['sources', oldSources, newSources, options.removedSources ?? []],
    ['places', oldPlaces, newPlaces, options.removedPlaces ?? []],
    ['assets', oldAssets, newAssets, options.removedAssets ?? []],
  ];
  for (const [name, oldMap, newMap, permitted] of removalGroups) {
    const removed = [...oldMap.keys()].filter(id => !newMap.has(id));
    summary.approvedRemovals += removed.filter(id => permitted.includes(id)).length;
    for (const id of removed) if (!permitted.includes(id)) add('REMOVAL', `$.${name}.${id}`);
    for (const id of permitted) if (!removed.includes(id)) add('UNMATCHED', `$.options.${name}.${id}`);
  }
  if (summary.approvedRemovals > (options.maximumRemovals ?? 0)) add('LIMIT', '$.options.maximumRemovals');
  for (const [id, source] of oldSources) {
    const current = newSources.get(id);
    if (!current) continue;
    if (source.licence !== current.licence || source.name !== current.name ||
        source.reference !== current.reference) add('SOURCE', `$.sources.${id}`);
    if ((current.observedOn as string) < (source.observedOn as string)) add('AGE', `$.sources.${id}`);
  }
  for (const [id, place] of oldPlaces) {
    const current = newPlaces.get(id);
    if (!current) continue;
    if (place.silo !== current.silo) add('SILO', `$.places.${id}`);
    if (current.en === '' || current.fr === '') add('TRANSLATION', `$.places.${id}`);
    if ((current.targetPx as number) < (place.targetPx as number)) add('TARGET', `$.places.${id}`);
    if (place.access !== current.access && !newEvidence(place, current)) {
      add(place.access === 'UNKNOWN' ? 'UNKNOWN' : 'ACCESS', `$.places.${id}`);
    }
    const nowEvidence = new Set(evidenceKeys(current));
    if (evidenceKeys(place).some(entry => !nowEvidence.has(entry)) &&
        !(options.removedPlaces ?? []).includes(id)) add('EVIDENCE', `$.places.${id}`);
    for (const sourceId of arrayStrings(current.sourceIds)) {
      if (!newSources.has(sourceId)) add('REFERENCE', `$.places.${id}.sourceIds`);
    }
  }
  for (const [id, asset] of oldAssets) {
    const current = newAssets.get(id);
    if (!current) continue;
    if (asset.silo !== current.silo) add('SILO', `$.assets.${id}`);
    if (asset.sha256 !== current.sha256 || asset.bytes !== current.bytes || asset.path !== current.path) {
      const oldSourceIds = arrayStrings(asset.sourceIds);
      const newSourceIds = arrayStrings(current.sourceIds);
      if (oldSourceIds.length === newSourceIds.length &&
          oldSourceIds.every(item => newSourceIds.includes(item))) add('ASSET', `$.assets.${id}`);
    }
  }
  return finish();
}

export function regressionText(report: RegressionReport, locale: 'en' | 'fr'): string {
  const heading = locale === 'fr' ? (report.ok ? 'Contrôle réussi' : 'Publication bloquée') :
    (report.ok ? 'Check passed' : 'Publication blocked');
  return `${[heading, ...report.findings.map(issue =>
    `${issue.code} ${issue.path}: ${issue[locale]}`)].join('\n')}\n`;
}
