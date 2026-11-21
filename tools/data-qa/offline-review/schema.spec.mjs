import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ageInDays, BufferLikeByteLength, cleanText, dateNumber, exactFields,
  isFrenchTypography, isHeldSource, isRecord, LICENCES, LIMITS, parseJsonText,
  reviewManifest, validId, validLocalPath,
} from './schema.mjs';
import {
  AS_OF, HASH_A, HASH_B, POLICY, asset, clone, manifest, observation,
  place, stamp, withAsset, withObservation, withPlace, withSource,
} from './test-helpers.mjs';

function review(input, policy = POLICY) { return reviewManifest(input, policy); }
function blocks(input, code) {
  const result = review(input);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.findings.some(item => item.code === code), JSON.stringify(result.findings));
}

describe('P15L calendar and bounded local input primitives', () => {
  it('accepts a valid calendar day', () => assert.notEqual(dateNumber(AS_OF), null));
  it('rejects February 30', () => assert.equal(dateNumber('2026-02-30'), null));
  it('accepts a leap day in a leap year', () => assert.notEqual(dateNumber('2024-02-29'), null));
  it('rejects a leap day in a nonleap year', () => assert.equal(dateNumber('2025-02-29'), null));
  it('rejects a month below January', () => assert.equal(dateNumber('2026-00-10'), null));
  it('rejects month 13', () => assert.equal(dateNumber('2026-13-10'), null));
  it('rejects day zero', () => assert.equal(dateNumber('2026-11-00'), null));
  it('rejects a time in a calendar-only field', () => assert.equal(dateNumber('2026-11-20T10:00:00Z'), null));
  it('treats dates in UTC calendar days', () => assert.equal(ageInDays('2026-11-19', AS_OF), 1));
  it('returns null for an invalid age input', () => assert.equal(ageInDays('not-a-date', AS_OF), null));
  it('rejects absent objects', () => assert.equal(isRecord(null), false));
  it('rejects arrays masquerading as objects', () => assert.equal(isRecord([]), false));
  it('requires all mandatory object keys', () => assert.equal(exactFields({ x: 1 }, ['x', 'y']), false));
  it('rejects extra object keys', () => assert.equal(exactFields({ x: 1, other: true }, ['x']), false));
  it('accepts an optional object key', () => assert.equal(exactFields({ x: 1, y: 2 }, ['x'], ['y']), true));
  it('allows a safe local relative asset path', () => assert.equal(validLocalPath('offline/a.json'), true));
  it('blocks absolute paths', () => assert.equal(validLocalPath('/etc/passwd'), false));
  it('blocks parent traversal', () => assert.equal(validLocalPath('../private/data.json'), false));
  it('blocks embedded traversal segments', () => assert.equal(validLocalPath('data/../other.json'), false));
  it('blocks remote URL paths', () => assert.equal(validLocalPath('https://example.org/data'), false));
  it('blocks protocol-relative URLs', () => assert.equal(validLocalPath('//example.org/data'), false));
  it('blocks Windows drive paths', () => assert.equal(validLocalPath('C:\\data\\item.json'), false));
  it('blocks backslash separators', () => assert.equal(validLocalPath('data\\file.json'), false));
  it('blocks percent encoding in paths', () => assert.equal(validLocalPath('data/%2e%2e/file'), false));
  it('blocks query strings in paths', () => assert.equal(validLocalPath('data.json?token=1'), false));
  it('accepts a bounded identifier', () => assert.equal(validId('region-a_2'), true));
  it('rejects identifiers beginning with a digit', () => assert.equal(validId('2region'), false));
  it('rejects whitespace inside identifiers', () => assert.equal(validId('region a'), false));
  it('rejects punctuation in identifiers', () => assert.equal(validId('place/a'), false));
  it('accepts open licences on the allowlist', () => assert.ok(LICENCES.includes('OGL-ON-1.0')));
  it('excludes proprietary licences from the allowlist', () => assert.ok(!LICENCES.includes('proprietary')));
  it('recognizes held feed with conventional spelling', () => assert.equal(isHeldSource('MiWay'), true));
  it('recognizes held feed with punctuation', () => assert.equal(isHeldSource('mi-way'), true));
  it('recognizes held feed with whitespace', () => assert.equal(isHeldSource('mi way'), true));
  it('does not block unrelated sources', () => assert.equal(isHeldSource('Ontario data'), false));
  it('rejects email text', () => assert.equal(cleanText('contact a@example.org'), false));
  it('rejects telephone numbers in free text', () => assert.equal(cleanText('416 555 1234'), false));
  it('rejects script markup', () => assert.equal(cleanText('<script>run()</script>'), false));
  it('rejects event-handler markup', () => assert.equal(cleanText('hello onclick=run'), false));
  it('rejects blank text', () => assert.equal(cleanText(''), false));
  it('rejects untrimmed text', () => assert.equal(cleanText(' padded '), false));
  it('accepts normal bilingual copy', () => assert.equal(cleanText('Aucune donnée d’accès'), true));
  it('accepts French typographic apostrophes', () => assert.equal(isFrenchTypography('L’accès'), true));
  it('rejects straight French apostrophes', () => assert.equal(isFrenchTypography("L'acces"), false));
  it('rejects ordinary spaces before a French colon', () => assert.equal(isFrenchTypography('Source : exemple'), false));
  it('accepts nonbreaking space before French colon', () => assert.equal(isFrenchTypography('Source\u00a0: exemple'), true));
  it('rejects ordinary question-mark spacing', () => assert.equal(isFrenchTypography('Où ?'), false));
  it('accepts narrow nonbreaking question-mark spacing', () => assert.equal(isFrenchTypography('Où\u202f?'), true));
  it('rejects guillemets with no spaces', () => assert.equal(isFrenchTypography('«Texte»'), false));
  it('accepts narrow spaces inside guillemets', () => assert.equal(isFrenchTypography('«\u202fTexte\u202f»'), true));
  it('counts multibyte UTF-8 bytes rather than characters', () => assert.equal(BufferLikeByteLength('é'), 2));
  it('defines a nonzero local JSON limit', () => assert.ok(LIMITS.bytes > 1000));
});

describe('P15L fail-closed publication manifest checks', () => {
  it('accepts a provenance-rich UNKNOWN record', () => {
    const result = review(manifest());
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.counts.unknown, 1);
  });
  it('preserves known record count separately from UNKNOWN', () => {
    const input = withObservation('state', 'YES');
    const result = review(input);
    assert.equal(result.ok, true);
    assert.equal(result.counts.known, 1);
  });
  it('rejects a missing root collection', () => {
    const input = manifest(); delete input.sources;
    blocks(input, 'ROOT_SCHEMA');
  });
  it('rejects an extra root field', () => blocks({ ...manifest(), contact: 'hidden' }, 'ROOT_SCHEMA'));
  it('rejects an unsupported schema version', () => blocks({ ...manifest(), schemaVersion: 3 }, 'ROOT_SCHEMA'));
  it('rejects nonobject root input', () => blocks([], 'ROOT_SCHEMA'));
  it('rejects invalid review date', () => assert.equal(review(manifest(), { asOf: 'bad' }).ok, false));
  it('rejects negative maximum age', () => assert.equal(review(manifest(), { asOf: AS_OF, maxAgeDays: -1 }).ok, false));
  it('rejects fractional maximum age', () => assert.equal(review(manifest(), { asOf: AS_OF, maxAgeDays: 0.1 }).ok, false));
  it('rejects future publication dates', () => blocks({ ...manifest(), generatedOn: '2026-12-01' }, 'GENERATED_DATE'));
  it('rejects invalid generated dates', () => blocks({ ...manifest(), generatedOn: '2026-02-30' }, 'GENERATED_DATE'));
  it('rejects a source with a held provider', () => blocks(withSource('name', 'MiWay transit feed'), 'SOURCE_SCHEMA'));
  it('rejects a proprietary source', () => blocks(withSource('licence', 'Private'), 'SOURCE_SCHEMA'));
  it('rejects a missing source name', () => blocks(withSource('name', ''), 'SOURCE_SCHEMA'));
  it('rejects a missing source date', () => blocks(withSource('observedOn', ''), 'SOURCE_SCHEMA'));
  it('rejects a stale source date', () => blocks(withSource('observedOn', '2025-01-01'), 'DATE_POLICY'));
  it('rejects a future source date', () => blocks(withSource('observedOn', '2026-12-01'), 'DATE_POLICY'));
  it('rejects remote source references', () => blocks(withSource('reference', 'https://example.org/a'), 'SOURCE_SCHEMA'));
  it('rejects duplicate source identifiers', () => {
    const input = manifest(); input.sources.push(stamp()); blocks(input, 'DUPLICATE');
  });
  it('rejects missing French place name', () => blocks(withPlace('nameFr', ''), 'PLACE_SCHEMA'));
  it('rejects malformed French punctuation', () => blocks(withPlace('nameFr', 'Entrée : test'), 'PLACE_SCHEMA'));
  it('rejects unsupported place category', () => blocks(withPlace('category', 'other'), 'PLACE_SCHEMA'));
  it('rejects invalid place region identifier', () => blocks(withPlace('region', '../unsafe'), 'PLACE_SCHEMA'));
  it('rejects duplicate place identifiers', () => {
    const input = manifest(); input.places.push(place()); blocks(input, 'DUPLICATE');
  });
  it('rejects observation missing place', () => blocks(withObservation('placeId', 'place-missing'), 'PLACE_MISSING'));
  it('rejects invalid observation state', () => blocks(withObservation('state', 'ASSUMED'), 'OBSERVATION_SCHEMA'));
  it('rejects missing French description', () => blocks(withObservation('descriptionFr', ''), 'OBSERVATION_SCHEMA'));
  it('rejects unknown nonexisting source reference', () => blocks(withObservation('sourceIds', ['missing']), 'SOURCE_MISSING'));
  it('rejects duplicate observation source references', () => blocks(withObservation('sourceIds', ['source-a', 'source-a']), 'SOURCE_DUPLICATE'));
  it('rejects known access assertion without a source', () => blocks({ ...withObservation('state', 'NO'), observations: [{ ...observation(), state: 'NO', sourceIds: [] }] }, 'SOURCE_REQUIRED'));
  it('allows UNKNOWN without a source', () => assert.equal(review(withObservation('sourceIds', [])).ok, true));
  it('rejects a future observation date', () => blocks(withObservation('observedOn', '2026-12-10'), 'DATE_POLICY'));
  it('rejects a stale observation date', () => blocks(withObservation('observedOn', '2024-01-01'), 'DATE_POLICY'));
  it('rejects a source newer than its observation', () => blocks(withObservation('observedOn', '2026-11-05'), 'SOURCE_AFTER_OBSERVATION'));
  it('rejects duplicate observation identifiers', () => {
    const input = manifest(); input.observations.push(observation()); blocks(input, 'DUPLICATE');
  });
  it('rejects missing predecessor in observation history', () => blocks(withObservation('replacesId', 'missing'), 'HISTORY_MISSING'));
  it('rejects a history self cycle', () => blocks(withObservation('replacesId', 'observation-a'), 'HISTORY_CYCLE'));
  it('accepts a chronological correction', () => {
    const input = manifest();
    input.observations.push({ ...observation('observation-b'), observedOn: '2026-11-13', replacesId: 'observation-a' });
    assert.equal(review(input).ok, true);
  });
  it('reports conflicting active claims as a notice', () => {
    const input = manifest();
    input.observations = [
      { ...observation('observation-a'), state: 'YES' },
      { ...observation('observation-b'), state: 'NO' },
    ];
    const result = review(input);
    assert.equal(result.ok, true);
    assert.ok(result.findings.some(f => f.code === 'CONFLICT' && f.severity === 'NOTICE'));
  });
  it('rejects invalid asset SHA-256', () => blocks(withAsset('sha256', 'short'), 'ASSET_SCHEMA'));
  it('rejects an unsafe asset path', () => blocks(withAsset('path', '../private/a.json'), 'ASSET_SCHEMA'));
  it('rejects an external asset URL', () => blocks(withAsset('path', 'https://example.org/a.json'), 'ASSET_SCHEMA'));
  it('rejects an unknown source in asset lineage', () => blocks(withAsset('sourceIds', ['missing']), 'SOURCE_MISSING'));
  it('rejects ODbL contamination of the open silo', () => blocks(withSource('licence', 'ODbL-1.0'), 'ODBL_SILO'));
  it('accepts ODbL in the separate silo', () => {
    const input = withSource('licence', 'ODbL-1.0');
    input.assets[0].silo = 'odbl';
    assert.equal(review(input).ok, true);
  });
  it('rejects a non-ODbL file in the ODbL silo', () => blocks(withAsset('silo', 'odbl'), 'ODBL_SILO'));
  it('rejects duplicate asset identifiers', () => {
    const input = manifest(); input.assets.push(asset()); blocks(input, 'DUPLICATE');
  });
  it('rejects duplicate asset paths with different ids', () => {
    const input = manifest(); input.assets.push({ ...asset('asset-b'), path: 'offline/asset-a.json' });
    blocks(input, 'ASSET_PATH_DUPLICATE');
  });
  it('rejects negative asset size', () => blocks(withAsset('bytes', -1), 'ASSET_SCHEMA'));
  it('rejects asset exceeding the page policy size', () => blocks(withAsset('bytes', LIMITS.bytes + 1), 'ASSET_SCHEMA'));
  it('returns stable findings for identical bad input', () => {
    const input = withAsset('path', 'file://evil');
    assert.deepEqual(review(input), review(input));
  });
  it('blocks malformed JSON without throwing', () => assert.equal(parseJsonText('{broken', POLICY).ok, false));
  it('blocks oversized input without parsing it', () => assert.equal(parseJsonText(' '.repeat(LIMITS.bytes + 1), POLICY).ok, false));
  it('accepts valid serialized manifest', () => assert.equal(parseJsonText(JSON.stringify(manifest()), POLICY).ok, true));
});
