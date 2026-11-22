import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./locale-parity-fixture.mjs";
import { auditCatalog, auditFrenchTypography, compareCatalogs } from "./locale-parity-audit.mjs";
import { extractTokens } from "./locale-parity-core.mjs";

function hasFinding(catalog, code) {
  return auditCatalog(catalog).findings.some(finding => finding.code === code);
}

// Keep the original numbered inputs without copying each assertion 180 times.
test("placeholders with a numeric suffix are extracted and agree across both notices", () => {
  for (let i = 1; i <= 180; i++) {
    const underscored = `field_${i}`;
    assert.deepEqual(extractTokens(`{{${underscored}}}`), [underscored]);
    const catalog = fixture();
    const token = `field${i}`;
    for (const entry of catalog.entries) {
      entry.text = `Message {{${token}}}`;
      entry.tokens = [token];
    }
    assert.equal(hasFinding(catalog, "TOKEN_PARITY_MISMATCH"), false, token);
  }
});

test("labels ending in digits still require a nonbreaking space before the colon", () => {
  for (let i = 1; i <= 180; i++) {
    const invalid = auditFrenchTypography(`Étiquette${i} : valeur`);
    assert.ok(invalid.some(finding => finding.code === "FR_NBSP_REQUIRED"), String(i));
    const valid = auditFrenchTypography(`Libellé${i}\u00a0: valeur`);
    assert.ok(valid.every(finding => finding.code !== "FR_NBSP_REQUIRED"), String(i));
  }
});

test("changing the French licence is surfaced both in the audit and in the comparison", () => {
  const before = fixture();
  for (let i = 1; i <= 180; i++) {
    const after = structuredClone(before);
    after.entries[1].licence = `Licence ${i}`;
    assert.ok(hasFinding(after, "LICENCE_MISMATCH"));
    assert.ok(compareCatalogs(before, after).some(change =>
      change.field === "licence" && change.id === "entry-fr" && change.after === after.entries[1].licence));
  }
});

test("a numbered suffix on the OSM notice is reported as a credit mismatch", () => {
  for (let i = 1; i <= 180; i++) {
    const catalog = fixture();
    catalog.entries[0].text = `© OpenStreetMap contributors [${i}]`;
    assert.ok(hasFinding(catalog, "OSM_CREDIT_NOT_EXACT"), String(i));
  }
});

test("changing French text identifies the changed entry and field", () => {
  const before = fixture();
  for (let i = 1; i <= 180; i++) {
    const after = structuredClone(before);
    after.entries[1].text = `Texte révisé ${i}`;
    assert.ok(compareCatalogs(before, after).some(change =>
      change.id === "entry-fr" && change.field === "text" && change.after === after.entries[1].text));
  }
});

test("required flags and source identifiers are compared between the paired entries", () => {
  const catalog = fixture();
  catalog.entries[1].required = false;
  assert.ok(hasFinding(catalog, "REQUIRED_FLAG_MISMATCH"));
  const other = fixture();
  other.entries[1].sourceId = "alternate-source";
  assert.ok(hasFinding(other, "SOURCE_ID_MISMATCH"));
});

test("licence URL changes preserve the identity of the affected notice pair", () => {
  for (let i = 1; i <= 200; i++) {
    const catalog = fixture();
    catalog.entries[1].licenceUrl = `https://example.org/licence/${i}`;
    assert.ok(hasFinding(catalog, "LICENCE_URL_MISMATCH"), String(i));
  }
});

test("identical placeholders in both sentences still require matching token declarations", () => {
  for (let i = 1; i <= 200; i++) {
    const catalog = fixture();
    const token = `person${i}`;
    catalog.entries[0].text = `Hello {{${token}}}`;
    catalog.entries[0].tokens = [token];
    catalog.entries[1].text = `Bonjour {{${token}}}`;
    catalog.entries[1].tokens = [`wrong${i}`];
    assert.ok(hasFinding(catalog, "FR_TOKEN_MANIFEST_MISMATCH"), token);
  }
});
