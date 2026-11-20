import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LICENCES, FEATURES, ACCESS, KINDS, ROLES, LIMITS, PHRASES,
  isObject, hasKeys, isId, isDate, dateDistance, isText, isBilingual,
  isLicence, licenceSilo, isSilo, isAccess, isFeature, isTier, isSafePath,
  isUniqueIds, isDigest, checksum, jsonBytes, stableObject, stableDigest,
  diagnostic, sortedIssues, blocked, accepted, requireKeys, indexUnique,
  validateTimeWindow, normalizeWord, containsRestrictedText,
  independentSources, makeReport, ensureLimit, validateNames,
  compareDates, compactIssueText,
} from './p15aa-contract.mjs';

const name = { en: 'Fictional public entrance', fr: 'Entrée publique fictive' };

describe('P15AA contract: bounded, public, and deterministic', () => {
  it('exposes allowed source and feature constants', () => {
    assert.ok(LICENCES.includes('OGL-ON-1.0'));
    assert.ok(LICENCES.includes('ODbL-1.0'));
    assert.ok(FEATURES.includes('entrance'));
    assert.ok(FEATURES.includes('crossing'));
    assert.deepEqual(ACCESS, ['YES', 'NO', 'UNKNOWN']);
    assert.ok(KINDS.includes('municipal'));
    assert.ok(ROLES.includes('operator'));
    assert.equal(LIMITS.notes, 250);
  });
  it('rejects non-record objects', () => {
    for (const value of [null, [], [1], undefined, 'name', 1, true]) {
      assert.equal(isObject(value), false);
    }
    assert.equal(isObject({}), true);
  });
  it('enforces exact records when requested', () => {
    assert.equal(hasKeys({ a: 1, b: 2 }, ['a']), false);
    assert.equal(hasKeys({ a: 1, b: 2 }, ['a'], ['b']), true);
    assert.equal(hasKeys({}, ['a']), false);
    assert.equal(hasKeys({ a: null }, ['a']), true);
  });
  it('checks strict identifiers', () => {
    for (const value of ['one', 'one-two', 'one_2', 'x']) assert.equal(isId(value), true);
    for (const value of ['', 'One', '-name', 'one--two', 'one space', '../x', 4, null]) {
      assert.equal(isId(value), false);
    }
  });
  it('uses actual calendar days including leap years', () => {
    assert.equal(isDate('2024-02-29'), true);
    assert.equal(isDate('2023-02-29'), false);
    assert.equal(isDate('2026-02-30'), false);
    assert.equal(isDate('2026-11-19'), true);
    assert.equal(isDate('2026-11-20T00:00:00Z'), false);
    assert.equal(dateDistance('2026-11-18', '2026-11-19'), 1);
    assert.equal(dateDistance('2026-11-20', '2026-11-19'), -1);
    assert.equal(dateDistance('bad', '2026-11-19'), null);
  });
  it('accepts plain text without external links', () => {
    assert.equal(isText('Fictional entrance'), true);
    assert.equal(isText('Fictional ramp'), true);
    assert.equal(isText(''), false);
    assert.equal(isText(' leading'), false);
    assert.equal(isText('trailing '), false);
    assert.equal(isText('x'.repeat(281)), false);
    assert.equal(isText('https://example.invalid'), false);
    assert.equal(isText('<script>'), false);
    assert.equal(isText('user@example.invalid'), false);
    assert.equal(isText('alpha\n beta'), false);
  });
  it('preserves proper French typography', () => {
    assert.equal(isBilingual(name), true);
    assert.equal(isBilingual({ en: 'Public', fr: 'Accès\u00a0: public' }), true);
    assert.equal(isBilingual({ en: 'Public', fr: 'Accès: public' }), false);
    assert.equal(isBilingual({ en: 'Public', fr: 'Oui\u202f!' }), true);
    assert.equal(isBilingual({ en: 'Public', fr: 'Oui !' }), false);
    assert.equal(isBilingual({ en: 'Public', fr: '«\u202fAccès\u202f»' }), true);
    assert.equal(isBilingual({ en: 'Public', fr: '« Accès »' }), false);
    assert.equal(isBilingual({ en: 'Public', fr: "l'accès" }), false);
    assert.equal(isBilingual({ en: 'Public', fr: 'l’accès' }), true);
  });
  it('distinguishes open licences and export silos', () => {
    for (const item of LICENCES) assert.equal(isLicence(item), true);
    assert.equal(isLicence('private'), false);
    assert.equal(licenceSilo('ODbL-1.0'), 'odbl');
    assert.equal(licenceSilo('OGL-ON-1.0'), 'open');
    assert.equal(isSilo('odbl'), true);
    assert.equal(isSilo('open'), true);
    assert.equal(isSilo('mixed'), false);
  });
  it('keeps the UNKNOWN value literal', () => {
    for (const value of ACCESS) assert.equal(isAccess(value), true);
    for (const value of ['unknown', 'maybe', '', 'Y']) assert.equal(isAccess(value), false);
  });
  it('restricts declared features and tiers', () => {
    for (const feature of FEATURES) assert.equal(isFeature(feature), true);
    assert.equal(isFeature('fictional-feature'), false);
    for (const tier of [0, 1, 2, 3]) assert.equal(isTier(tier), true);
    for (const tier of [-1, 4, 2.5, '2', null]) assert.equal(isTier(tier), false);
  });
  it('allows safe local paths only', () => {
    for (const path of ['offline/map.json', 'sources/a.json', 'assets/map-a.bin']) {
      assert.equal(isSafePath(path), true);
    }
    for (const path of ['../one', '/root', 'http://server', 'offline/../x',
      'offline\\map', 'offline/file?x=1', 'offline/.private', 'bad\npath']) {
      assert.equal(isSafePath(path), false);
    }
  });
  it('requires unique ids without ordering assumptions', () => {
    assert.equal(isUniqueIds(['a', 'b']), true);
    assert.equal(isUniqueIds([]), true);
    assert.equal(isUniqueIds(['a', 'a']), false);
    assert.equal(isUniqueIds(['A']), false);
    assert.equal(isUniqueIds(['a', 'b'], 1), false);
  });
  it('computes actual SHA-256 digests', () => {
    const bytes = jsonBytes({ a: 1 });
    assert.equal(bytes instanceof Uint8Array, true);
    assert.equal(isDigest(checksum(bytes)), true);
    assert.equal(isDigest('a'.repeat(63)), false);
    assert.equal(isDigest('Z'.repeat(64)), false);
    assert.throws(() => checksum('not bytes'), TypeError);
  });
  it('hashes objects independently of object key insertion order', () => {
    const left = { z: { y: 2, x: 1 }, a: 1 };
    const right = { a: 1, z: { x: 1, y: 2 } };
    assert.deepEqual(stableObject(left), stableObject(right));
    assert.equal(stableDigest(left), stableDigest(right));
    assert.notEqual(stableDigest(left), stableDigest({ a: 2, z: right.z }));
  });
  it('creates deterministic bilingual issues', () => {
    const issue = diagnostic('CONFLICT', 'features.one');
    assert.equal(issue.code, 'CONFLICT');
    assert.ok(issue.en.length > 5);
    assert.ok(issue.fr.length > 5);
    assert.equal(issue.path, 'features.one');
    for (const text of Object.values(PHRASES)) {
      assert.equal(text.length, 2);
      assert.ok(text.every((part) => isText(part)));
    }
  });
  it('sorts diagnostics by path then code', () => {
    const issues = [diagnostic('TIER', 'z'), diagnostic('CLAIM', 'a'), diagnostic('DATE', 'a')];
    assert.deepEqual(sortedIssues(issues).map((item) => item.code), ['CLAIM', 'DATE', 'TIER']);
    assert.deepEqual(issues.map((item) => item.code), ['TIER', 'CLAIM', 'DATE']);
  });
  it('never leaks partial records from blocked results', () => {
    const outcome = blocked([diagnostic('ROOT', '$')], { count: 3 });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.value, null);
    assert.equal(outcome.summary.count, 3);
    assert.equal(accepted({ value: 1 }).ok, true);
  });
  it('checks required fields with explicit diagnostics', () => {
    const issues = [];
    assert.equal(requireKeys({ a: 1 }, ['a'], '$', issues), true);
    assert.equal(requireKeys({ a: 1 }, ['a', 'b'], '$', issues), false);
    assert.equal(issues[0].code, 'ROOT');
  });
  it('indexes unique records while flagging duplicate ids', () => {
    const issues = [];
    const records = indexUnique([{ id: 'a' }, { id: 'a' }, { id: 'b' }], 'FEATURE',
      (code, path) => issues.push(diagnostic(code, path)));
    assert.equal(records.size, 2);
    assert.equal(issues[0].code, 'DUPLICATE');
  });
  it('rejects future and excessively old observations', () => {
    assert.equal(validateTimeWindow('2026-11-19', '2026-11-19', 0), true);
    assert.equal(validateTimeWindow('2026-11-10', '2026-11-19', 9), true);
    assert.equal(validateTimeWindow('2026-11-10', '2026-11-19', 8), false);
    assert.equal(validateTimeWindow('2026-11-20', '2026-11-19', 9), false);
  });
  it('normalizes words without erasing Unicode', () => {
    assert.equal(normalizeWord('  Hôtel   PUBLIC '), 'hôtel public');
    assert.equal(normalizeWord('Ramp'), 'ramp');
  });
  it('recognizes unsafe disclosure content', () => {
    assert.equal(containsRestrictedText('<script>'), true);
    assert.equal(containsRestrictedText('user@example.invalid'), true);
    assert.equal(containsRestrictedText('Fictional ramp'), false);
  });
  it('counts independent groups rather than duplicate observations', () => {
    const sources = new Map([['a', { independenceGroup: 'group-a' }],
      ['b', { independenceGroup: 'group-a' }], ['c', { independenceGroup: 'group-c' }]]);
    assert.equal(independentSources([{ sourceId: 'a' }, { sourceId: 'b' }], sources), 1);
    assert.equal(independentSources([{ sourceId: 'a' }, { sourceId: 'c' }], sources), 2);
    assert.equal(independentSources([{ sourceId: 'none' }], sources), 0);
  });
  it('retains report counters and blocks unsupported values', () => {
    const report = makeReport(false, [diagnostic('ROOT', '$')], { a: 1 }, { checked: 2 });
    assert.equal(report.result, null);
    assert.equal(report.counters.checked, 2);
    const issues = [];
    assert.equal(ensureLimit([1, 2], 1, 'LIMIT', '$', (c, p) => issues.push(diagnostic(c, p))), false);
    assert.equal(issues[0].code, 'LIMIT');
    assert.equal(validateNames(name, 'name', (c) => issues.push(c)), true);
  });
  it('compares calendar dates without guessing', () => {
    assert.equal(compareDates('2026-11-18', '2026-11-19'), -1);
    assert.equal(compareDates('2026-11-19', '2026-11-19'), 0);
    assert.equal(compareDates('2026-11-20', '2026-11-19'), 1);
    assert.equal(compareDates('invalid', '2026-11-19'), null);
  });
  it('formats diagnostics in both languages', () => {
    const result = blocked([diagnostic('CONFLICT', 'features.a')]);
    assert.match(compactIssueText(result, 'fr'), /Contrôle bloqué/u);
    assert.match(compactIssueText(result, 'en'), /Check blocked/u);
    assert.match(compactIssueText(accepted({}), 'en'), /Check passed/u);
    assert.throws(() => compactIssueText(result, 'es'), TypeError);
  });
});
