/** Atomic offline update plan auditor: prevent partial/silent dataset downgrades. */
import {
  asArray, calendarDay, dictionary, evidenceSilo, exactFields, finish,
  heldSource, licenceAllowed, localReference, makeEmitter, requiredString,
  safeIdentifier, validAccess, validSilo, validSourceStamp,
  type AccessValue, type Finding, type FindingReport, type SiloName,
  type SourceStamp,
} from './p15e-core.ts';

export interface OfflineEntry {
  readonly id: string;
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly silo: SiloName;
  readonly source: SourceStamp;
  readonly access: AccessValue;
  readonly locale: 'en' | 'fr' | 'neutral';
}
export interface OfflineState {
  readonly revision: string;
  readonly generatedOn: string;
  readonly entries: readonly OfflineEntry[];
}
export interface UpdateOperation {
  readonly op: 'ADD' | 'REPLACE' | 'DELETE';
  readonly id: string;
  readonly oldSha256?: string;
  readonly next?: OfflineEntry;
  readonly reason: string;
}
export interface OfflinePlan {
  readonly schemaVersion: 1;
  readonly asOf: string;
  readonly maxBytes: number;
  readonly maxAgeDays: number;
  readonly before: OfflineState;
  readonly after: OfflineState;
  readonly operations: readonly UpdateOperation[];
}
export interface UpdateSummary {
  readonly beforeFiles: number;
  readonly afterFiles: number;
  readonly additions: number;
  readonly replacements: number;
  readonly removals: number;
  readonly bytes: number;
  readonly unknownBefore: number;
  readonly unknownAfter: number;
}
export type UpdateResult = FindingReport<UpdateSummary>;

const W = {
  ROOT: ['Update plan structure is invalid.', 'La structure du plan de mise à jour est non valide.'],
  STATE: ['Offline state structure is invalid.', 'La structure de l’état hors ligne est non valide.'],
  ENTRY: ['Offline entry has missing or invalid metadata.', 'L’entrée hors ligne comporte des métadonnées absentes ou non valides.'],
  OPERATION: ['Update operation is incomplete or invalid.', 'L’opération de mise à jour est incomplète ou non valide.'],
  DUPLICATE: ['Duplicate identifier or file path.', 'Un identifiant ou un chemin de fichier est en double.'],
  AGE: ['Data has an invalid, future or stale date.', 'Les données comportent une date invalide, future ou trop ancienne.'],
  LICENCE: ['Data must retain an open licence and a local source reference.', 'Les données doivent conserver une licence ouverte et une référence locale à la source.'],
  HELD: ['Held feed data cannot be included.', 'Les données d’un flux retenu ne peuvent pas être incluses.'],
  SILO: ['ODbL entries must remain in their separate silo.', 'Les entrées ODbL doivent rester dans leur exportation distincte.'],
  SHA: ['Changed file digest has no matching update operation.', 'La nouvelle empreinte du fichier n’a pas d’opération correspondante.'],
  OLD_SHA: ['Operation does not match the previous file digest.', 'L’opération ne correspond pas à l’empreinte précédente du fichier.'],
  NEXT: ['Operation target does not match the published next state.', 'La cible de l’opération ne correspond pas au prochain état publié.'],
  MISSING_OP: ['A file changed without a declared atomic operation.', 'Un fichier a changé sans opération atomique déclarée.'],
  REDUNDANT: ['An operation does not change the published state.', 'Une opération ne modifie pas l’état publié.'],
  UNKNOWN: ['A known access state became UNKNOWN without an explicit reason.', 'Un état d’accès connu est devenu UNKNOWN sans motif explicite.'],
  ASSERTION: ['A changed access statement needs a newer source observation.', 'Un changement d’état d’accès exige une observation de source plus récente.'],
  ROLLBACK: ['Offline revision must advance and preserve rollback provenance.', 'La version hors ligne doit avancer et conserver la provenance antérieure.'],
  DATE: ['Published state generation date is inconsistent.', 'La date de génération de l’état publié est incohérente.'],
  BUDGET: ['Offline update exceeds the maximum byte budget.', 'La mise à jour hors ligne dépasse le budget maximal d’octets.'],
  LOCALE: ['English and French assets must be updated together.', 'Les fichiers anglais et français doivent être mis à jour ensemble.'],
  DELETE: ['File removal requires an explicit, specific reason.', 'Le retrait d’un fichier exige un motif précis et explicite.'],
  LIMIT: ['Update contains too many entries.', 'La mise à jour contient trop d’entrées.'],
} as const;
const ENTRY_FIELDS = ['id', 'path', 'sha256', 'bytes', 'silo', 'source', 'access', 'locale'];
const STATE_FIELDS = ['revision', 'generatedOn', 'entries'];
const PLAN_FIELDS = ['schemaVersion', 'asOf', 'maxBytes', 'maxAgeDays', 'before', 'after', 'operations'];
const SHA = /^[0-9a-f]{64}$/;

function entry(value: unknown): value is OfflineEntry {
  return dictionary(value) && exactFields(value, ENTRY_FIELDS) &&
    safeIdentifier(value.id) && localReference(value.path) &&
    typeof value.sha256 === 'string' && SHA.test(value.sha256) &&
    Number.isSafeInteger(value.bytes) && (value.bytes as number) >= 0 &&
    validSilo(value.silo) && validSourceStamp(value.source) && validAccess(value.access) &&
    (value.locale === 'en' || value.locale === 'fr' || value.locale === 'neutral');
}
function state(value: unknown): value is OfflineState {
  return dictionary(value) && exactFields(value, STATE_FIELDS) &&
    safeIdentifier(value.revision) && calendarDay(value.generatedOn) !== null &&
    Array.isArray(value.entries) && value.entries.length <= 50000;
}
function operation(value: unknown): value is UpdateOperation {
  if (!dictionary(value) || !exactFields(value, ['op', 'id', 'reason'], ['oldSha256', 'next']) ||
      !['ADD', 'REPLACE', 'DELETE'].includes(String(value.op)) ||
      !safeIdentifier(value.id) || !requiredString(value.reason, 280)) return false;
  if (value.oldSha256 !== undefined && (typeof value.oldSha256 !== 'string' || !SHA.test(value.oldSha256))) return false;
  if (value.next !== undefined && !entry(value.next)) return false;
  if (value.op === 'ADD') return value.oldSha256 === undefined && value.next !== undefined;
  if (value.op === 'REPLACE') return value.oldSha256 !== undefined && value.next !== undefined;
  return value.oldSha256 !== undefined && value.next === undefined;
}
function fingerprint(value: OfflineEntry): string {
  return JSON.stringify(value);
}
function locales(entries: readonly OfflineEntry[]): Set<string> {
  return new Set(entries.filter(e => e.locale !== 'neutral')
    .map(e => `${e.id.replace(/(?:-en|-fr)$/, '')}:${e.locale}`));
}
function reasonSpecific(value: string): boolean {
  return value.length >= 12 && !/^(?:n\/a|none|unknown|todo|remove|delete|update|changed)$/i.test(value);
}
function deltaDays(a: string, b: string): number {
  return (calendarDay(a) ?? 0) - (calendarDay(b) ?? 0);
}

/** Compare full before/after snapshots to the proposed atomic local update. */
export function auditOfflineUpdate(input: unknown): UpdateResult {
  const findings: Finding[] = [];
  const add = makeEmitter(findings, W);
  const empty: UpdateSummary = {
    beforeFiles: 0, afterFiles: 0, additions: 0, replacements: 0,
    removals: 0, bytes: 0, unknownBefore: 0, unknownAfter: 0,
  };
  if (!dictionary(input) || !exactFields(input, PLAN_FIELDS) || input.schemaVersion !== 1 ||
      calendarDay(input.asOf) === null || !Number.isSafeInteger(input.maxBytes) ||
      (input.maxBytes as number) <= 0 || !Number.isSafeInteger(input.maxAgeDays) ||
      (input.maxAgeDays as number) < 0 || (input.maxAgeDays as number) > 3650) {
    add('ROOT', '$'); return finish(findings, empty);
  }
  if (!state(input.before) || !state(input.after)) {
    add('STATE', '$'); return finish(findings, empty);
  }
  const before = input.before;
  const after = input.after;
  const ops = asArray(input.operations, 50000);
  if (!ops) { add('LIMIT', '$'); return finish(findings, empty); }
  const prior = new Map<string, OfflineEntry>();
  const next = new Map<string, OfflineEntry>();
  const operationById = new Map<string, UpdateOperation>();
  let bytes = 0;
  for (const [label, snapshot, target] of [
    ['before', before, prior], ['after', after, next],
  ] as const) {
    const paths = new Set<string>();
    for (let i = 0; i < snapshot.entries.length; i++) {
      const value: unknown = snapshot.entries[i];
      const where = `${label}.entries[${i}]`;
      if (!entry(value)) { add('ENTRY', where); continue; }
      if (target.has(value.id) || paths.has(value.path)) add('DUPLICATE', where);
      target.set(value.id, value);
      paths.add(value.path);
      if (heldSource(value.source.source)) add('HELD', where);
      if (!licenceAllowed(value.source.licence)) add('LICENCE', where);
      if (evidenceSilo([value.source]) !== value.silo) add('SILO', where);
      const old = calendarDay(value.source.observedOn);
      const today = calendarDay(input.asOf) ?? 0;
      if (old === null || old > today || today - old > (input.maxAgeDays as number)) add('AGE', where);
      if ((calendarDay(value.source.observedOn) ?? Infinity) >
          (calendarDay(snapshot.generatedOn) ?? -Infinity)) add('DATE', where);
      if (label === 'after') bytes += value.bytes;
    }
  }
  if (bytes > (input.maxBytes as number)) add('BUDGET', 'after.entries');
  if (deltaDays(after.generatedOn, before.generatedOn) < 0 ||
      deltaDays(after.generatedOn, input.asOf as string) > 0) add('DATE', 'after.generatedOn');
  if (before.revision === after.revision) add('ROLLBACK', 'after.revision');
  for (let i = 0; i < ops.length; i++) {
    const value = ops[i];
    const where = `operations[${i}]`;
    if (!operation(value)) { add('OPERATION', where); continue; }
    if (operationById.has(value.id)) add('DUPLICATE', where);
    operationById.set(value.id, value);
    const previous = prior.get(value.id);
    const current = next.get(value.id);
    if (value.op === 'ADD') {
      if (previous || !current || !value.next || fingerprint(current) !== fingerprint(value.next)) add('NEXT', where);
    } else if (value.op === 'REPLACE') {
      if (!previous || !current || !value.next || fingerprint(current) !== fingerprint(value.next)) add('NEXT', where);
      if (previous?.sha256 !== value.oldSha256) add('OLD_SHA', where);
      if (previous && current && fingerprint(previous) === fingerprint(current)) add('REDUNDANT', where);
    } else {
      if (!previous || current) add('NEXT', where);
      if (previous?.sha256 !== value.oldSha256) add('OLD_SHA', where);
      if (!reasonSpecific(value.reason)) add('DELETE', where);
    }
    if (previous && current) {
      if (current.silo !== previous.silo) add('SILO', where);
      if (current.access === 'UNKNOWN' && previous.access !== 'UNKNOWN' &&
          !reasonSpecific(value.reason)) add('UNKNOWN', where);
      if (current.access !== previous.access && current.access !== 'UNKNOWN' &&
          (calendarDay(current.source.observedOn) ?? 0) <=
          (calendarDay(previous.source.observedOn) ?? 0)) add('ASSERTION', where);
      if (current.sha256 !== previous.sha256 && value.op !== 'REPLACE') add('SHA', where);
    }
  }
  for (const [id, value] of prior) {
    const current = next.get(id);
    const changed = !current || fingerprint(value) !== fingerprint(current);
    if (changed && !operationById.has(id)) add('MISSING_OP', `before.${id}`);
  }
  for (const [id, value] of next) {
    const previous = prior.get(id);
    if (!previous && !operationById.has(id)) add('MISSING_OP', `after.${id}`);
    if (value.locale === 'neutral') continue;
    const pair = `${id.replace(/(?:-en|-fr)$/, '')}:${value.locale === 'en' ? 'fr' : 'en'}`;
    const current = locales([...next.values()]);
    if (!current.has(pair)) add('LOCALE', `after.${id}`);
  }
  let additions = 0;
  let replacements = 0;
  let removals = 0;
  for (const value of operationById.values()) {
    if (value.op === 'ADD') additions++;
    if (value.op === 'REPLACE') replacements++;
    if (value.op === 'DELETE') removals++;
  }
  return finish(findings, {
    beforeFiles: before.entries.length, afterFiles: after.entries.length,
    additions, replacements, removals, bytes,
    unknownBefore: before.entries.filter(e => e.access === 'UNKNOWN').length,
    unknownAfter: after.entries.filter(e => e.access === 'UNKNOWN').length,
  });
}
