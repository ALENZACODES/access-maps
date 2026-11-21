import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ACCESS, LICENCES, ageWithin, array, bilingual, calendar, digest, frenchType,
  hasExactly, held, identifier, inspectBilingual, inspectSource, label, localSize,
  makeAudit, maxInput, object, offlinePath, own, privateText, renderText,
  safeInteger, sameStamp, sha256, siloOf, stable, stamp, stampKey, unique,
  unsafeMarkup, validRoot,
} from './p15k-core.mjs';
import { SOURCE, clone, source } from './p15k-fixtures.mjs';

function errorCodes(run) {
  const audit = makeAudit();
  run(audit);
  return audit.finish().findings.map(item => item.code);
}

describe('P15K core strict validation', () => {
  it('supports all three explicit access states', () => {
    assert.deepEqual(ACCESS, ['YES', 'NO', 'UNKNOWN']);
  });
  it('does not accept empty access as a supported state', () => {
    assert.equal(ACCESS.includes(''), false);
  });
  it('does not permit arbitrary access claims', () => {
    assert.equal(ACCESS.includes('probably'), false);
  });
  it('accepts the chosen Ontario open licence', () => {
    assert.ok(LICENCES.includes('OGL-ON-1.0'));
  });
  it('keeps ODbL explicitly identifiable', () => {
    assert.ok(LICENCES.includes('ODbL-1.0'));
  });
  it('rejects proprietary source licences', () => {
    assert.equal(LICENCES.includes('All rights reserved'), false);
  });
  it('recognizes objects but not arrays', () => {
    assert.equal(object({}), true);
    assert.equal(object([]), false);
  });
  it('rejects a null object', () => {
    assert.equal(object(null), false);
  });
  it('tests own keys without reading the prototype', () => {
    assert.equal(own(Object.create({ inherited: true }), 'inherited'), false);
  });
  it('accepts exact object fields', () => {
    assert.equal(hasExactly({ a: 1, b: 2 }, ['a', 'b']), true);
  });
  it('rejects missing mandatory fields', () => {
    assert.equal(hasExactly({ a: 1 }, ['a', 'b']), false);
  });
  it('rejects unrecognised fields', () => {
    assert.equal(hasExactly({ a: 1, hidden: 2 }, ['a']), false);
  });
  it('accepts explicitly optional fields', () => {
    assert.equal(hasExactly({ a: 1, b: 2 }, ['a'], ['b']), true);
  });
  it('accepts bounded ordinary labels', () => {
    assert.equal(label('Accessible text'), true);
  });
  it('does not normalize away whitespace', () => {
    assert.equal(label(' something '), false);
  });
  it('rejects invisible control characters', () => {
    assert.equal(label('A\u0000B'), false);
  });
  it('rejects whitespace-only labels', () => {
    assert.equal(label('   '), false);
  });
  it('rejects oversized labels', () => {
    assert.equal(label('a'.repeat(257)), false);
  });
  it('supports stable local identifiers', () => {
    assert.equal(identifier('route_one-2'), true);
  });
  it('rejects identifiers starting with digits', () => {
    assert.equal(identifier('2route'), false);
  });
  it('rejects identifiers with spaces', () => {
    assert.equal(identifier('two routes'), false);
  });
  it('rejects uppercase mutable keys', () => {
    assert.equal(identifier('RouteOne'), false);
  });
  it('rejects unsafe path components in identifiers', () => {
    assert.equal(identifier('../secret'), false);
  });
  it('accepts zero as a safe integer', () => {
    assert.equal(safeInteger(0), true);
  });
  it('rejects negative values', () => {
    assert.equal(safeInteger(-1), false);
  });
  it('rejects decimal values', () => {
    assert.equal(safeInteger(44.2), false);
  });
  it('rejects oversized byte declarations', () => {
    assert.equal(safeInteger(101, 100), false);
  });
  it('rejects unsafe integer precision', () => {
    assert.equal(safeInteger(Number.MAX_SAFE_INTEGER + 1), false);
  });
  it('accepts a leap date', () => {
    assert.notEqual(calendar('2024-02-29'), null);
  });
  it('rejects a non-leap February 29', () => {
    assert.equal(calendar('2025-02-29'), null);
  });
  it('rejects an impossible April day', () => {
    assert.equal(calendar('2026-04-31'), null);
  });
  it('rejects zero month', () => {
    assert.equal(calendar('2026-00-10'), null);
  });
  it('rejects an ISO timestamp where a day is required', () => {
    assert.equal(calendar('2026-11-20T00:00:00Z'), null);
  });
  it('does not age observations with local timezone offsets', () => {
    assert.equal(calendar('2026-11-20') - calendar('2026-11-19'), 1);
  });
  it('accepts an observation on the same day', () => {
    assert.equal(ageWithin('2026-11-20', '2026-11-20', 0), true);
  });
  it('rejects an observation in the future', () => {
    assert.equal(ageWithin('2026-11-21', '2026-11-20', 30), false);
  });
  it('rejects an observation outside freshness policy', () => {
    assert.equal(ageWithin('2026-10-01', '2026-11-20', 30), false);
  });
  it('rejects negative freshness policy', () => {
    assert.equal(ageWithin('2026-11-20', '2026-11-20', -1), false);
  });
  it('detects a held feed name with punctuation', () => {
    assert.equal(held('Mi-Way'), true);
  });
  it('detects a held feed name in a filename', () => {
    assert.equal(held('cache_mi_way_gtfs'), true);
  });
  it('does not match an unrelated municipal source', () => {
    assert.equal(held('Municipal fixture'), false);
  });
  it('accepts local POSIX references', () => {
    assert.equal(offlinePath('sources/fixture.json'), true);
  });
  it('rejects absolute filesystem paths', () => {
    assert.equal(offlinePath('/tmp/private.json'), false);
  });
  it('rejects http references', () => {
    assert.equal(offlinePath('https://example.org/file'), false);
  });
  it('rejects parent path escape', () => {
    assert.equal(offlinePath('../sources/file'), false);
  });
  it('rejects query strings in a local path', () => {
    assert.equal(offlinePath('en/page.html?token=abc'), false);
  });
  it('rejects percent-encoded traversal attempts', () => {
    assert.equal(offlinePath('%2e%2e/file'), false);
  });
  it('rejects Windows separators', () => {
    assert.equal(offlinePath('data\\file.json'), false);
  });
  it('rejects empty path segments', () => {
    assert.equal(offlinePath('data//file.json'), false);
  });
  it('accepts complete open provenance', () => {
    assert.equal(stamp(SOURCE), true);
  });
  it('rejects provenance without a licence', () => {
    assert.equal(stamp(source({ licence: '' })), false);
  });
  it('rejects held provenance', () => {
    assert.equal(stamp(source({ source: 'MiWay' })), false);
  });
  it('rejects provenance lacking a date', () => {
    assert.equal(stamp(source({ observedOn: '' })), false);
  });
  it('rejects provenance with extra secrets', () => {
    assert.equal(stamp(source({ token: 'private' })), false);
  });
  it('uses stable provenance identity', () => {
    assert.equal(stampKey(SOURCE), stampKey(clone(SOURCE)));
  });
  it('compares provenance without object identity', () => {
    assert.equal(sameStamp(SOURCE, clone(SOURCE)), true);
  });
  it('recognizes changed provenance dates', () => {
    assert.equal(sameStamp(SOURCE, source({ observedOn: '2026-11-14' })), false);
  });
  it('isolates ODbL when any contributor uses ODbL', () => {
    assert.equal(siloOf([SOURCE, source({ licence: 'ODbL-1.0' })]), 'odbl');
  });
  it('retains open silo for non-ODbL source sets', () => {
    assert.equal(siloOf([SOURCE]), 'open');
  });
  it('accepts lowercase SHA-256 digests only', () => {
    assert.equal(digest('a'.repeat(64)), true);
  });
  it('rejects shortened digest declarations', () => {
    assert.equal(digest('a'.repeat(63)), false);
  });
  it('uses a deterministic content digest', () => {
    assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('detects an email address in public text', () => {
    assert.equal(privateText('contact@example.org'), true);
  });
  it('detects a telephone number in public notes', () => {
    assert.equal(privateText('416-555-0123'), true);
  });
  it('detects credential-shaped text', () => {
    assert.equal(privateText('password: hello'), true);
  });
  it('rejects event-handler HTML', () => {
    assert.equal(unsafeMarkup('<p onclick="x()">hi</p>'), true);
  });
  it('rejects a javascript URL', () => {
    assert.equal(unsafeMarkup('javascript:alert(1)'), true);
  });
  it('rejects embedded iframes', () => {
    assert.equal(unsafeMarkup('<iframe src="x"></iframe>'), true);
  });
  it('accepts a typographic apostrophe', () => {
    assert.equal(frenchType('L’accès est UNKNOWN.'), true);
  });
  it('rejects straight apostrophes in French', () => {
    assert.equal(frenchType("L'acces"), false);
  });
  it('rejects ordinary spacing before French colon', () => {
    assert.equal(frenchType('Source : inconnue'), false);
  });
  it('accepts nonbreaking spacing before French colon', () => {
    assert.equal(frenchType('Source\u00a0: inconnue'), true);
  });
  it('rejects ordinary question-mark spacing', () => {
    assert.equal(frenchType('Où ?'), false);
  });
  it('accepts narrow nonbreaking spacing in guillemets', () => {
    assert.equal(frenchType('«\u202fTexte\u202f»'), true);
  });
  it('accepts a valid bilingual notice', () => {
    assert.equal(bilingual({ en: 'Unknown', fr: 'Inconnu' }), true);
  });
  it('rejects missing French copy', () => {
    assert.equal(bilingual({ en: 'Unknown' }), false);
  });
  it('rejects unsafe translated markup', () => {
    assert.equal(bilingual({ en: 'Safe', fr: '<script>evil</script>' }), false);
  });
  it('rejects a duplicate source identifier', () => {
    assert.equal(unique(['x', 'x']), false);
  });
  it('retains declaration order in unique checks', () => {
    assert.equal(unique(['b', 'a', 'c']), true);
  });
  it('rejects an oversized array', () => {
    assert.equal(array([1, 2, 3], 2), null);
  });
  it('accepts an empty inventory', () => {
    assert.deepEqual(array([]), []);
  });
  it('sorts diagnostics without mutating the input', () => {
    const items = [{ id: 'z' }, { id: 'a' }];
    assert.deepEqual(stable(items).map(item => item.id), ['a', 'z']);
    assert.equal(items[0].id, 'z');
  });
  it('returns bilingual diagnostics on a blocking issue', () => {
    const audit = makeAudit();
    audit.add('UNKNOWN', '$.status');
    const result = audit.finish();
    assert.equal(result.ok, false);
    assert.ok(result.findings[0].en.length > 0);
    assert.ok(result.findings[0].fr.length > 0);
  });
  it('returns success with no findings', () => {
    assert.equal(makeAudit().finish().ok, true);
  });
  it('renders French failure messages', () => {
    const audit = makeAudit();
    audit.add('SOURCE', '$.source');
    assert.match(renderText(audit.finish(), 'fr'), /Exportation bloquée/u);
  });
  it('rejects unsupported report languages', () => {
    assert.throws(() => renderText(makeAudit().finish(), 'es'));
  });
  it('blocks non-open provenance during inspection', () => {
    const errors = errorCodes(audit => inspectSource(source({ licence: 'proprietary' }), audit, '$', { asOf: '2026-11-20', maxAgeDays: 30 }));
    assert.ok(errors.includes('LICENCE'));
  });
  it('blocks stale provenance during inspection', () => {
    const errors = errorCodes(audit => inspectSource(source({ observedOn: '2026-01-01' }), audit, '$', { asOf: '2026-11-20', maxAgeDays: 30 }));
    assert.ok(errors.includes('STALE'));
  });
  it('blocks malformed French notices', () => {
    const errors = errorCodes(audit => inspectBilingual({ en: 'Source', fr: 'Source :' }, audit, '$'));
    assert.ok(errors.includes('TYPOGRAPHY'));
  });
  it('rejects the unsupported schema number', () => {
    assert.equal(validRoot({ schemaVersion: 2 }, ['schemaVersion']), false);
  });
  it('measures JSON in UTF-8 bytes', () => {
    assert.ok(localSize({ a: 'é' }) > '{"a":"é"}'.length);
  });
  it('rejects input exceeding the hard limit', () => {
    const audit = makeAudit();
    const ok = maxInput({ content: 'x'.repeat(8 * 1024 * 1024) }, audit);
    assert.equal(ok, false);
    assert.equal(audit.finish().ok, false);
  });
});
