import { createHash } from 'node:crypto';
import { licence, sourceId as readSourceId } from './p15al-input.mjs';
import type { QueueCandidate as Candidate } from './p15al-types.d.mts';
export type { QueueCandidate as Candidate } from './p15al-types.d.mts';

export const QUEUE_SCHEMA = 'access-maps/source-review-queue/1' as const;
export const HANDOFF_SCHEMA = 'access-maps/source-review-handoff/1' as const;
export const MAX_EVENTS = 50000;
export const PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const;
export const REASONS = [
  'source-withdrawn', 'licence-changed', 'tier-changed', 'content-changed',
  'conflicting-captures', 'source-unavailable', 'review-overdue', 'review-due'
] as const;
export const OBSTACLES = [
  'capture-needed', 'rights-unclear', 'scope-unclear', 'metadata-mismatch'
] as const;
export const PHASES = ['ready', 'claimed', 'handoff', 'blocked', 'peer-review', 'reviewed'] as const;
export type Phase = typeof PHASES[number];
export type Priority = typeof PRIORITIES[number];
export type Reason = typeof REASONS[number];
export type Obstacle = typeof OBSTACLES[number];

export interface Desk {
  deskId: string;
  capacity: number;
  excludedSources: string[];
}

export interface Seed {
  queueId: string;
  openedAt: string;
  desks: Desk[];
  candidates: Candidate[];
}

export interface Cursor {
  revision: number;
  head: string;
}

type SimpleAction = 'claim' | 'release' | 'accept' | 'decline' | 'cancel' | 'resume' | 'submit' | 'confirm';
export type Action =
  | { [K in SimpleAction]: { kind: K } }[SimpleAction]
  | { kind: 'offer'; to: string }
  | { kind: 'block' | 'return' | 'reopen'; reason: Obstacle };

export interface Command {
  commandId: string;
  proposalId: string;
  actor: string;
  at: string;
  expected: Cursor;
  action: Action;
}

export interface JournalEvent {
  command: Command;
  hash: string;
}

export interface ReviewQueue {
  schema: typeof QUEUE_SCHEMA;
  seed: Seed;
  genesis: string;
  events: JournalEvent[];
  cursor: Cursor;
}

export interface QueueHandoff {
  schema: typeof HANDOFF_SCHEMA;
  queueId: string;
  genesis: string;
  from: Cursor;
  to: Cursor;
  events: JournalEvent[];
  checksum: string;
}

export interface Item {
  candidate: Candidate;
  phase: Phase;
  owner: string | null;
  offeredTo: string | null;
  submittedBy: string | null;
  reviewedBy: string | null;
  obstacle: Obstacle | null;
  lastRevision: number;
}

export interface ReviewView {
  queueId: string;
  openedAt: string;
  cursor: Cursor;
  desks: Desk[];
  items: Item[];
}

export const ERRORS = {
  SHAPE: ['Unexpected fields or data type.', 'Champs ou type de données inattendus.'],
  LIMIT: ['A queue limit was exceeded.', 'Une limite de la file a été dépassée.'],
  ID: ['Invalid identifier.', 'Identifiant invalide.'],
  DATE: ['Invalid calendar date or timestamp.', 'Date ou horodatage invalide.'],
  VALUE: ['Value outside the supported choices.', 'Valeur hors des choix pris en charge.'],
  DUPLICATE: ['A unique identifier is repeated.', 'Un identifiant unique est répété.'],
  TIME: ['Event precedes the current journal time.', 'L’événement précède l’heure courante du journal.'],
  CHECKSUM: ['Journal checksum mismatch.', 'Somme de contrôle du journal incohérente.'],
  CURSOR: ['Queue revision has changed.', 'La révision de la file a changé.'],
  COLLISION: ['Command identifier was reused.', 'L’identifiant de la commande a été réutilisé.'],
  ITEM: ['Unknown proposal.', 'Proposition inconnue.'],
  DESK: ['Unknown review desk.', 'Poste de révision inconnu.'],
  EXCLUDED: ['Desk is excluded for this source.', 'Le poste est exclu pour cette source.'],
  CAPACITY: ['Review desk is full.', 'Le poste de révision est complet.'],
  PHASE: ['Action is unavailable in this phase.', 'L’action est indisponible à cette étape.'],
  OWNER: ['Action requires the assigned desk.', 'L’action exige le poste affecté.'],
  RECIPIENT: ['Action requires the receiving desk.', 'L’action exige le poste destinataire.'],
  PEER: ['A different review desk is required.', 'Un autre poste de révision est requis.'],
  BASE: ['Handoff belongs to another queue.', 'Le transfert appartient à une autre file.'],
  GAP: ['Earlier journal entries are missing.', 'Des entrées antérieures du journal manquent.'],
  FORK: ['Offline journal histories diverged.', 'Les historiques des journaux hors ligne divergent.'],
  INPUT: ['Invalid UTF-8 JSON input.', 'Entrée JSON UTF-8 invalide.'],
  USAGE: ['Unknown operation or language.', 'Opération ou langue inconnue.']
} as const;
export type ErrorCode = keyof typeof ERRORS;

export class QueueError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode) {
    super(ERRORS[code][0]);
    this.name = 'QueueError';
    this.code = code;
  }
}

export function demand(condition: unknown, code: ErrorCode): asserts condition {
  if (!condition) throw new QueueError(code);
}

export function fields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  demand(value !== null && typeof value === 'object' && !Array.isArray(value), 'SHAPE');
  const proto: unknown = Object.getPrototypeOf(value);
  demand(proto === Object.prototype || proto === null, 'SHAPE');
  demand(Reflect.ownKeys(value).length === keys.length, 'SHAPE');
  demand(keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value');
  }), 'SHAPE');
  return value as Record<string, unknown>;
}

export function list(value: unknown, limit: number): unknown[] {
  demand(Array.isArray(value), 'SHAPE');
  demand(value.length <= limit, 'LIMIT');
  demand(Object.keys(value).length === value.length, 'SHAPE');
  demand(Reflect.ownKeys(value).length === value.length + 1, 'SHAPE');
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    demand(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'SHAPE');
  }
  return value;
}

export function integer(value: unknown, min: number, max: number): number {
  demand(typeof value === 'number' && Number.isSafeInteger(value), 'VALUE');
  demand(!Object.is(value, -0) && value >= min && value <= max, 'VALUE');
  return value;
}

export function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
  demand(typeof value === 'string' && allowed.includes(value as T), 'VALUE');
  return value as T;
}

export function token(value: unknown, pattern: RegExp, max: number): string {
  demand(typeof value === 'string' && value.length <= max && pattern.test(value), 'ID');
  return value;
}

export function publicId(value: unknown): string {
  return token(value, /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u, 120);
}

export function proposalId(value: unknown): string {
  return token(value, /^proposal-[a-f0-9]{64}$/u, 73);
}

export function deskId(value: unknown): string {
  return token(value, /^desk-[0-9]{2,4}$/u, 9);
}

export function checksum(value: unknown): string {
  return token(value, /^[a-f0-9]{64}$/u, 64);
}

export function instant(value: unknown): string {
  demand(typeof value === 'string' && /^[0-9]{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value), 'DATE');
  demand(!value.startsWith('0000') && Number.isFinite(Date.parse(value)), 'DATE');
  demand(new Date(value).toISOString() === value, 'DATE');
  return value;
}

function calendarDay(value: unknown): string {
  demand(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value), 'DATE');
  instant(value + 'T00:00:00.000Z');
  return value;
}

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function unique(values: readonly string[]): void {
  demand(new Set(values).size === values.length, 'DUPLICATE');
}

function parseCandidate(value: unknown): Candidate {
  const c = fields(value, ['proposalId', 'sourceId', 'recordIds', 'priority', 'reason', 'provenance']);
  const p = fields(c.provenance, ['source', 'licence', 'retrievedOn', 'verificationTier']);
  const sourceId = readSourceId(c.sourceId, 'candidate.sourceId');
  demand(sourceId === p.source, 'VALUE');
  const recordIds = list(c.recordIds, 20000).map(publicId).sort(compareText);
  unique(recordIds);
  return {
    proposalId: proposalId(c.proposalId),
    sourceId,
    recordIds,
    priority: choice(c.priority, PRIORITIES),
    reason: choice(c.reason, REASONS),
    provenance: {
      source: sourceId,
      licence: licence(p.licence, 'candidate.provenance.licence'),
      retrievedOn: calendarDay(p.retrievedOn),
      verificationTier: p.verificationTier === 'UNKNOWN' ? 'UNKNOWN' : integer(p.verificationTier, 0, 4)
    }
  };
}

function parseDesk(value: unknown): Desk {
  const desk = fields(value, ['deskId', 'capacity', 'excludedSources']);
  const excludedSources = list(desk.excludedSources, 4096).map(publicId).sort(compareText);
  unique(excludedSources);
  return {
    deskId: deskId(desk.deskId),
    capacity: integer(desk.capacity, 1, 32),
    excludedSources
  };
}

export function parseSeed(value: unknown): Seed {
  const seed = fields(value, ['queueId', 'openedAt', 'desks', 'candidates']);
  const openedAt = instant(seed.openedAt);
  const desks = list(seed.desks, 64).map(parseDesk).sort((a, b) => compareText(a.deskId, b.deskId));
  demand(desks.length > 0, 'LIMIT');
  unique(desks.map((d) => d.deskId));
  let edgeCount = 0;
  const candidates = list(seed.candidates, 32768).map(value => {
    const candidate = parseCandidate(value);
    edgeCount += candidate.recordIds.length;
    demand(edgeCount <= 1000000, 'LIMIT');
    demand(candidate.provenance.retrievedOn <= openedAt.slice(0, 10), 'DATE');
    return candidate;
  }).sort((a, b) => compareText(a.proposalId, b.proposalId));
  unique(candidates.map((c) => c.proposalId));
  unique(candidates.map((c) => c.sourceId + '/' + c.reason));
  return { queueId: publicId(seed.queueId), openedAt, desks, candidates };
}

export function parseCursor(value: unknown): Cursor {
  const cursor = fields(value, ['revision', 'head']);
  return { revision: integer(cursor.revision, 0, MAX_EVENTS), head: checksum(cursor.head) };
}

function parseAction(value: unknown): Action {
  demand(value !== null && typeof value === 'object' && Object.hasOwn(value, 'kind'), 'SHAPE');
  const descriptor = Object.getOwnPropertyDescriptor(value, 'kind');
  demand(descriptor && Object.hasOwn(descriptor, 'value'), 'SHAPE');
  const kind: unknown = descriptor.value;
  if (kind === 'offer') {
    const action = fields(value, ['kind', 'to']);
    return { kind, to: deskId(action.to) };
  }
  if (kind === 'block' || kind === 'return' || kind === 'reopen') {
    const action = fields(value, ['kind', 'reason']);
    return { kind, reason: choice(action.reason, OBSTACLES) };
  }
  fields(value, ['kind']);
  return { kind: choice(kind, ['claim', 'release', 'accept', 'decline', 'cancel', 'resume', 'submit', 'confirm'] as const) };
}

export function parseCommand(value: unknown): Command {
  const cmd = fields(value, ['commandId', 'proposalId', 'actor', 'at', 'expected', 'action']);
  return {
    commandId: token(cmd.commandId, /^op-[a-f0-9]{16,64}$/u, 67),
    proposalId: proposalId(cmd.proposalId),
    actor: deskId(cmd.actor),
    at: instant(cmd.at),
    expected: parseCursor(cmd.expected),
    action: parseAction(cmd.action)
  };
}

export function parseEvent(value: unknown): JournalEvent {
  const event = fields(value, ['command', 'hash']);
  const command = parseCommand(event.command);
  const hash = checksum(event.hash);
  demand(digest(command) === hash, 'CHECKSUM');
  return { command, hash };
}

// Call with reconstructed DTOs only: their property order is fixed by their parsers.
export function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function sameCursor(a: Cursor, b: Cursor): boolean {
  return a.revision === b.revision && a.head === b.head;
}
