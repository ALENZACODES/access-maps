import assert from 'node:assert/strict';
import test from 'node:test';
import { applyReviewCommands, inspectReviewQueue, validateReviewQueue } from './p15am-queue.mts';
import { candidate, command, desk, errorCode, item, queue, resign, step, time } from './p15am-fixtures.mjs';

test('a review and independent sign-off preserve every original provenance field and affected ID', () => {
  const record = candidate('alpha', { recordIds: ['entrance-a', 'leg-d'] });
  const opened = queue([record]);
  const claimed = step(opened, 'claim');
  const submitted = step(claimed, 'submit');
  const reviewed = step(submitted, 'confirm', { actor: 'desk-02' });
  assert.equal(opened.cursor.revision, 0);
  assert.equal(item(claimed).owner, 'desk-01');
  assert.equal(item(submitted).owner, null);
  assert.equal(item(submitted).submittedBy, 'desk-01');
  assert.deepEqual(item(reviewed), {
    candidate: record, phase: 'reviewed', submittedBy: 'desk-01', reviewedBy: 'desk-02',
    owner: null, offeredTo: null, obstacle: null, lastRevision: 3
  });
  assert.equal(reviewed.seed.candidates[0].provenance.verificationTier, 'UNKNOWN');
  assert.deepEqual(validateReviewQueue(JSON.parse(JSON.stringify(reviewed))), reviewed);
});

test('a return for correction keeps the reason visible until work is resubmitted', () => {
  const submitted = step(step(queue(), 'claim'), 'submit');
  const returned = step(submitted, 'return', { actor: 'desk-02', payload: { reason: 'scope-unclear' } });
  assert.equal(item(returned).phase, 'ready');
  assert.equal(item(returned).obstacle, 'scope-unclear');
  assert.equal(item(returned).submittedBy, null);
  const nextClaim = step(returned, 'claim', { actor: 'desk-03' });
  assert.equal(item(nextClaim).obstacle, 'scope-unclear');
  const corrected = step(nextClaim, 'submit', { actor: 'desk-03' });
  assert.equal(item(corrected).obstacle, null);
  assert.equal(item(corrected).submittedBy, 'desk-03');
  errorCode('PEER', () => step(corrected, 'confirm', { actor: 'desk-03' }));
  assert.equal(item(step(corrected, 'confirm', { actor: 'desk-01' })).reviewedBy, 'desk-01');
});

test('reopening releases the completed decision and records the cause in history', () => {
  const submitted = step(step(queue(), 'claim'), 'submit');
  const complete = step(submitted, 'confirm', { actor: 'desk-02' });
  const reopened = step(complete, 'reopen', { actor: 'desk-03', payload: { reason: 'metadata-mismatch' } });
  assert.equal(reopened.events[2].command.action.kind, 'confirm');
  assert.equal(reopened.events[3].command.action.reason, 'metadata-mismatch');
  assert.equal(item(reopened).reviewedBy, null);
  assert.equal(item(reopened).submittedBy, null);
  assert.equal(item(reopened).phase, 'ready');
  assert.equal(item(reopened).obstacle, 'metadata-mismatch');
  errorCode('PHASE', () => step(reopened, 'confirm', { actor: 'desk-02' }));
});

test('an offer keeps the donor responsible until the recipient explicitly accepts', () => {
  const opened = queue([candidate(), candidate('beta')], [desk(1, 1), desk(2, 1), desk(3, 1)]);
  const offered = step(step(opened, 'claim'), 'offer', { payload: { to: 'desk-02' } });
  assert.equal(item(offered).phase, 'handoff');
  assert.equal(item(offered).owner, 'desk-01');
  errorCode('RECIPIENT', () => step(offered, 'accept', { actor: 'desk-03' }));
  errorCode('PHASE', () => step(offered, 'submit'));
  errorCode('CAPACITY', () => step(offered, 'claim', { proposalId: candidate('beta').proposalId }));
  const accepted = step(offered, 'accept', { actor: 'desk-02' });
  assert.equal(item(accepted).owner, 'desk-02');
  assert.equal(item(accepted).offeredTo, null);
  assert.equal(item(accepted).phase, 'claimed');
  const reused = step(accepted, 'claim', { proposalId: candidate('beta').proposalId });
  assert.equal(item(reused, candidate('beta').proposalId).owner, 'desk-01');
  errorCode('OWNER', () => step(reused, 'release'));
});

test('recipient can fill their last slot after an offer, decline it, and keep their own work', () => {
  const second = candidate('beta');
  const opened = queue([candidate(), second], [desk(1, 1), desk(2, 1)]);
  const offered = step(step(opened, 'claim'), 'offer', { payload: { to: 'desk-02' } });
  const recipientBusy = step(offered, 'claim', { actor: 'desk-02', proposalId: second.proposalId });
  errorCode('CAPACITY', () => step(recipientBusy, 'accept', { actor: 'desk-02' }));
  const declined = step(recipientBusy, 'decline', { actor: 'desk-02' });
  assert.equal(item(declined).owner, 'desk-01');
  assert.equal(item(declined).phase, 'claimed');
  assert.equal(item(declined, second.proposalId).owner, 'desk-02');
  errorCode('CAPACITY', () => step(declined, 'offer', { payload: { to: 'desk-02' } }));
});

test('cancellation is reserved to the donor, decline to the named recipient', () => {
  const claimed = step(queue(), 'claim');
  errorCode('PEER', () => step(claimed, 'offer', { payload: { to: 'desk-01' } }));
  const offered = step(claimed, 'offer', { payload: { to: 'desk-02' } });
  errorCode('RECIPIENT', () => step(offered, 'decline'));
  errorCode('OWNER', () => step(offered, 'cancel', { actor: 'desk-02' }));
  const cancelled = step(offered, 'cancel');
  assert.equal(item(cancelled).owner, 'desk-01');
  assert.equal(item(cancelled).offeredTo, null);
  errorCode('PHASE', () => step(cancelled, 'accept', { actor: 'desk-02' }));
  assert.equal(item(step(cancelled, 'release')).phase, 'ready');
});

test('blocking frees capacity while preserving the evidence gap on the affected proposal', () => {
  const second = candidate('beta');
  const opened = queue([candidate(), second], [desk(1, 1), desk(2, 1)]);
  const blocked = step(step(opened, 'claim'), 'block', { payload: { reason: 'capture-needed' } });
  assert.equal(item(blocked).phase, 'blocked');
  assert.equal(item(blocked).owner, null);
  const other = step(blocked, 'claim', { proposalId: second.proposalId });
  assert.equal(item(other).obstacle, 'capture-needed');
  errorCode('PHASE', () => step(other, 'claim', { actor: 'desk-02' }));
  const resumed = step(other, 'resume', { actor: 'desk-02' });
  assert.equal(item(resumed).obstacle, null);
  assert.equal(item(resumed).phase, 'ready');
  errorCode('CAPACITY', () => step(resumed, 'claim'));
  const taken = step(resumed, 'claim', { actor: 'desk-02' });
  assert.equal(item(taken).owner, 'desk-02');
  assert.equal(item(taken, second.proposalId).owner, 'desk-01');
});

test('declared source exclusions apply to work, transfers, and independent confirmation', () => {
  const c = candidate();
  const opened = queue([c], [desk(1), desk(2, 1, [c.sourceId]), desk(3)]);
  errorCode('EXCLUDED', () => step(opened, 'claim', { actor: 'desk-02' }));
  const claimed = step(opened, 'claim');
  errorCode('EXCLUDED', () => step(claimed, 'offer', { payload: { to: 'desk-02' } }));
  const submitted = step(claimed, 'submit');
  errorCode('EXCLUDED', () => step(submitted, 'confirm', { actor: 'desk-02' }));
  errorCode('PEER', () => step(submitted, 'return', { payload: { reason: 'metadata-mismatch' } }));
  const reviewed = step(submitted, 'confirm', { actor: 'desk-03' });
  assert.equal(item(reviewed).reviewedBy, 'desk-03');
});

test('journal timestamps permit an equal clock tick but reject an out-of-order event', () => {
  const q = queue();
  errorCode('TIME', () => step(q, 'claim', { at: '2026-01-05T11:59:59.999Z' }));
  const at = '2026-01-05T12:05:30.999Z';
  const claimed = step(q, 'claim', { at });
  const submitted = step(claimed, 'submit', { at });
  assert.equal(submitted.events[1].command.at, at);
  errorCode('TIME', () => step(submitted, 'confirm', { actor: 'desk-02', at: time }));
});

test('two commands recorded offline against one cursor cannot silently overwrite each other', () => {
  const q = queue();
  const first = command(q, 'claim');
  const competing = command(q, 'claim', { actor: 'desk-02' });
  const updated = applyReviewCommands(q, [first]);
  errorCode('CURSOR', () => applyReviewCommands(updated, [competing]));
  assert.equal(item(updated).owner, 'desk-01');
  assert.equal(q.events.length, 0);
});

test('a retry of the exact original operation succeeds even after later state changes', () => {
  const q = queue();
  const claim = command(q, 'claim');
  const claimed = applyReviewCommands(q, [claim]);
  const submit = command(claimed, 'submit');
  const submitted = applyReviewCommands(claimed, [submit]);
  assert.deepEqual(applyReviewCommands(submitted, [claim]), submitted);
  assert.deepEqual(applyReviewCommands(submitted, [claim, submit]), submitted);
  const collision = { ...claim, expected: submitted.cursor };
  errorCode('COLLISION', () => applyReviewCommands(submitted, [collision]));
  errorCode('COLLISION', () => applyReviewCommands(submitted, [{ ...claim, actor: 'desk-03' }]));
});

test('a batch with a rejected tail leaves the caller and prior snapshots unchanged', () => {
  const initial = queue();
  const claim = command(initial, 'claim');
  const claimed = applyReviewCommands(initial, [claim]);
  const invalidSubmit = command(claimed, 'submit', { actor: 'desk-02' });
  const before = structuredClone(initial);
  errorCode('OWNER', () => applyReviewCommands(initial, [claim, invalidSubmit]));
  assert.deepEqual(initial, before);
  const submit = command(claimed, 'submit');
  assert.deepEqual(applyReviewCommands(initial, [claim, submit]), applyReviewCommands(claimed, [submit]));
  assert.deepEqual(initial, before);
});

test('replay validates legal transitions even if all checksums are internally consistent', () => {
  const q = queue();
  errorCode('PHASE', () => validateReviewQueue(resign(q, [command(q, 'confirm', { actor: 'desk-02' })])));
  const claimed = step(q, 'claim');
  const forged = resign(claimed, [command(claimed, 'release', { actor: 'desk-03' })]);
  errorCode('OWNER', () => inspectReviewQueue(forged));
  const submitted = step(claimed, 'submit');
  errorCode('PEER', () => inspectReviewQueue(resign(submitted, [command(submitted, 'confirm')])));
});

test('detached queue and view objects cannot mutate stored inputs through nested aliases', () => {
  const c = candidate();
  const q = queue([c]);
  const claimed = step(q, 'claim');
  c.recordIds.push('unrelated');
  const view = inspectReviewQueue(claimed);
  view.items[0].candidate.recordIds.pop();
  view.desks[0].excludedSources.push('sample-alpha');
  view.cursor.head = '0'.repeat(64);
  assert.deepEqual(claimed.seed.candidates[0].recordIds, ['record-alpha']);
  assert.deepEqual(q.seed.desks[0].excludedSources, []);
  assert.equal(item(claimed).phase, 'claimed');
  assert.equal(item(q).phase, 'ready');
});

test('generic diagnostics do not echo actor or payload details', () => {
  const q = queue();
  const raw = { ...command(q, 'claim'), actor: 'sensitive@example.invalid' };
  assert.throws(() => applyReviewCommands(q, [raw]), error => {
    assert.equal(error.code, 'ID');
    assert.doesNotMatch(error.message, /sensitive/u);
    return true;
  });
  const note = command(q, 'claim', { payload: { note: 'fictional note' } });
  errorCode('SHAPE', () => applyReviewCommands(q, [note]));
  errorCode('ITEM', () => step(q, 'claim', { proposalId: candidate('missing').proposalId }));
  errorCode('DESK', () => step(q, 'claim', { actor: 'desk-99' }));
});
