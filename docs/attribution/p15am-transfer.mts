import {
  HANDOFF_SCHEMA, MAX_EVENTS, checksum, demand, digest, fields, list,
  parseCursor, parseEvent, publicId, sameCursor
} from './p15am-model.mts';
import type { Cursor, QueueHandoff, ReviewQueue } from './p15am-model.mts';
import { applyReviewCommands, cursorAt, validateReviewQueue } from './p15am-queue.mts';

/** Export only the events after a receiver's known cursor. */
export function exportReviewHandoff(input: unknown, after: unknown): QueueHandoff {
  const queue = validateReviewQueue(input);
  const from = parseCursor(after);
  demand(sameCursor(cursorAt(queue, from.revision), from), 'FORK');
  const body = {
    schema: HANDOFF_SCHEMA, queueId: queue.seed.queueId,
    genesis: queue.genesis, from, to: queue.cursor, events: queue.events.slice(from.revision)
  };
  return { ...body, checksum: digest(body) };
}

/**
 * Standalone verification checks byte integrity and segment continuity.
 * The receiving queue must still verify ancestry, roles, and legal transitions.
 */
export function verifyReviewHandoff(input: unknown): QueueHandoff {
  const h = fields(input, ['schema', 'queueId', 'genesis', 'from', 'to', 'events', 'checksum']);
  demand(h.schema === HANDOFF_SCHEMA, 'VALUE');
  const queueId = publicId(h.queueId);
  const genesis = checksum(h.genesis);
  const from = parseCursor(h.from);
  const to = parseCursor(h.to);
  const events = list(h.events, MAX_EVENTS).map(parseEvent);
  demand(to.revision - from.revision === events.length, 'GAP');
  if (from.revision === 0) demand(from.head === genesis, 'CHECKSUM');
  let cursor: Cursor = from;
  let previousAt = '';
  const seen = new Set<string>();
  for (const event of events) {
    const { command } = event;
    demand(sameCursor(command.expected, cursor), 'FORK');
    demand(command.at >= previousAt, 'TIME');
    demand(!seen.has(command.commandId), 'DUPLICATE');
    seen.add(command.commandId);
    previousAt = command.at;
    cursor = { revision: cursor.revision + 1, head: event.hash };
  }
  demand(sameCursor(to, cursor), 'CHECKSUM');
  const body = { schema: HANDOFF_SCHEMA, queueId, genesis, from, to, events };
  const hash = checksum(h.checksum);
  demand(digest(body) === hash, 'CHECKSUM');
  return { ...body, checksum: hash };
}

export function importReviewHandoff(input: unknown, envelope: unknown): ReviewQueue {
  const queue = validateReviewQueue(input);
  const handoff = verifyReviewHandoff(envelope);
  demand(handoff.queueId === queue.seed.queueId && handoff.genesis === queue.genesis, 'BASE');
  const { from, events } = handoff;
  demand(sameCursor(cursorAt(queue, from.revision), from), 'FORK');
  const overlap = Math.min(events.length, queue.cursor.revision - from.revision);
  for (let i = 0; i < overlap; i++) {
    demand(events[i]?.hash === queue.events[from.revision + i]?.hash, 'FORK');
  }
  if (overlap === events.length) return queue;
  // The command API accepts retries, but a journal entry is always a new revision.
  const result = applyReviewCommands(queue, events.slice(overlap).map(e => e.command));
  demand(sameCursor(result.cursor, handoff.to), 'CURSOR');
  return result;
}
