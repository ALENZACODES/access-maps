import { describe, expect, it } from 'vitest';
import { compareNeedsSnapshots, differencesForRequirement, exportNeedsJson,
  portableNeedsComparison, sourceDateChanges, sourceInventory } from '../src/routeNeedsReview.js';
import { compareRoutes, DEFAULT_PROFILE, withChoice } from '../src/routeNeeds.js';
import { barredLeg, journey, leg, plan, provenance, uncertainLeg, varyingPlan } from './routeNeedsFixtures.js';

describe('P15AD snapshot change-review contract', () => {
  it('reports identical snapshots without manufactured changes', () => {
    const source = plan([journey('a')]);
    const report = compareNeedsSnapshots(source, source, DEFAULT_PROFILE);
    expect(report.status).toBe('ok');
    expect(report.newBarriers).toBe(0);
    expect(report.newUnknowns).toBe(0);
  });
  it('identifies a newly added journey option', () => {
    const previous = plan([journey('a')]);
    const next = plan([journey('a'), journey('b')]);
    const report = compareNeedsSnapshots(previous, next, DEFAULT_PROFILE);
    expect(report.addedRoutes).toBe(1);
    expect(report.changes.find((row) => row.routeId === 'b')?.kind).toBe('added');
  });
  it('identifies a removed journey option', () => {
    const previous = plan([journey('a'), journey('b')]);
    const next = plan([journey('a')]);
    const report = compareNeedsSnapshots(previous, next, DEFAULT_PROFILE);
    expect(report.removedRoutes).toBe(1);
    expect(report.changes.find((row) => row.routeId === 'b')?.kind).toBe('removed');
  });
  it('reports an essential barrier that appeared after a source change', () => {
    const previous = plan([journey('a', [leg('out')], [leg('back')])]);
    const next = plan([journey('a', [barredLeg('out')], [leg('back')])]);
    const report = compareNeedsSnapshots(previous, next, DEFAULT_PROFILE);
    expect(report.newBarriers).toBe(1);
    expect(report.changes[0]?.warnings).toContain('barrier');
  });
  it('reports a newly unknown outbound segment', () => {
    const previous = plan([journey('a', [leg('out')], [leg('back')])]);
    const next = plan([journey('a', [uncertainLeg('out')], [leg('back')])]);
    const report = compareNeedsSnapshots(previous, next, DEFAULT_PROFILE);
    expect(report.newUnknowns).toBeGreaterThan(0);
  });
  it('does not claim a new barrier when an old barrier remains', () => {
    const previous = plan([journey('a', [barredLeg('out')])]);
    const next = plan([journey('a', [barredLeg('out', { surface: 'loose gravel' })])]);
    const report = compareNeedsSnapshots(previous, next, DEFAULT_PROFILE);
    expect(report.newBarriers).toBe(0);
  });
  it('rejects malformed preference inputs before comparing snapshots', () => {
    const report = compareNeedsSnapshots(plan(), plan(), null);
    expect(report.status).toBe('blocked');
    expect(report.changes).toHaveLength(0);
  });
  it('retains the date supplied in preferences', () => {
    const report = compareNeedsSnapshots(plan(), plan(), DEFAULT_PROFILE);
    expect(report.date).toBe('2026-11-19');
  });
  it('sorts newly added route IDs stably', () => {
    const report = compareNeedsSnapshots(plan([]), plan([journey('z'), journey('a')]), DEFAULT_PROFILE);
    expect(report.changes.map((item) => item.routeId)).toEqual(['a', 'z']);
  });
  it('identifies changed requirement findings by id', () => {
    const previous = plan([journey('a', [leg('out')])]);
    const next = plan([journey('a', [barredLeg('out')])]);
    const report = compareNeedsSnapshots(previous, next, DEFAULT_PROFILE);
    expect(differencesForRequirement(report, 'no-steps').map((item) => item.routeId)).toContain('a');
  });
  it('returns no matches for an unaffected requirement', () => {
    const report = compareNeedsSnapshots(plan(), plan(), DEFAULT_PROFILE);
    expect(differencesForRequirement(report, 'distance')).toHaveLength(0);
  });
  it('does not change the caller-owned plan snapshots', () => {
    const before = plan([journey('a')]);
    const after = plan([journey('a', [barredLeg('out')])]);
    const saved = JSON.stringify(before) + JSON.stringify(after);
    compareNeedsSnapshots(before, after, DEFAULT_PROFILE);
    expect(JSON.stringify(before) + JSON.stringify(after)).toBe(saved);
  });
  it('retains a removed route as absent rather than UNKNOWN route data', () => {
    const report = compareNeedsSnapshots(plan([journey('a')]), plan([]), DEFAULT_PROFILE);
    expect(report.changes[0]?.kind).toBe('removed');
    expect(report.changes[0]?.afterStatus).toBe('UNKNOWN');
  });
  it('records the changed known outbound distance', () => {
    const before = plan([journey('a', [leg('out', { distanceMetres: 100 })], [])]);
    const after = plan([journey('a', [leg('out', { distanceMetres: 200 })], [])]);
    const report = compareNeedsSnapshots(before, after, DEFAULT_PROFILE);
    expect(report.changes[0]?.beforeDistance).toBe(100);
    expect(report.changes[0]?.afterDistance).toBe(200);
  });
  it('does not invent a distance when the next route has an unknown segment', () => {
    const before = plan([journey('a', [leg('out')])]);
    const after = plan([journey('a', [uncertainLeg('out')])]);
    const report = compareNeedsSnapshots(before, after, DEFAULT_PROFILE);
    expect(report.changes[0]?.afterDistance).toBeNull();
  });
  it('treats a changed source as review-worthy', () => {
    const before = plan([journey('a', [leg('out')], [])]);
    const after = plan([journey('a', [leg('out', { provenance: provenance({ sourceId: 'other-source' }) })], [])]);
    const report = compareNeedsSnapshots(before, after, DEFAULT_PROFILE);
    expect(report.changes[0]?.warnings).toContain('source');
  });
  it('counts changed route requirements without duplicating IDs', () => {
    const before = plan([journey('a', [leg('out')])]);
    const after = plan([journey('a', [barredLeg('out')])]);
    const report = compareNeedsSnapshots(before, after, DEFAULT_PROFILE);
    const ids = report.changes[0]?.changedRequirements ?? [];
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('does not inspect blocked options unless the user includes them', () => {
    const before = plan([], [journey('barrier')]);
    const after = plan([], [journey('different')]);
    const report = compareNeedsSnapshots(before, after, DEFAULT_PROFILE);
    expect(report.changes).toHaveLength(0);
  });
  it('includes blocked routes in the review when selected', () => {
    const profile = { ...DEFAULT_PROFILE, includeBlocked: true };
    const before = plan([], [journey('barrier')]);
    const after = plan([], [journey('different')]);
    const report = compareNeedsSnapshots(before, after, profile);
    expect(report.addedRoutes).toBe(1);
    expect(report.removedRoutes).toBe(1);
  });
});

describe('P15AD source inventory and lineage', () => {
  it('returns no rows for no routes', () => {
    const inventory = sourceInventory(compareRoutes(plan([]), DEFAULT_PROFILE));
    expect(inventory.sources).toHaveLength(0);
    expect(inventory.totalObservations).toBe(0);
  });
  it('aggregates repeated references instead of duplicating source rows', () => {
    const inventory = sourceInventory(compareRoutes(plan([journey('a')]), DEFAULT_PROFILE));
    expect(inventory.sources.length).toBeGreaterThan(0);
    expect(new Set(inventory.sources.map((item) => `${item.sourceId}|${item.date}|${item.licence}`)).size)
      .toBe(inventory.sources.length);
  });
  it('retains every referenced route in its source inventory', () => {
    const inventory = sourceInventory(compareRoutes(plan([journey('a'), journey('b')]), DEFAULT_PROFILE));
    const routes = new Set(inventory.sources.flatMap((source) => source.routes));
    expect([...routes].sort()).toEqual(['a', 'b']);
  });
  it('keeps source dates from the provenance record', () => {
    const inventory = sourceInventory(compareRoutes(plan(), DEFAULT_PROFILE));
    expect(inventory.sources[0]?.date).toBe('2026-11-18');
  });
  it('counts missing source dates', () => {
    const report = compareRoutes(plan([journey('a', [uncertainLeg('missing')])]), DEFAULT_PROFILE);
    expect(sourceInventory(report).missingDates).toBeGreaterThan(0);
  });
  it('counts missing source identifiers', () => {
    const route = journey('a', [leg('missing', { provenance: provenance({ sourceId: 'UNKNOWN' }) })]);
    const report = compareRoutes(plan([route]), DEFAULT_PROFILE);
    expect(sourceInventory(report).missingCitations).toBeGreaterThan(0);
  });
  it('counts records with unknown licences', () => {
    const route = journey('a', [leg('missing', { provenance: provenance({ licence: 'UNKNOWN' }) })]);
    const report = compareRoutes(plan([route]), DEFAULT_PROFILE);
    expect(sourceInventory(report).unlicensed).toBeGreaterThan(0);
  });
  it('sets inventory status to UNKNOWN when citations are missing', () => {
    const report = compareRoutes(plan([journey('a', [uncertainLeg('unknown')])]), DEFAULT_PROFILE);
    expect(sourceInventory(report).status).toBe('UNKNOWN');
  });
  it('retains the return direction explicitly', () => {
    const inventory = sourceInventory(compareRoutes(plan(), DEFAULT_PROFILE));
    expect(inventory.sources[0]?.directions).toContain('return');
  });
  it('retains requirement identifiers for audit review', () => {
    const inventory = sourceInventory(compareRoutes(plan(), DEFAULT_PROFILE));
    expect(inventory.sources[0]?.requirements).toContain('no-steps');
  });
  it('uses deterministic source ordering', () => {
    const inventory = sourceInventory(compareRoutes(varyingPlan(), DEFAULT_PROFILE));
    const sorted = [...inventory.sources].sort((a, b) => a.sourceId.localeCompare(b.sourceId, 'en'));
    expect(inventory.sources).toEqual(sorted);
  });
  it('preserves a distinct record when one source has two dates', () => {
    const one = journey('a', [leg('a', { provenance: provenance({ retrievedAt: '2026-11-17' }) })], []);
    const two = journey('b', [leg('b', { provenance: provenance({ retrievedAt: '2026-11-18' }) })], []);
    const inventory = sourceInventory(compareRoutes(plan([one, two]), DEFAULT_PROFILE));
    expect(inventory.sources.some((item) => item.date === '2026-11-17')).toBe(true);
    expect(inventory.sources.some((item) => item.date === '2026-11-18')).toBe(true);
  });
});

describe('P15AD local-only portable comparison', () => {
  it('builds a complete JSON-compatible report from valid preferences', () => {
    const report = portableNeedsComparison(plan(), DEFAULT_PROFILE);
    expect(report?.version).toBe(1);
  });
  it('rejects an invalid preference envelope without producing a report', () => {
    expect(portableNeedsComparison(plan(), null)).toBeNull();
  });
  it('retains the selected locale in the portable report', () => {
    const report = portableNeedsComparison(plan([], [], { locale: 'fr' }), DEFAULT_PROFILE);
    expect(report?.locale).toBe('fr');
  });
  it('retains the explicit date', () => {
    const report = portableNeedsComparison(plan(), DEFAULT_PROFILE);
    expect(report?.reportDate).toBe('2026-11-19');
  });
  it('does not mutate the original preference settings', () => {
    const snapshot = JSON.stringify(DEFAULT_PROFILE);
    portableNeedsComparison(plan(), DEFAULT_PROFILE);
    expect(JSON.stringify(DEFAULT_PROFILE)).toBe(snapshot);
  });
  it('has one route row per supplied route', () => {
    const report = portableNeedsComparison(varyingPlan(), DEFAULT_PROFILE);
    expect(report?.routes).toHaveLength(4);
  });
  it('includes one entry for each requirement', () => {
    const report = portableNeedsComparison(plan(), DEFAULT_PROFILE);
    expect(report?.routes[0]?.requirements).toHaveLength(9);
  });
  it('does not invent a source ID for a missing citation', () => {
    const report = portableNeedsComparison(plan([journey('a', [uncertainLeg('missing')])]), DEFAULT_PROFILE);
    expect(report?.status).toBe('UNKNOWN');
  });
  it('returns a deterministic JSON document for equivalent inputs', () => {
    const first = exportNeedsJson(plan(), DEFAULT_PROFILE);
    const second = exportNeedsJson(plan(), DEFAULT_PROFILE);
    expect(second).toBe(first);
  });
  it('terminates the JSON report with one newline', () => {
    const json = exportNeedsJson(plan(), DEFAULT_PROFILE);
    expect(json?.endsWith('\n')).toBe(true);
    expect(json?.endsWith('\n\n')).toBe(false);
  });
  it('exports valid JSON without encoding source objects as text blobs', () => {
    const json = exportNeedsJson(plan(), DEFAULT_PROFILE);
    const data = JSON.parse(json ?? 'null');
    expect(data.sourceInventory.sources).toHaveLength(1);
  });
  it('does not emit a local export on invalid preferences', () => {
    expect(exportNeedsJson(plan(), { broken: true })).toBeNull();
  });
  it('keeps UNKNOWN as a literal data token in the JSON output', () => {
    const json = exportNeedsJson(plan([journey('a', [uncertainLeg('missing')])]), DEFAULT_PROFILE);
    expect(json).toContain('UNKNOWN');
  });
  it('reports the selected maximum source age in the export', () => {
    const profile = { ...DEFAULT_PROFILE, maximumSourceAgeDays: 30 };
    const data = JSON.parse(exportNeedsJson(plan(), profile) ?? 'null');
    expect(data.profile.maximumSourceAgeDays).toBe(30);
  });
  it('retains only source identifiers, not entire source records, per requirement', () => {
    const data = JSON.parse(exportNeedsJson(plan(), DEFAULT_PROFILE) ?? 'null');
    expect(data.routes[0].requirements[0].sourceIds).toEqual(['municipal-fixture']);
  });
  it('lists distinct source identifiers for each requirement', () => {
    const route = journey('a', [leg('out'), leg('again')]);
    const data = JSON.parse(exportNeedsJson(plan([route]), DEFAULT_PROFILE) ?? 'null');
    expect(data.routes[0].requirements[0].sourceIds).toHaveLength(1);
  });
  it('keeps a route-level UNKNOWN when an essential segment has no evidence', () => {
    const data = JSON.parse(exportNeedsJson(plan([journey('a', [uncertainLeg('gap')])]), DEFAULT_PROFILE) ?? 'null');
    expect(data.routes[0].status).toBe('UNKNOWN');
  });
  it('does not include unrelated fields from the original planner state', () => {
    const data = JSON.parse(exportNeedsJson(plan(), DEFAULT_PROFILE) ?? 'null');
    expect(data).not.toHaveProperty('emergency');
    expect(data).not.toHaveProperty('systemEvent');
  });
});

describe('P15AD source-date change trace', () => {
  it('detects a changed source date on the same leg', () => {
    const previous = plan([journey('a', [leg('out')])]);
    const next = plan([journey('a', [leg('out', { provenance: provenance({ retrievedAt: '2026-11-19' }) })])]);
    expect(sourceDateChanges(previous, next)).toContain('a|out|municipal-fixture');
  });
  it('does not report an unchanged source date', () => {
    expect(sourceDateChanges(plan(), plan())).toEqual([]);
  });
  it('does not pretend a newly added route had an older source date', () => {
    expect(sourceDateChanges(plan([]), plan([journey('new')]))).toEqual([]);
  });
  it('does not compare dates across unrelated route identifiers', () => {
    expect(sourceDateChanges(plan([journey('a')]), plan([journey('b')]))).toEqual([]);
  });
  it('reports changes to source dates in return legs', () => {
    const before = plan([journey('a', [leg('out')], [leg('home')])]);
    const after = plan([journey('a', [leg('out')], [leg('home', { provenance: provenance({ retrievedAt: '2026-11-19' }) })])]);
    expect(sourceDateChanges(before, after)).toContain('a|home|municipal-fixture');
  });
});
