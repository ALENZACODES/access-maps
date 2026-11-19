import test from "node:test";
import assert from "node:assert/strict";
import { compareBilingualReleases, type ParityChangeKind } from "./offline-parity-change.js";
import { parityAsset, parityBundle, parityPair, parityPlan, parityRoute, paritySource,
  paritySurface, renamePlan, renameRelease, setAssets, setRoutes, setSource, setSurfaces } from "./offline-parity-fixtures.js";
import type { OfflineBundle } from "./offline-bundle.js";
import type { ParityPlan } from "./offline-parity.js";

function nextBundle(): OfflineBundle { return renameRelease(parityBundle(), "release-next"); }
function nextPlan(): ParityPlan { return renamePlan(parityPlan(), "release-next"); }
function compare(bundle = nextBundle(), plan = nextPlan()) {
  return compareBilingualReleases(parityBundle(), parityPlan(), bundle, plan);
}
function has(kind: ParityChangeKind, bundle = nextBundle(), plan = nextPlan()): boolean {
  return compare(bundle, plan).changes.some((change) => change.kind === kind);
}

test("unchanged bilingual publication permits release", () => {
  const result = compare();
  assert.equal(result.schema, "attribution-bilingual-parity-comparison/1");
  assert.equal(result.previousRelease, "release-one");
  assert.equal(result.nextRelease, "release-next");
  assert.equal(result.blocked, false, JSON.stringify(result.changes));
  assert.equal(result.changes.length, 0);
  assert.equal(result.blockingChanges, 0);
  assert.equal(result.noticeChanges, 0);
  assert.equal(result.afterResult.blocked, false);
});

test("dropping an English/French pair blocks release", () => {
  const result = compare(nextBundle(), nextPlan().pairs.length ? { ...nextPlan(), pairs: [] } : nextPlan());
  assert.equal(result.blocked, true);
  assert.equal(result.changes.some((item) => item.kind === "PAIR_REMOVED" && item.level === "block"), true);
});

test("changing either route's identity blocks paired parity", () => {
  for (const change of [
    parityPair({ enRouteId: "new-en" }),
    parityPair({ frRouteId: "new-fr" }),
  ]) {
    const result = compare(nextBundle(), nextPlan().pairs.length ? { ...nextPlan(), pairs: [change] } : nextPlan());
    assert.equal(result.blocked, true);
    assert.ok(result.changes.some((item) => item.kind === "PAIR_ROUTE_CHANGED"));
  }
});

test("dropping the offline requirement is a blocker", () => {
  const plan = { ...nextPlan(), pairs: [parityPair({ requireOffline: false })] };
  assert.equal(has("PAIR_REQUIREMENT_CHANGED", nextBundle(), plan), true);
  assert.equal(compare(nextBundle(), plan).blocked, true);
});

test("reducing the minimum target requirement blocks", () => {
  const previous = { ...parityPlan(), minimumTargetPx: 48 };
  const result = compareBilingualReleases(parityBundle(), previous, nextBundle(), nextPlan());
  assert.equal(result.changes.some((change) => change.kind === "PAIR_REQUIREMENT_CHANGED" && change.level === "block"), true);
});

test("adding a stricter minimum requirement is not itself a regression", () => {
  const plan = { ...nextPlan(), minimumTargetPx: 48 };
  const result = compare(nextBundle(), plan);
  assert.equal(result.changes.some((change) => change.kind === "PAIR_REQUIREMENT_CHANGED"), false);
  assert.equal(result.afterResult.blocked, true); // actual 44px targets do not meet the new rule
});

test("removing a declared source from a pair blocks", () => {
  const plan = { ...nextPlan(), pairs: [parityPair({ expectedSourceIds: [] })] };
  assert.equal(has("PAIR_SOURCE_REMOVED", nextBundle(), plan), true);
  assert.equal(compare(nextBundle(), plan).blocked, true);
});

test("adding a declared source must still pass the evidence audit", () => {
  const plan = { ...nextPlan(), pairs: [parityPair({ expectedSourceIds: ["osm-one", "other-source"] })] };
  const result = compare(nextBundle(), plan);
  assert.ok(result.changes.some((change) => change.kind === "PAIR_SOURCE_ADDED" && change.level === "notice"));
  assert.equal(result.afterResult.blocked, true);
});

test("removing a shared asset requirement blocks even if the asset still exists", () => {
  const plan = { ...nextPlan(), pairs: [parityPair({ sharedAssetPaths: [] })] };
  assert.equal(has("PAIR_SHARED_ASSET_REMOVED", nextBundle(), plan), true);
});

test("adding a shared asset requirement is a notice pending audit", () => {
  const plan = { ...nextPlan(), pairs: [parityPair({ sharedAssetPaths: ["assets/map.js", "assets/extra.js"] })] };
  const result = compare(nextBundle(), plan);
  assert.ok(result.changes.some((change) => change.kind === "PAIR_SHARED_ASSET_ADDED" && change.level === "notice"));
  assert.equal(result.afterResult.blocked, true);
});

test("adding an independent pair yields an explicit addition", () => {
  const second = parityPair({ id: "second-pair", enRouteId: "second-en", frRouteId: "second-fr" });
  const plan = { ...nextPlan(), pairs: [parityPair(), second] };
  assert.equal(has("PAIR_ADDED", nextBundle(), plan), true);
});

test("removing an existing language route is a blocker", () => {
  const bundle = setRoutes(nextBundle(), [parityRoute("en")]);
  assert.equal(has("ROUTE_LOST", bundle), true);
  assert.equal(compare(bundle).blocked, true);
});

test("adding a new route produces a traceable addition", () => {
  const bundle = setRoutes(nextBundle(), [...nextBundle().routes, parityRoute("en", { id: "additional", path: "additional.html" })]);
  assert.equal(has("ROUTE_ADDED", bundle), true);
});

test("changing locale of an existing route blocks", () => {
  const bundle = setRoutes(nextBundle(), [parityRoute("en", { locale: "fr" }), parityRoute("fr")]);
  assert.equal(has("LOCALE_CHANGED", bundle), true);
});

test("losing explicit offline support blocks", () => {
  for (const offline of ["UNKNOWN", "NO"] as const) {
    const bundle = setRoutes(nextBundle(), [parityRoute("en"), parityRoute("fr", { offline })]);
    assert.equal(has("OFFLINE_LOST", bundle), true);
  }
});

test("gaining offline support is recorded as improvement", () => {
  const before = setRoutes(parityBundle(), [parityRoute("en", { offline: "UNKNOWN" }), parityRoute("fr", { offline: "UNKNOWN" })]);
  const result = compareBilingualReleases(before, parityPlan(), nextBundle(), nextPlan());
  assert.equal(result.changes.some((change) => change.kind === "OFFLINE_GAINED" && change.level === "notice"), true);
});

test("dropping any existing route source credit blocks", () => {
  const bundle = setRoutes(nextBundle(), [parityRoute("en"), parityRoute("fr", { sourceIds: [] })]);
  assert.equal(has("SOURCE_CREDIT_LOST", bundle), true);
});

test("adding a route source credit is audited rather than treated as proof", () => {
  const bundle = setRoutes(nextBundle(), [parityRoute("en"), parityRoute("fr", { sourceIds: ["osm-one", "other-source"] })]);
  const result = compare(bundle);
  assert.equal(result.changes.some((change) => change.kind === "SOURCE_CREDIT_ADDED" && change.level === "notice"), true);
  assert.equal(result.afterResult.blocked, true);
});

test("removing a previously shipped asset blocks", () => {
  const bundle = setAssets(nextBundle(), nextBundle().assets.filter((asset) => asset.path !== "assets/map.js"));
  assert.equal(has("ASSET_LOST", bundle), true);
});

test("a newly added asset is informational until its completeness is audited", () => {
  const bundle = setAssets(nextBundle(), [...nextBundle().assets, parityAsset("assets/new.js")]);
  assert.equal(has("ASSET_GAINED", bundle), true);
});

test("same-size digest changes are visible in comparison", () => {
  const bundle = setAssets(nextBundle(), nextBundle().assets.map((asset) => asset.path === "assets/map.js" ? { ...asset, sha256: "a".repeat(64) } : asset));
  const result = compare(bundle);
  assert.equal(result.changes.some((change) => change.kind === "ASSET_DIGEST_CHANGED" && change.level === "notice"), true);
});

test("changed byte sizes are visible separately from digest changes", () => {
  const bundle = setAssets(nextBundle(), nextBundle().assets.map((asset) => asset.path === "assets/map.js" ? { ...asset, bytes: 99 } : asset));
  assert.equal(has("ASSET_SIZE_CHANGED", bundle), true);
});

test("included asset becoming held blocks publication", () => {
  const bundle = setAssets(nextBundle(), nextBundle().assets.map((asset) => asset.path === "assets/map.js" ? { ...asset, disposition: "held" } : asset));
  assert.equal(has("ASSET_DISPOSITION_CHANGED", bundle), true);
  assert.equal(compare(bundle).blocked, true);
});

test("losing a source evidence record blocks", () => {
  const bundle = { ...nextBundle(), release: { ...nextBundle().release, sources: [] } };
  assert.equal(has("SOURCE_REMOVED", bundle), true);
});

test("adding a source record produces a separate change", () => {
  const bundle = { ...nextBundle(), release: { ...nextBundle().release, sources: [...nextBundle().release.sources, paritySource({ id: "new-source" })] } };
  assert.equal(has("SOURCE_ADDED", bundle), true);
});

test("changing provider family blocks without relying on string heuristics", () => {
  const bundle = setSource(nextBundle(), paritySource({ family: "other" }));
  assert.equal(has("SOURCE_FAMILY_CHANGED", bundle), true);
});

test("changed licence evidence blocks even when URL stays the same", () => {
  const bundle = setSource(nextBundle(), paritySource({ licenceEvidence: "UNKNOWN" }));
  assert.equal(has("SOURCE_LICENCE_CHANGED", bundle), true);
});

test("changed licence URL blocks even when the name stays the same", () => {
  const bundle = setSource(nextBundle(), paritySource({ licenceUrl: "https://example.org/licence" }));
  assert.equal(has("SOURCE_LICENCE_CHANGED", bundle), true);
});

test("lost redistribution permission blocks", () => {
  for (const redistributionPermission of ["UNKNOWN", "NO"] as const) {
    const bundle = setSource(nextBundle(), paritySource({ redistributionPermission }));
    const result = compare(bundle);
    assert.equal(result.changes.some((change) => change.kind === "SOURCE_PERMISSION_CHANGED" && change.level === "block"), true);
  }
});

test("improved redistribution permission is not a regression", () => {
  const before = setSource(parityBundle(), paritySource({ redistributionPermission: "UNKNOWN" }));
  const result = compareBilingualReleases(before, parityPlan(), nextBundle(), nextPlan());
  assert.equal(result.changes.some((change) => change.kind === "SOURCE_PERMISSION_CHANGED" && change.level === "notice"), true);
});

test("changing a source origin blocks independently of licence", () => {
  const bundle = setSource(nextBundle(), paritySource({ sourceUrl: "https://example.org/extract" }));
  assert.equal(has("SOURCE_ORIGIN_CHANGED", bundle), true);
});

test("removing a source notice blocks even if a URL survives", () => {
  const bundle = setSource(nextBundle(), paritySource({ attribution: "" }));
  assert.equal(has("SOURCE_NOTICE_CHANGED", bundle), true);
});

test("unknown dates remain explicitly recorded as date changes", () => {
  const bundle = setSource(nextBundle(), paritySource({ acquisitionDate: "UNKNOWN" }));
  assert.equal(has("SOURCE_DATE_CHANGED", bundle), true);
});

test("removing a surface blocks", () => {
  const bundle = setSurfaces(nextBundle(), [paritySurface("en")]);
  assert.equal(has("SURFACE_LOST", bundle), true);
});

test("adding a new surface produces a change without guessing parity", () => {
  const bundle = setSurfaces(nextBundle(), [...nextBundle().release.surfaces, paritySurface("en", { id: "another" })]);
  assert.equal(has("SURFACE_ADDED", bundle), true);
});

test("target reductions are blocking even when still above 44px", () => {
  const old = setSurfaces(parityBundle(), [paritySurface("en", { minimumTargetPx: 60 }), paritySurface("fr", { minimumTargetPx: 60 })]);
  const newer = setSurfaces(nextBundle(), [paritySurface("en", { minimumTargetPx: 48 }), paritySurface("fr", { minimumTargetPx: 48 })]);
  const result = compareBilingualReleases(old, parityPlan(), newer, nextPlan());
  assert.equal(result.changes.some((change) => change.kind === "TARGET_REDUCED" && change.level === "block"), true);
});

test("target increase is a notice", () => {
  const newer = setSurfaces(nextBundle(), [paritySurface("en"), paritySurface("fr", { minimumTargetPx: 48 })]);
  assert.equal(has("TARGET_INCREASED", newer), true);
});

test("loss of keyboard evidence is a blocker", () => {
  const newer = setSurfaces(nextBundle(), [paritySurface("en"), paritySurface("fr", { keyboardAccessible: "UNKNOWN" })]);
  assert.equal(has("KEYBOARD_LOST", newer), true);
});

test("loss of screen reader evidence is a blocker", () => {
  const newer = setSurfaces(nextBundle(), [paritySurface("en"), paritySurface("fr", { screenReaderLabelled: "NO" })]);
  assert.equal(has("SCREEN_READER_LOST", newer), true);
});

test("loss of near-map attribution is a blocker", () => {
  const newer = setSurfaces(nextBundle(), [paritySurface("en"), paritySurface("fr", { creditedNearMap: "UNKNOWN" })]);
  assert.equal(has("MAP_CREDIT_LOST", newer), true);
});

test("new parity blockers are included in the change report", () => {
  const bundle = setSource(nextBundle(), paritySource({ attribution: "" }));
  const result = compare(bundle);
  assert.equal(result.changes.some((change) => change.kind === "NEW_BLOCKING_FINDING" && change.level === "block"), true);
});

test("resolved parity blockers appear as notices", () => {
  const before = setSource(parityBundle(), paritySource({ attribution: "" }));
  const result = compareBilingualReleases(before, parityPlan(), nextBundle(), nextPlan());
  assert.equal(result.changes.some((change) => change.kind === "RESOLVED_BLOCKING_FINDING" && change.level === "notice"), true);
});

test("all change entries identify entity and before/after values", () => {
  const bundle = setSource(nextBundle(), paritySource({ attribution: "" }));
  const result = compare(bundle);
  for (const change of result.changes) {
    assert.ok(change.entity.length > 0);
    assert.ok(change.kind.length > 0);
    assert.ok(change.before.length > 0);
    assert.equal(typeof change.after, "string");
    assert.ok(change.level === "notice" || change.level === "block");
  }
});

test("repeating the comparison produces exactly the same findings", () => {
  const bundle = setSource(nextBundle(), paritySource({ attribution: "" }));
  assert.deepEqual(compare(bundle), compare(bundle));
});
