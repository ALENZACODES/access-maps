import {
  QUEUE_SCHEMA, MAX_EVENTS, demand, digest, fields, list, parseCommand, parseCursor,
  parseEvent, parseSeed, proposalId, sameCursor
} from './p15am-model.mts';
import type {
  Command, Cursor, Desk, Item, JournalEvent, ReviewQueue, ReviewView, Seed
} from './p15am-model.mts';

interface DeskState {
  policy: Desk;
  occupied: number;
  exclusions: Set<string>;
}

interface Replay {
  queue: ReviewQueue;
  desks: Map<string, DeskState>;
  items: Map<string, Item>;
  commands: Map<string, JournalEvent>;
  lastTime: string;
}

function start(seed: Seed): Replay {
  const genesis = digest({ schema: QUEUE_SCHEMA, seed });
  const items = new Map<string, Item>();
  for (const candidate of seed.candidates) {
    items.set(candidate.proposalId, {
      candidate, phase: 'ready', owner: null, offeredTo: null,
      submittedBy: null, reviewedBy: null, obstacle: null, lastRevision: 0
    });
  }
  return {
    queue: {
      schema: QUEUE_SCHEMA, seed, genesis,
      events: [], cursor: { revision: 0, head: genesis }
    },
    desks: new Map(seed.desks.map(policy => [
      policy.deskId, { policy, occupied: 0, exclusions: new Set(policy.excludedSources) }
    ])),
    items,
    commands: new Map(),
    lastTime: seed.openedAt
  };
}

/** Open a queue from the array returned by the source review's toQueueCandidates(). */
export function openReviewQueue(seed: unknown): ReviewQueue {
  return start(parseSeed(seed)).queue;
}

function eligible(replay: Replay, id: string, item: Item): DeskState {
  const desk = replay.desks.get(id);
  demand(desk, 'DESK');
  demand(!desk.exclusions.has(item.candidate.sourceId), 'EXCLUDED');
  return desk;
}

function hasSpace(desk: DeskState): void {
  demand(desk.occupied < desk.policy.capacity, 'CAPACITY');
}

function release(replay: Replay, item: Item): void {
  // Only the holder of an existing claim can reach this transition.
  const desk = item.owner && replay.desks.get(item.owner);
  demand(desk && desk.occupied > 0, 'OWNER');
  desk.occupied -= 1;
  item.owner = null;
  item.offeredTo = null;
}

function transition(replay: Replay, cmd: Command): void {
  const item = replay.items.get(cmd.proposalId);
  demand(item, 'ITEM');
  const desk = eligible(replay, cmd.actor, item);
  const action = cmd.action;
  switch (action.kind) {
    case 'claim': {
      demand(item.phase === 'ready', 'PHASE');
      hasSpace(desk);
      desk.occupied++;
      item.owner = cmd.actor;
      item.phase = 'claimed';
      break;
    }
    case 'release': {
      demand(item.phase === 'claimed', 'PHASE');
      demand(item.owner === cmd.actor, 'OWNER');
      release(replay, item);
      item.phase = 'ready';
      break;
    }
    case 'offer': {
      demand(item.phase === 'claimed', 'PHASE');
      demand(item.owner === cmd.actor, 'OWNER');
      demand(action.to !== item.owner, 'PEER');
      hasSpace(eligible(replay, action.to, item));
      item.phase = 'handoff';
      item.offeredTo = action.to;
      break;
    }
    case 'accept': {
      demand(item.phase === 'handoff', 'PHASE');
      demand(cmd.actor === item.offeredTo, 'RECIPIENT');
      hasSpace(desk);
      release(replay, item);
      desk.occupied++;
      item.owner = cmd.actor;
      item.phase = 'claimed';
      break;
    }
    case 'cancel':
    case 'decline': {
      demand(item.phase === 'handoff', 'PHASE');
      if (action.kind === 'cancel') demand(cmd.actor === item.owner, 'OWNER');
      else demand(cmd.actor === item.offeredTo, 'RECIPIENT');
      item.phase = 'claimed';
      item.offeredTo = null;
      break;
    }
    case 'block': {
      demand(item.phase === 'claimed', 'PHASE');
      demand(item.owner === cmd.actor, 'OWNER');
      release(replay, item);
      item.phase = 'blocked';
      item.obstacle = action.reason;
      break;
    }
    case 'resume': {
      demand(item.phase === 'blocked', 'PHASE');
      item.phase = 'ready';
      item.obstacle = null;
      break;
    }
    case 'submit': {
      demand(item.phase === 'claimed', 'PHASE');
      demand(item.owner === cmd.actor, 'OWNER');
      release(replay, item);
      item.phase = 'peer-review';
      item.submittedBy = cmd.actor;
      item.obstacle = null;
      break;
    }
    case 'return':
    case 'confirm': {
      demand(item.phase === 'peer-review', 'PHASE');
      demand(item.submittedBy !== cmd.actor, 'PEER');
      if (action.kind === 'confirm') {
        item.phase = 'reviewed';
        item.reviewedBy = cmd.actor;
      } else {
        item.phase = 'ready';
        item.obstacle = action.reason;
        item.submittedBy = null;
      }
      break;
    }
    case 'reopen': {
      demand(item.phase === 'reviewed', 'PHASE');
      item.phase = 'ready';
      item.submittedBy = null;
      item.reviewedBy = null;
      item.obstacle = action.reason;
      break;
    }
  }
  item.lastRevision = cmd.expected.revision + 1;
}

function advance(replay: Replay, event: JournalEvent): void {
  const { command } = event;
  const { queue } = replay;
  demand(queue.events.length < MAX_EVENTS, 'LIMIT');
  demand(!replay.commands.has(command.commandId), 'DUPLICATE');
  demand(sameCursor(command.expected, queue.cursor), 'CURSOR');
  demand(command.at >= replay.lastTime, 'TIME');
  transition(replay, command);
  queue.events.push(event);
  queue.cursor = { revision: queue.events.length, head: event.hash };
  replay.lastTime = command.at;
  replay.commands.set(command.commandId, event);
}

type Observer = (event: JournalEvent, item: Item) => void;

function replayQueue(input: unknown, observe?: Observer): Replay {
  const row = fields(input, ['schema', 'seed', 'genesis', 'events', 'cursor']);
  demand(row.schema === QUEUE_SCHEMA, 'VALUE');
  const events = list(row.events, MAX_EVENTS);
  const cursor = parseCursor(row.cursor);
  demand(cursor.revision === events.length, 'CURSOR');
  const replay = start(parseSeed(row.seed));
  demand(replay.queue.genesis === row.genesis, 'CHECKSUM');
  for (const raw of events) {
    const event = parseEvent(raw);
    advance(replay, event);
    if (observe) observe(event, replay.items.get(event.command.proposalId)!);
  }
  demand(sameCursor(replay.queue.cursor, cursor), 'CHECKSUM');
  return replay;
}

/** Validate every transition, build a detached journal, and return it in wire order. */
export function validateReviewQueue(input: unknown): ReviewQueue {
  return replayQueue(input).queue;
}

/** Derive all assignments from the seed and journal. No stored summary is trusted. */
export function inspectReviewQueue(input: unknown): ReviewView {
  const { queue, items } = replayQueue(input);
  return {
    queueId: queue.seed.queueId, openedAt: queue.seed.openedAt,
    cursor: queue.cursor, desks: queue.seed.desks, items: Array.from(items.values())
  };
}

/**
 * Compare-and-swap against exact revision AND head. A command ID is idempotent
 * only for the original complete command, including its original expected cursor.
 * A rejected batch never mutates the caller's queue.
 */
export function applyReviewCommands(input: unknown, intents: unknown): ReviewQueue {
  const replay = replayQueue(input);
  for (const raw of list(intents, MAX_EVENTS)) {
    const command = parseCommand(raw);
    const hash = digest(command);
    const known = replay.commands.get(command.commandId);
    if (known) {
      demand(hash === known.hash, 'COLLISION');
      continue;
    }
    advance(replay, { command, hash });
  }
  return replay.queue;
}

export function cursorAt(queue: ReviewQueue, revision: number): Cursor {
  const head = revision === 0 ? queue.genesis : queue.events[revision - 1]?.hash;
  demand(head && Number.isInteger(revision), 'GAP');
  return { revision, head };
}

export interface ReviewMoment {
  cursor: Cursor;
  command: Command;
  phase: Item['phase'];
  owner: string | null;
  offeredTo: string | null;
  obstacle: Item['obstacle'];
}

/** Return the complete accepted history for one source proposal, including reasons for reopening. */
export function traceReviewItem(input: unknown, id: unknown) {
  const key = proposalId(id);
  const moments: ReviewMoment[] = [];
  const replay = replayQueue(input, (event, item) => {
    if (item.candidate.proposalId !== key) return;
    moments.push({
      cursor: { revision: item.lastRevision, head: event.hash },
      command: event.command, phase: item.phase, owner: item.owner,
      offeredTo: item.offeredTo, obstacle: item.obstacle
    });
  });
  const item = replay.items.get(key);
  demand(item, 'ITEM');
  return { openedAt: replay.queue.seed.openedAt, cursor: replay.queue.cursor, item, moments };
}
