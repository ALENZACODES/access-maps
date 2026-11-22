import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildReview, toQueueCandidates } from './p15al-review.mjs';
import { linkedRecord, notice, receipt, sampleInput, sampleSource } from './p15al-fixtures.mjs';
import { runQueueOperation } from './p15am-cli.mts';
import { describeReviewQueue } from './p15am-report.mts';
import { candidate, command, desk, errorCode, item, queue, seed, step } from './p15am-fixtures.mjs';

const cli = fileURLToPath(new URL('p15am-cli.mts', import.meta.url));
function invoke(args, input) {
  return spawnSync(process.execPath, [cli, ...args], {
    input: typeof input === 'string' || Buffer.isBuffer(input) ? input : JSON.stringify(input),
    encoding: 'utf8', timeout: 15000
  });
}

test('source revalidation can feed an entire English/French work queue without changing unknown access', () => {
  const source = sampleSource({ verificationTier: 'UNKNOWN' });
  const data = sampleInput({
    sources: [source],
    records: [
      linkedRecord('sample-entrance', [source.source]),
      linkedRecord('sample-interchange', [], ['sample-entrance'])
    ],
    captures: [notice(source, 'withdrawn')]
  });
  const report = buildReview(data);
  const saved = JSON.stringify(report);
  const rows = toQueueCandidates(report);
  assert.ok(rows.some(row => row.reason === 'source-withdrawn'));
  const initial = runQueueOperation('open', seed(rows), 'en');
  const fr = runQueueOperation('report', initial, 'fr');
  const en = runQueueOperation('report', initial, 'en');
  assert.equal(fr.title, 'File de révision des sources hors ligne');
  assert.equal(en.title, 'Offline source review queue');
  const idx = rows.find(row => row.reason === 'source-withdrawn').proposalId;
  const entry = fr.entries.find(row => row.proposalId === idx);
  assert.equal(entry.reasonLabel, 'Source retirée');
  assert.equal(entry.phaseLabel, 'Prête à attribuer');
  assert.equal(entry.verificationLabel, 'Inconnu');
  assert.equal(en.entries.find(row => row.proposalId === idx).verificationLabel, 'Unknown');
  assert.equal(entry.source, source.source);
  assert.equal(entry.licence, source.licence);
  assert.equal(entry.retrievedOn, source.retrievedOn);
  assert.deepEqual(entry.recordIds, ['sample-entrance', 'sample-interchange']);
  assert.equal(entry.verificationTier, 'UNKNOWN');
  assert.equal(JSON.stringify(report), saved);
  assert.ok(report.records.every(record => record.access === 'UNKNOWN'));
});

test('a changed capture opens administrative proposals while preserving the reviewed baseline tier', () => {
  const source = sampleSource();
  const capture = receipt(source, { verificationTier: 2, licence: 'Fixture terms v2' });
  const report = buildReview(sampleInput({ sources: [source], captures: [capture] }));
  const rows = toQueueCandidates(report);
  const opened = runQueueOperation('open', seed(rows), 'en');
  const tierChange = rows.find(row => row.reason === 'tier-changed');
  const claimed = step(opened, 'claim', { proposalId: tierChange.proposalId });
  const submitted = step(claimed, 'submit', { proposalId: tierChange.proposalId });
  const reviewed = step(submitted, 'confirm', { proposalId: tierChange.proposalId, actor: 'desk-02' });
  const fr = describeReviewQueue(reviewed, 'fr');
  const done = fr.entries.find(row => row.proposalId === tierChange.proposalId);
  assert.equal(done.phaseLabel, 'Révision consignée');
  assert.equal(done.verificationLabel, 'Niveau 0');
  assert.equal(done.licence, source.licence);
  assert.equal(done.verificationTier, source.verificationTier);
  assert.equal(fr.phaseCounts.find(row => row.phase === 'reviewed').count, 1);
  assert.equal(report.records[0].access, 'UNKNOWN');
});

test('desk workload and eligible independent readers reflect actual claims and source exclusions', () => {
  const c = candidate();
  const b = candidate('beta');
  const q = queue([c, b], [desk(1, 1), desk(2, 1, [c.sourceId]), desk(3, 1)]);
  const held = step(q, 'claim');
  const submitted = step(held, 'submit');
  const other = step(submitted, 'claim', { actor: 'desk-02', proposalId: b.proposalId });
  const report = describeReviewQueue(other, 'fr');
  const work = report.entries.find(row => row.proposalId === c.proposalId);
  assert.equal(work.phaseLabel, 'En attente d’une révision indépendante');
  assert.deepEqual(work.independentDesks, ['desk-03']);
  assert.deepEqual(report.deskLoads, [
    { deskId: 'desk-01', occupied: 0, capacity: 1 },
    { deskId: 'desk-02', occupied: 1, capacity: 1 },
    { deskId: 'desk-03', occupied: 0, capacity: 1 }
  ]);
  assert.equal(report.phaseCounts.reduce((sum, phase) => sum + phase.count, 0), report.entries.length);
});

test('CLI exchange works between separate processes with only plain JSON on stdin/stdout', () => {
  const opened = invoke(['open'], seed());
  assert.equal(opened.status, 0, opened.stderr);
  const local = JSON.parse(opened.stdout);
  const suggestion = invoke(['plan'], { queue: local, limit: 1 });
  assert.equal(suggestion.status, 0, suggestion.stderr);
  const [slot] = JSON.parse(suggestion.stdout).assignments;
  const claim = command(local, 'claim', { proposalId: slot.proposalId, actor: slot.deskId });
  const changed = invoke(['apply'], { queue: local, commands: [claim] });
  assert.equal(changed.status, 0, changed.stderr);
  const q = JSON.parse(changed.stdout);
  const exported = invoke(['export'], { queue: q, after: local.cursor });
  assert.equal(exported.status, 0, exported.stderr);
  const received = invoke(['receive'], { queue: local, handoff: JSON.parse(exported.stdout) });
  assert.equal(received.status, 0, received.stderr);
  const remote = JSON.parse(received.stdout);
  assert.deepEqual(remote, q);
  const verified = invoke(['verify', 'fr'], remote);
  assert.equal(verified.status, 0, verified.stderr);
  assert.deepEqual(JSON.parse(verified.stdout), { queueId: local.seed.queueId, genesis: local.genesis, cursor: q.cursor });
  const report = invoke(['report', 'fr'], remote);
  assert.equal(report.status, 0, report.stderr);
  assert.equal(JSON.parse(report.stdout).entries[0].phaseLabel, 'Attribuée');
});

test('CLI trace, compare and checkout operate on the same cursor as the queue reducer', () => {
  const q = queue();
  const claimed = step(q, 'claim');
  const left = step(claimed, 'release');
  const right = step(claimed, 'submit');
  const diff = runQueueOperation('compare', { left, right }, 'en');
  const common = runQueueOperation('checkout', { queue: left, at: diff.common }, 'fr');
  const trace = runQueueOperation('trace', { queue: left, proposalId: candidate().proposalId }, 'en');
  assert.deepEqual(diff.common, claimed.cursor);
  assert.equal(item(common).owner, 'desk-01');
  assert.deepEqual(trace.moments.map(moment => moment.phase), ['claimed', 'ready']);
  assert.deepEqual(trace.moments.at(-1).cursor, left.cursor);
});

test('command line diagnostics use the requested language and never output partial queue state', () => {
  const invalid = invoke(['report', 'fr'], '{ not valid UTF-8 JSON');
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
  assert.deepEqual(JSON.parse(invalid.stderr), { code: 'INPUT', message: 'Entrée JSON UTF-8 invalide.' });
  const malformedBytes = invoke(['verify'], Buffer.from([0x22, 0xc3, 0x28, 0x22]));
  assert.equal(malformedBytes.status, 1);
  assert.equal(JSON.parse(malformedBytes.stderr).code, 'INPUT');
  const unknown = invoke(['new-operation', 'fr'], 'ignored');
  assert.equal(unknown.status, 1);
  assert.equal(JSON.parse(unknown.stderr).code, 'USAGE');
  const badLocale = invoke(['report', 'xx'], queue());
  assert.equal(badLocale.status, 1);
  assert.equal(JSON.parse(badLocale.stderr).message, 'Unknown operation or language.');
});

test('custody operations require exact wrapper fields and avoid printing stack traces on bad source input', () => {
  const q = queue();
  errorCode('SHAPE', () => runQueueOperation('open-custody', { input: {}, setup: {}, extra: true }, 'en'));
  errorCode('SHAPE', () => runQueueOperation('resume-custody', { input: {}, setup: {} }, 'fr'));
  const malformed = invoke(['open-custody', 'fr'], { input: { review: {}, ledger: {}, selection: {} }, setup: q.seed });
  assert.equal(malformed.status, 1);
  assert.equal(malformed.stdout, '');
  assert.doesNotMatch(malformed.stderr, /\n\s+at\s/u);
  assert.equal(JSON.parse(malformed.stderr).code, 'shape');
});

test('direct queue intake enforces the source registry public label and exclusion checks', () => {
  const c = candidate();
  const unsafe = { ...c, provenance: { ...c.provenance, licence: 'token: withheld' } };
  assert.throws(() => queue([unsafe]), { name: 'SourceReviewError', code: 'licence' });
  const badSource = { ...c, sourceId: 'mi-way-test', provenance: { ...c.provenance, source: 'mi-way-test' } };
  assert.throws(() => queue([badSource]), { name: 'SourceReviewError', code: 'excluded' });
  const errors = invoke(['open', 'fr'], seed([unsafe]));
  const result = JSON.parse(errors.stderr);
  assert.equal(result.code, 'licence');
  assert.doesNotMatch(result.message, /token|withheld/u);
});
