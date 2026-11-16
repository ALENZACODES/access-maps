/** Audit publication decisions for community observations without inferred access. */
import {
  asArray, calendarDay, dateWithin, dictionary, evidenceSilo, exactFields, finish,
  hasPiiLikeText, hasUnsafeContent, heldSource, licenceAllowed, localReference,
  makeEmitter, requiredString, safeIdentifier, sameStamp, validAccess,
  validSilo, validSourceStamp, type AccessValue, type FindingReport, type SourceStamp,
  type SiloName,
} from './p15e-core.js';

export type Feature = 'entrance' | 'washroom' | 'lift' | 'parking' | 'path' | 'seating';
export type EvidenceKind = 'OBSERVATION' | 'CORRECTION' | 'WITHDRAWAL';
export interface Observation {
  readonly id: string;
  readonly placeId: string;
  readonly feature: Feature;
  readonly kind: EvidenceKind;
  readonly access: AccessValue;
  readonly recordedOn: string;
  readonly reason: string;
  readonly source: SourceStamp;
  readonly silo: SiloName;
  readonly supersedes?: string;
}
export interface Decision {
  readonly placeId: string;
  readonly feature: Feature;
  readonly access: AccessValue;
  readonly observationIds: readonly string[];
  readonly silo: SiloName;
  readonly source: SourceStamp | null;
}
export interface EvidencePackage {
  readonly schemaVersion: 1;
  readonly asOf: string;
  readonly maxAgeDays: number;
  readonly observations: readonly Observation[];
  readonly decisions: readonly Decision[];
}
export interface EvidenceSummary {
  readonly observations: number;
  readonly decisions: number;
  readonly unknown: number;
  readonly conflicting: number;
  readonly rejectedSources: number;
  readonly withdrawals: number;
}
export type EvidenceResult = FindingReport<EvidenceSummary>;

const WORDS = {
  ROOT: ['Evidence input has the wrong structure.', 'Le dossier de données n’a pas la structure attendue.'],
  POLICY: ['Observation date policy is invalid.', 'La règle de date d’observation est non valide.'],
  OBS_SCHEMA: ['Observation has missing or unexpected fields.', 'L’observation contient des champs manquants ou inattendus.'],
  DEC_SCHEMA: ['Decision has missing or unexpected fields.', 'La décision contient des champs manquants ou inattendus.'],
  DUPLICATE: ['Observation or decision identifier is duplicated.', 'Un identifiant d’observation ou de décision est en double.'],
  SOURCE: ['A complete open-licence source is required.', 'Une source complète sous licence ouverte est requise.'],
  HELD: ['A held feed cannot supply observations.', 'Un flux retenu ne peut pas fournir d’observations.'],
  AGE: ['Source or observation date is old or in the future.', 'La date de la source ou de l’observation est ancienne ou future.'],
  ORDER: ['Source date cannot follow recording date.', 'La date de la source ne peut pas suivre celle de l’enregistrement.'],
  SILO: ['ODbL material must stay in the separate ODbL export.', 'Les données ODbL doivent rester dans l’exportation ODbL distincte.'],
  PRIVACY: ['Observation contains a personal identifier or unsafe markup.', 'L’observation contient un identifiant personnel ou du balisage non sûr.'],
  WITHDRAWAL: ['A withdrawal must keep access UNKNOWN and name its previous observation.', 'Un retrait doit conserver UNKNOWN et nommer son observation antérieure.'],
  SUPERSEDES: ['A correction must name a previous observation in the same feature.', 'Une correction doit nommer une observation antérieure de la même caractéristique.'],
  HISTORY: ['Observation history has a cycle or invalid chronology.', 'L’historique des observations comporte un cycle ou une chronologie non valide.'],
  REFERENCE: ['Decision references missing or unrelated observations.', 'La décision renvoie à des observations absentes ou sans rapport.'],
  ORPHAN: ['An observation is not considered by any decision.', 'Une observation n’est prise en compte dans aucune décision.'],
  CONFLICT: ['Contradictory observations must result in UNKNOWN.', 'Des observations contradictoires doivent donner UNKNOWN.'],
  ASSERTION: ['A known access state needs current matching evidence.', 'Un état d’accès connu exige une source actuelle correspondante.'],
  UNKNOWN: ['UNKNOWN must remain explicit when evidence is unavailable.', 'UNKNOWN doit rester explicite lorsque les données sont absentes.'],
  DEC_SOURCE: ['Decision source must match the supporting evidence.', 'La source de la décision doit correspondre aux données justificatives.'],
  DEC_SILO: ['Decision silo must match all supporting observations.', 'L’exportation de la décision doit correspondre à toutes les observations.'],
  DEC_COVER: ['Each observed place and feature needs a decision.', 'Chaque lieu et caractéristique observés exige une décision.'],
  DEC_EXTRA: ['Decision has no observations and must keep UNKNOWN.', 'Une décision sans observation doit conserver UNKNOWN.'],
  LIMIT: ['Evidence inventory exceeds the local size limit.', 'L’inventaire dépasse la limite locale.'],
} as const;
const FEATURES = new Set<Feature>(['entrance', 'washroom', 'lift', 'parking', 'path', 'seating']);
const KINDS = new Set<EvidenceKind>(['OBSERVATION', 'CORRECTION', 'WITHDRAWAL']);
const OBS_KEYS = ['id', 'placeId', 'feature', 'kind', 'access', 'recordedOn', 'reason', 'source', 'silo'];
const DEC_KEYS = ['placeId', 'feature', 'access', 'observationIds', 'silo', 'source'];

function isFeature(input: unknown): input is Feature {
  return typeof input === 'string' && FEATURES.has(input as Feature);
}
function isKind(input: unknown): input is EvidenceKind {
  return typeof input === 'string' && KINDS.has(input as EvidenceKind);
}
function parseObservation(input: unknown): input is Observation {
  if (!dictionary(input) || !exactFields(input, OBS_KEYS, ['supersedes'])) return false;
  if (!safeIdentifier(input.id) || !safeIdentifier(input.placeId) ||
      !isFeature(input.feature) || !isKind(input.kind) || !validAccess(input.access) ||
      calendarDay(input.recordedOn) === null || !validSilo(input.silo) ||
      !requiredString(input.reason, 280) || !validSourceStamp(input.source)) return false;
  if (input.supersedes !== undefined && !safeIdentifier(input.supersedes)) return false;
  return true;
}
function parseDecision(input: unknown): input is Decision {
  return dictionary(input) && exactFields(input, DEC_KEYS) &&
    safeIdentifier(input.placeId) && isFeature(input.feature) &&
    validAccess(input.access) && validSilo(input.silo) &&
    Array.isArray(input.observationIds) && input.observationIds.length <= 1000 &&
    input.observationIds.every(safeIdentifier) &&
    (input.source === null || validSourceStamp(input.source));
}
function key(place: string, feature: Feature): string {
  return `${place}/${feature}`;
}
function collectActive(observations: readonly Observation[]): Observation[] {
  const replaced = new Set(observations.map(o => o.supersedes).filter((s): s is string => !!s));
  return observations.filter(o => !replaced.has(o.id) && o.kind !== 'WITHDRAWAL');
}
function anyConflict(active: readonly Observation[]): boolean {
  return active.some(o => o.access === 'YES') && active.some(o => o.access === 'NO');
}
function evidenceStatus(active: readonly Observation[]): AccessValue {
  if (active.length === 0 || anyConflict(active)) return 'UNKNOWN';
  const states = new Set(active.map(o => o.access));
  return states.size === 1 ? active[0]?.access ?? 'UNKNOWN' : 'UNKNOWN';
}
function sourceMatches(decision: Decision, active: readonly Observation[]): boolean {
  if (decision.access === 'UNKNOWN') return decision.source === null ||
    active.some(o => decision.source !== null && sameStamp(o.source, decision.source));
  return decision.source !== null && active.some(o =>
    o.access === decision.access && decision.source !== null && sameStamp(o.source, decision.source));
}
function historyError(observation: Observation, byId: ReadonlyMap<string, Observation>): boolean {
  const visited = new Set<string>([observation.id]);
  let current = observation;
  while (current.supersedes) {
    const ancestor = byId.get(current.supersedes);
    if (!ancestor || visited.has(ancestor.id)) return true;
    visited.add(ancestor.id);
    if (key(ancestor.placeId, ancestor.feature) !== key(observation.placeId, observation.feature)) return true;
    if ((calendarDay(ancestor.recordedOn) ?? Infinity) > (calendarDay(current.recordedOn) ?? -Infinity)) return true;
    if (current.kind === 'OBSERVATION') return true;
    current = ancestor;
  }
  return false;
}

/** Invalid input and conflicting decisions always block release. No access inference occurs. */
export function auditEvidence(input: unknown): EvidenceResult {
  const findings: import('./p15e-core.js').Finding[] = [];
  const add = makeEmitter(findings, WORDS);
  const summary: EvidenceSummary = {
    observations: 0, decisions: 0, unknown: 0, conflicting: 0,
    rejectedSources: 0, withdrawals: 0,
  };
  if (!dictionary(input) ||
      !exactFields(input, ['schemaVersion', 'asOf', 'maxAgeDays', 'observations', 'decisions']) ||
      input.schemaVersion !== 1) {
    add('ROOT', '$'); return finish(findings, summary);
  }
  const observations = asArray(input.observations, 50000);
  const decisions = asArray(input.decisions, 50000);
  if (!observations || !decisions) {
    add('LIMIT', '$'); return finish(findings, summary);
  }
  if (calendarDay(input.asOf) === null || !Number.isSafeInteger(input.maxAgeDays) ||
      (input.maxAgeDays as number) < 0 || (input.maxAgeDays as number) > 3650) {
    add('POLICY', '$'); return finish(findings, summary);
  }
  const asOf = input.asOf as string;
  const maxAge = input.maxAgeDays as number;
  const byId = new Map<string, Observation>();
  const groups = new Map<string, Observation[]>();
  const decisionKeys = new Set<string>();
  const used = new Set<string>();
  let rejectedSources = 0;
  let withdrawals = 0;
  let unknown = 0;
  let conflicting = 0;
  for (let i = 0; i < observations.length; i++) {
    const raw = observations[i];
    const path = `observations[${i}]`;
    if (!parseObservation(raw)) {
      add('OBS_SCHEMA', path);
      if (dictionary(raw)) {
        if (heldSource(raw.source) || (dictionary(raw.source) && heldSource(raw.source.source))) add('HELD', path);
        if (!dictionary(raw.source) || !licenceAllowed(raw.source.licence) ||
            !localReference(raw.source.reference)) add('SOURCE', path);
      }
      rejectedSources++;
      continue;
    }
    if (byId.has(raw.id)) add('DUPLICATE', `${path}.id`);
    byId.set(raw.id, raw);
    const group = key(raw.placeId, raw.feature);
    groups.set(group, [...(groups.get(group) ?? []), raw]);
    if (hasPiiLikeText(raw.reason) || hasUnsafeContent(raw.reason)) add('PRIVACY', `${path}.reason`);
    if (heldSource(raw.source.source)) add('HELD', `${path}.source`);
    if (!dateWithin(raw.source.observedOn, asOf, maxAge) ||
        !dateWithin(raw.recordedOn, asOf, maxAge)) add('AGE', path);
    if ((calendarDay(raw.source.observedOn) ?? Infinity) >
        (calendarDay(raw.recordedOn) ?? -Infinity)) add('ORDER', path);
    if (evidenceSilo([raw.source]) !== raw.silo) add('SILO', path);
    if (raw.kind === 'WITHDRAWAL') {
      withdrawals++;
      if (raw.access !== 'UNKNOWN' || !raw.supersedes) add('WITHDRAWAL', path);
    }
    if (raw.kind === 'CORRECTION' && !raw.supersedes) add('SUPERSEDES', path);
    if (raw.kind === 'OBSERVATION' && raw.supersedes) add('SUPERSEDES', path);
  }
  for (const observation of byId.values()) {
    if (historyError(observation, byId)) add('HISTORY', `observations.${observation.id}`);
  }
  for (let i = 0; i < decisions.length; i++) {
    const raw = decisions[i];
    const path = `decisions[${i}]`;
    if (!parseDecision(raw)) { add('DEC_SCHEMA', path); continue; }
    const group = key(raw.placeId, raw.feature);
    if (decisionKeys.has(group)) add('DUPLICATE', path);
    decisionKeys.add(group);
    if (raw.access === 'UNKNOWN') unknown++;
    if (!raw.observationIds.length && raw.access !== 'UNKNOWN') add('DEC_EXTRA', path);
    if (new Set(raw.observationIds).size !== raw.observationIds.length) add('DUPLICATE', `${path}.observationIds`);
    const supporting: Observation[] = [];
    for (const id of raw.observationIds) {
      const found = byId.get(id);
      if (!found || key(found.placeId, found.feature) !== group) add('REFERENCE', `${path}.${id}`);
      else { supporting.push(found); used.add(id); }
    }
    const all = groups.get(group) ?? [];
    if (supporting.length !== all.length || all.some(o => !raw.observationIds.includes(o.id))) {
      add('REFERENCE', path);
    }
    const active = collectActive(supporting);
    if (anyConflict(active)) conflicting++;
    const expected = evidenceStatus(active);
    if (raw.access !== expected) add(expected === 'UNKNOWN' ? 'CONFLICT' : 'ASSERTION', path);
    if (raw.access !== 'UNKNOWN' && active.length === 0) add('UNKNOWN', path);
    if (raw.silo !== evidenceSilo(supporting.map(o => o.source))) add('DEC_SILO', path);
    if (supporting.some(o => o.silo !== raw.silo)) add('DEC_SILO', path);
    if (!sourceMatches(raw, active)) add('DEC_SOURCE', path);
    if (raw.source && (!licenceAllowed(raw.source.licence) || heldSource(raw.source.source))) add('SOURCE', path);
  }
  for (const [group, rows] of groups) {
    if (!decisionKeys.has(group)) add('DEC_COVER', group);
    for (const row of rows) if (!used.has(row.id)) add('ORPHAN', `observations.${row.id}`);
  }
  return finish(findings, {
    observations: observations.length, decisions: decisions.length, unknown,
    conflicting, rejectedSources, withdrawals,
  });
}
