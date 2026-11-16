import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  UNKNOWN, emptyRecord, emptyInventory,
} from './provenance-core.mjs';
import {
  DISCLOSURE_VERSION, MAX_SURFACES, MAX_LINKS, MAX_SURFACE_BYTES,
  SURFACE_KINDS, SURFACE_STATES, ACCESS_STATES, DELIVERY,
  DISCLOSURE_FIELDS, REGISTER_FIELDS, DisclosureError, blankSurface,
  emptyRegister, parseSurface, parseRegister, parseRegisterText,
  encodeRegister, upsertSurface, removeSurface, updateSurfaceState,
  copySurface, findSurface, searchSurfaces, registerCounts,
  parseReleasePackage, parseReleasePackageText, encodeReleasePackage,
  combineReleaseFiles, surfaceCreditRows, sourceLink,
} from './disclosure-core.mjs';

const each = (cases) => (title, callback) => {
  for (const value of cases) it(title.replace('%j', JSON.stringify(value)), () => callback(value));
};

function surface(overrides = {}) {
  return { ...blankSurface('maps'), ...overrides };
}
function register(...surfaces) {
  return { version: 1, surfaces };
}
function source(id = 'roads') {
  return {
    ...emptyRecord(id), sourceName: 'Public Source', sourceUrl: 'https://example.org/data',
    datasetAsOf: '2026-10-11', licence: 'OTHER-OPEN',
  };
}

const invalid = (value, code) => {
  assert.throws(() => parseSurface(value), (error) => error instanceof DisclosureError && error.code === code);
};

describe('publication surface contract', () => {
  it('starts with an explicitly held surface', () => {
    const item = blankSurface();
    assert.equal(item.state, 'held');
    assert.equal(item.titleEn, UNKNOWN);
    assert.equal(item.titleFr, UNKNOWN);
    assert.equal(item.minimumTargetPx, UNKNOWN);
    assert.equal(item.sourceDate, UNKNOWN);
    assert.deepEqual(item.sourceIds, []);
  });
  it('starts with an empty register', () => {
    assert.deepEqual(emptyRegister(), register());
    assert.equal(DISCLOSURE_VERSION, 1);
  });
  it('accepts a strict surface with no inferred values', () => {
    const parsed = parseSurface(surface());
    assert.equal(parsed.delivery, UNKNOWN);
    assert.equal(parsed.supportsKeyboard, UNKNOWN);
  });
  it('rejects missing properties', () => {
    const item = surface();
    delete item.notesFr;
    invalid(item, 'MISSING_FIELD');
  });
  it('rejects unrecognized properties', () => {
    invalid({ ...surface(), unsafe: true }, 'UNEXPECTED_FIELD');
  });
  it('rejects arrays, numbers and null as records', () => {
    for (const value of [null, [], 3, 'surface']) invalid(value, 'NOT_OBJECT');
  });
  each(['', 'ABC', '../other', 'x/y', 'x space', '1start', 'x'.repeat(65)])(
    'rejects invalid identifiers %j', (id) => invalid(surface({ id }), id.length === 0 || id.length > 64 ? 'INVALID_TEXT' : 'INVALID_ID'));
  each(['http://example.org', '//map', '/map?foo=1', '/map#fragment',
    '/a//b', '/a/../b', '/A', '/map/', '', 'https://example.org/map'])(
    'rejects invalid local routes %j', (path) => invalid(surface({ path }), path.length === 0 ? 'INVALID_TEXT' : 'INVALID_ROUTE'));
  each(['/', '/maps', '/places/accessible', '/a-b_c/123'])(
    'accepts local routes %j', (path) => assert.equal(parseSurface(surface({ path })).path, path));
  each(['','2026-02-30', '2025-13-01', '2024-00-03', '2025-01-00',
    '2026-1-1', '2026/01/01'])(
    'rejects invalid review dates %j', (date) => invalid(surface({ lastReviewedOn: date }), 'INVALID_DATE'));
  it('accepts leap-day dates', () => {
    assert.equal(parseSurface(surface({ lastReviewedOn: '2024-02-29' })).lastReviewedOn, '2024-02-29');
  });
  each([-1, 1.5, NaN, Infinity, 1001, '44', null])(
    'rejects invalid target dimensions %j', (minimumTargetPx) =>
      invalid(surface({ minimumTargetPx }), 'INVALID_TARGET'));
  each([0, 43, 44, 1000, UNKNOWN])(
    'keeps target evidence without inventing %j', (minimumTargetPx) =>
      assert.equal(parseSurface(surface({ minimumTargetPx })).minimumTargetPx, minimumTargetPx));
  it('rejects repeated source identifiers', () => {
    invalid(surface({ sourceIds: ['roads', 'roads'] }), 'DUPLICATE_SOURCE');
  });
  it('rejects malformed identifiers', () => {
    invalid(surface({ sourceIds: ['Bad ID'] }), 'INVALID_SOURCE_ID');
  });
  it('rejects non-array source identifiers', () => {
    invalid(surface({ sourceIds: 'roads' }), 'INVALID_SOURCES');
  });
  it('rejects too many source identifiers', () => {
    invalid(surface({ sourceIds: Array.from({ length: 101 }, (_, i) => `id${i}`) }), 'INVALID_SOURCES');
  });
  it('rejects control characters in displayed text', () => {
    invalid(surface({ titleEn: 'bad\u0000text' }), 'INVALID_TEXT');
  });
  it('accepts empty optional notes but not missing titles', () => {
    assert.equal(parseSurface(surface({ notesEn: '' })).notesEn, '');
    invalid(surface({ titleFr: '' }), 'INVALID_TEXT');
  });
  it('rejects oversized field text', () => {
    invalid(surface({ noticeEn: 'x'.repeat(4001) }), 'INVALID_TEXT');
  });
  it('preserves explicit trivalent accessibility values', () => {
    for (const value of ACCESS_STATES) {
      const parsed = parseSurface(surface({ supportsKeyboard: value, supportsScreenReader: value }));
      assert.equal(parsed.supportsKeyboard, value);
      assert.equal(parsed.supportsScreenReader, value);
    }
  });
  it('rejects boolean accessibility assertions', () => {
    invalid(surface({ supportsKeyboard: true }), 'INVALID_ENUM');
  });
  it('only accepts known kinds, states and delivery modes', () => {
    for (const kind of SURFACE_KINDS) assert.equal(parseSurface(surface({ kind })).kind, kind);
    for (const state of SURFACE_STATES) assert.equal(parseSurface(surface({ state })).state, state);
    for (const delivery of DELIVERY) assert.equal(parseSurface(surface({ delivery })).delivery, delivery);
  });
  it('rejects unexpected enum values', () => {
    for (const [key, value] of [['kind', 'restaurant'], ['state', 'live'], ['delivery', 'installed']]) {
      invalid(surface({ [key]: value }), 'INVALID_ENUM');
    }
  });
  it('exposes a stable field contract', () => {
    assert.deepEqual(Object.keys(blankSurface()).sort(), [...DISCLOSURE_FIELDS].sort());
    assert.deepEqual(Object.keys(emptyRegister()).sort(), [...REGISTER_FIELDS].sort());
  });
});

describe('register operations', () => {
  it('parses and freezes a register', () => {
    const parsed = parseRegister(register(surface()));
    assert.ok(Object.isFrozen(parsed));
    assert.ok(Object.isFrozen(parsed.surfaces));
    assert.ok(Object.isFrozen(parsed.surfaces[0]));
    assert.ok(Object.isFrozen(parsed.surfaces[0].sourceIds));
  });
  it('rejects unexpected register properties', () => {
    assert.throws(() => parseRegister({ ...register(), extra: true }), /UNEXPECTED_FIELD/u);
  });
  it('rejects a missing register property', () => {
    assert.throws(() => parseRegister({ version: 1 }), /MISSING_FIELD/u);
  });
  it('rejects an unsupported schema version', () => {
    assert.throws(() => parseRegister({ version: 2, surfaces: [] }), /VERSION/u);
  });
  it('rejects an invalid surfaces property', () => {
    assert.throws(() => parseRegister({ version: 1, surfaces: {} }), /INVALID_SURFACES/u);
  });
  it('rejects an excessive register', () => {
    const many = Array.from({ length: MAX_SURFACES + 1 }, (_, i) => surface({ id: `s${i}` }));
    assert.throws(() => parseRegister(register(...many)), /INVALID_SURFACES/u);
  });
  it('rejects repeated surface IDs', () => {
    assert.throws(() => parseRegister(register(surface(), surface())), /DUPLICATE_ID/u);
  });
  it('rejects two included surfaces on one route', () => {
    assert.throws(() => parseRegister(register(
      surface({ id: 'a', state: 'included', path: '/map' }),
      surface({ id: 'b', state: 'included', path: '/map' }),
    )), /DUPLICATE_ROUTE/u);
  });
  it('allows two held surfaces on the same route', () => {
    assert.equal(parseRegister(register(surface({ id: 'a' }), surface({ id: 'b' }))).surfaces.length, 2);
  });
  it('rejects oversized source link totals', () => {
    const many = Array.from({ length: 11 }, (_, i) => surface({
      id: `s${i}`, sourceIds: Array.from({ length: 100 }, (_, n) => `id${n}`),
    }));
    assert.equal(many.reduce((total, item) => total + item.sourceIds.length, 0) > MAX_LINKS, true);
    assert.throws(() => parseRegister(register(...many)), /TOO_MANY_LINKS/u);
  });
  it('roundtrips JSON without changing unknowns', () => {
    const original = register(surface({ sourceIds: ['roads'], sourceDate: UNKNOWN }));
    assert.deepEqual(parseRegisterText(encodeRegister(original)), parseRegister(original));
    assert.equal(JSON.parse(encodeRegister(original)).surfaces[0].sourceDate, UNKNOWN);
  });
  it('rejects invalid JSON', () => {
    assert.throws(() => parseRegisterText('not JSON'), /INVALID_JSON/u);
  });
  it('rejects oversized JSON', () => {
    assert.throws(() => parseRegisterText('x'.repeat(MAX_SURFACE_BYTES + 1)), /FILE_TOO_LARGE/u);
  });
  it('sorts insertions by identifier', () => {
    const first = upsertSurface(emptyRegister(), surface({ id: 'z' }));
    const second = upsertSurface(first, surface({ id: 'a' }));
    assert.deepEqual(second.surfaces.map((item) => item.id), ['a', 'z']);
  });
  it('replaces an existing surface without duplication', () => {
    const first = upsertSurface(emptyRegister(), surface({ titleEn: 'Before' }));
    const second = upsertSurface(first, surface({ titleEn: 'After' }));
    assert.equal(second.surfaces.length, 1);
    assert.equal(second.surfaces[0].titleEn, 'After');
  });
  it('removes one surface', () => {
    assert.deepEqual(removeSurface(register(surface()), 'maps'), emptyRegister());
  });
  it('rejects malformed removal identifiers', () => {
    assert.throws(() => removeSurface(register(), '../bad'), /INVALID_ID/u);
  });
  it('changes publication state without changing other facts', () => {
    const updated = updateSurfaceState(register(surface()), 'maps', 'included');
    assert.equal(updated.surfaces[0].state, 'included');
    assert.equal(updated.surfaces[0].sourceDate, UNKNOWN);
  });
  it('cannot change the state of an absent surface', () => {
    assert.throws(() => updateSurfaceState(register(), 'absent', 'included'), /MISSING_SURFACE/u);
  });
  it('copies only into held state', () => {
    const copied = copySurface(register(surface({ state: 'included' })), 'maps', 'copy');
    assert.equal(copied.surfaces.find((item) => item.id === 'copy').state, 'held');
  });
  it('can locate a surface or return null', () => {
    const value = register(surface());
    assert.equal(findSurface(value, 'maps').id, 'maps');
    assert.equal(findSurface(value, 'other'), null);
  });
  it('filters case-insensitively on text', () => {
    const value = register(surface({ titleEn: 'River Walk' }));
    assert.equal(searchSurfaces(value, { text: 'RIVER' }).length, 1);
    assert.equal(searchSurfaces(value, { text: 'unknown-id' }).length, 0);
  });
  it('filters state and kind', () => {
    const value = register(surface({ kind: 'map', state: 'held' }));
    assert.equal(searchSurfaces(value, { state: 'included' }).length, 0);
    assert.equal(searchSurfaces(value, { kind: 'map' }).length, 1);
  });
  it('rejects invalid search filters', () => {
    assert.throws(() => searchSurfaces(register(), { kind: 'x' }), /INVALID_ENUM/u);
    assert.throws(() => searchSurfaces(register(), { state: 'x' }), /INVALID_ENUM/u);
  });
  it('counts only recorded offline states', () => {
    const value = register(surface({ id: 'a', delivery: UNKNOWN }),
      surface({ id: 'b', delivery: 'both', state: 'included' }));
    assert.deepEqual(registerCounts(value), {
      total: 2, included: 1, held: 1, excluded: 0,
      offline: 1, unknownDelivery: 1, linkedSources: 0,
    });
  });
});

describe('combined local release packages', () => {
  it('roundtrips inventory and surfaces together', () => {
    const value = { inventory: emptyInventory(), register: register(surface()) };
    assert.deepEqual(parseReleasePackageText(encodeReleasePackage(value)), parseReleasePackage(value));
  });
  it('refuses unknown package keys', () => {
    assert.throws(() => parseReleasePackage({ inventory: emptyInventory(), register: emptyRegister(), token: 'x' }), /PACKAGE_KEYS/u);
  });
  it('rejects malformed package text', () => {
    assert.throws(() => parseReleasePackageText('{'), /INVALID_JSON/u);
  });
  it('combines two valid documents', () => {
    const bundle = combineReleaseFiles(JSON.stringify(emptyInventory()), JSON.stringify(emptyRegister()));
    assert.deepEqual(bundle.inventory, emptyInventory());
  });
  it('rejects a corrupt second document atomically', () => {
    assert.throws(() => combineReleaseFiles(JSON.stringify(emptyInventory()), '{}'), /MISSING_FIELD/u);
  });
  it('exports the source licence and date without inference', () => {
    const rows = surfaceCreditRows(surface({ sourceIds: ['roads'] }), {
      ...emptyInventory(), records: [source()],
    });
    assert.deepEqual(rows[0], {
      id: 'roads', name: 'Public Source', licence: 'OTHER-OPEN',
      date: '2026-10-11', url: 'https://example.org/data',
    });
  });
  it('shows UNKNOWN when the referenced source is missing', () => {
    const rows = surfaceCreditRows(surface({ sourceIds: ['absent'] }), emptyInventory());
    assert.equal(rows[0].name, UNKNOWN);
    assert.equal(rows[0].licence, UNKNOWN);
    assert.equal(rows[0].url, null);
  });
  it('does not create a link for missing URL evidence', () => {
    assert.equal(sourceLink(source('x') && { sourceUrl: UNKNOWN }), null);
  });
});
