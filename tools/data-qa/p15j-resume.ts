/** Offline resume journal: deterministic transition, dependency and rollback safety. */
import {
  array, current, day, exact, finish, identifier, integer, object, pathLocal, push,
  unique, type Finding, type Report,
} from './p15j-core.js';

export type Phase = 'PENDING' | 'STAGED' | 'COMMITTED' | 'ROLLED_BACK';
export type Operation = 'ADD' | 'REPLACE' | 'REMOVE';
export interface JournalItem {
  readonly id: string;
  readonly path: string;
  readonly operation: Operation;
  readonly phase: Phase;
  readonly dependsOn: readonly string[];
  readonly beforeSha256: string | null;
  readonly afterSha256: string | null;
  readonly bytes: number;
}
export interface JournalEntry {
  readonly sequence: number;
  readonly itemId: string;
  readonly next: Phase;
  readonly observedOn: string;
  readonly previousDigest: string | null;
  readonly digest: string;
}
export interface JournalPolicy {
  readonly schemaVersion: 1;
  readonly asOf: string;
  readonly maxAgeDays: number;
  readonly availableBytes: number;
  readonly items: readonly JournalItem[];
  readonly entries: readonly JournalEntry[];
}
export interface ResumeTotals {
  readonly items: number;
  readonly events: number;
  readonly committed: number;
  readonly staged: number;
  readonly rolledBack: number;
  readonly reservedBytes: number;
}
export type ResumeReport = Report<ResumeTotals>;
const WORDS = {
  ROOT: ['The offline journal has an invalid structure.', 'Le journal hors ligne a une structure non valide.'],
  POLICY: ['Journal limits or review date are invalid.', 'Les limites ou la date de contrôle sont non valides.'],
  ITEM: ['Journal item has missing or unexpected fields.', 'L’élément du journal a des champs manquants ou inattendus.'],
  ENTRY: ['Journal event has missing or unexpected fields.', 'L’événement du journal a des champs manquants ou inattendus.'],
  DUPLICATE: ['Journal identifiers or paths must be unique.', 'Les identifiants et chemins du journal doivent être uniques.'],
  SOURCE: ['An existing asset needs a previous digest.', 'Un fichier existant exige une empreinte antérieure.'],
  TARGET: ['A new or replaced asset needs a new digest.', 'Un fichier ajouté ou remplacé exige une nouvelle empreinte.'],
  SAME: ['Replacement digest must differ from the old digest.', 'L’empreinte de remplacement doit être différente de l’ancienne.'],
  PHASE: ['Event phase transition is not allowed.', 'La transition de phase n’est pas autorisée.'],
  ORDER: ['Journal sequence must increase without gaps.', 'La séquence du journal doit avancer sans lacune.'],
  CHAIN: ['Journal digest chain is discontinuous.', 'La chaîne des empreintes du journal est interrompue.'],
  MISSING: ['Journal event refers to an unknown item.', 'L’événement renvoie à un élément inconnu.'],
  EMPTY: ['A journal item has no transition events.', 'Un élément du journal n’a aucun événement de transition.'],
  STATE: ['Final recorded phase does not match item phase.', 'La dernière phase inscrite ne correspond pas à celle de l’élément.'],
  DEPENDENCY: ['A required asset is absent or not committed.', 'Un fichier requis est absent ou non finalisé.'],
  CYCLE: ['Offline dependencies contain a cycle.', 'Les dépendances hors ligne contiennent une boucle.'],
  BYTES: ['Staged assets exceed available offline bytes.', 'Les fichiers préparés dépassent l’espace hors ligne disponible.'],
  CLOCK: ['An event date is stale, future, or out of order.', 'La date d’un événement est ancienne, future ou désordonnée.'],
  ROLLBACK: ['Rollback requires a preceding staged event.', 'Le retour arrière exige un événement de préparation antérieur.'],
  REMOVE: ['Removal cannot leave a committed dependent asset.', 'Le retrait ne peut pas laisser un fichier dépendant finalisé.'],
  LIMIT: ['The journal exceeds supported size limits.', 'Le journal dépasse les limites de taille prises en charge.'],
} as const;
const ITEM_KEYS = ['id', 'path', 'operation', 'phase', 'dependsOn', 'beforeSha256', 'afterSha256', 'bytes'];
const ENTRY_KEYS = ['sequence', 'itemId', 'next', 'observedOn', 'previousDigest', 'digest'];
const PHASES = new Set<Phase>(['PENDING', 'STAGED', 'COMMITTED', 'ROLLED_BACK']);
const OPS = new Set<Operation>(['ADD', 'REPLACE', 'REMOVE']);
const HASH = /^[a-f0-9]{64}$/;
function hashOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && HASH.test(value));
}
function phase(value: unknown): value is Phase {
  return typeof value === 'string' && PHASES.has(value as Phase);
}
function operation(value: unknown): value is Operation {
  return typeof value === 'string' && OPS.has(value as Operation);
}
function parseItem(value: unknown): value is JournalItem {
  return object(value) && exact(value, ITEM_KEYS) && identifier(value.id) &&
    pathLocal(value.path) && operation(value.operation) && phase(value.phase) &&
    Array.isArray(value.dependsOn) && value.dependsOn.length <= 1000 &&
    value.dependsOn.every(identifier) && integer(value.bytes, 0, 1024 * 1024 * 1024) &&
    hashOrNull(value.beforeSha256) && hashOrNull(value.afterSha256);
}
function parseEntry(value: unknown): value is JournalEntry {
  return object(value) && exact(value, ENTRY_KEYS) && integer(value.sequence, 1) &&
    identifier(value.itemId) && phase(value.next) && day(value.observedOn) !== null &&
    hashOrNull(value.previousDigest) && typeof value.digest === 'string' && HASH.test(value.digest);
}
function allowed(before: Phase, next: Phase): boolean {
  return (before === 'PENDING' && next === 'STAGED') ||
    (before === 'STAGED' && (next === 'COMMITTED' || next === 'ROLLED_BACK'));
}
function dependencyCycle(id: string, index: ReadonlyMap<string, JournalItem>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function walk(current: string): boolean {
    if (visiting.has(current)) return true;
    if (visited.has(current)) return false;
    visiting.add(current);
    const item = index.get(current);
    if (item) for (const child of item.dependsOn) if (walk(child)) return true;
    visiting.delete(current);
    visited.add(current);
    return false;
  }
  return walk(id);
}

/** Fail closed if a resumable offline update could lose assets or violate ordering. */
export function auditResume(input: unknown): ResumeReport {
  const findings: Finding[] = [];
  const add = (code: keyof typeof WORDS, path: string): void => push(findings, WORDS, code, path);
  const zero: ResumeTotals = { items: 0, events: 0, committed: 0, staged: 0, rolledBack: 0, reservedBytes: 0 };
  if (!object(input) || !exact(input, ['schemaVersion', 'asOf', 'maxAgeDays', 'availableBytes', 'items', 'entries']) ||
      input.schemaVersion !== 1) {
    add('ROOT', '$'); return finish(findings, zero);
  }
  if (day(input.asOf) === null || !integer(input.maxAgeDays, 0, 3650) ||
      !integer(input.availableBytes, 0, 1024 * 1024 * 1024 * 1024)) {
    add('POLICY', '$'); return finish(findings, zero);
  }
  const rawItems = array(input.items, 10000);
  const rawEntries = array(input.entries, 40000);
  if (!rawItems || !rawEntries) { add('LIMIT', '$'); return finish(findings, zero); }
  const items: JournalItem[] = [];
  const entries: JournalEntry[] = [];
  rawItems.forEach((raw, i) => {
    if (!parseItem(raw)) add('ITEM', `$.items[${i}]`);
    else items.push(raw);
  });
  rawEntries.forEach((raw, i) => {
    if (!parseEntry(raw)) add('ENTRY', `$.entries[${i}]`);
    else entries.push(raw);
  });
  const ids = new Map<string, JournalItem>();
  const paths = new Set<string>();
  items.forEach((item, i) => {
    const path = `$.items[${i}]`;
    if (ids.has(item.id) || paths.has(item.path)) add('DUPLICATE', path);
    ids.set(item.id, item);
    paths.add(item.path);
    if (!unique(item.dependsOn)) add('DUPLICATE', `${path}.dependsOn`);
    if (item.operation === 'ADD' && item.beforeSha256 !== null) add('SOURCE', `${path}.beforeSha256`);
    if (item.operation !== 'ADD' && item.beforeSha256 === null) add('SOURCE', `${path}.beforeSha256`);
    if (item.operation !== 'REMOVE' && item.afterSha256 === null) add('TARGET', `${path}.afterSha256`);
    if (item.operation === 'REMOVE' && item.afterSha256 !== null) add('TARGET', `${path}.afterSha256`);
    if (item.operation === 'REPLACE' && item.beforeSha256 === item.afterSha256) add('SAME', path);
    for (const dependency of item.dependsOn) {
      if (!ids.has(dependency) && !items.some(candidate => candidate.id === dependency)) {
        add('DEPENDENCY', `${path}.dependsOn`);
      }
    }
  });
  items.forEach((item, i) => {
    if (dependencyCycle(item.id, ids)) add('CYCLE', `$.items[${i}].dependsOn`);
    if (item.phase === 'COMMITTED') {
      item.dependsOn.forEach((dep, j) => {
        if (ids.get(dep)?.phase !== 'COMMITTED') add('DEPENDENCY', `$.items[${i}].dependsOn[${j}]`);
      });
    }
    if (item.operation === 'REMOVE' && item.phase === 'COMMITTED') {
      items.forEach((dependent, j) => {
        if (dependent.phase === 'COMMITTED' && dependent.dependsOn.includes(item.id)) {
          add('REMOVE', `$.items[${j}].dependsOn`);
        }
      });
    }
  });
  const byItem = new Map<string, JournalEntry[]>();
  let previous: JournalEntry | undefined;
  entries.forEach((entry, i) => {
    const location = `$.entries[${i}]`;
    if (!ids.has(entry.itemId)) add('MISSING', `${location}.itemId`);
    if (entry.sequence !== i + 1) add('ORDER', `${location}.sequence`);
    if (entry.previousDigest !== (previous?.digest ?? null)) add('CHAIN', `${location}.previousDigest`);
    if (!current(entry.observedOn, input.asOf, input.maxAgeDays)) add('CLOCK', `${location}.observedOn`);
    if (previous && (day(entry.observedOn) ?? -Infinity) < (day(previous.observedOn) ?? Infinity)) {
      add('CLOCK', `${location}.observedOn`);
    }
    const all = byItem.get(entry.itemId) ?? [];
    all.push(entry);
    byItem.set(entry.itemId, all);
    previous = entry;
  });
  items.forEach((item, i) => {
    const chain = byItem.get(item.id) ?? [];
    if (chain.length === 0 && item.phase !== 'PENDING') add('EMPTY', `$.items[${i}]`);
    let phaseNow: Phase = 'PENDING';
    chain.forEach(entry => {
      if (!allowed(phaseNow, entry.next)) add('PHASE', `$.entries[${entry.sequence - 1}].next`);
      if (entry.next === 'ROLLED_BACK' && phaseNow !== 'STAGED') {
        add('ROLLBACK', `$.entries[${entry.sequence - 1}].next`);
      }
      phaseNow = entry.next;
    });
    if (item.phase !== phaseNow) add('STATE', `$.items[${i}].phase`);
  });
  const reservedBytes = items.filter(item => item.operation !== 'REMOVE' &&
    (item.phase === 'STAGED' || item.phase === 'COMMITTED')).reduce((acc, item) => acc + item.bytes, 0);
  if (reservedBytes > (input.availableBytes as number)) add('BYTES', '$.availableBytes');
  return finish(findings, {
    items: rawItems.length, events: rawEntries.length,
    committed: items.filter(i => i.phase === 'COMMITTED').length,
    staged: items.filter(i => i.phase === 'STAGED').length,
    rolledBack: items.filter(i => i.phase === 'ROLLED_BACK').length,
    reservedBytes,
  });
}
