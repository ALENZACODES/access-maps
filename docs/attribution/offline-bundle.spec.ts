import test from "node:test";
import assert from "node:assert/strict";
import { auditOfflineBundle, bundlePath, findCycles, parseOfflineBundle, parseOfflineBundleJson,
  traceAssets, BundleInputError } from "./offline-bundle.js";
import { fixtureAsset, fixtureBundle, fixtureRoute, withAssets, withRoutes, withRelease } from "./offline-fixtures.js";
import { sampleRelease, sampleSource, sampleSurface } from "./evidence-fixtures.js";
import type { OfflineBundle } from "./offline-bundle.js";

function codes(bundle: OfflineBundle): string[] {
  return auditOfflineBundle(bundle).problems.map((entry) => entry.code);
}
function failing(bundle: OfflineBundle, code: string): void {
  const report = auditOfflineBundle(bundle);
  assert.equal(report.blocked, true, `Expected block for ${code}`);
  assert.ok(report.problems.some((finding) => finding.code === code), JSON.stringify(report.problems));
}
function changedAsset(replacement: Parameters<typeof fixtureAsset>[0]): OfflineBundle {
  const bundle = fixtureBundle();
  return withAssets(bundle, [fixtureAsset(replacement), bundle.assets[1]!]);
}
function changedRoute(replacement: Parameters<typeof fixtureRoute>[0]): OfflineBundle {
  return withRoutes(fixtureBundle(), [fixtureRoute(replacement)]);
}

test("baseline fixture has complete connected asset closure", () => {
  const bundle = fixtureBundle();
  const report = auditOfflineBundle(bundle);
  assert.equal(report.blocked, false, JSON.stringify(report));
  assert.equal(report.assets, 2);
  assert.equal(report.routes, 1);
  assert.equal(report.totalBytes, 16);
  assert.deepEqual(report.reachable.home, ["assets/main.js", "index.html"]);
});

test("parsing leaves the caller object unchanged", () => {
  const bundle = fixtureBundle();
  const original = JSON.stringify(bundle);
  assert.deepEqual(parseOfflineBundle(bundle), bundle);
  assert.equal(JSON.stringify(bundle), original);
});

test("a JSON round trip preserves unknown metadata", () => {
  const bundle = fixtureBundle();
  const withUnknown = changedAsset({bytes:"UNKNOWN",sha256:"UNKNOWN"});
  const reparsed = parseOfflineBundleJson(JSON.stringify(withUnknown));
  assert.equal(reparsed.assets[0]?.bytes, "UNKNOWN");
  assert.equal(reparsed.assets[0]?.sha256, "UNKNOWN");
  assert.equal(bundle.assets[0]?.bytes, 12);
});

test("parsing rejects malformed JSON before creating a bundle", () => {
  assert.throws(() => parseOfflineBundleJson("{bad"), BundleInputError);
  assert.throws(() => parseOfflineBundleJson("null"), BundleInputError);
  assert.throws(() => parseOfflineBundleJson("[]"), BundleInputError);
  assert.throws(() => parseOfflineBundleJson(""), BundleInputError);
  assert.throws(() => parseOfflineBundleJson(" ".repeat(8 * 1024 * 1024 + 1)), BundleInputError);
});

test("empty routes are syntactically accepted but release remains blocked", () => {
  const bundle = withRoutes(fixtureBundle(), []);
  const result = auditOfflineBundle(bundle);
  assert.equal(result.blocked, true);
  assert.ok(codes(bundle).includes("SURFACE_WITHOUT_ROUTE"));
});

test("audit leaves original asset arrays unchanged", () => {
  const bundle = fixtureBundle();
  const before = JSON.stringify(bundle);
  auditOfflineBundle(bundle);
  assert.equal(JSON.stringify(bundle), before);
});

test("route closure is sorted for stable reports", () => {
  const bundle = fixtureBundle();
  assert.deepEqual(traceAssets(bundle, "index.html"), ["assets/main.js", "index.html"]);
  assert.deepEqual(traceAssets(bundle, "assets/main.js"), ["assets/main.js"]);
  assert.deepEqual(traceAssets(bundle, "not-in-bundle.html"), ["not-in-bundle.html"]);
});

test("parse detects unknown schema, missing fields and extra keys", () => {
  const initial = fixtureBundle();
  assert.throws(() => parseOfflineBundle({...initial,schema:"other"}), BundleInputError);
  assert.throws(() => parseOfflineBundle({release:initial.release,assets:initial.assets,routes:initial.routes}), BundleInputError);
  assert.throws(() => parseOfflineBundle({...initial,extra:1}), BundleInputError);
  assert.throws(() => parseOfflineBundle({...initial,release:null}), Error);
});

test("source licence record remains authoritative", () => {
  const bundle = fixtureBundle();
  const result = auditOfflineBundle(bundle);
  assert.equal(result.evidence.releaseId, bundle.release.releaseId);
  assert.equal(result.evidence.blocked, false);
  assert.equal(result.evidence.sourceCount, 1);
  assert.equal(result.evidence.surfaceCount, 1);
});

test("path parser accepts predictable nested local assets", () => {
  for (const path of ["index.html", "assets/main.2.js", "tiles/06/18_24.bin", "font/WorkSans-Regular.woff2",
    "public/notes@v2.json", "src/map_v3.css", "images/01.webp"]) {
    assert.equal(bundlePath(path), path);
  }
});

test("path parser blocks traversal, URL and platform-specific paths", () => {
  const invalid = ["../a", "a/../b", "a/./b", ".env", "a/.env", "a/..", "/etc/passwd", "a//b",
    "//server/file", "https://example.org/file", "file://local", "C:\\a", "a\\b", "a?x=1", "a#fragment",
    "~/.ssh/id_rsa", "", " a", "a ", "a/b/", "data:text/plain,hi", "./index.html", "a//", "a/%2e%2e/b"];
  for (const path of invalid) assert.throws(() => bundlePath(path), BundleInputError, path);
});

test("path parser rejects NUL, controls, Unicode mixed normalization", () => {
  for (const path of ["a\0b", "a\nb", "a\rb", "a\tb", "f/e\u0301.txt", "name/é.txt", "a/☃.svg"]) {
    assert.throws(() => bundlePath(path), BundleInputError);
  }
});

test("path parser rejects overly long paths", () => {
  assert.throws(() => bundlePath("a".repeat(321)), BundleInputError);
});

test("strict asset contract rejects omitted and added fields", () => {
  const bundle = fixtureBundle();
  const asset = bundle.assets[0]!;
  for (const field of ["path", "kind", "bytes", "sha256", "dependencies", "sourceIds", "disposition"]) {
    const copy: Record<string,unknown> = {...asset};
    delete copy[field];
    assert.throws(() => parseOfflineBundle({...bundle,assets:[copy]}), BundleInputError, field);
  }
  assert.throws(() => parseOfflineBundle({...bundle,assets:[{...asset, unexpected: true}]}), BundleInputError);
});

test("strict route contract rejects omitted and added fields", () => {
  const bundle = fixtureBundle();
  const route = bundle.routes[0]!;
  for (const field of ["id", "path", "locale", "entry", "sourceIds", "offline", "surfaceId"]) {
    const copy: Record<string,unknown> = {...route};
    delete copy[field];
    assert.throws(() => parseOfflineBundle({...bundle,routes:[copy]}), BundleInputError, field);
  }
  assert.throws(() => parseOfflineBundle({...bundle,routes:[{...route, unknown:2}]}), BundleInputError);
});

test("asset sizes must be safe integers or explicitly unknown", () => {
  for (const bytes of [-1, -0.5, 0.2, NaN, Infinity, Number.MAX_SAFE_INTEGER+1, "20", null, undefined]) {
    assert.throws(() => parseOfflineBundle(changedAsset({bytes} as never)), BundleInputError, String(bytes));
  }
  assert.equal(parseOfflineBundle(changedAsset({bytes:0})).assets[0]?.bytes, 0);
  assert.equal(parseOfflineBundle(changedAsset({bytes:"UNKNOWN"})).assets[0]?.bytes, "UNKNOWN");
});

test("asset hashes must be complete lowercase SHA256 or unknown", () => {
  for (const hash of ["abcd", "a".repeat(63), "A".repeat(64), "z".repeat(64), null, 8, ""]) {
    assert.throws(() => parseOfflineBundle(changedAsset({sha256:hash} as never)), BundleInputError);
  }
  assert.equal(parseOfflineBundle(changedAsset({sha256:"UNKNOWN"})).assets[0]?.sha256,"UNKNOWN");
  assert.equal(parseOfflineBundle(changedAsset({sha256:"a".repeat(64)})).assets[0]?.sha256,"a".repeat(64));
});

test("asset types and dispositions are strict", () => {
  for (const kind of ["html5", "script", "tile", "", null]) {
    assert.throws(() => parseOfflineBundle(changedAsset({kind} as never)), BundleInputError);
  }
  for (const disposition of ["live", "downloaded", "UNKNOWN", "", null]) {
    assert.throws(() => parseOfflineBundle(changedAsset({disposition} as never)), BundleInputError);
  }
  for (const disposition of ["included", "held", "excluded"] as const) {
    assert.equal(parseOfflineBundle(changedAsset({disposition})).assets[0]?.disposition,disposition);
  }
});

test("duplicate asset paths and route identities are rejected", () => {
  const bundle = fixtureBundle();
  assert.throws(() => parseOfflineBundle(withAssets(bundle,[...bundle.assets,bundle.assets[0]!])), BundleInputError);
  assert.throws(() => parseOfflineBundle(withRoutes(bundle,[...bundle.routes,bundle.routes[0]!])), BundleInputError);
  assert.throws(() => parseOfflineBundle(withRoutes(bundle,[fixtureRoute(),fixtureRoute({id:"another"})])),BundleInputError);
});

test("invalid identifiers are rejected", () => {
  for (const id of ["1bad", "Bad", "bad_name", "bad--name", "bad-", "", "x".repeat(73)]) {
    assert.throws(() => parseOfflineBundle(changedRoute({id})), BundleInputError);
    assert.throws(() => parseOfflineBundle(changedRoute({surfaceId:id})), BundleInputError);
  }
});

test("duplicate dependencies and source associations are rejected", () => {
  assert.throws(() => parseOfflineBundle(changedAsset({dependencies:["a", "a"]})), BundleInputError);
  assert.throws(() => parseOfflineBundle(changedAsset({sourceIds:["osm-one", "osm-one"]})), BundleInputError);
  assert.throws(() => parseOfflineBundle(changedRoute({sourceIds:["osm-one", "osm-one"]})), BundleInputError);
});

test("nested arrays require arrays rather than strings or objects", () => {
  assert.throws(() => parseOfflineBundle(changedAsset({dependencies:"assets/main.js"} as never)), BundleInputError);
  assert.throws(() => parseOfflineBundle(changedAsset({sourceIds:null} as never)), BundleInputError);
  assert.throws(() => parseOfflineBundle(changedRoute({sourceIds:{}} as never)), BundleInputError);
});

test("unknown asset byte count and digest block an included file", () => {
  failing(changedAsset({bytes:"UNKNOWN"}), "ASSET_SIZE_UNKNOWN");
  failing(changedAsset({sha256:"UNKNOWN"}), "ASSET_DIGEST_UNKNOWN");
});

test("held or excluded files with unknown byte counts do not trigger size blocker", () => {
  for (const disposition of ["held", "excluded"] as const) {
    const bundle = changedAsset({disposition,bytes:"UNKNOWN",sha256:"UNKNOWN"});
    assert.equal(codes(bundle).includes("ASSET_SIZE_UNKNOWN"),false);
    assert.equal(codes(bundle).includes("ASSET_DIGEST_UNKNOWN"),false);
  }
});

test("missing dependencies and excluded dependencies block", () => {
  failing(changedAsset({dependencies:["assets/absent.js"]}), "DEPENDENCY_MISSING");
  const bundle = fixtureBundle();
  failing(withAssets(bundle,[bundle.assets[0]!,fixtureAsset({...bundle.assets[1]!,disposition:"excluded"})]), "DEPENDENCY_NOT_INCLUDED");
});

test("missing asset sources and held asset sources block", () => {
  failing(changedAsset({sourceIds:["no-such-source"]}), "ASSET_SOURCE_MISSING");
  const bundle = fixtureBundle();
  failing(withRelease(bundle,sampleRelease([sampleSource({state:"held"})],[sampleSurface()])), "ASSET_SOURCE_NOT_INCLUDED");
});

test("route must point to an existing matching surface", () => {
  failing(changedRoute({surfaceId:"unknown-surface"}), "ROUTE_SURFACE_MISSING");
  failing(changedRoute({locale:"fr"}), "ROUTE_LANGUAGE_MISMATCH");
  failing(changedRoute({offline:"NO"}), "ROUTE_OFFLINE_MISMATCH");
  failing(changedRoute({sourceIds:[]}), "ROUTE_SOURCES_MISMATCH");
});

test("offline-required policy distinguishes UNKNOWN from YES", () => {
  for (const offline of ["UNKNOWN", "NO"] as const) {
    failing(changedRoute({offline}), "ROUTE_NOT_OFFLINE");
  }
  const bundle = changedRoute({offline:"UNKNOWN"});
  assert.equal(codes(bundle).includes("ROUTE_NOT_OFFLINE"),true);
  const report = auditOfflineBundle(bundle,false);
  assert.equal(report.problems.some((problem) => problem.code === "ROUTE_NOT_OFFLINE"),false);
});

test("entry must exist and be included HTML", () => {
  failing(changedRoute({entry:"not-here.html"}), "ENTRY_MISSING");
  const bundle = fixtureBundle();
  failing(withAssets(bundle,[fixtureAsset({kind:"json"}),bundle.assets[1]!]), "ENTRY_NOT_HTML");
  failing(withAssets(bundle,[fixtureAsset({disposition:"held"}),bundle.assets[1]!]), "ENTRY_NOT_INCLUDED");
});

test("source IDs on reachable assets must be on their route", () => {
  const bundle = fixtureBundle();
  const other = sampleSource({id:"osm-two"});
  const release = sampleRelease([bundle.release.sources[0]!,other],[sampleSurface()]);
  const assets = [fixtureAsset({sourceIds:["osm-two"]}),bundle.assets[1]!];
  failing(withRelease(withAssets(bundle,assets),release), "ROUTE_SOURCE_UNDECLARED");
});

test("route sources need an actual reachable asset reference", () => {
  const bundle = fixtureBundle();
  const assets = [fixtureAsset({sourceIds:[]}),bundle.assets[1]!];
  failing(withAssets(bundle,assets),"ROUTE_SOURCE_UNLINKED");
});

test("source declarations cannot name a missing source", () => {
  failing(changedRoute({sourceIds:["missing"]}), "ROUTE_SOURCE_MISSING");
});

test("every published surface needs a corresponding route", () => {
  const bundle = fixtureBundle();
  const extraSurface = sampleSurface({id:"second-page"});
  failing(withRelease(bundle,sampleRelease(bundle.release.sources,[...bundle.release.surfaces,extraSurface])),"SURFACE_WITHOUT_ROUTE");
});

test("unused included assets are notices, not by themselves blockers", () => {
  const bundle = fixtureBundle();
  const extra = fixtureAsset({path:"assets/extra.json",kind:"json",dependencies:[],sourceIds:[]});
  const result = auditOfflineBundle(withAssets(bundle,[...bundle.assets,extra]));
  assert.equal(result.blocked,false);
  assert.equal(result.problems.some((entry) => entry.code === "UNUSED_INCLUDED_ASSET"),true);
});

test("cycle search identifies self-edge", () => {
  const cyclic = [fixtureAsset({path:"self.js",kind:"js",dependencies:["self.js"]})];
  assert.deepEqual(findCycles(cyclic),[["self.js"]]);
});

test("cycle search identifies strongly connected dependency components", () => {
  const assets = [
    fixtureAsset({path:"a.js",dependencies:["b.js"]}),
    fixtureAsset({path:"b.js",dependencies:["c.js"]}),
    fixtureAsset({path:"c.js",dependencies:["a.js"]}),
    fixtureAsset({path:"d.js",dependencies:[]}),
  ];
  assert.deepEqual(findCycles(assets),[["a.js","b.js","c.js"]]);
});

test("acyclic graph returns zero dependency cycles", () => {
  const assets = [
    fixtureAsset({path:"a.js",dependencies:["b.js"]}),
    fixtureAsset({path:"b.js",dependencies:[]}),
  ];
  assert.deepEqual(findCycles(assets),[]);
});

test("dependency cycle causes a blocking finding", () => {
  const bundle = fixtureBundle();
  const assets = [fixtureAsset({dependencies:["assets/main.js"]}),
    fixtureAsset({path:"assets/main.js",kind:"js",dependencies:["index.html"],sourceIds:[]})];
  failing(withAssets(bundle,assets),"DEPENDENCY_CYCLE");
});

test("date evidence remains UNKNOWN and is not inferred from filenames", () => {
  const bundle = fixtureBundle();
  const parsed = parseOfflineBundle(bundle);
  assert.equal(parsed.release.sources[0]?.datasetDate,"UNKNOWN");
  assert.equal(parsed.release.sources[0]?.acquisitionDate,"2026-01-04");
});

test("Metrolinx AUA and OGL source families are not inferred from filenames", () => {
  const bundle = fixtureBundle();
  const asset = fixtureAsset({path:"assets/metrolinx-ogl.html"});
  const withName = withAssets(bundle,[asset,bundle.assets[1]!]);
  assert.equal(parseOfflineBundle(withName).release.sources[0]?.family,"osm");
});

test("asset inventory is not treated as permission evidence", () => {
  const bundle = fixtureBundle();
  const source = sampleSource({redistributionPermission:"UNKNOWN"});
  const report = auditOfflineBundle(withRelease(bundle,sampleRelease([source],[sampleSurface()])));
  assert.equal(report.blocked,true);
  assert.equal(report.evidence.blocked,true);
});

test("more than one route may share the same immutable assets", () => {
  const bundle = fixtureBundle();
  const second = fixtureRoute({id:"details",path:"details.html",entry:"details.html",surfaceId:"public-list"});
  const release = sampleRelease(bundle.release.sources,[sampleSurface(),sampleSurface({id:"public-list"})]);
  const assets = [...bundle.assets,fixtureAsset({path:"details.html",dependencies:["assets/main.js"]})];
  const report = auditOfflineBundle(withRelease(withAssets(withRoutes(bundle,[...bundle.routes,second]),assets),release));
  assert.equal(report.blocked,false,JSON.stringify(report.problems));
  assert.equal(report.reachable.details?.includes("assets/main.js"),true);
});

test("route path and entry path may differ without a false source claim", () => {
  const bundle = changedRoute({path:"fr/index.html"});
  const audit = auditOfflineBundle(bundle);
  assert.equal(audit.blocked,false,JSON.stringify(audit.problems));
});

test("no file size budget is invented by the bundle contract", () => {
  const report = auditOfflineBundle(changedAsset({bytes:500_000_000}));
  assert.equal(report.totalBytes,500_000_004);
  assert.equal(report.problems.some((item) => item.code.includes("BUDGET")),false);
});

test("error messages are bound to exact invalid field paths", () => {
  try { parseOfflineBundle(changedAsset({sha256:"bad"})); assert.fail("Expected input failure"); }
  catch (error) {
    assert.ok(error instanceof BundleInputError);
    assert.equal(error.at,"bundle.assets[0].sha256");
  }
});
