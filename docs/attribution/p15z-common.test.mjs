import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACCESS, LICENCES, EVENT_KINDS, bilingual, boundedDate, byId, calendarDay,
  checkFactSources, controlFree, digest, exact, factEvidence, frenchSpacing, id,
  immutable, instant, integer, isRecord, issue, licenceSilo, localPath, ordered,
  resultBlocked, resultOk, safeObservation, safeText, sortIssues, sourceIndex,
  stableJson, uniqueStrings, validLicence,
} from './p15z-common.mjs';
import { copy, evidence, node, source } from './p15z-fixtures.mjs';

function withSource() {
  const issues = [];
  const add = (code, path) => issues.push(issue(code, path));
  const sources = sourceIndex([source()], '2026-11-19', 45, add);
  return { issues, add, sources };
}

describe('P15Z common: strict record structures', () => {
  it('recognizes ordinary objects and excludes arrays', () => {
    assert.equal(isRecord({}), true);
    assert.equal(isRecord([]), false);
    assert.equal(isRecord(null), false);
    assert.equal(isRecord(1), false);
  });
  it('requires the complete key set', () => {
    assert.equal(exact({ a: 1 }, ['a']), true);
    assert.equal(exact({ a: 1 }, ['a', 'b']), false);
    assert.equal(exact({ a: 1, b: 2 }, ['a']), false);
  });
  it('allows explicitly listed optional keys', () => {
    assert.equal(exact({ a: 1, b: 2 }, ['a'], ['b']), true);
    assert.equal(exact({ a: 1, b: 2, c: 3 }, ['a'], ['b']), false);
  });
  it('does not permit prototype properties as required fields', () => {
    assert.equal(exact({}, ['toString']), false);
  });
  it('supports lowercase prefixed identifiers', () => {
    for (const value of ['a', 'a1', 'a-b', 'a_b', 'segment-one-2']) assert.equal(id(value), true);
  });
  it('rejects ambiguous identifiers', () => {
    for (const value of ['', 'A', '1a', '-a', 'a-', 'a__b', 'a b', '../a', 'a/b', 'é']) {
      assert.equal(id(value), false, value);
    }
  });
  it('bounds identifier length', () => {
    assert.equal(id('a'.repeat(96)), true);
    assert.equal(id('a'.repeat(97)), false);
  });
  it('returns deterministic sorting', () => {
    assert.deepEqual(ordered(['z', 'a', 'm']), ['a', 'm', 'z']);
    assert.deepEqual(ordered(['m', 'a', 'z']), ['a', 'm', 'z']);
  });
  it('sorts records by their stable identifiers', () => {
    assert.deepEqual([{ id: 'b' }, { id: 'a' }].sort(byId).map(x => x.id), ['a', 'b']);
  });
  it('requires uniqueness in bounded lists', () => {
    assert.equal(uniqueStrings(['a', 'b']), true);
    assert.equal(uniqueStrings(['a', 'a']), false);
    assert.equal(uniqueStrings(['A']), false);
  });
  it('limits incoming ID lists', () => {
    assert.equal(uniqueStrings(['a', 'b'], 1), false);
    assert.equal(uniqueStrings(['a', 'b'], 2), true);
  });
  it('accepts only supported access tokens', () => {
    assert.deepEqual(ACCESS, ['YES', 'NO', 'UNKNOWN']);
    assert.ok(!ACCESS.includes('maybe'));
  });
  it('contains a bounded event vocabulary', () => {
    assert.ok(EVENT_KINDS.includes('closure'));
    assert.ok(EVENT_KINDS.includes('reopening'));
    assert.ok(!EVENT_KINDS.includes('automatic-clearance'));
  });
});

describe('P15Z common: copy, localization, and path safety', () => {
  it('accepts natural bilingual names', () => {
    assert.equal(bilingual({ en: 'Accessible route', fr: 'Parcours accessible' }), true);
  });
  it('requires both languages', () => {
    assert.equal(bilingual({ en: 'Route' }), false);
    assert.equal(bilingual({ fr: 'Parcours' }), false);
  });
  it('does not accept a third implicit language', () => {
    assert.equal(bilingual({ en: 'Route', fr: 'Parcours', de: 'Weg' }), false);
  });
  it('requires non-empty content', () => {
    assert.equal(safeText(' '), false);
    assert.equal(safeText(''), false);
    assert.equal(safeText('A route'), true);
  });
  it('rejects outside whitespace', () => {
    assert.equal(safeText(' route'), false);
    assert.equal(safeText('route '), false);
  });
  it('rejects control characters using Unicode', () => {
    for (const value of ['a\tb', 'a\nb', 'a\rb', 'a\u0000b', 'a\u007fb']) {
      assert.equal(controlFree(value), false);
      assert.equal(safeText(value), false);
    }
  });
  it('rejects HTML-like code and unsafe URLs', () => {
    for (const value of ['<script>', '<b>text', 'javascript:go', 'data:image/png', 'onclick=x']) {
      assert.equal(safeText(value), false, value);
    }
  });
  it('does not leak contact information into copy', () => {
    assert.equal(safeText('a@example.com'), false);
    assert.equal(safeText('Token: abc'), false);
    assert.equal(safeText('Route data'), true);
  });
  it('does not claim real-time conditions', () => {
    assert.equal(safeText('guaranteed passage'), false);
    assert.equal(safeText('real-time access'), false);
    assert.equal(safeText('Reported access'), true);
  });
  it('rejects ASCII apostrophes in French elisions', () => {
    assert.equal(frenchSpacing("L'accès est UNKNOWN"), false);
    assert.equal(frenchSpacing('L’accès est UNKNOWN'), true);
  });
  it('requires U+00A0 before the colon', () => {
    assert.equal(frenchSpacing('État: UNKNOWN'), false);
    assert.equal(frenchSpacing('État\u00a0: UNKNOWN'), true);
  });
  it('requires U+202F before semicolons', () => {
    assert.equal(frenchSpacing('Source; UNKNOWN'), false);
    assert.equal(frenchSpacing('Source\u202f; UNKNOWN'), true);
  });
  it('requires U+202F before question marks', () => {
    assert.equal(frenchSpacing('Accès?'), false);
    assert.equal(frenchSpacing('Accès\u202f?'), true);
  });
  it('requires U+202F before exclamation marks', () => {
    assert.equal(frenchSpacing('Attention!'), false);
    assert.equal(frenchSpacing('Attention\u202f!'), true);
  });
  it('requires U+202F within French quotation marks', () => {
    assert.equal(frenchSpacing('«UNKNOWN»'), false);
    assert.equal(frenchSpacing('«\u202fUNKNOWN\u202f»'), true);
  });
  it('rejects non-local offline paths', () => {
    for (const path of ['/x', '../x', 'x/../y', './x', 'x\\y', 'x?y', 'x#z', 'x:y', '']) {
      assert.equal(localPath(path), false, path);
    }
  });
  it('allows a relative nested asset path', () => {
    assert.equal(localPath('routes/ontario/segment-one.json'), true);
  });
  it('rejects hidden dot components', () => {
    assert.equal(localPath('.secrets/key'), false);
    assert.equal(localPath('routes/.hidden/file'), false);
  });
  it('rejects percent-encoded escapes', () => {
    assert.equal(localPath('a/%2e%2e/b'), false);
  });
  it('rejects duplicate slashes and trailing separators', () => {
    assert.equal(localPath('a//b'), false);
    assert.equal(localPath('a/b/'), false);
  });
});

describe('P15Z common: dates, licences, and evidence', () => {
  it('accepts real calendar days', () => {
    assert.notEqual(calendarDay('2024-02-29'), null);
    assert.notEqual(calendarDay('2026-11-19'), null);
  });
  it('rejects nonexistent dates', () => {
    for (const value of ['2026-02-29', '2026-13-01', '2026-00-01', '2026-04-31']) {
      assert.equal(calendarDay(value), null, value);
    }
  });
  it('does not accept loose dates', () => {
    assert.equal(calendarDay('2026-1-01'), null);
    assert.equal(calendarDay('2026-11-19T00:00:00Z'), null);
  });
  it('allows exact UTC timestamps', () => {
    assert.notEqual(instant('2026-11-19T10:00:00Z'), null);
  });
  it('rejects local timestamps without zone', () => {
    assert.equal(instant('2026-11-19T10:00:00'), null);
  });
  it('rejects invalid clock values', () => {
    assert.equal(instant('2026-11-19T25:00:00Z'), null);
    assert.equal(instant('2026-11-19T10:62:00Z'), null);
  });
  it('rejects timestamps with fractional seconds', () => {
    assert.equal(instant('2026-11-19T10:00:00.000Z'), null);
  });
  it('accepts an observation at the cutoff', () => {
    assert.equal(boundedDate('2026-11-01', '2026-11-19', 18), true);
  });
  it('rejects an observation outside the cutoff', () => {
    assert.equal(boundedDate('2026-11-01', '2026-11-19', 17), false);
  });
  it('rejects future observation dates', () => {
    assert.equal(boundedDate('2026-11-20', '2026-11-19', 50), false);
  });
  it('maintains explicit open licence list', () => {
    assert.ok(LICENCES.includes('OGL-ON-1.0'));
    assert.equal(validLicence('proprietary'), false);
  });
  it('keeps ODbL separate', () => {
    assert.equal(licenceSilo('ODbL-1.0'), 'odbl');
    assert.equal(licenceSilo('OGL-ON-1.0'), 'open');
  });
  it('builds source lookup from valid records', () => {
    const { issues, sources } = withSource();
    assert.equal(issues.length, 0);
    assert.equal(sources.get('city').licence, 'OGL-ON-1.0');
  });
  it('flags repeated source identifiers', () => {
    const errors = [];
    sourceIndex([source(), source()], '2026-11-19', 45, (code, path) => errors.push({ code, path }));
    assert.ok(errors.some(error => error.code === 'DUPLICATE'));
  });
  it('rejects source-silo mismatches', () => {
    const errors = [];
    sourceIndex([{ ...source(), silo: 'odbl' }], '2026-11-19', 45, code => errors.push(code));
    assert.ok(errors.includes('SILO'));
  });
  it('rejects missing source references', () => {
    const { sources, add, issues } = withSource();
    checkFactSources({ sourceIds: ['missing'], silo: 'open' }, sources, add, 'item');
    assert.ok(issues.some(error => error.code === 'REF'));
  });
  it('rejects mixed lineage across source silos', () => {
    const { sources, add, issues } = withSource();
    checkFactSources({ sourceIds: ['city'], silo: 'odbl' }, sources, add, 'item');
    assert.ok(issues.some(error => error.code === 'SILO'));
  });
  it('accepts a grounded known observation', () => {
    const { sources, add, issues } = withSource();
    const fact = node('a');
    factEvidence(fact, sources, '2026-11-19', 45, add, 'item');
    assert.equal(issues.length, 0);
  });
  it('accepts tier-one UNKNOWN without a positive claim', () => {
    const { sources, add, issues } = withSource();
    factEvidence(node('a', 'UNKNOWN'), sources, '2026-11-19', 45, add, 'item');
    assert.equal(issues.length, 0);
  });
  it('rejects tier-one positive claims', () => {
    const { sources, add, issues } = withSource();
    const fact = node('a', 'YES', { tier: 1 });
    factEvidence(fact, sources, '2026-11-19', 45, add, 'item');
    assert.ok(issues.some(error => error.code === 'TIER'));
  });
  it('rejects positive claims without matching evidence', () => {
    const { sources, add, issues } = withSource();
    const fact = node('a', 'YES', { evidence: [] });
    factEvidence(fact, sources, '2026-11-19', 45, add, 'item');
    assert.ok(issues.some(error => error.code === 'EVIDENCE'));
  });
  it('rejects contradictory stated access', () => {
    const { sources, add, issues } = withSource();
    const fact = node('a', 'YES', { evidence: [evidence('YES'), evidence('NO')] });
    factEvidence(fact, sources, '2026-11-19', 45, add, 'item');
    assert.ok(issues.some(error => error.code === 'CONFLICT'));
  });
  it('rejects a high tier without independent support', () => {
    const { sources, add, issues } = withSource();
    const fact = node('a', 'YES', { tier: 3, evidence: [evidence('YES', 'city', 3)] });
    factEvidence(fact, sources, '2026-11-19', 45, add, 'item');
    assert.ok(issues.some(error => error.code === 'TIER'));
  });
  it('rejects stale observations', () => {
    const { sources, add, issues } = withSource();
    const fact = node('a', 'YES', { evidence: [{ ...evidence(), observedOn: '2026-01-01' }] });
    factEvidence(fact, sources, '2026-11-19', 45, add, 'item');
    assert.ok(issues.some(error => error.code === 'AGE'));
  });
});

describe('P15Z common: deterministic results', () => {
  it('is stable across object insertion orders', () => {
    assert.equal(stableJson({ b: 2, a: 1 }), stableJson({ a: 1, b: 2 }));
  });
  it('produces the same digest for equivalent data', () => {
    assert.equal(digest({ z: 1, a: 2 }), digest({ a: 2, z: 1 }));
  });
  it('changes the digest when a field changes', () => {
    assert.notEqual(digest({ a: 'YES' }), digest({ a: 'UNKNOWN' }));
  });
  it('freezes result objects recursively', () => {
    const result = resultOk({ records: [{ id: 'a' }] });
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.value.records[0]), true);
  });
  it('never exposes a value on a blocked result', () => {
    const result = resultBlocked([issue('ROOT', '$')]);
    assert.equal(result.ok, false);
    assert.equal(result.value, null);
  });
  it('sorts diagnostics deterministically', () => {
    const sorted = sortIssues([issue('ROOT', 'z'), issue('TIME', 'a')]);
    assert.deepEqual(sorted.map(x => x.path), ['a', 'z']);
  });
  it('keeps French conflict diagnostics correctly spaced', () => {
    const text = issue('CONFLICT', 'route').fr;
    assert.ok(text.includes('\u202f;'));
    assert.equal(frenchSpacing(text), true);
  });
  it('does not mutate caller-owned objects', () => {
    const original = { z: { a: 2 } };
    const frozen = immutable(original);
    assert.deepEqual(original, frozen);
    assert.equal(Object.isFrozen(original), false);
  });
  it('exposes diagnostic details without personal data', () => {
    const entry = issue('UNKNOWN', 'links.ab');
    assert.equal(entry.code, 'UNKNOWN');
    assert.ok(entry.fr.includes('UNKNOWN'));
    assert.equal(entry.path, 'links.ab');
  });
  it('rejects out-of-range integers', () => {
    assert.equal(integer(0, 0, 10), true);
    assert.equal(integer(-1, 0, 10), false);
    assert.equal(integer(11, 0, 10), false);
    assert.equal(integer(3.5, 0, 10), false);
  });
});
