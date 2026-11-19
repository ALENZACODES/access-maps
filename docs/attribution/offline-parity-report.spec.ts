import test from "node:test";
import assert from "node:assert/strict";
import { auditBilingualParity } from "./offline-parity.js";
import { compareBilingualReleases } from "./offline-parity-change.js";
import { renderParityReport } from "./offline-parity-report.js";
import { parityBundle, parityPlan, paritySource, renamePlan, renameRelease, setSource } from "./offline-parity-fixtures.js";

function report(locale: "en" | "fr" = "en") {
  const bundle = parityBundle();
  const plan = parityPlan();
  return renderParityReport(bundle, plan, auditBilingualParity(bundle, plan), locale);
}

test("the text report shows release, route pair and separate language assets", () => {
  const result = report();
  assert.ok(result.text.includes("Bilingual publication parity"));
  assert.ok(result.text.includes("Release: release-one"));
  assert.ok(result.text.includes("English route: map-en"));
  assert.ok(result.text.includes("French route: map-fr"));
  assert.ok(result.text.includes("assets/map.js"));
  assert.ok(result.text.includes("map-en.html"));
  assert.ok(result.text.includes("map-fr.html"));
});

test("the French report uses U+00A0 before all generated field colons", () => {
  const result = report("fr");
  assert.ok(result.text.includes("Version\u00a0: release-one"));
  assert.ok(result.text.includes("Vue en anglais\u00a0: map-en"));
  assert.ok(result.text.includes("Vue en français\u00a0: map-fr"));
  assert.ok(result.text.includes("Données en date du\u00a0: UNKNOWN"));
  assert.ok(result.text.includes("Licence\u00a0: Open Database License"));
  assert.ok(result.text.includes("Permission de redistribution\u00a0: YES"));
  assert.equal(result.text.includes("Données en date du: "), false);
});

test("legal attribution is rendered without inventing feed currency", () => {
  const result = report();
  assert.ok(result.text.includes("© OpenStreetMap contributors"));
  assert.ok(result.text.includes("Open Database License (ODbL) 1.0"));
  assert.ok(result.text.includes("Dataset date: UNKNOWN"));
  assert.ok(result.text.includes("Acquisition date: 2026-01-04"));
  assert.ok(result.text.includes("Terms reviewed: 2026-01-03"));
});

test("the report retains source and licence URLs as recorded", () => {
  const result = report();
  assert.ok(result.text.includes("https://www.openstreetmap.org/copyright"));
  assert.ok(result.text.includes("https://opendatacommons.org/licenses/odbl/1-0/"));
});

test("HTML has lang, heading, main, skip navigation and no external assets", () => {
  for (const locale of ["en", "fr"] as const) {
    const result = report(locale);
    assert.ok(result.html.includes(`<html lang="${locale}">`));
    assert.ok(result.html.includes('<a href="#main" class="skip">'));
    assert.ok(result.html.includes('<main id="main" tabindex="-1">'));
    assert.ok(result.html.includes('<meta name="viewport"'));
    assert.ok(result.html.includes("default-src 'none'"));
    assert.ok(result.html.includes("connect-src 'none'"));
    assert.ok(result.html.includes("script-src 'none'"));
    assert.equal(/<script\b/iu.test(result.html), false);
    assert.equal(/<link\b/iu.test(result.html), false);
    assert.equal(/<img\b/iu.test(result.html), false);
  }
});

test("HTML style declares 44px targets and focus-visible indication", () => {
  const html = report().html;
  assert.ok(html.includes("min-height:44px"));
  assert.ok(html.includes("min-width:44px"));
  assert.ok(html.includes(":focus-visible"));
  assert.ok(html.includes("outline:3px"));
  assert.ok(html.includes("@media(prefers-reduced-motion:reduce)"));
  assert.ok(html.includes("@media(print)"));
});

test("the report is responsive to narrow viewports", () => {
  const html = report("fr").html;
  assert.ok(html.includes("@media(max-width:600px)"));
  assert.ok(html.includes("overflow-wrap:anywhere"));
  assert.ok(html.includes("font-family:system-ui"));
});

test("HTML correctly escapes an adversarial source name", () => {
  const bundle = setSource(parityBundle(), paritySource({ name: '<img src=x onerror="boom">' }));
  const result = renderParityReport(bundle, parityPlan(), auditBilingualParity(bundle, parityPlan()), "en");
  assert.ok(result.html.includes("&lt;img src=x onerror=&quot;boom&quot;&gt;"));
  assert.equal(result.html.includes('<img src=x onerror="boom">'), false);
});

test("HTML escapes legal notice text without changing source evidence", () => {
  const attribution = '© OpenStreetMap contributors; ODbL <danger> & "quote"';
  const bundle = setSource(parityBundle(), paritySource({ attribution }));
  const result = renderParityReport(bundle, parityPlan(), auditBilingualParity(bundle, parityPlan()), "fr");
  assert.ok(result.html.includes("ODbL &lt;danger&gt; &amp; &quot;quote&quot;"));
  assert.ok(result.text.includes(attribution));
  assert.equal(JSON.parse(result.json).includedSources[0].attribution, attribution);
});

test("HTML escapes source IDs in displayed text", () => {
  const bundle = setSource(parityBundle(), paritySource({ id: "osm-one", name: "A & B" }));
  const result = renderParityReport(bundle, parityPlan(), auditBilingualParity(bundle, parityPlan()), "en");
  assert.ok(result.html.includes("A &amp; B"));
  assert.equal(result.html.includes("A & B"), false);
});

test("report remains deterministic for the same input", () => {
  assert.deepEqual(report("en"), report("en"));
  assert.deepEqual(report("fr"), report("fr"));
});

test("reported JSON has schema, locale, result and source records", () => {
  const data = JSON.parse(report("en").json) as Record<string, unknown>;
  assert.equal(data.schema, "attribution-bilingual-parity-export/1");
  assert.equal(data.locale, "en");
  assert.equal((data.plan as {releaseId:string}).releaseId, "release-one");
  assert.equal((data.report as {blocked:boolean}).blocked, false);
  assert.equal((data.includedSources as unknown[]).length, 1);
  assert.equal(data.comparison, null);
});

test("report JSON round-trips without adding inferred provenance", () => {
  const data = JSON.parse(report("fr").json) as {
    includedSources: Array<{datasetDate:string;redistributionPermission:string;termsReviewedDate:string}>;
  };
  assert.equal(data.includedSources[0]?.datasetDate, "UNKNOWN");
  assert.equal(data.includedSources[0]?.redistributionPermission, "YES");
  assert.equal(data.includedSources[0]?.termsReviewedDate, "2026-01-03");
});

test("blocking findings appear in text, HTML and JSON", () => {
  const bundle = setSource(parityBundle(), paritySource({ attribution: "" }));
  const result = renderParityReport(bundle, parityPlan(), auditBilingualParity(bundle, parityPlan()), "fr");
  assert.ok(result.text.includes("Publication bloquée"));
  assert.ok(result.text.includes("SOURCE_NOTICE_MISSING"));
  assert.ok(result.html.includes("SOURCE_NOTICE_MISSING"));
  assert.ok(result.json.includes("SOURCE_NOTICE_MISSING"));
});

test("missing source records are exposed as UNKNOWN in all report formats", () => {
  const bundle = { ...parityBundle(), release: { ...parityBundle().release, sources: [] } };
  const result = renderParityReport(bundle, parityPlan(), auditBilingualParity(bundle, parityPlan()), "en");
  assert.ok(result.text.includes("UNKNOWN"));
  assert.ok(result.html.includes("UNKNOWN"));
  assert.equal((JSON.parse(result.json) as {includedSources:unknown[]}).includedSources.length, 0);
});

test("comparison reports include both before and after release identifiers", () => {
  const before = parityBundle();
  const after = renameRelease(before, "release-next");
  const afterPlan = renamePlan(parityPlan(), "release-next");
  const comparison = compareBilingualReleases(before, parityPlan(), after, afterPlan);
  const result = renderParityReport(after, afterPlan, comparison.afterResult, "en", comparison);
  const data = JSON.parse(result.json) as {comparison:{previousRelease:string;nextRelease:string}};
  assert.equal(data.comparison.previousRelease, "release-one");
  assert.equal(data.comparison.nextRelease, "release-next");
  assert.ok(result.text.includes("Release changes"));
  assert.ok(result.html.includes("Release changes"));
});

test("comparison change details use EN/FR labels consistently", () => {
  const before = parityBundle();
  const after = setSource(renameRelease(before, "release-next"), paritySource({ attribution: "" }));
  const plan = renamePlan(parityPlan(), "release-next");
  const comparison = compareBilingualReleases(before, parityPlan(), after, plan);
  for (const [locale, beforeLabel, afterLabel] of [["en", "Before:", "After:"], ["fr", "Avant\u00a0:", "Après\u00a0:"]] as const) {
    const rendered = renderParityReport(after, plan, comparison.afterResult, locale, comparison);
    assert.ok(rendered.text.includes(beforeLabel));
    assert.ok(rendered.text.includes(afterLabel));
    assert.ok(rendered.html.includes("SOURCE_NOTICE_CHANGED"));
    assert.ok(rendered.json.includes("SOURCE_NOTICE_CHANGED"));
  }
});

test("a comparison blocker sets report status to blocked", () => {
  const before = parityBundle();
  const after = renameRelease(before, "release-next");
  const afterPlan = { ...renamePlan(parityPlan(), "release-next"), pairs: [] };
  const comparison = compareBilingualReleases(before, parityPlan(), after, afterPlan);
  const rendered = renderParityReport(after, afterPlan, comparison.afterResult, "en", comparison);
  assert.ok(rendered.text.includes("Publication blocked"));
});

test("report does not inject invented time or feed freshness", () => {
  const rendered = report();
  assert.equal(rendered.text.includes("newest"), false);
  assert.equal(rendered.html.includes("Date.now"), false);
  assert.equal(rendered.json.includes("lastCheckedAt"), false);
  assert.ok(rendered.text.includes("UNKNOWN"));
});

test("HTML uses text instead of loading remote source and licence URLs", () => {
  const html = report().html;
  assert.ok(html.includes("https://www.openstreetmap.org/copyright"));
  assert.equal(/<a[^>]+href="https?:/iu.test(html), false);
  assert.equal(/<iframe\b/iu.test(html), false);
  assert.equal(/<object\b/iu.test(html), false);
});

test("report includes explicit scope limitation in both locales", () => {
  assert.ok(report("en").text.includes("not conditions at a destination"));
  assert.ok(report("fr").text.includes("non sur l’état d’un lieu"));
});
