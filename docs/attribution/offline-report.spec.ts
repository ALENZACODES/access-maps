import test from "node:test";
import assert from "node:assert/strict";
import { makeOfflineReport } from "./offline-report.js";
import { auditOfflineBundle } from "./offline-bundle.js";
import { fixtureAsset, fixtureBundle, fixtureRoute, withAssets, withRoutes } from "./offline-fixtures.js";
import type { BundleAudit, OfflineBundle } from "./offline-bundle.js";
import type { FilesystemAudit } from "./offline-files.js";

function render(bundle: OfflineBundle = fixtureBundle(), locale: "en" | "fr" = "en") {
  return makeOfflineReport(bundle,auditOfflineBundle(bundle),locale);
}

test("report languages both carry source and asset totals", () => {
  for (const locale of ["en", "fr"] as const) {
    const report = render(fixtureBundle(),locale);
    assert.equal(report.locale,locale);
    assert.equal(report.releaseId,"release-one");
    assert.ok(report.html.includes("assets/main.js"));
    assert.ok(report.text.includes("index.html"));
  }
});

test("French report contains the correct nonbreaking colon in fields", () => {
  const report = render(fixtureBundle(),"fr");
  assert.ok(report.text.includes("Version\u00a0: release-one"));
  assert.ok(report.text.includes("État\u00a0: "));
  assert.ok(report.text.includes("Octets déclarés\u00a0: 16"));
  assert.ok(!report.text.includes("Version: "));
  assert.ok(!report.text.includes("État: "));
});

test("French reports retain native apostrophe conventions", () => {
  const report = render(fixtureBundle(),"fr");
  assert.equal(report.html.includes('lang="fr"'),true);
  assert.ok(report.text.includes("Fichiers inclus"));
  assert.ok(report.html.includes("Rapport sur les sources hors connexion"));
});

test("English reports use ordinary English punctuation", () => {
  const report = render();
  assert.ok(report.text.includes("Release: release-one"));
  assert.ok(report.text.includes("Declared bytes: 16"));
  assert.ok(report.html.includes('lang="en"'));
});

test("UNKNOWN byte counts are not replaced with an inferred zero", () => {
  const bundle = fixtureBundle();
  const changed = withAssets(bundle,[fixtureAsset({bytes:"UNKNOWN"}),bundle.assets[1]!]);
  const report = render(changed,"fr");
  assert.ok(report.text.includes("UNKNOWN"));
  assert.ok(report.json.includes('"totalBytes": "UNKNOWN"'));
  assert.ok(report.json.includes("ASSET_SIZE_UNKNOWN"));
});

test("source IDs appear only when declared", () => {
  const report = render();
  assert.ok(report.text.includes("osm-one"));
  assert.equal(report.text.includes("metrolinx-aua"),false);
});

test("route IDs do not become source URLs or permissions", () => {
  const bundle = withRoutes(fixtureBundle(),[fixtureRoute({id:"map-home"})]);
  const report = render(bundle);
  assert.ok(report.text.includes("map-home"));
  assert.ok(!report.html.includes('href="https://'));
});

test("report HTML has complete structural landmarks", () => {
  const html = render().html;
  assert.match(html,/<!doctype html>/);
  assert.match(html,/<html lang="en">/);
  assert.match(html,/<header>/);
  assert.match(html,/<main id="report">/);
  assert.match(html,/<h1>/);
  assert.match(html,/<h2 id="routes">/);
  assert.match(html,/<h2 id="assets">/);
  assert.match(html,/<h2 id="findings">/);
  assert.match(html,/<section aria-labelledby="routes">/);
  assert.match(html,/<\/main>/);
  assert.match(html,/<\/body><\/html>/);
});

test("HTML report includes a keyboard skip link", () => {
  const html = render().html;
  assert.match(html,/href="#report"/);
  assert.match(html,/class="skip"/);
  assert.match(html,/focus-visible/);
});

test("HTML uses minimum 44 pixel links and buttons", () => {
  const html = render().html;
  assert.ok(html.includes("min-width:44px"));
  assert.ok(html.includes("min-height:44px"));
  assert.ok(!html.includes("min-height:24px"));
});

test("HTML CSP blocks all network access by default", () => {
  const html = render().html;
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(html.includes("connect-src 'none'"));
  assert.ok(html.includes("form-action 'none'"));
  assert.ok(html.includes("base-uri 'none'"));
});

test("HTML does not inject remote scripts or network-request markup", () => {
  const html = render().html;
  assert.ok(!/<script\b/iu.test(html));
  assert.ok(!/<iframe\b/iu.test(html));
  assert.ok(!/<(?:script|link|iframe|img)\b[^>]+(?:src|href)=/iu.test(html));
});

test("HTML encodes arbitrary release identifiers and descriptions", () => {
  const bundle = fixtureBundle();
  const tampered = {...bundle,release:{...bundle.release,releaseId:'<script>alert("x")</script>'}};
  const report = makeOfflineReport(tampered,auditOfflineBundle(tampered),"en");
  assert.ok(report.html.includes("&lt;script&gt;"));
  assert.ok(!report.html.includes('<script>alert'));
  assert.ok(!report.html.includes("<script>"));
});

test("HTML encodes arbitrary asset paths rather than trusting a filename", () => {
  const bundle = fixtureBundle();
  const asset = fixtureAsset({path:'<img src=x onerror=alert(1)>'});
  const edited = withAssets(bundle,[asset,bundle.assets[1]!]);
  const report = makeOfflineReport(edited,auditOfflineBundle(edited),"en");
  assert.ok(report.html.includes("&lt;img"));
  assert.ok(!report.html.includes("<img"));
});

test("HTML escapes ampersands, apostrophes and angle brackets", () => {
  const bundle = fixtureBundle();
  const route = fixtureRoute({id:"a&b<'\""});
  const edited = withRoutes(bundle,[route]);
  const html = render(edited).html;
  assert.ok(html.includes("a&amp;b&lt;&#39;&quot;"));
});

test("zero findings produce a readable empty state", () => {
  const report = render();
  assert.ok(report.text.includes("No bundle findings"));
  assert.ok(report.html.includes("No bundle findings"));
  assert.ok(!report.json.includes('"blocked": true'));
});

test("blocked report explains the incomplete manifest", () => {
  const bundle = withRoutes(fixtureBundle(),[fixtureRoute({entry:"absent.html"})]);
  const report = render(bundle);
  assert.ok(report.text.includes("ENTRY_MISSING"));
  assert.ok(report.html.includes("ENTRY_MISSING"));
  assert.ok(report.json.includes("ENTRY_MISSING"));
  assert.ok(report.text.includes("Blocked by recorded gaps"));
});

test("blocking evidence remains visible even without bundle-problem lines", () => {
  const bundle = fixtureBundle();
  const source = bundle.release.sources[0]!;
  const edited = {...bundle,release:{...bundle.release,sources:[{...source,redistributionPermission:"UNKNOWN" as const}]}};
  const report = render(edited);
  assert.ok(report.json.includes("REDISTRIBUTION_UNKNOWN"));
  assert.ok(report.json.includes('"blocked": true'));
});

test("filesystem inspection findings are represented in report JSON", () => {
  const bundle = fixtureBundle();
  const base = auditOfflineBundle(bundle);
  const filesystem: FilesystemAudit = {
    base,blocked:true,inspected:2,matched:1,missing:0,
    files:[{code:"FILE_HASH_MISMATCH",level:"block",location:"assets.index.html",
      description:"Mismatch",expectedBytes:12,actualBytes:12,
      expectedHash:"a".repeat(64),actualHash:"b".repeat(64)}],
  };
  const report = makeOfflineReport(bundle,filesystem,"en");
  assert.ok(report.text.includes("FILE_HASH_MISMATCH"));
  assert.ok(report.html.includes("FILE_HASH_MISMATCH"));
  const json = JSON.parse(report.json) as Record<string, unknown>;
  assert.deepEqual(json.filesystem,{inspected:2,matched:1,missing:0});
});

test("report JSON has stable schema and parseable findings", () => {
  const report = render();
  const value = JSON.parse(report.json) as {schema:string;releaseId:string;blocked:boolean;findings:unknown[]};
  assert.equal(value.schema,"attribution-offline-report/1");
  assert.equal(value.releaseId,"release-one");
  assert.equal(value.blocked,false);
  assert.ok(Array.isArray(value.findings));
});

test("human-oriented reports do not fabricate dataset timestamps", () => {
  const report = render();
  assert.equal(report.text.includes("2026-11-16"),false);
  assert.equal(report.html.includes("2026-11-16"),false);
  assert.equal(report.json.includes("2026-11-16"),false);
});

test("HTML has no source claim unrelated to supplied inventory", () => {
  const report = render();
  assert.equal(/miway/iu.test(report.html),false);
  assert.equal(/partnership|guarantee|real-time/iu.test(report.html),false);
});

test("large finding reports preserve every finding without collapsing errors", () => {
  const bundle = fixtureBundle();
  const errors = Array.from({length:60},(_,i)=>({code:`ISSUE_${i}`,level:"block" as const,location:`assets.a-${i}.js`,description:`Problem ${i}`}));
  const audit: BundleAudit = {...auditOfflineBundle(bundle),blocked:true,problems:errors};
  const report = makeOfflineReport(bundle,audit,"fr");
  for (let i=0;i<60;i+=1) {
    assert.ok(report.html.includes(`ISSUE_${i}`));
    assert.ok(report.text.includes(`ISSUE_${i}`));
  }
});

test("HTML heading hierarchy remains monotonic", () => {
  const report = render();
  const headings = Array.from(report.html.matchAll(/<h([1-6])(?:\s|>)/gu),(match) => Number(match[1]));
  assert.equal(headings[0],1);
  for (let i=1;i<headings.length;i+=1) assert.ok(headings[i]! <= headings[i-1]! + 1);
});

test("report text uses line-oriented output with final newline", () => {
  const text = render().text;
  assert.ok(text.endsWith("\n"));
  assert.ok(text.split("\n").length > 10);
});

test("JSON output is standalone and terminates with newline", () => {
  const report = render();
  assert.ok(report.json.endsWith("\n"));
  assert.ok(!report.json.includes("undefined"));
});

test("reported file dependencies are exactly declared, no inferred downloads", () => {
  const report = render();
  assert.ok(report.html.includes("assets/main.js"));
  assert.ok(!report.html.includes('href="https://'));
  assert.ok(report.html.includes("https://www.openstreetmap.org/copyright"));
});

test("all three report forms are deterministic across repeated calls", () => {
  const bundle = fixtureBundle();
  const audit = auditOfflineBundle(bundle);
  const first = makeOfflineReport(bundle,audit,"en");
  const second = makeOfflineReport(bundle,audit,"en");
  assert.deepEqual(first,second);
});

test("French and English report share the same machine-readable codes", () => {
  const bundle = withRoutes(fixtureBundle(),[fixtureRoute({entry:"missing.html"})]);
  const en = render(bundle,"en");
  const fr = render(bundle,"fr");
  const english = JSON.parse(en.json) as {findings:{code:string}[]};
  const french = JSON.parse(fr.json) as {findings:{code:string}[]};
  assert.deepEqual(english.findings.map((f)=>f.code),french.findings.map((f)=>f.code));
});
