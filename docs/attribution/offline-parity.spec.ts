import test from "node:test";
import assert from "node:assert/strict";
import {
  auditBilingualParity, parseParityPlan, parseParityPlanJson, ParityInputError,
  type ParityCode,
} from "./offline-parity.js";
import { parseOfflineBundle } from "./offline-bundle.js";
import { METROLINX_AUA_SECTION_3_LEGEND, METROLINX_AUA_END_USER_LAWS_EN,
  METROLINX_AUA_END_USER_LAWS_FR, METROLINX_OGL_LINE } from "./index.js";
import {
  parityAsset, parityBundle, parityPair, parityPlan, parityRoute, paritySource,
  paritySurface, setAssets, setRoutes, setSource, setSurfaces,
} from "./offline-parity-fixtures.js";

const problems = (code: ParityCode, bundle = parityBundle(), plan = parityPlan()): boolean =>
  auditBilingualParity(bundle, plan).findings.some((finding) => finding.code === code);
const mutate = (change: (plan: Record<string, unknown>) => void): unknown => {
  const plan = structuredClone(parityPlan()) as unknown as Record<string, unknown>;
  change(plan);
  return plan;
};

test("baseline bilingual publication has distinct routes, source proof, and shared assets", () => {
  const result = auditBilingualParity(parityBundle(), parityPlan());
  assert.equal(result.schema, "attribution-bilingual-parity-report/1");
  assert.equal(result.releaseId, "release-one");
  assert.equal(result.blocked, false, JSON.stringify(result.findings));
  assert.equal(result.blockingCount, 0);
  assert.equal(result.pairedRoutes, 2);
  assert.deepEqual(result.unpairedRoutes, []);
  assert.equal(result.summaries.length, 1);
  assert.equal(result.summaries[0]?.ready, true);
  assert.deepEqual(result.summaries[0]?.sharedAssetPaths, ["assets/map.js"]);
  assert.deepEqual(result.summaries[0]?.enAssetPaths, ["assets/map.js", "map-en.html"]);
  assert.deepEqual(result.summaries[0]?.frAssetPaths, ["assets/map.js", "map-fr.html"]);
});

test("input parser copies normalized arrays without changing the original", () => {
  const original = parityPlan();
  const parsed = parseParityPlan(original);
  assert.notEqual(parsed, original);
  assert.notEqual(parsed.pairs, original.pairs);
  assert.deepEqual(parsed, original);
  assert.equal(parsed.pairs[0]?.id, "map-pair");
});

test("strict JSON parsing and preservation of explicit requireOffline=false", () => {
  const plan = parityPlan({ pairs: [parityPair({ requireOffline: false })] });
  assert.deepEqual(parseParityPlanJson(JSON.stringify(plan)), plan);
  assert.equal(parseParityPlanJson(JSON.stringify(plan)).pairs[0]?.requireOffline, false);
});

test("invalid JSON fails with a scoped exception", () => {
  assert.throws(() => parseParityPlanJson("!bad!"), ParityInputError);
  assert.throws(() => parseParityPlanJson("!bad!"), /plan/);
});

test("oversized JSON is rejected before parsing", () => {
  assert.throws(() => parseParityPlanJson(" ".repeat(1_048_577)), /too large/);
});

test("wrong types and non-object plan values are rejected", () => {
  for (const item of [null, false, 1, "", "bad", [], [parityPlan()]]) {
    assert.throws(() => parseParityPlan(item), ParityInputError);
  }
});

test("the schema is exact and cannot silently migrate", () => {
  for (const schema of ["", "attribution-bilingual-parity/0", "attribution-bilingual-parity/2", null]) {
    assert.throws(() => parseParityPlan(mutate((plan) => { plan.schema = schema; })), /schema/);
  }
});

test("unknown root keys are rejected without silent repair", () => {
  assert.throws(() => parseParityPlan(mutate((plan) => { plan.extra = "unexpected"; })), /extra/);
});

test("missing root keys are rejected independently", () => {
  for (const key of ["schema", "releaseId", "minimumTargetPx", "pairs"]) {
    assert.throws(() => parseParityPlan(mutate((plan) => { delete plan[key]; })), new RegExp(key));
  }
});

test("minimum target must be at least 44 px and safely representable", () => {
  for (const size of ["UNKNOWN", 0, -1, 43, 43.9, 44.5, 513, Number.NaN, Number.POSITIVE_INFINITY, "44", null]) {
    assert.throws(() => parseParityPlan(mutate((plan) => { plan.minimumTargetPx = size; })), /minimumTargetPx/);
  }
  for (const size of [44, 48, 64, 128, 512]) {
    assert.equal(parseParityPlan(mutate((plan) => { plan.minimumTargetPx = size; })).minimumTargetPx, size);
  }
});

test("identifiers must be short, lower-case, and nonempty", () => {
  const badIds = ["", "UPPER", " under", "has space", "has_underscore", "dot.name", "a--b", "a-", "-a", "x".repeat(73), "☃", "42"];
  for (const id of badIds) {
    assert.throws(() => parseParityPlan(mutate((plan) => { plan.releaseId = id; })), /releaseId/, id);
    assert.throws(() => parseParityPlan(mutate((plan) => { (plan.pairs as Record<string, unknown>[])[0]!.id = id; })), /\.id/, id);
  }
});

test("a registered pair must use two distinct routes", () => {
  assert.throws(() => parseParityPlan(parityPlan({ pairs: [parityPair({ frRouteId: "map-en" })] })), /distinct routes/);
});

test("a register cannot reuse either language route", () => {
  const first = parityPair();
  for (const duplicate of [
    parityPair({ id: "second", enRouteId: "map-en", frRouteId: "other-fr" }),
    parityPair({ id: "second", enRouteId: "other-en", frRouteId: "map-fr" }),
    parityPair({ id: "second", enRouteId: "map-fr", frRouteId: "map-en" }),
  ]) {
    assert.throws(() => parseParityPlan(parityPlan({ pairs: [first, duplicate] })), /Route assigned/);
  }
});

test("pair IDs are unique regardless of routes", () => {
  assert.throws(() => parseParityPlan(parityPlan({ pairs: [parityPair(), parityPair({
    enRouteId: "other-en", frRouteId: "other-fr",
  })] })), /Duplicate pair/);
});

test("pair-level strict keys fail for unknown and missing fields", () => {
  for (const key of ["id", "enRouteId", "frRouteId", "expectedSourceIds", "sharedAssetPaths", "requireOffline"]) {
    assert.throws(() => parseParityPlan(mutate((plan) => { delete (plan.pairs as Record<string, unknown>[])[0]![key]; })), new RegExp(key));
  }
  assert.throws(() => parseParityPlan(mutate((plan) => { (plan.pairs as Record<string, unknown>[])[0]!.extra = 1; })), /extra/);
});

test("pair lists are bounded and type-safe", () => {
  for (const value of [null, {}, 1, "list"]) {
    assert.throws(() => parseParityPlan(mutate((plan) => { plan.pairs = value; })), /pairs/);
  }
  assert.throws(() => parseParityPlan(parityPlan({ pairs: Array.from({ length: 1001 }, (_, index) =>
    parityPair({ id: `pair-${index}`, enRouteId: `route-en-${index}`, frRouteId: `route-fr-${index}` })) })), /pairs/);
});

test("expected source identifiers cannot repeat", () => {
  assert.throws(() => parseParityPlan(parityPlan({ pairs: [parityPair({ expectedSourceIds: ["osm-one", "osm-one"] })] })), /Duplicate value/);
});

test("declared shared asset paths cannot repeat", () => {
  assert.throws(() => parseParityPlan(parityPlan({ pairs: [parityPair({ sharedAssetPaths: ["assets/map.js", "assets/map.js"] })] })), /Duplicate value/);
});

test("relative paths reject traversal, absolute paths, URLs, hidden paths and unsafe characters", () => {
  const rejected = ["../escape", "a/../b", "./a", ".hidden", "a/.cache", "/root", "a//b", "a/", "\\windows", "C:\\foo", "https://example.org/a", "a?x=1", "a#fragment", "a b", "a/<script>", "a/é", "a/🔒"];
  for (const value of rejected) {
    assert.throws(() => parseParityPlan(parityPlan({ pairs: [parityPair({ sharedAssetPaths: [value] })] })), ParityInputError, value);
  }
});

test("shared asset and source lists reject non-string elements", () => {
  for (const item of [null, 1, {}, [], false]) {
    assert.throws(() => parseParityPlan(mutate((plan) => { (plan.pairs as Record<string, unknown>[])[0]!.expectedSourceIds = [item]; })), ParityInputError);
    assert.throws(() => parseParityPlan(mutate((plan) => { (plan.pairs as Record<string, unknown>[])[0]!.sharedAssetPaths = [item]; })), ParityInputError);
  }
});

test("empty pair registers block rather than imply complete bilingual coverage", () => {
  const result = auditBilingualParity(parityBundle(), parityPlan({ pairs: [] }));
  assert.equal(result.blocked, true);
  assert.equal(result.findings.some((finding) => finding.code === "EMPTY_PAIR_REGISTER"), true);
  assert.deepEqual(result.unpairedRoutes, ["map-en", "map-fr"]);
});

test("release mismatch is invalid input, not a finding", () => {
  assert.throws(() => auditBilingualParity(parityBundle(), parityPlan({ releaseId: "different" })), ParityInputError);
});

test("the missing English route blocks", () => {
  const bundle = setRoutes(parityBundle(), [parityRoute("fr")]);
  assert.equal(problems("ROUTE_NOT_FOUND", bundle), true);
  assert.equal(auditBilingualParity(bundle, parityPlan()).summaries[0]?.ready, false);
});

test("the missing French route blocks", () => {
  const bundle = setRoutes(parityBundle(), [parityRoute("en")]);
  assert.equal(problems("ROUTE_NOT_FOUND", bundle), true);
});

test("swapped route locales are caught", () => {
  const bundle = setRoutes(parityBundle(), [parityRoute("en", { locale: "fr" }), parityRoute("fr", { locale: "en" })]);
  assert.equal(problems("WRONG_LOCALE", bundle), true);
});

test("missing surface links are blocked", () => {
  const bundle = setRoutes(parityBundle(), [parityRoute("en", { surfaceId: "absent" }), parityRoute("fr")]);
  assert.equal(problems("SURFACE_MISSING", bundle), true);
});

test("route locale and attached surface locale cannot disagree", () => {
  const bundle = setSurfaces(parityBundle(), [paritySurface("en", { locale: "fr" }), paritySurface("fr")]);
  assert.equal(problems("SURFACE_LOCALE_MISMATCH", bundle), true);
});

test("one map and one list surface cannot silently form a pair", () => {
  const bundle = setSurfaces(parityBundle(), [paritySurface("en"), paritySurface("fr", { mode: "list" })]);
  assert.equal(problems("SURFACE_MODE_MISMATCH", bundle), true);
});

test("a French route cannot be declared offline when its surface denies it", () => {
  const bundle = setSurfaces(parityBundle(), [paritySurface("en"), paritySurface("fr", { offline: "NO" })]);
  assert.equal(problems("BASE_BUNDLE_BLOCKED", bundle), true);
});

test("a route claiming offline UNKNOWN blocks when required", () => {
  const bundle = setRoutes(parityBundle(), [parityRoute("en"), parityRoute("fr", { offline: "UNKNOWN" })]);
  assert.equal(problems("ROUTE_OFFLINE_UNKNOWN", bundle), true);
});

test("a route claiming offline NO blocks when required", () => {
  const bundle = setRoutes(parityBundle(), [parityRoute("en"), parityRoute("fr", { offline: "NO" })]);
  assert.equal(problems("ROUTE_OFFLINE_NO", bundle), true);
});

test("explicitly non-offline plans still enforce evidence-source consistency", () => {
  const bundle = setRoutes(parityBundle(), [parityRoute("en", { offline: "NO" }), parityRoute("fr", { offline: "NO" })]);
  const result = auditBilingualParity(bundle, parityPlan({ pairs: [parityPair({ requireOffline: false })] }));
  assert.equal(result.findings.some((finding) => finding.code === "ROUTE_OFFLINE_NO"), false);
  assert.equal(result.findings.some((finding) => finding.code === "BASE_BUNDLE_BLOCKED"), true);
});

test("English and French routes need the same source set", () => {
  const bundle = setRoutes(parityBundle(), [parityRoute("en"), parityRoute("fr", { sourceIds: [] })]);
  assert.equal(problems("SOURCE_SET_MISMATCH", bundle), true);
});

test("expected sources are required on both paths", () => {
  const bundle = setRoutes(parityBundle(), [parityRoute("en"), parityRoute("fr", { sourceIds: [] })]);
  assert.equal(problems("EXPECTED_SOURCE_MISSING", bundle), false); // shared dependency still carries the source
  const changed = setAssets(bundle, bundle.assets.map((asset) => asset.path === "assets/map.js" ? { ...asset, sourceIds: [] } : asset));
  assert.equal(problems("EXPECTED_SOURCE_MISSING", changed), true);
});

test("an undeclared expected source blocks, not silently excluded", () => {
  const result = auditBilingualParity(parityBundle(), parityPlan({ pairs: [parityPair({ expectedSourceIds: ["not-found"] })] }));
  assert.equal(result.blocked, true);
  assert.equal(result.findings.some((finding) => finding.code === "EXPECTED_SOURCE_MISSING"), true);
  assert.equal(result.findings.some((finding) => finding.code === "UNKNOWN_SOURCE"), true);
});

test("unknown source references remain UNKNOWN instead of inheriting a provider licence", () => {
  const bundle = setRoutes(parityBundle(), [parityRoute("en", { sourceIds: ["unknown"] }), parityRoute("fr", { sourceIds: ["unknown"] })]);
  assert.equal(problems("UNKNOWN_SOURCE", bundle), true);
});

test("held and excluded sources are not published", () => {
  for (const state of ["held", "excluded"] as const) {
    const bundle = setSource(parityBundle(), paritySource({ state }));
    assert.equal(problems("SOURCE_NOT_INCLUDED", bundle), true);
  }
});

test("YES licence permission is not inferred from OSM family", () => {
  for (const licenceEvidence of ["UNKNOWN", "NO"] as const) {
    const bundle = setSource(parityBundle(), paritySource({ licenceEvidence }));
    assert.equal(problems(licenceEvidence === "UNKNOWN" ? "SOURCE_LICENCE_UNKNOWN" : "SOURCE_LICENCE_NO", bundle), true);
  }
});

test("YES redistribution rights are not inferred from ODbL", () => {
  for (const redistributionPermission of ["UNKNOWN", "NO"] as const) {
    const bundle = setSource(parityBundle(), paritySource({ redistributionPermission }));
    assert.equal(problems(redistributionPermission === "UNKNOWN" ? "SOURCE_PERMISSION_UNKNOWN" : "SOURCE_PERMISSION_NO", bundle), true);
  }
});

test("missing source and licence URLs are separate blockers", () => {
  assert.equal(problems("SOURCE_URL_UNKNOWN", setSource(parityBundle(), paritySource({ sourceUrl: "UNKNOWN" }))), true);
  assert.equal(problems("SOURCE_TERMS_UNKNOWN", setSource(parityBundle(), paritySource({ licenceUrl: "UNKNOWN" }))), true);
});

test("UNKNOWN dataset date remains informational; acquisition and terms dates block", () => {
  const base = auditBilingualParity(parityBundle(), parityPlan());
  assert.equal(base.findings.some((f) => f.code === "DATASET_DATE_UNKNOWN" && f.level === "notice"), true);
  assert.equal(problems("ACQUISITION_DATE_UNKNOWN", setSource(parityBundle(), paritySource({ acquisitionDate: "UNKNOWN" }))), true);
  assert.equal(problems("TERMS_REVIEW_DATE_UNKNOWN", setSource(parityBundle(), paritySource({ termsReviewedDate: "UNKNOWN" }))), true);
});

test("lack of attribution is a blocker", () => {
  assert.equal(problems("SOURCE_NOTICE_MISSING", setSource(parityBundle(), paritySource({ attribution: "" }))), true);
});

test("map credit and the ODbL licence are independent notices", () => {
  assert.equal(problems("ODBL_NOTICE_MISSING", setSource(parityBundle(), paritySource({ attribution: "© OpenStreetMap contributors" }))), true);
  assert.equal(problems("OSM_NOTICE_MISSING", setSource(parityBundle(), paritySource({ attribution: "Open Database License (ODbL) 1.0" }))), true);
});

test("Metrolinx AUA needs its section-three legend and both applicable-laws lines", () => {
  const source = paritySource({ family: "metrolinx-aua", attribution: METROLINX_AUA_SECTION_3_LEGEND });
  const bundle = setSource(parityBundle(), source);
  assert.equal(problems("AUA_LAWS_MISSING", bundle), true);
  assert.equal(problems("AUA_LEGEND_MISSING", setSource(parityBundle(), { ...source,
    attribution: `${METROLINX_AUA_END_USER_LAWS_EN} ${METROLINX_AUA_END_USER_LAWS_FR}` })), true);
});

test("Metrolinx AUA complete legal text satisfies the parity notice check", () => {
  const source = paritySource({ family: "metrolinx-aua", attribution: `${METROLINX_AUA_SECTION_3_LEGEND} ${METROLINX_AUA_END_USER_LAWS_EN} ${METROLINX_AUA_END_USER_LAWS_FR}` });
  const result = auditBilingualParity(setSource(parityBundle(), source), parityPlan());
  assert.equal(result.findings.some((f) => f.code === "AUA_LAWS_MISSING" || f.code === "AUA_LEGEND_MISSING"), false);
});

test("Metrolinx OGL requires its distinct licence notice", () => {
  assert.equal(problems("OGL_NOTICE_MISSING", setSource(parityBundle(), paritySource({ family: "metrolinx-ogl", attribution: "Some text" }))), true);
});

test("AUA and OGL text cannot be silently crossed", () => {
  const aua = paritySource({ family: "metrolinx-aua", attribution: `${METROLINX_AUA_SECTION_3_LEGEND} ${METROLINX_AUA_END_USER_LAWS_EN} ${METROLINX_AUA_END_USER_LAWS_FR} ${METROLINX_OGL_LINE}` });
  const ogl = paritySource({ family: "metrolinx-ogl", attribution: `${METROLINX_OGL_LINE} ${METROLINX_AUA_SECTION_3_LEGEND}` });
  assert.equal(problems("NOTICE_CROSSED", setSource(parityBundle(), aua)), true);
  assert.equal(problems("NOTICE_CROSSED", setSource(parityBundle(), ogl)), true);
});

test("LTC attribution must identify the actual agency", () => {
  assert.equal(problems("LTC_NOTICE_MISSING", setSource(parityBundle(), paritySource({ family: "ltc", attribution: "Third-party transport data" }))), true);
  assert.equal(problems("LTC_NOTICE_MISSING", setSource(parityBundle(), paritySource({ family: "ltc", attribution: "London Transit Commission (LTC)" }))), false);
});

test("minimum controls reject 43px and unknown", () => {
  for (const minimumTargetPx of [43, "UNKNOWN"] as const) {
    const bundle = setSurfaces(parityBundle(), [paritySurface("en"), paritySurface("fr", { minimumTargetPx })]);
    assert.equal(problems(minimumTargetPx === "UNKNOWN" ? "TARGET_UNKNOWN" : "TARGET_TOO_SMALL", bundle), true);
  }
});

test("a stricter required 48px minimum rejects 44px recorded surfaces", () => {
  const result = auditBilingualParity(parityBundle(), parityPlan({ minimumTargetPx: 48 }));
  assert.equal(result.blocked, true);
  assert.equal(result.findings.some((f) => f.code === "TARGET_TOO_SMALL"), true);
});

test("different but sufficient target sizes produce notice, not blocker", () => {
  const bundle = setSurfaces(parityBundle(), [paritySurface("en", { minimumTargetPx: 44 }), paritySurface("fr", { minimumTargetPx: 48 })]);
  const result = auditBilingualParity(bundle, parityPlan());
  assert.equal(result.findings.some((f) => f.code === "TARGET_MISMATCH" && f.level === "notice"), true);
});

test("keyboard state must be explicitly YES for both languages", () => {
  for (const keyboardAccessible of ["UNKNOWN", "NO"] as const) {
    const bundle = setSurfaces(parityBundle(), [paritySurface("en"), paritySurface("fr", { keyboardAccessible })]);
    assert.equal(problems(keyboardAccessible === "UNKNOWN" ? "KEYBOARD_UNKNOWN" : "KEYBOARD_NO", bundle), true);
  }
});

test("screen reader state must be explicitly YES for both languages", () => {
  for (const screenReaderLabelled of ["UNKNOWN", "NO"] as const) {
    const bundle = setSurfaces(parityBundle(), [paritySurface("en"), paritySurface("fr", { screenReaderLabelled })]);
    assert.equal(problems(screenReaderLabelled === "UNKNOWN" ? "SCREEN_READER_UNKNOWN" : "SCREEN_READER_NO", bundle), true);
  }
});

test("near-map credit must be explicitly YES when map data is used", () => {
  for (const creditedNearMap of ["UNKNOWN", "NO"] as const) {
    const bundle = setSurfaces(parityBundle(), [paritySurface("en"), paritySurface("fr", { creditedNearMap })]);
    assert.equal(problems(creditedNearMap === "UNKNOWN" ? "MAP_CREDIT_UNKNOWN" : "MAP_CREDIT_NO", bundle), true);
  }
});

test("publication date UNKNOWN remains a visible notice", () => {
  const bundle = setSurfaces(parityBundle(), [paritySurface("en"), paritySurface("fr", { publicationDate: "UNKNOWN" })]);
  assert.equal(problems("PUBLICATION_DATE_UNKNOWN", bundle), true);
  assert.equal(auditBilingualParity(bundle, parityPlan()).findings.some((f) => f.code === "PUBLICATION_DATE_UNKNOWN" && f.level === "notice"), true);
});

test("language-specific publication dates may differ but must be recorded", () => {
  const bundle = setSurfaces(parityBundle(), [paritySurface("en"), paritySurface("fr", { publicationDate: "2026-01-06" })]);
  assert.equal(problems("DATE_MISMATCH", bundle), true);
});

test("shared assets must be reachable from both route entries", () => {
  const bundle = setAssets(parityBundle(), [
    parityAsset("map-en.html", { dependencies: ["assets/map.js"] }),
    parityAsset("map-fr.html"), parityAsset("assets/map.js", { sourceIds: ["osm-one"] }),
  ]);
  assert.equal(problems("SHARED_ASSET_MISSING", bundle), true);
});

test("missing assets are not invented from expected paths", () => {
  const bundle = setAssets(parityBundle(), [
    parityAsset("map-en.html", { dependencies: ["assets/map.js"] }),
    parityAsset("map-fr.html", { dependencies: ["assets/map.js"] }),
  ]);
  assert.equal(problems("ASSET_UNKNOWN", bundle), true);
});

test("included route files cannot depend on held assets", () => {
  const bundle = setAssets(parityBundle(), parityBundle().assets.map((asset) => asset.path === "assets/map.js" ? { ...asset, disposition: "held" } : asset));
  assert.equal(problems("ASSET_NOT_INCLUDED", bundle), true);
});

test("asset sizes must be recorded as integers", () => {
  const bundle = setAssets(parityBundle(), parityBundle().assets.map((asset) => asset.path === "assets/map.js" ? { ...asset, bytes: "UNKNOWN" } : asset));
  assert.equal(problems("ASSET_SIZE_UNKNOWN", bundle), true);
});

test("asset digests cannot remain UNKNOWN for publication", () => {
  const bundle = setAssets(parityBundle(), parityBundle().assets.map((asset) => asset.path === "assets/map.js" ? { ...asset, sha256: "UNKNOWN" } : asset));
  assert.equal(problems("ASSET_HASH_UNKNOWN", bundle), true);
});

test("extra unpaired routes are disclosed, not guessed into the pair", () => {
  const bundle = setRoutes(parityBundle(), [...parityBundle().routes, parityRoute("en", { id: "other", path: "other.html", entry: "map-en.html", surfaceId: "map-en" })]);
  const result = auditBilingualParity(bundle, parityPlan());
  assert.deepEqual(result.unpairedRoutes, ["other"]);
  assert.equal(result.findings.some((f) => f.code === "ORPHAN_ROUTE" && f.level === "notice"), true);
});

test("source selection does not introduce MiWay from an unrelated label", () => {
  const result = auditBilingualParity(parityBundle(), parityPlan());
  assert.deepEqual(result.summaries[0]?.expectedSourceIds, ["osm-one"]);
  assert.equal(result.summaries[0]?.sharedAssetPaths.includes("assets/map.js"), true);
});

test("the base offline bundle audit is enforced for both language routes", () => {
  const bundle = setAssets(parityBundle(), parityBundle().assets.map((asset) => asset.path === "map-fr.html" ? { ...asset, dependencies: ["missing.js"] } : asset));
  assert.equal(problems("BASE_BUNDLE_BLOCKED", bundle), true);
});

test("parity input can use the existing strict offline-bundle contract", () => {
  const bundle = parseOfflineBundle(parityBundle());
  const result = auditBilingualParity(bundle, parseParityPlan(parityPlan()));
  assert.equal(result.blocked, false, JSON.stringify(result.findings));
});
