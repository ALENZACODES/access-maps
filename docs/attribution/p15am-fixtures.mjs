import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { openReviewQueue, applyReviewCommands, inspectReviewQueue } from './p15am-queue.mts';

export const time = '2026-01-05T12:00:00.000Z';

export function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function candidate(key = 'alpha', options = {}) {
  const sourceId = 'sample-' + key;
  return {
    proposalId: 'proposal-' + hash(key),
    sourceId,
    recordIds: ['record-' + key],
    reason: 'review-due',
    priority: 'normal',
    provenance: {
      source: sourceId, licence: 'Fixture licence', retrievedOn: '2026-01-01',
      verificationTier: 'UNKNOWN'
    },
    ...options
  };
}

export function desk(id, capacity = 2, excludedSources = []) {
  return { deskId: 'desk-' + String(id).padStart(2, '0'), capacity, excludedSources };
}

export function seed(candidates = [candidate()], desks = [desk(1), desk(2), desk(3)]) {
  return { queueId: 'synthetic-round', openedAt: time, candidates, desks };
}

export function queue(candidates, desks) {
  return openReviewQueue(seed(candidates, desks));
}

export function command(queue, kind, options = {}) {
  const { actor = 'desk-01', proposalId = candidate().proposalId, at = time, payload = {}, id } = options;
  const action = { kind, ...payload };
  const key = hash(JSON.stringify([queue.cursor, actor, proposalId, at, action]));
  return { commandId: id ?? 'op-' + key, proposalId, actor, at, expected: { ...queue.cursor }, action };
}

export function step(queue, kind, options) {
  return applyReviewCommands(queue, [command(queue, kind, options)]);
}

export function item(queue, id = candidate().proposalId) {
  const result = inspectReviewQueue(queue).items.find(row => row.candidate.proposalId === id);
  assert.ok(result);
  return result;
}

export function errorCode(code, callback) {
  assert.throws(callback, error => {
    assert.equal(error.name, 'QueueError');
    assert.equal(error.code, code);
    return true;
  });
}

export function resign(queue, commands) {
  // Simulate a structurally valid, consistently rehashed journal created by another client.
  const result = structuredClone(queue);
  for (const value of commands) {
    const cmd = { ...value, expected: { ...result.cursor } };
    const digest = hash(JSON.stringify(cmd));
    result.events.push({ command: cmd, hash: digest });
    result.cursor = { revision: result.events.length, head: digest };
  }
  return result;
}
