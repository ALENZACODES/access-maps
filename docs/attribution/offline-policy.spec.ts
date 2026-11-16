import test from "node:test";
import assert from "node:assert/strict";
import { auditOfflineBundle } from "./offline-bundle.js";
import { makeOfflineReport } from "./offline-report.js";
import { fixtureBundle, fixtureAsset, withRelease, withAssets } from "./offline-fixtures.js";
import { sampleRelease, sampleSource, sampleSurface } from "./evidence-fixtures.js";
import { METROLINX_AUA_SECTION_3_LEGEND, METROLINX_AUA_END_USER_LAWS_EN,
  METROLINX_AUA_END_USER_LAWS_FR, METROLINX_OGL_LINE, OSM_ATTRIBUTION_LINE } from "./index.js";
import type { SourceEvidence } from "./evidence-contract.js";

function withSource(source: SourceEvidence) {
  const bundle = fixtureBundle();
  const surface = sampleSurface({sourceIds:[source.id]});
  return withRelease(withAssets(bundle,[fixtureAsset({sourceIds:[source.id]}),bundle.assets[1]!]),
    sampleRelease([source],[surface]));
}
function sourceCodes(source: SourceEvidence): string[] {
  return auditOfflineBundle(withSource(source)).evidence.findings.map((entry) => entry.code);
}

test("OSM map credit is distinct from its ODbL name", () => {
  const source = sampleSource();
  assert.ok(source.attribution.includes(OSM_ATTRIBUTION_LINE));
  assert.ok(!OSM_ATTRIBUTION_LINE.includes("ODbL"));
  assert.ok(source.licenceName.includes("ODbL"));
  assert.equal(sourceCodes(source).includes("OSM_CREDIT_MISSING"),false);
  assert.equal(sourceCodes(source).includes("ODBL_MISSING"),false);
});

test("removing OSM credit blocks an otherwise connected offline route", () => {
  const source = sampleSource({attribution:"Open Database License (ODbL) 1.0"});
  assert.ok(sourceCodes(source).includes("OSM_CREDIT_MISSING"));
  assert.equal(auditOfflineBundle(withSource(source)).blocked,true);
});

test("removing ODbL licence name cannot be masked by map credit", () => {
  const source = sampleSource({licenceName:"UNKNOWN"});
  assert.ok(sourceCodes(source).includes("ODBL_MISSING"));
  assert.equal(auditOfflineBundle(withSource(source)).blocked,true);
});

test("Metrolinx AUA notice requires the section 3 legend and both law lines", () => {
  const source = sampleSource({family:"metrolinx-aua",licenceName:"Metrolinx GTFS Access and Use Agreement",
    attribution:[METROLINX_AUA_SECTION_3_LEGEND,METROLINX_AUA_END_USER_LAWS_EN,METROLINX_AUA_END_USER_LAWS_FR].join("\n")});
  const result = auditOfflineBundle(withSource(source));
  assert.equal(result.blocked,false,JSON.stringify(result.evidence.findings));
  assert.equal(sourceCodes(source).includes("AUA_LEGEND_MISSING"),false);
  assert.equal(sourceCodes(source).includes("AUA_LAWS_MISSING"),false);
});

test("Metrolinx AUA without section 3 legend blocks", () => {
  const source = sampleSource({family:"metrolinx-aua",licenceName:"Metrolinx GTFS Access and Use Agreement",
    attribution:[METROLINX_AUA_END_USER_LAWS_EN,METROLINX_AUA_END_USER_LAWS_FR].join("\n")});
  assert.ok(sourceCodes(source).includes("AUA_LEGEND_MISSING"));
});

test("Metrolinx AUA without its English applicable-laws line blocks", () => {
  const source = sampleSource({family:"metrolinx-aua",licenceName:"Metrolinx GTFS Access and Use Agreement",
    attribution:[METROLINX_AUA_SECTION_3_LEGEND,METROLINX_AUA_END_USER_LAWS_FR].join("\n")});
  assert.ok(sourceCodes(source).includes("AUA_LAWS_MISSING"));
});

test("Metrolinx AUA without its French applicable-laws line blocks", () => {
  const source = sampleSource({family:"metrolinx-aua",licenceName:"Metrolinx GTFS Access and Use Agreement",
    attribution:[METROLINX_AUA_SECTION_3_LEGEND,METROLINX_AUA_END_USER_LAWS_EN].join("\n")});
  assert.ok(sourceCodes(source).includes("AUA_LAWS_MISSING"));
});

test("AUA source carrying OGL terms is flagged as mixed", () => {
  const source = sampleSource({family:"metrolinx-aua",licenceName:"Metrolinx GTFS Access and Use Agreement",
    attribution:[METROLINX_AUA_SECTION_3_LEGEND,METROLINX_AUA_END_USER_LAWS_EN,
      METROLINX_AUA_END_USER_LAWS_FR,METROLINX_OGL_LINE].join("\n")});
  assert.ok(sourceCodes(source).includes("MIXED_METROLINX_TERMS"));
});

test("Metrolinx OGL source needs OGL line, not the separate AUA legend", () => {
  const source = sampleSource({family:"metrolinx-ogl",licenceName:"Open Government Licence – Ontario – Metrolinx",
    attribution:METROLINX_OGL_LINE});
  assert.equal(sourceCodes(source).includes("OGL_LINE_MISSING"),false);
  assert.equal(sourceCodes(source).includes("MIXED_METROLINX_TERMS"),false);
  assert.equal(auditOfflineBundle(withSource(source)).blocked,false);
});

test("Metrolinx OGL source lacking its line blocks", () => {
  const source = sampleSource({family:"metrolinx-ogl",licenceName:"Open Government Licence – Ontario – Metrolinx",
    attribution:"Metrolinx data"});
  assert.ok(sourceCodes(source).includes("OGL_LINE_MISSING"));
});

test("Metrolinx OGL source carrying AUA legend is flagged as mixed", () => {
  const source = sampleSource({family:"metrolinx-ogl",licenceName:"Open Government Licence – Ontario – Metrolinx",
    attribution:METROLINX_OGL_LINE + "\n" + METROLINX_AUA_SECTION_3_LEGEND});
  assert.ok(sourceCodes(source).includes("MIXED_METROLINX_TERMS"));
});

test("LTC requires recorded attribution and terms, not provider-name inference", () => {
  const good = sampleSource({family:"ltc",licenceName:"LTC Open Data Terms of Use",
    attribution:"London Transit Commission open data"});
  assert.equal(auditOfflineBundle(withSource(good)).blocked,false);
  const omitted = {...good,attribution:"Attribution omitted"};
  assert.ok(sourceCodes(omitted).includes("LTC_NOTICE_MISSING"));
  const unknown = {...good,licenceName:"UNKNOWN"};
  assert.ok(sourceCodes(unknown).includes("LICENCE_UNKNOWN"));
});

test("permission UNKNOWN always blocks, irrespective of catalogue family", () => {
  for (const family of ["osm","metrolinx-aua","metrolinx-ogl","ltc","other"] as const) {
    const source = sampleSource({family,redistributionPermission:"UNKNOWN"});
    assert.ok(sourceCodes(source).includes("REDISTRIBUTION_UNKNOWN"),family);
  }
});

test("explicitly denied redistribution always blocks", () => {
  const source = sampleSource({redistributionPermission:"NO"});
  assert.ok(sourceCodes(source).includes("REDISTRIBUTION_DENIED"));
});

test("missing licence evidence remains blocking when files match hashes", () => {
  const source = sampleSource({licenceEvidence:"UNKNOWN"});
  const result = auditOfflineBundle(withSource(source));
  assert.equal(result.blocked,true);
  assert.ok(result.evidence.findings.some((finding) => finding.code === "LICENCE_UNKNOWN"));
});

test("source dates remain UNKNOWN, not filled from current locale or runtime", () => {
  const source = sampleSource({datasetDate:"UNKNOWN"});
  const bundle = withSource(source);
  const report = makeOfflineReport(bundle,auditOfflineBundle(bundle),"fr");
  assert.ok(report.text.includes("Données en date du\u00a0: UNKNOWN"));
  assert.ok(report.html.includes("UNKNOWN"));
  assert.ok(!report.json.includes('"datasetDate": "2026-11-16"'));
});

test("reports show the actual recorded Metrolinx AUA text instead of a summary", () => {
  const source = sampleSource({family:"metrolinx-aua",licenceName:"Metrolinx GTFS Access and Use Agreement",
    attribution:[METROLINX_AUA_SECTION_3_LEGEND,METROLINX_AUA_END_USER_LAWS_EN,METROLINX_AUA_END_USER_LAWS_FR].join("\n")});
  const bundle = withSource(source);
  const text = makeOfflineReport(bundle,auditOfflineBundle(bundle),"en").text;
  assert.ok(text.includes(METROLINX_AUA_SECTION_3_LEGEND));
  assert.ok(text.includes(METROLINX_AUA_END_USER_LAWS_EN));
  assert.ok(text.includes(METROLINX_AUA_END_USER_LAWS_FR));
});

test("reports preserve French legal notice with typographic apostrophes", () => {
  const source = sampleSource({family:"metrolinx-aua",licenceName:"Metrolinx GTFS Access and Use Agreement",
    attribution:[METROLINX_AUA_SECTION_3_LEGEND,METROLINX_AUA_END_USER_LAWS_EN,METROLINX_AUA_END_USER_LAWS_FR].join("\n")});
  const bundle = withSource(source);
  const text = makeOfflineReport(bundle,auditOfflineBundle(bundle),"fr").text;
  assert.ok(text.includes("lorsqu’ils"));
  assert.ok(text.includes(METROLINX_AUA_END_USER_LAWS_FR));
});

test("the offline report never selects a new legal regime from an asset filename", () => {
  const bundle = fixtureBundle();
  const changed = withAssets(bundle,[fixtureAsset({path:"metrolinx-ogl-map.html"}),bundle.assets[1]!]);
  const report = makeOfflineReport(changed,auditOfflineBundle(changed),"en");
  assert.equal(report.text.includes(METROLINX_OGL_LINE),false);
  assert.equal(report.text.includes(METROLINX_AUA_SECTION_3_LEGEND),false);
});

test("one source catalogue remains reachable from the public index", () => {
  assert.equal(OSM_ATTRIBUTION_LINE,"© OpenStreetMap contributors");
  assert.equal(METROLINX_OGL_LINE,"Contains information licensed under the Open Government Licence - Ontario - Metrolinx.");
  assert.ok(METROLINX_AUA_SECTION_3_LEGEND.startsWith("Data used in this product or service"));
});

test("reports never include an undeclared transit provider", () => {
  const report = makeOfflineReport(fixtureBundle(),auditOfflineBundle(fixtureBundle()),"en");
  assert.equal(/miway/iu.test(report.text),false);
  assert.equal(/miway/iu.test(report.html),false);
});
