import assert from "node:assert/strict";
import { test } from "node:test";
import { metrolinxAuaLegendEn, metrolinxOglLineEn } from "../../../packages/timetables/src/index.ts";
import terms from "../../../packages/timetables/src/licence-allowlist.json" with { type: "json" };
import {
  canDiscloseSources, compareSources, readProvenance, resolveSources,
  type SourceEvidence, type SourceIssue,
} from "./provenance.ts";

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: "qa-fixture", name: "Synthetic registry fixture", kind: "municipal",
    url: "https://example.invalid/sources?id=fixture", licence_id: "Fixture-1.0",
    licence_name: "Synthetic fixture terms", licence_url: "https://example.invalid/terms",
    retrieved_at: "2024-02-29", attribution: "Synthetic fixture credit",
    tier: 0, notes: "", tier_note: "", ...overrides,
  };
}

function evidence(overrides: Record<string, unknown> = {}): SourceEvidence {
  const catalogue = readProvenance({ sources: [source(overrides)] });
  const row = catalogue.values().next().value;
  assert.ok(row);
  return row;
}

function beforeAfter(a: Record<string, unknown>, b: Record<string, unknown>) {
  return compareSources(
    readProvenance({ sources: [source(a)] }), readProvenance({ sources: [source(b)] }), ["qa-fixture"],
  );
}

test("returns a published provenance projection with no note or download fields", () => {
  const row = evidence({ download_url: "https://example.invalid/private.zip", notes: "internal fixture annotation" });
  assert.deepEqual(row, {
    sourceId: "qa-fixture", sourceName: "Synthetic registry fixture", status: "included",
    licence: "Fixture-1.0", sourceUrl: "https://example.invalid/sources?id=fixture",
    licenceUrl: "https://example.invalid/terms", retrievedOn: "2024-02-29",
    verificationTier: 0, attribution: "Synthetic fixture credit", issues: [],
  });
  assert.ok(!JSON.stringify(row).includes("internal"));
  assert.ok(!JSON.stringify(row).includes("private.zip"));
  assert.ok(Object.isFrozen(row) && Object.isFrozen(row.issues));
});

test("integral registry tiers are preserved without promotion or string coercion", () => {
  for (const value of [0, 1, 2, 3, 4]) {
    assert.equal(evidence({ tier: value }).verificationTier, value);
    assert.equal(evidence({ tier: value }).status, "included");
  }
  for (const value of ["0", 5, -1, 1.1, null, undefined, NaN, true]) {
    const row = evidence({ tier: value });
    assert.equal(row.verificationTier, null);
    assert.ok(row.issues.includes("invalid-tier"));
    assert.equal(row.status, "unknown");
  }
});

test("missing or placeholder attribution, identity or terms cannot pass review", () => {
  const cases: [string, unknown, SourceIssue][] = [
    ["name", null, "incomplete-name"], ["name", "Unknown", "incomplete-name"],
    ["name", "Fixture\ncontrol", "incomplete-name"], ["name", "raw\u202e", "incomplete-name"],
    ["licence_id", "UNCLEAR", "incomplete-licence"], ["licence_id", "n/a", "incomplete-licence"],
    ["licence_id", { text: "Fixture-1.0" }, "incomplete-licence"],
    ["attribution", " INCONNU", "incomplete-attribution"], ["attribution", "", "incomplete-attribution"],
    ["kind", "unknown", "invalid-kind"], ["kind", null, "invalid-kind"],
  ];
  for (const [key, value, issue] of cases) {
    const row = evidence({ [key]: value });
    assert.ok(row.issues.includes(issue), key);
    assert.equal(row.status, "unknown");
  }
});

test("retrievedOn accepts calendar dates, including leap day, without inferring a fallback", () => {
  for (const valid of ["2000-02-29", "0001-01-01", "2026-11-21"]) {
    assert.equal(evidence({ retrieved_at: valid }).retrievedOn, valid);
  }
  for (const invalid of ["1900-02-29", "2026-02-29", "2026-04-31", "0000-01-01",
    "2026-11-21T00:00Z", "2026-2-03", "20261121", "unknown", null, 20261121]) {
    const row = evidence({ retrieved_at: invalid });
    assert.equal(row.retrievedOn, null);
    assert.deepEqual(row.issues, ["invalid-retrieval-date"]);
  }
});

test("public HTTP and HTTPS declaration URLs preserve their original public addresses", () => {
  for (const url of ["http://example.invalid/open", "https://example.invalid/catalog?q=parks%20inventory",
    "https://example.invalid/terms#attribution"]) {
    const row = evidence({ url, licence_url: url });
    assert.equal(row.sourceUrl, url);
    assert.equal(row.licenceUrl, url);
    assert.equal(row.status, "included");
  }
});

test("invalid addresses and credential-bearing URLs cannot appear in exported evidence", () => {
  const urls = [
    "https://example.invalid/#access_token=synthetic?path",
    "https://example.invalid/#/return?%69d_token=synthetic",
    "https://example.invalid/terms?client_secret=synthetic",
    "file:///tmp/test", "/terms", "//example.invalid/terms", "javascript:fixture",
    "https://example.invalid/x y", "https://example.invalid\\terms",
    "https://fixture:dummy@example.invalid/", "https://example.invalid/d?x-amz-signature=dummy",
    "https://example.invalid/d?%61pi_key=dummy", "https://example.invalid/d?ACCESS_TOKEN=dummy"];
  for (const url of urls) {
    const row = evidence({ url, licence_url: url });
    assert.equal(row.sourceUrl, null, url);
    assert.equal(row.licenceUrl, null);
    assert.equal(row.status, "unknown");
    assert.ok(!JSON.stringify(row).includes("dummy"));
  }
});

test("all pack hold phrases apply in either notes field without exposing its content", () => {
  const phrases = ["not been reconciled", "revocable", "LEGAL REVIEW IS STILL REQUIRED",
    "not treated as a settled open grant", "held for legal review"];
  for (const key of ["notes", "tier_note"]) {
    for (const phrase of phrases) {
      const row = evidence({ [key]: "Fixture-only confidential marker / " + phrase });
      assert.equal(row.status, "held");
      assert.deepEqual(row.issues, ["terms-held"]);
      assert.ok(!JSON.stringify(row).includes("confidential"));
    }
  }
});

test("malformed optional notes cue review and cannot override an independent hold", () => {
  assert.equal(evidence({ notes: undefined, tier_note: undefined }).status, "included");
  assert.equal(evidence({ notes: null }).status, "unknown");
  const row = evidence({ notes: {}, tier_note: "revocable" });
  assert.equal(row.status, "held");
  assert.equal(row.licence, "Fixture-1.0");
  assert.deepEqual(row.issues, ["terms-held", "invalid-policy-notes"]);
});

test("source exclusions apply to IDs, names, duplicate IDs and undeclared references", () => {
  for (const overrides of [{ id: "qa-miway-exclusion" }, { name: "Fixture: MiWaY check" }]) {
    const row = evidence(overrides);
    assert.equal(row.status, "held");
    assert.ok(row.issues.includes("excluded-source"));
  }
  const missing = resolveSources(readProvenance({ sources: [] }), ["miway"])[0];
  assert.equal(missing?.status, "held");
  assert.equal(missing?.licence, null);
  assert.deepEqual(missing?.issues, ["missing-declaration", "excluded-source"]);
});

test("OSM credit is exact for OSM-source kinds and the repository's OSM source ID", () => {
  const credit = "© OpenStreetMap contributors";
  for (const identity of [{ kind: "osm" }, { id: "osm-ontario" }]) {
    assert.equal(evidence({ ...identity, attribution: credit, licence_id: "ODbL-1.0" }).status, "included");
    for (const invalid of ["OpenStreetMap contributors", "© OpenStreetMap Contributor", credit + ", ODbL"]) {
      const row = evidence({ ...identity, attribution: invalid });
      assert.equal(row.status, "unknown");
      assert.ok(row.issues.includes("incorrect-osm-credit"));
      assert.equal(row.attribution, null);
    }
  }
});

test("accepted Metrolinx terms require the pack date, both statements, licence and URL", () => {
  for (const policy of terms.filter(entry => entry.sourceId.startsWith("metrolinx-"))) {
    const declaration = {
      id: policy.sourceId, kind: "gtfs", licence_id: policy.licence, licence_name: policy.licence,
      retrieved_at: policy.retrieved, licence_url: policy.licenceUrl,
      attribution: metrolinxAuaLegendEn + " " + metrolinxOglLineEn,
    };
    assert.equal(evidence(declaration).status, "included");
    for (const update of [
      { retrieved_at: "2024-01-01" }, { licence_url: "https://example.invalid/terms" },
      { attribution: metrolinxAuaLegendEn }, { attribution: metrolinxOglLineEn },
      { licence_id: "Other", licence_name: "Other" }, { id: "metrolinx-undeclared-fixture" },
    ]) {
      const row = evidence({ ...declaration, ...update });
      assert.equal(row.status, "unknown");
      assert.ok(row.issues.includes("special-source-terms"));
    }
  }
});

test("LTC retains the bilingual notice, terms URL and independent retrieval date", () => {
  const policy = terms.find(entry => entry.sourceId === "ltc");
  assert.ok(policy);
  const en = "Transit data is available from London Transit Commission under its Terms of Use";
  const fr = "Les données de transport en commun sont disponibles auprès de la Commission de transport de London : elles sont offertes aux termes de ses conditions d’utilisation.";
  const attribution = en + ". " + fr + " " + policy.licenceUrl;
  const declaration = { id: "gtfs-ltc", kind: "gtfs", licence_id: policy.licence, licence_url: policy.licenceUrl };
  assert.equal(evidence({ ...declaration, attribution }).status, "included");
  for (const invalid of [en, fr, en + " " + fr, attribution + " logo", attribution.replace(" :", ":")]) {
    const row = evidence({ ...declaration, attribution: invalid });
    assert.ok(row.issues.includes("special-source-terms"));
    assert.equal(row.status, "unknown");
  }
});

test("a duplicate registry declaration fails closed independent of registry row order", () => {
  const a = source({ name: "Fixture A" });
  const b = source({ name: "Fixture B", tier: 4 });
  const c = source({ notes: "Held for legal review" });
  const versions = [[a, b, c], [c, a, b], [b, c, a]];
  const outcomes = versions.map(rows => resolveSources(readProvenance({ sources: rows }), ["qa-fixture"]));
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.deepEqual(outcomes[1], outcomes[2]);
  assert.deepEqual(outcomes[0]?.[0]?.issues, ["duplicate-declaration"]);
  assert.equal(outcomes[0]?.[0]?.verificationTier, null);
  assert.equal(outcomes[0]?.[0]?.status, "held");
  assert.equal(readProvenance({ sources: [a, b] }).get("qa-fixture")?.status, "unknown");
});

test("malformed registry structure and unusable identities cannot silently drop rows", () => {
  for (const input of [null, 1, [], { sources: null }, { sources: {} }, { sources: [1] },
    { sources: [source(), source({ id: "bad/id" })] }, { sources: [Object.create({ id: "prototype" })] },
    Object.create({ sources: [] })]) {
    assert.throws(() => readProvenance(input), { name: "TypeError" });
  }
  assert.equal(readProvenance({ sources: [] }).size, 0);
  assert.throws(() => resolveSources(new Map(), ["qa\nprivate-marker"]), /^TypeError: registry-source-id$/u);
});

test("inputs and output scopes are detached, deduplicated and ordered by source ID", () => {
  const raw = { sources: [source({ id: "zeta" }), source({ id: "alpha" })] };
  const catalogue = readProvenance(raw);
  raw.sources.reverse();
  raw.sources[0]!.name = "Updated after parsing";
  function* references() { yield "zeta"; yield "missing"; yield "alpha"; yield "zeta"; }
  const rows = resolveSources(catalogue, references());
  assert.deepEqual(rows.map(row => row.sourceId), ["alpha", "missing", "zeta"]);
  assert.equal(rows[0]?.sourceName, "Synthetic registry fixture");
  assert.equal(rows[1]?.retrievedOn, null);
  assert.deepEqual(rows[1]?.issues, ["missing-declaration"]);
});

test("disclosure requires every referenced source and at least one source", () => {
  const catalogue = readProvenance({ sources: [source(), source({ id: "held", tier_note: "revocable" }),
    source({ id: "incomplete", tier: null })] });
  assert.equal(canDiscloseSources(catalogue, new Set(["qa-fixture"])), true);
  for (const ids of [[], ["outside"], ["qa-fixture", "held"], ["incomplete", "qa-fixture"], ["miway"]]) {
    assert.equal(canDiscloseSources(catalogue, ids), false);
  }
});

test("source changes preserve each side's provenance and identify the exact changed fields", () => {
  const [change] = beforeAfter({}, { licence_id: "Fixture-2.0", licence_url: "https://example.invalid/terms/v2",
    tier: 3, retrieved_at: "2024-03-01" });
  assert.ok(change);
  assert.equal(change.kind, "changed");
  assert.deepEqual(change.fields, ["licence", "licenceUrl", "retrievedOn", "verificationTier"]);
  assert.equal(change.previous?.licence, "Fixture-1.0");
  assert.equal(change.candidate?.licence, "Fixture-2.0");
  assert.equal(change.previous?.verificationTier, 0);
  assert.equal(change.candidate?.verificationTier, 3);
});

test("compares newly held, restored and incomplete metadata without promoting a source", () => {
  const hold = beforeAfter({}, { notes: "revocable" })[0];
  assert.equal(hold?.kind, "held");
  assert.deepEqual(hold?.fields, ["status", "issues"]);
  const restored = beforeAfter({ tier: null }, { tier: 0 })[0];
  assert.equal(restored?.kind, "restored");
  assert.equal(restored?.candidate?.status, "included");
  const incomplete = beforeAfter({}, { licence_url: "UNKNOWN" })[0];
  assert.equal(incomplete?.kind, "changed");
  assert.equal(incomplete?.candidate?.status, "unknown");
  assert.equal(incomplete?.previous?.licenceUrl, "https://example.invalid/terms");
});

test("cosmetic changes to unpublished fields produce no provenance event", () => {
  assert.deepEqual(beforeAfter({ notes: "internal A" }, { notes: "internal B", download_url: "https://example.invalid/a" }), []);
  assert.deepEqual(beforeAfter({ notes: "revocable" }, { notes: "held for legal review" }), []);
  assert.deepEqual(beforeAfter({ name: null }, { name: "" }), []);
});

test("source adoption and removal are scoped separately from a held source's admission", () => {
  const old = readProvenance({ sources: [source({ id: "old-source" }), source({ id: "stable" })] });
  const next = readProvenance({ sources: [source({ id: "fresh-source", notes: "revocable" }), source({ id: "stable" })] });
  const changes = compareSources(old, next, ["old-source", "fresh-source", "stable", "absent", "old-source"]);
  assert.deepEqual(changes.map(change => [change.sourceId, change.kind]), [["fresh-source", "added"], ["old-source", "removed"]]);
  assert.equal(changes[0]?.previous, null);
  assert.equal(changes[0]?.candidate?.status, "held");
  assert.equal(changes[1]?.candidate, null);
  assert.deepEqual(compareSources(old, next, []), []);
});
