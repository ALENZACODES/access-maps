import { compareText, demand, parseCursor, sameCursor } from './p15am-model.mts';
import type { Cursor, JournalEvent, ReviewQueue } from './p15am-model.mts';
import { cursorAt, validateReviewQueue } from './p15am-queue.mts';

export type Relationship = 'identical' | 'left-ahead' | 'right-ahead' | 'diverged';

export interface BranchDelta {
  count: number;
  firstRevision: number;
  lastRevision: number;
  actors: string[];
}

export interface ProposalDelta {
  proposalId: string;
  left: BranchDelta | null;
  right: BranchDelta | null;
}

export interface BranchComparison {
  relationship: Relationship;
  common: Cursor;
  left: Cursor;
  right: Cursor;
  proposals: ProposalDelta[];
  reusedCommandIds: string[];
}

/** Materialize an already-verified ancestor without modifying the working journal. */
export function checkoutReviewCursor(input: unknown, at: unknown): ReviewQueue {
  const queue = validateReviewQueue(input);
  const cursor = parseCursor(at);
  demand(sameCursor(cursorAt(queue, cursor.revision), cursor), 'FORK');
  return { ...queue, events: queue.events.slice(0, cursor.revision), cursor };
}

function commonRevision(left: ReviewQueue, right: ReviewQueue): number {
  let low = 0;
  let high = Math.min(left.events.length, right.events.length);
  // A head includes every earlier command's head. Once two valid chains split,
  // their subsequent heads differ even if the local actions look alike.
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (left.events[mid - 1]!.hash === right.events[mid - 1]!.hash) low = mid;
    else high = mid - 1;
  }
  return low;
}

interface Changes {
  count: number;
  firstRevision: number;
  lastRevision: number;
  actors: Set<string>;
}

function delta(events: JournalEvent[], after: number) {
  const proposals = new Map<string, Changes>();
  const ids = new Set<string>();
  for (let index = after; index < events.length; index++) {
    const command = events[index]!.command;
    const revision = index + 1;
    const entry = proposals.get(command.proposalId) ?? {
      count: 0, firstRevision: revision, lastRevision: revision, actors: new Set<string>()
    };
    entry.count++;
    entry.lastRevision = revision;
    entry.actors.add(command.actor);
    proposals.set(command.proposalId, entry);
    ids.add(command.commandId);
  }
  return { proposals, ids };
}

function describe(changes: Changes | undefined): BranchDelta | null {
  if (!changes) return null;
  return {
    count: changes.count,
    firstRevision: changes.firstRevision,
    lastRevision: changes.lastRevision,
    actors: [...changes.actors].sort(compareText)
  };
}

/**
 * Summarize independent edits without reordering them. Different proposal IDs
 * can still compete for one desk's last slot, so only a verified prefix can be
 * imported automatically.
 */
export function compareReviewBranches(leftInput: unknown, rightInput: unknown): BranchComparison {
  const left = validateReviewQueue(leftInput);
  const right = validateReviewQueue(rightInput);
  demand(left.genesis === right.genesis, 'BASE');
  const revision = commonRevision(left, right);
  const common = cursorAt(left, revision);
  const leftChanges = delta(left.events, revision);
  const rightChanges = delta(right.events, revision);
  let relationship: Relationship;
  if (revision === left.events.length) {
    relationship = revision === right.events.length ? 'identical' : 'right-ahead';
  } else {
    relationship = revision === right.events.length ? 'left-ahead' : 'diverged';
  }
  const keys = Array.from(new Set([...leftChanges.proposals.keys(), ...rightChanges.proposals.keys()]));
  const proposals = keys.sort(compareText).map(proposalId => ({
    proposalId,
    left: describe(leftChanges.proposals.get(proposalId)),
    right: describe(rightChanges.proposals.get(proposalId))
  }));
  const reusedCommandIds = [...leftChanges.ids].filter(id => rightChanges.ids.has(id)).sort(compareText);
  return { relationship, common, left: left.cursor, right: right.cursor, proposals, reusedCommandIds };
}
