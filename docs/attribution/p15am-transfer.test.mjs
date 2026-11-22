import assert from 'node:assert/strict';
import test from 'node:test';
import { openReviewQueue, validateReviewQueue } from './p15am-queue.mts';
import { exportReviewHandoff, importReviewHandoff, verifyReviewHandoff } from './p15am-transfer.mts';
import { candidate, command, desk, errorCode, hash, item, queue, resign, seed, step } from './p15am-fixtures.mjs';

function path() {
  const opened = queue();
  const claimed = step(opened, 'claim');
  const submitted = step(claimed, 'submit');
  const reviewed = step(submitted, 'confirm', { actor: 'desk-02' });
  return [opened, claimed, submitted, reviewed];
}

function reseal(packet) {
  const { checksum, ...body } = packet;
  return { ...body, checksum: hash(JSON.stringify(body)) };
}

test('a segment contains only journal commands and can initialize a synchronized offline copy', () => {
  const [opened, claimed, submitted] = path();
  const segment = exportReviewHandoff(submitted, opened.cursor);
  assert.equal(segment.events.length, 2);
  assert.deepEqual(segment.from, opened.cursor);
  assert.deepEqual(segment.to, submitted.cursor);
  assert.equal(Object.hasOwn(segment, 'seed'), false);
  assert.deepEqual(verifyReviewHandoff(JSON.parse(JSON.stringify(segment))), segment);
  assert.deepEqual(importReviewHandoff(opened, segment), submitted);
  assert.deepEqual(importReviewHandoff(claimed, segment), submitted);
  assert.equal(opened.cursor.revision, 0);
});

test('reimporting a wholly covered suffix or an empty older packet keeps all local entries', () => {
  const [opened, claimed, submitted, reviewed] = path();
  const partial = exportReviewHandoff(submitted, claimed.cursor);
  assert.deepEqual(importReviewHandoff(reviewed, partial), reviewed);
  const empty = exportReviewHandoff(claimed, claimed.cursor);
  assert.deepEqual(empty.events, []);
  assert.deepEqual(importReviewHandoff(reviewed, empty), reviewed);
  assert.deepEqual(importReviewHandoff(opened, exportReviewHandoff(opened, opened.cursor)), opened);
});

test('successive packets can be retried, but delivery across a missing predecessor fails', () => {
  const [opened, claimed, submitted, reviewed] = path();
  const first = exportReviewHandoff(claimed, opened.cursor);
  const rest = exportReviewHandoff(reviewed, claimed.cursor);
  errorCode('GAP', () => importReviewHandoff(opened, rest));
  const resumed = importReviewHandoff(opened, first);
  const result = importReviewHandoff(resumed, rest);
  assert.deepEqual(result, reviewed);
  assert.deepEqual(importReviewHandoff(result, first), result);
  assert.deepEqual(importReviewHandoff(result, rest), result);
  assert.deepEqual(importReviewHandoff(submitted, rest), reviewed);
});

test('divergence is rejected at an equal revision and also inside an overlapping prefix', () => {
  const [opened, claimed, submitted] = path();
  const released = step(claimed, 'release');
  const newClaim = step(released, 'claim', { actor: 'desk-02' });
  const suffix = exportReviewHandoff(newClaim, released.cursor);
  errorCode('FORK', () => importReviewHandoff(submitted, suffix));
  const allEvents = exportReviewHandoff(newClaim, opened.cursor);
  errorCode('FORK', () => importReviewHandoff(submitted, allEvents));
  errorCode('FORK', () => exportReviewHandoff(submitted, released.cursor));
  assert.equal(item(submitted).phase, 'peer-review');
});

test('matching queue handles cannot cross distinct frozen reviewer rosters or candidate sets', () => {
  const [opened, claimed] = path();
  const handoff = exportReviewHandoff(claimed, opened.cursor);
  const rosterChanged = queue([candidate()], [desk(1, 3), desk(2, 2)]);
  errorCode('BASE', () => importReviewHandoff(rosterChanged, handoff));
  const dataChanged = queue([candidate('beta')]);
  errorCode('BASE', () => importReviewHandoff(dataChanged, handoff));
  const differentHandle = openReviewQueue({ ...seed(), queueId: 'another-round' });
  errorCode('BASE', () => importReviewHandoff(differentHandle, handoff));
});

test('segment verification checks each event even if envelope checksum is recalculated', () => {
  const [opened, , submitted] = path();
  const handoff = exportReviewHandoff(submitted, opened.cursor);
  handoff.events[0].command.actor = 'desk-03';
  errorCode('CHECKSUM', () => verifyReviewHandoff(reseal(handoff)));
  assert.equal(item(submitted).submittedBy, 'desk-01');
});

test('missing/reordered entries and a foreign genesis cannot be disguised by a fresh envelope checksum', () => {
  const [opened, , submitted] = path();
  const full = exportReviewHandoff(submitted, opened.cursor);
  const shortened = reseal({ ...full, events: [full.events[1]] });
  errorCode('GAP', () => verifyReviewHandoff(shortened));
  const reversed = reseal({ ...full, events: [...full.events].reverse() });
  errorCode('FORK', () => verifyReviewHandoff(reversed));
  const wrongStart = reseal({ ...full, from: { revision: 0, head: '0'.repeat(64) } });
  errorCode('CHECKSUM', () => verifyReviewHandoff(wrongStart));
  const wrongEnd = reseal({ ...full, to: { ...full.to, head: full.genesis } });
  errorCode('CHECKSUM', () => verifyReviewHandoff(wrongEnd));
});

test('carrying a correctly hashed segment cannot authorize a self-confirmation', () => {
  const [, , submitted] = path();
  const invalid = resign(submitted, [command(submitted, 'confirm')]);
  const empty = exportReviewHandoff(submitted, submitted.cursor);
  const packet = reseal({ ...empty, to: invalid.cursor, events: invalid.events.slice(-1) });
  assert.deepEqual(verifyReviewHandoff(packet), packet);
  errorCode('PEER', () => importReviewHandoff(submitted, packet));
  assert.equal(validateReviewQueue(submitted).cursor.revision, 2);
});

test('an imported command ID already present at the receiver must not advance its revision', () => {
  const [, claimed] = path();
  const repeatedId = claimed.events[0].command.commandId;
  const cmd = command(claimed, 'release', { id: repeatedId });
  const fork = resign(claimed, [cmd]);
  const blank = exportReviewHandoff(claimed, claimed.cursor);
  const packet = reseal({ ...blank, to: fork.cursor, events: fork.events.slice(-1) });
  errorCode('COLLISION', () => importReviewHandoff(claimed, packet));
  assert.equal(item(claimed).phase, 'claimed');
});

test('applying a segment cannot overwrite a competing event on another proposal', () => {
  const second = candidate('beta');
  const opened = queue([candidate(), second], [desk(1, 1), desk(2, 1)]);
  const local = step(opened, 'claim');
  const remote = step(opened, 'claim', { proposalId: second.proposalId });
  const incoming = exportReviewHandoff(remote, opened.cursor);
  errorCode('FORK', () => importReviewHandoff(local, incoming));
  assert.equal(item(local).owner, 'desk-01');
  assert.equal(item(local, second.proposalId).owner, null);
});
