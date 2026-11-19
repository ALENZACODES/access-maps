import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compareEventFeeds, eventAt, eventDecisions, eventReceipt, eventTimeline,
  validateEventFeed,
} from './p15z-events.mjs';
import { copy, event, feed, source, evidence } from './p15z-fixtures.mjs';

function codes(result) { return result.issues?.map(x => x.code) ?? []; }
function changedEvent(changes) { return feed([event('event-one', 'ab', 'closure', changes)]); }
function errorsFor(changes) { return codes(validateEventFeed(changedEvent(changes))); }
function errorWith(code, changes) { assert.ok(errorsFor(changes).includes(code), JSON.stringify(errorsFor(changes))); }
function at(value = feed(), when = '2026-11-19T11:00:00Z', silo = 'open') {
  return eventDecisions(value, when, silo);
}

describe('P15Z events: bounded intake and field validation', () => {
  it('accepts a complete local closure notice', () => {
    const result = validateEventFeed(feed());
    assert.equal(result.ok, true);
    assert.equal(result.value.events.length, 1);
  });
  it('does not mutate the supplied event list', () => {
    const input = feed();
    const original = copy(input);
    validateEventFeed(input);
    assert.deepEqual(input, original);
  });
  it('sorts out-of-order event IDs', () => {
    const result = validateEventFeed(feed([event('z'), event('a')]));
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.events.map(x => x.id), ['a', 'z']);
  });
  it('rejects an absent root object', () => {
    assert.ok(codes(validateEventFeed(null)).includes('ROOT'));
  });
  it('rejects malformed root version', () => {
    const input = feed();
    input.version = 2;
    assert.ok(codes(validateEventFeed(input)).includes('ROOT'));
  });
  it('rejects a missing sources collection', () => {
    const input = feed();
    delete input.sources;
    assert.ok(codes(validateEventFeed(input)).includes('ROOT'));
  });
  it('rejects an invalid calendar date', () => {
    const input = feed();
    input.asOf = '2026-02-30';
    assert.ok(codes(validateEventFeed(input)).includes('ROOT'));
  });
  it('rejects an excessive age window', () => {
    const input = feed();
    input.maxAgeDays = 3651;
    assert.ok(codes(validateEventFeed(input)).includes('ROOT'));
  });
  it('does not accept an unknown root field', () => {
    const input = feed();
    input.publishAutomatically = true;
    assert.ok(codes(validateEventFeed(input)).includes('ROOT'));
  });
  it('rejects duplicate event identifiers', () => {
    assert.ok(codes(validateEventFeed(feed([event(), event()]))).includes('DUPLICATE'));
  });
  it('accepts a feed with no active notices', () => {
    assert.equal(validateEventFeed(feed([])).ok, true);
  });
  it('rejects missing event names', () => {
    errorWith('ROOT', { name: { en: 'Closure' } });
  });
  it('rejects unsafe HTML in a bilingual notice', () => {
    errorWith('ROOT', { name: { en: '<script>', fr: 'Fermeture' } });
  });
  it('rejects an ASCII apostrophe in French', () => {
    errorWith('ROOT', { name: { en: 'Closure', fr: "Avis d'acces" } });
  });
  it('rejects a missing source ID', () => {
    errorWith('REF', { sourceIds: ['missing'] });
  });
  it('rejects unsupported status values', () => {
    errorWith('ROOT', { access: 'maybe' });
  });
  it('rejects unsupported observation tiers', () => {
    errorWith('ROOT', { tier: 4 });
  });
  it('rejects an unsupported event kind', () => {
    errorWith('ROOT', { kind: 'automatic-clearance' });
  });
  it('rejects an unsafe event reference', () => {
    errorWith('ROOT', { reference: '../notices/unsafe.json' });
  });
  it('rejects a mismatched export group', () => {
    errorWith('SILO', { silo: 'odbl' });
  });
  it('rejects source evidence not linked by the event', () => {
    errorWith('REF', { sourceIds: [], evidence: [evidence('NO')] });
  });
  it('rejects an unsupported source licence', () => {
    const input = feed();
    input.sources[0].licence = 'closed-licence';
    assert.ok(codes(validateEventFeed(input)).includes('SOURCE'));
  });
  it('rejects a missing source reference', () => {
    const input = feed();
    input.sources[0].reference = 'https://example.org';
    assert.ok(codes(validateEventFeed(input)).includes('SOURCE'));
  });
  it('rejects future dated source metadata', () => {
    const input = feed();
    input.sources[0].observedOn = '2026-11-20';
    assert.ok(codes(validateEventFeed(input)).includes('AGE'));
  });
  it('rejects event evidence preceding its source observation', () => {
    errorWith('AGE', { evidence: [{ ...evidence('NO'), observedOn: '2026-11-09' }] });
  });
  it('rejects event evidence beyond the reference date', () => {
    errorWith('AGE', { evidence: [{ ...evidence('NO'), observedOn: '2026-11-20' }] });
  });
});

describe('P15Z events: timeline and temporal semantics', () => {
  it('recognizes the start of an active interval', () => {
    assert.equal(eventAt(event(), '2026-11-19T10:00:00Z'), 'ACTIVE');
  });
  it('recognizes a moment immediately before the event', () => {
    assert.equal(eventAt(event(), '2026-11-19T09:59:59Z'), 'INACTIVE');
  });
  it('treats the end as exclusive', () => {
    assert.equal(eventAt(event(), '2026-11-19T12:00:00Z'), 'INACTIVE');
  });
  it('recognizes a moment during the event', () => {
    assert.equal(eventAt(event(), '2026-11-19T11:30:00Z'), 'ACTIVE');
  });
  it('returns UNKNOWN for invalid query time', () => {
    assert.equal(eventAt(event(), 'tomorrow'), 'UNKNOWN');
  });
  it('returns UNKNOWN for a malformed event', () => {
    assert.equal(eventAt({ id: 'e' }, '2026-11-19T11:00:00Z'), 'UNKNOWN');
  });
  it('rejects a zero-length event interval', () => {
    errorWith('TIME', { endAt: '2026-11-19T10:00:00Z' });
  });
  it('rejects a reversed event interval', () => {
    errorWith('TIME', { endAt: '2026-11-19T09:00:00Z' });
  });
  it('rejects invalid start timestamps', () => {
    errorWith('TIME', { startAt: '2026-11-19T99:00:00Z' });
  });
  it('rejects local-time date strings without UTC', () => {
    errorWith('TIME', { startAt: '2026-11-19T10:00:00' });
  });
  it('does not treat expired data as a live condition', () => {
    const result = at(feed(), '2026-11-20T11:00:00Z');
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.decisions, []);
  });
  it('rejects invalid evaluation timestamps', () => {
    assert.equal(at(feed(), 'not-a-date').ok, false);
  });
  it('rejects an invalid requested licence group', () => {
    assert.equal(at(feed(), '2026-11-19T11:00:00Z', 'mixed').ok, false);
  });
  it('returns a single active closure decision', () => {
    const result = at();
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.decisions.map(x => x.segmentId), ['ab']);
    assert.equal(result.value.decisions[0].access, 'NO');
  });
  it('returns no decision when the timestamp precedes every event', () => {
    assert.deepEqual(at(feed(), '2026-11-19T09:00:00Z').value.decisions, []);
  });
  it('retains source IDs for active decisions', () => {
    assert.deepEqual(at().value.decisions[0].sourceIds, ['city']);
  });
  it('retains event identifiers for attribution', () => {
    assert.deepEqual(at().value.decisions[0].eventIds, ['event-one']);
  });
  it('labels a reported closure in both languages', () => {
    const reason = at().value.decisions[0].reasons[0];
    assert.equal(reason.en, 'Reported closure');
    assert.equal(reason.fr, 'Fermeture signalée');
  });
  it('creates a bounded segment timeline', () => {
    const result = eventTimeline(feed(), 'ab', 'open',
      '2026-11-19T09:00:00Z', '2026-11-19T13:00:00Z');
    assert.equal(result.ok, true);
    assert.equal(result.value.windows.length, 3);
  });
  it('keeps hours before the closure UNKNOWN', () => {
    const result = eventTimeline(feed(), 'ab', 'open',
      '2026-11-19T09:00:00Z', '2026-11-19T13:00:00Z');
    assert.equal(result.value.windows[0].access, 'UNKNOWN');
  });
  it('reports NO only inside the closure window', () => {
    const result = eventTimeline(feed(), 'ab', 'open',
      '2026-11-19T09:00:00Z', '2026-11-19T13:00:00Z');
    assert.equal(result.value.windows[1].access, 'NO');
  });
  it('keeps hours after the closure UNKNOWN', () => {
    const result = eventTimeline(feed(), 'ab', 'open',
      '2026-11-19T09:00:00Z', '2026-11-19T13:00:00Z');
    assert.equal(result.value.windows[2].access, 'UNKNOWN');
  });
  it('rejects a reversed timeline query', () => {
    const result = eventTimeline(feed(), 'ab', 'open',
      '2026-11-20T00:00:00Z', '2026-11-19T00:00:00Z');
    assert.ok(codes(result).includes('TIME'));
  });
  it('rejects excessively long timeline queries', () => {
    const result = eventTimeline(feed(), 'ab', 'open',
      '2026-11-19T00:00:00Z', '2027-01-20T00:00:00Z');
    assert.ok(codes(result).includes('TIME'));
  });
  it('rejects invalid segment IDs for timeline selection', () => {
    assert.equal(eventTimeline(feed(), '../x', 'open',
      '2026-11-19T10:00:00Z', '2026-11-19T12:00:00Z').ok, false);
  });
  it('does not fabricate affected segments for empty events', () => {
    const result = eventTimeline(feed([]), 'ab', 'open',
      '2026-11-19T10:00:00Z', '2026-11-19T12:00:00Z');
    assert.equal(result.ok, true);
    assert.equal(result.value.windows[0].access, 'UNKNOWN');
  });
});

describe('P15Z events: conflicting reports and licence separation', () => {
  it('keeps a maintenance observation UNKNOWN', () => {
    const result = at(feed([event('maint', 'ab', 'maintenance')]));
    assert.equal(result.ok, true);
    assert.equal(result.value.decisions[0].access, 'UNKNOWN');
  });
  it('rejects maintenance claiming a positive access state', () => {
    errorWith('STATE', { kind: 'maintenance', access: 'YES', evidence: [evidence('YES')] });
  });
  it('rejects reopening without positive evidence', () => {
    const item = event('reopen', 'ab', 'reopening');
    item.evidence = [];
    assert.ok(codes(validateEventFeed(feed([item]))).includes('EVIDENCE'));
  });
  it('accepts a supported reopening notice', () => {
    const value = feed([event('reopen', 'ab', 'reopening')]);
    assert.equal(validateEventFeed(value).ok, true);
    assert.equal(at(value).value.decisions[0].access, 'YES');
  });
  it('keeps competing closure and reopening UNKNOWN', () => {
    const value = feed([event('stop', 'ab', 'closure'), event('open', 'ab', 'reopening')]);
    const result = at(value);
    assert.equal(result.ok, true);
    assert.equal(result.value.decisions[0].access, 'UNKNOWN');
    assert.equal(result.value.decisions[0].conflict, true);
  });
  it('keeps reopening plus maintenance UNKNOWN', () => {
    const value = feed([event('open', 'ab', 'reopening'), event('work', 'ab', 'maintenance')]);
    assert.equal(at(value).value.decisions[0].access, 'UNKNOWN');
  });
  it('keeps a closure reported by multiple events as NO', () => {
    const value = feed([event('one', 'ab', 'closure'), event('two', 'ab', 'obstruction')]);
    assert.equal(at(value).value.decisions[0].access, 'NO');
  });
  it('separates unrelated segment decisions', () => {
    const value = feed([event('one', 'ab', 'closure'), event('two', 'cd', 'maintenance')]);
    const result = at(value);
    assert.deepEqual(result.value.decisions.map(x => x.segmentId), ['ab', 'cd']);
  });
  it('keeps decisions deterministic when event insertion order changes', () => {
    const a = feed([event('one', 'ab'), event('two', 'ab')]);
    const b = feed([...a.events].reverse());
    assert.deepEqual(at(a), at(b));
  });
  it('does not mix licence groups when filtering reports', () => {
    const value = feed([event('open', 'ab', 'closure')]);
    assert.deepEqual(at(value, '2026-11-19T11:00:00Z', 'odbl').value.decisions, []);
  });
  it('does not infer an event for an unrelated segment', () => {
    assert.equal(eventTimeline(feed(), 'cd', 'open',
      '2026-11-19T10:00:00Z', '2026-11-19T12:00:00Z').value.windows[0].access, 'UNKNOWN');
  });
  it('sorts event IDs even when reference order differs', () => {
    const value = feed([event('z', 'ab'), event('a', 'ab')]);
    assert.deepEqual(at(value).value.decisions[0].eventIds, ['a', 'z']);
  });
  it('preserves explicit event status in the result', () => {
    const value = feed([event('work', 'ab', 'inspection')]);
    assert.equal(at(value).value.decisions[0].reasons[0].access, 'UNKNOWN');
  });
  it('rejects tier-zero claims of NO', () => {
    errorWith('TIER', { tier: 0 });
  });
  it('rejects tier-one claims of NO', () => {
    errorWith('TIER', { tier: 1 });
  });
  it('accepts unknown notices without positive evidence', () => {
    assert.equal(validateEventFeed(feed([event('weather', 'cd', 'weather')])).ok, true);
  });
});

describe('P15Z events: change review and receipts', () => {
  it('reports unchanged feeds as no changes', () => {
    const result = compareEventFeeds(feed(), copy(feed()));
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.added, []);
    assert.deepEqual(result.value.removed, []);
    assert.deepEqual(result.value.changed, []);
  });
  it('reports an added event separately', () => {
    const old = feed([]);
    const next = feed([event()]);
    assert.deepEqual(compareEventFeeds(old, next).value.added, ['event-one']);
  });
  it('reports a removed event separately', () => {
    const result = compareEventFeeds(feed(), feed([]));
    assert.deepEqual(result.value.removed, ['event-one']);
  });
  it('reports time adjustments as changes', () => {
    const next = changedEvent({ endAt: '2026-11-19T13:00:00Z' });
    assert.deepEqual(compareEventFeeds(feed(), next).value.changed, ['event-one']);
  });
  it('rejects a repeated event ID changing segment identity', () => {
    const next = changedEvent({ segmentId: 'cd' });
    assert.ok(codes(compareEventFeeds(feed(), next)).includes('STATE'));
  });
  it('rejects a repeated event ID changing its source reference', () => {
    const next = changedEvent({ reference: 'notices/other.json' });
    assert.ok(codes(compareEventFeeds(feed(), next)).includes('STATE'));
  });
  it('rejects a repeated event ID changing its kind', () => {
    const next = changedEvent({ kind: 'obstruction' });
    assert.ok(codes(compareEventFeeds(feed(), next)).includes('STATE'));
  });
  it('rejects time travelling publication dates', () => {
    const next = feed();
    next.asOf = '2026-11-18';
    assert.ok(codes(compareEventFeeds(feed(), next)).includes('DATE'));
  });
  it('rejects source identity changes under a reused ID', () => {
    const next = feed();
    next.sources[0].reference = 'sources/different.json';
    assert.ok(codes(compareEventFeeds(feed(), next)).includes('SOURCE'));
  });
  it('rejects source observation dates moving backwards', () => {
    const next = feed();
    next.sources[0].observedOn = '2026-11-09';
    assert.ok(codes(compareEventFeeds(feed(), next)).includes('AGE'));
  });
  it('does not produce a partial summary for malformed input', () => {
    const result = compareEventFeeds(feed(), { events: [] });
    assert.equal(result.ok, false);
    assert.equal(result.value, null);
  });
  it('produces a deterministic event receipt', () => {
    assert.deepEqual(eventReceipt(feed(), '2026-11-19T11:00:00Z', 'open'),
      eventReceipt(copy(feed()), '2026-11-19T11:00:00Z', 'open'));
  });
  it('includes a full-length digest in the receipt', () => {
    const result = eventReceipt(feed(), '2026-11-19T11:00:00Z', 'open');
    assert.equal(result.ok, true);
    assert.match(result.value.sha256, /^[a-f0-9]{64}$/u);
  });
  it('changes the digest when status changes', () => {
    const before = eventReceipt(feed(), '2026-11-19T11:00:00Z', 'open');
    const after = eventReceipt(feed(), '2026-11-19T13:00:00Z', 'open');
    assert.notEqual(before.value.sha256, after.value.sha256);
  });
  it('does not expose a receipt for invalid source data', () => {
    const bad = feed();
    bad.events[0].reference = '/outside';
    assert.equal(eventReceipt(bad, '2026-11-19T11:00:00Z', 'open').value, null);
  });
  it('preserves the UNKNOWN token in French diagnostics', () => {
    const bad = changedEvent({ access: 'YES' });
    const result = validateEventFeed(bad);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some(x => x.fr.includes('UNKNOWN') || x.code === 'STATE'));
  });
});
