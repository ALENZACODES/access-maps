import test from"node:test";import assert from"node:assert/strict";import{auditCatalog,auditFrenchTypography,compareCatalogs,auditOsmPairs,pairCoverage,placeholderUsage}from"./locale-parity-audit.mjs";import{fixture}from"./locale-parity-fixture.mjs";
test("complete fixture has no blocks",()=>assert.equal(auditCatalog(fixture()).counts.block,0));test("missing French blocks",()=>{const x=fixture();x.entries=x.entries.filter(e=>e.locale==="en");assert.ok(auditCatalog(x).findings.some(f=>f.code==="FR_ENTRY_MISSING"))});test("missing English blocks",()=>{const x=fixture();x.entries=x.entries.filter(e=>e.locale==="fr");assert.ok(auditCatalog(x).findings.some(f=>f.code==="EN_ENTRY_MISSING"))});test("duplicate French blocks",()=>{const x=fixture();x.entries.push({...x.entries[1],id:"entry-fr-copy"});assert.ok(auditCatalog(x).findings.some(f=>f.code==="FR_ENTRY_DUPLICATED"))});test("kind mismatch blocks",()=>{const x=fixture();x.entries[1].kind="other";assert.ok(auditCatalog(x).findings.some(f=>f.code==="KIND_MISMATCH"))});test("source mismatch blocks",()=>{const x=fixture();x.entries[1].sourceId="other-source";assert.ok(auditCatalog(x).findings.some(f=>f.code==="SOURCE_ID_MISMATCH"))});test("licence mismatch blocks",()=>{const x=fixture();x.entries[1].licence="Other";assert.ok(auditCatalog(x).findings.some(f=>f.code==="LICENCE_MISMATCH"))});test("required flag mismatch high",()=>{const x=fixture();x.entries[1].required=false;assert.ok(auditCatalog(x).findings.some(f=>f.code==="REQUIRED_FLAG_MISMATCH"))});test("token mismatch blocks",()=>{const x=fixture();x.entries[0].text="Hello {{name}}";x.entries[0].tokens=["name"];assert.ok(auditCatalog(x).findings.some(f=>f.code==="TOKEN_PARITY_MISMATCH"))});test("EN manifest mismatch high",()=>{const x=fixture();x.entries[0].tokens=["wrong"];assert.ok(auditCatalog(x).findings.some(f=>f.code==="EN_TOKEN_MANIFEST_MISMATCH"))});test("FR manifest mismatch high",()=>{const x=fixture();x.entries[1].tokens=["wrong"];assert.ok(auditCatalog(x).findings.some(f=>f.code==="FR_TOKEN_MANIFEST_MISMATCH"))});test("French colon NBSP",()=>assert.ok(auditFrenchTypography("Licence : ODbL").some(f=>f.code==="FR_NBSP_REQUIRED")));test("French question NBSP",()=>assert.ok(auditFrenchTypography("Prêt ?").some(f=>f.code==="FR_NBSP_REQUIRED")));test("French exclamation NBSP",()=>assert.ok(auditFrenchTypography("Attention !").some(f=>f.code==="FR_NBSP_REQUIRED")));test("French guillemets narrow spaces",()=>assert.ok(auditFrenchTypography("« mot »").some(f=>f.code==="FR_GUILLEMET_SPACING")));test("correct French spaces accepted",()=>assert.equal(auditFrenchTypography("Licence\u00a0: «\u202fmot\u202f»\u202f!").length,0));test("prohibited wording flagged",()=>assert.ok(auditFrenchTypography("Veuillez vérifier").some(f=>f.code==="PROHIBITED_WORDING")));test("OSM exact credit audit",()=>{const x=fixture();x.entries[0].text="© OpenStreetMap";assert.ok(auditOsmPairs(x).length>0)});test("pair coverage complete",()=>assert.equal(pairCoverage(fixture()).complete,1));test("compare detects text",()=>{const a=fixture(),b=structuredClone(a);b.entries[1].text="Texte modifié";assert.ok(compareCatalogs(a,b).some(x=>x.field==="text"))});test("compare detects removal",()=>{const a=fixture(),b=structuredClone(a);b.entries.pop();assert.ok(compareCatalogs(a,b).some(x=>x.kind==="entry-removed"))});test("placeholder usage",()=>{const x=fixture();for(const e of x.entries){e.text="Hello {{name}}";e.tokens=["name"]}assert.equal(placeholderUsage(x)[0].token,"name")});

const NBSP = "\u00a0";
const NARROW = "\u202f";

for (const [mark, required] of [[":", NBSP], [";", NARROW], ["!", NARROW], ["?", NARROW]]) {
  test(`audit requires the exact single space before ${mark}`, () => {
    const otherWidth = required === NBSP ? NARROW : NBSP;
    assert.deepEqual(auditFrenchTypography(`Source${required}${mark} Suite`), []);
    for (const gap of ["", " ", "\t", "\n", "\u2009", otherWidth, " " + required, required.repeat(2)]) {
      const findings = auditFrenchTypography(`Source${gap}${mark} Suite`, "entries.notice.text");
      const result = findings.find(f => f.code === "FR_NBSP_REQUIRED");
      assert.ok(result, JSON.stringify(gap));
      assert.equal(result.path, "entries.notice.text");
      assert.equal(result.severity, "high");
      assert.deepEqual(result.detail, [{
        index: "Source".length + gap.length,
        mark,
        expected: required === NBSP ? "U+00A0" : "U+202F",
      }]);
    }
  });
}

test("audit checks both inner sides of every pair of French quotation marks", () => {
  assert.deepEqual(auditFrenchTypography(`«${NARROW}Un${NARROW}» et «${NARROW}deux${NARROW}»`), []);
  for (const bad of ["", " ", NBSP, "\u2009", "\t", NARROW.repeat(2)]) {
    for (const mark of ["«", "»"]) {
      const affected = mark === "«" ? `«${bad}mot${NARROW}»` : `«${NARROW}mot${bad}»`;
      const text = `«${NARROW}Correct${NARROW}» et ${affected}`;
      const [issue] = auditFrenchTypography(text);
      assert.equal(issue.code, "FR_GUILLEMET_SPACING");
      assert.deepEqual(issue.detail, [{ index: text.lastIndexOf(mark), mark, expected: "U+202F" }]);
    }
  }
});

test("reports all bad marks without counting separate occurrences as separate high findings", () => {
  const text = `Texte: «a»; suite${NARROW}! Fin?`;
  const findings = auditFrenchTypography(text);
  assert.deepEqual(findings.map(f => f.code), ["FR_NBSP_REQUIRED", "FR_GUILLEMET_SPACING"]);
  assert.deepEqual(findings[0].detail.map(f => f.mark), [":", ";", "?"]);
  assert.deepEqual(findings[1].detail.map(f => f.mark), ["«", "»"]);
  for (const issue of findings) {
    for (const location of issue.detail) assert.equal(text[location.index], location.mark);
  }
});

test("URL, query and clock delimiters are distinct from punctuation in adjacent prose", () => {
  const url = "https://cartes.example:8443/fiche;2?mode=fr!oui";
  const valid = `À 09:30:45, consulter «${NARROW}${url}${NARROW}»${NARROW}; mise à jour${NBSP}: 2026-11-15T19:45:00-05:00.`;
  assert.deepEqual(auditFrenchTypography(valid), []);
  const sentence = `À 11:00, ouvrir ${url}${NARROW}? Sinon: réessayer!`;
  const [issue] = auditFrenchTypography(sentence);
  assert.deepEqual(issue.detail.map(d => d.index), [sentence.indexOf("Sinon:") + 5, sentence.length - 1]);
  const quoted = `«${url}»`;
  assert.deepEqual(auditFrenchTypography(quoted)[0].detail.map(d => d.index), [0, quoted.length - 1]);
  assert.ok(auditFrenchTypography("Ouvrir https://cartes.example!").some(f => f.code === "FR_NBSP_REQUIRED"));
  assert.ok(auditFrenchTypography("Source:inconnue").some(f => f.code === "FR_NBSP_REQUIRED"));
});

test("lone and duplicate French entries each receive their own audit path", () => {
  const catalog = fixture();
  const item = { ...catalog.entries[1], kind: "data-source", text: "Source: inconnue" };
  catalog.entries = [item, { ...item, id: "fr-alternate", text: "Autre ?" }];
  const findings = auditCatalog(catalog).findings;
  assert.ok(findings.some(f => f.code === "EN_ENTRY_MISSING"));
  assert.ok(findings.some(f => f.code === "FR_ENTRY_DUPLICATED"));
  assert.deepEqual(findings.filter(f => f.code === "FR_NBSP_REQUIRED").map(f => f.path).sort(),
    ["entries.fr-alternate.text", "pairs.osm-credit.fr.text"]);
});

test("the English half and source URL fields do not receive French prose findings", () => {
  const catalog = fixture();
  catalog.entries[0].kind = catalog.entries[1].kind = "data-source";
  catalog.entries[0].text = "Source: public; review?";
  catalog.entries[1].text = `Source${NBSP}: publique${NARROW}; à consulter${NARROW}?`;
  for (const item of catalog.entries) item.sourceUrl = "https://notice.example/query?lang=fr;v=2";
  assert.deepEqual(auditCatalog(catalog).findings, []);
});
