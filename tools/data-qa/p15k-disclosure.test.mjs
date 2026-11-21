import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  accessDisclosureShape, auditDisclosures, controlShape, entryShape,
  evidenceShape, pageShape, sourceShape,
} from './p15k-disclosure.mjs';
import {
  catalogue, clone, control, disclosure, entry, evidence,
  knownCatalogue, page, sourceRecord, status, switchEntry,
} from './p15k-fixtures.mjs';

function bad(input, code) {
  const report = auditDisclosures(input);
  assert.equal(report.ok, false, JSON.stringify(report));
  assert.ok(report.findings.some(item => item.code === code), JSON.stringify(report));
}
function changeEntry(id, patch) {
  const input = catalogue();
  return { ...input, entries: input.entries.map(item => item.id === id ? { ...item, ...patch } : item) };
}
function changePage(patch) { return catalogue({ pages: [page(patch)] }); }
function changeControl(patch) { return catalogue({ controls: [control(patch)] }); }
function changeDisclosure(patch) { return catalogue({ disclosures: [disclosure(patch)] }); }

describe('P15K offline disclosure schemas', () => {
  it('accepts a heading with EN and FR text', () => {
    assert.equal(entryShape(entry()), true);
  });
  it('accepts an explicit UNKNOWN status', () => {
    assert.equal(entryShape(status()), true);
  });
  it('rejects unrecognised entry kinds', () => {
    assert.equal(entryShape(entry({ kind: 'banner-ad' })), false);
  });
  it('rejects malformed entry identifiers', () => {
    assert.equal(entryShape(entry({ id: '../data' })), false);
  });
  it('rejects missing French copy', () => {
    assert.equal(entryShape(entry({ fr: null })), false);
  });
  it('rejects fractional target declarations', () => {
    assert.equal(entryShape(switchEntry({ minimumTargetPx: 43.5 })), false);
  });
  it('accepts a complete offline page mapping', () => {
    assert.equal(pageShape(page()), true);
  });
  it('rejects remote French page targets', () => {
    assert.equal(pageShape(page({ frPath: 'https://example.org/' })), false);
  });
  it('rejects a non-array set of copy keys', () => {
    assert.equal(Boolean(pageShape(page({ keyRefs: null }))), false);
  });
  it('accepts a public source attribution', () => {
    assert.equal(sourceShape(sourceRecord()), true);
  });
  it('rejects missing source date in the source stamp', () => {
    assert.equal(sourceShape(sourceRecord({ stamp: { ...sourceRecord().stamp, observedOn: '' } })), false);
  });
  it('accepts a complete UNKNOWN disclosure', () => {
    assert.equal(accessDisclosureShape(disclosure()), true);
  });
  it('accepts a known value with an observation link', () => {
    assert.equal(accessDisclosureShape(knownCatalogue().disclosures[0]), true);
  });
  it('rejects unsupported access keywords', () => {
    assert.equal(accessDisclosureShape(disclosure({ access: 'POSSIBLE' })), false);
  });
  it('accepts an interactive link target', () => {
    assert.equal(controlShape(control()), true);
  });
  it('rejects negative focus order', () => {
    assert.equal(controlShape(control({ focusIndex: -1 })), false);
  });
  it('rejects an unrecognised interactive control type', () => {
    assert.equal(controlShape(control({ type: 'div-button' })), false);
  });
  it('accepts source-stamped access evidence', () => {
    assert.equal(evidenceShape(evidence()), true);
  });
  it('rejects unsupported observation features', () => {
    assert.equal(evidenceShape(evidence({ feature: 'guessed-feature' })), false);
  });
});

describe('P15K bilingual publication catalogue', () => {
  it('accepts a minimal UNKNOWN-only catalogue', () => {
    const report = auditDisclosures(catalogue());
    assert.equal(report.ok, true, JSON.stringify(report));
  });
  it('accepts a known claim with current dated evidence', () => {
    const report = auditDisclosures(knownCatalogue());
    assert.equal(report.ok, true, JSON.stringify(report));
  });
  it('reports all inventory counts', () => {
    const report = auditDisclosures(catalogue());
    assert.equal(report.summary.pages, 1);
    assert.equal(report.summary.controls, 1);
  });
  it('rejects null catalogue input', () => {
    bad(null, 'SHAPE');
  });
  it('rejects a missing French page mapping', () => {
    bad(changePage({ frPath: null }), 'SHAPE');
  });
  it('rejects duplicate entries', () => {
    bad(catalogue({ entries: [entry(), entry(), status(), switchEntry()] }), 'DUPLICATE');
  });
  it('rejects duplicate page identifiers', () => {
    bad(catalogue({ pages: [page(), page()] }), 'DUPLICATE');
  });
  it('rejects duplicated control identifiers', () => {
    bad(catalogue({ controls: [control(), control()] }), 'DUPLICATE');
  });
  it('rejects duplicated disclosure identifiers', () => {
    bad(catalogue({ disclosures: [disclosure(), disclosure()] }), 'DUPLICATE');
  });
  it('rejects missing English copy', () => {
    bad(changeEntry('heading-one', { en: '' }), 'SHAPE');
  });
  it('rejects ordinary French apostrophes', () => {
    bad(changeEntry('heading-one', { fr: "L'acces" }), 'TYPOGRAPHY');
  });
  it('rejects ordinary spaces before French colons', () => {
    bad(changeEntry('heading-one', { fr: 'Source : données' }), 'TYPOGRAPHY');
  });
  it('accepts nonbreaking spaces before French colons', () => {
    assert.equal(auditDisclosures(changeEntry('heading-one', { fr: 'Source\u00a0: données' })).ok, true);
  });
  it('rejects different placeholder sets in translations', () => {
    bad(changeEntry('heading-one', { en: 'Place {name}', fr: 'Lieu {place}' }), 'LANGUAGE');
  });
  it('accepts matching translated placeholders', () => {
    assert.equal(auditDisclosures(changeEntry('heading-one', { en: 'Place {name}', fr: 'Lieu {name}' })).ok, true);
  });
  it('rejects unmatched curly braces', () => {
    bad(changeEntry('heading-one', { en: 'Place {bad' }), 'LANGUAGE');
  });
  it('rejects script markup inside French text', () => {
    bad(changeEntry('heading-one', { fr: '<script>bad()</script>' }), 'UNSAFE');
  });
  it('rejects inline click handlers', () => {
    bad(changeEntry('heading-one', { en: '<span onclick="bad()">X</span>' }), 'UNSAFE');
  });
  it('rejects personal email addresses in the catalogue', () => {
    bad(changeEntry('heading-one', { en: 'john@example.org' }), 'UNSAFE');
  });
  it('rejects a source licence missing from a known entry', () => {
    const input = knownCatalogue();
    input.sources[0].stamp.licence = '';
    bad(input, 'SHAPE');
  });
  it('rejects proprietary source licences', () => {
    const input = knownCatalogue();
    input.sources[0].stamp.licence = 'proprietary';
    bad(input, 'SHAPE');
  });
  it('rejects a source that is too old for the package', () => {
    const input = knownCatalogue();
    input.sources[0].stamp.observedOn = '2025-01-01';
    bad(input, 'STALE');
  });
  it('rejects a held source reference', () => {
    const input = knownCatalogue();
    input.sources[0].stamp.source = 'MiWay';
    bad(input, 'SHAPE');
  });
  it('rejects ODbL source content outside its silo', () => {
    const input = knownCatalogue();
    input.sources[0].stamp.licence = 'ODbL-1.0';
    bad(input, 'SILO');
  });
  it('accepts ODbL material isolated in the ODbL silo', () => {
    const input = knownCatalogue();
    input.sources[0].stamp.licence = 'ODbL-1.0';
    input.sources[0].silo = 'odbl';
    assert.equal(auditDisclosures(input).ok, true);
  });
  it('rejects missing offline attribution assets', () => {
    const input = knownCatalogue();
    input.offlineAssets = input.offlineAssets.filter(path => path !== 'sources/fixture.json');
    bad(input, 'REFERENCE');
  });
  it('rejects missing local French page files', () => {
    bad(catalogue({ offlineAssets: ['en/route.html'] }), 'REFERENCE');
  });
  it('rejects remote links in the language switch', () => {
    bad(changeEntry('language-one', { href: 'https://example.org/fr' }), 'SHAPE');
  });
  it('rejects missing link destinations', () => {
    const input = changeEntry('language-one', { href: undefined });
    bad(input, 'PATH');
  });
  it('rejects missing page-heading copy keys', () => {
    bad(changePage({ headingKey: 'missing' }), 'REFERENCE');
  });
  it('rejects missing status copy keys', () => {
    bad(changePage({ statusKey: 'missing' }), 'REFERENCE');
  });
  it('rejects missing language switch copy keys', () => {
    bad(changePage({ langSwitchKey: 'missing' }), 'REFERENCE');
  });
  it('rejects a heading pointing to an action entry', () => {
    bad(changePage({ headingKey: 'language-one' }), 'SHAPE');
  });
  it('rejects duplicate copy references within a page', () => {
    bad(changePage({ keyRefs: [...page().keyRefs, 'status-one'] }), 'DUPLICATE');
  });
  it('rejects same English and French local page path', () => {
    bad(changePage({ frPath: 'en/route.html' }), 'PATH');
  });
  it('rejects missing locale directory prefixes', () => {
    bad(changePage({ enPath: 'routes.html' }), 'LANGUAGE');
  });
  it('rejects duplicate offline paths', () => {
    bad(catalogue({ offlineAssets: ['en/route.html', 'en/route.html', 'fr/route.html'] }), 'PATH');
  });
  it('rejects missing controls referenced by pages', () => {
    bad(changeControl({ pageId: 'other-page' }), 'REFERENCE');
  });
  it('rejects buttons under 44px wide', () => {
    bad(changeControl({ widthPx: 43 }), 'TARGET');
  });
  it('rejects buttons under 44px high', () => {
    bad(changeControl({ heightPx: 43 }), 'TARGET');
  });
  it('accepts exactly 44px on both axes', () => {
    assert.equal(auditDisclosures(changeControl({ widthPx: 44, heightPx: 44 })).ok, true);
  });
  it('rejects interactive copy targets below 44px', () => {
    bad(changeEntry('language-one', { minimumTargetPx: 40 }), 'TARGET');
  });
  it('rejects missing accessible control labels', () => {
    bad(changeControl({ labelledBy: 'missing-key' }), 'REFERENCE');
  });
  it('rejects controls whose copy is not in the page', () => {
    bad(changeControl({ copyKey: 'missing-key' }), 'REFERENCE');
  });
  it('rejects focus-order collisions within a page', () => {
    bad(catalogue({ controls: [control(), control({ id: 'control-two' })] }), 'DUPLICATE');
  });
  it('accepts separately ordered controls', () => {
    const input = catalogue({ controls: [control(), control({ id: 'control-two', focusIndex: 2 })] });
    assert.equal(auditDisclosures(input).ok, true);
  });
  it('rejects known status text without source provenance', () => {
    bad(changeEntry('status-one', { status: 'YES', en: 'Known', fr: 'Connu' }), 'EVIDENCE');
  });
  it('rejects replacement of UNKNOWN with a fabricated copy label', () => {
    bad(changeEntry('status-one', { en: 'Probably yes', fr: 'Probablement oui' }), 'UNKNOWN');
  });
  it('rejects known disclosures without current observations', () => {
    bad(changeDisclosure({ access: 'YES' }), 'EVIDENCE');
  });
  it('rejects UNKNOWN with a non-null source claim', () => {
    bad(changeDisclosure({ sourceId: 'source-one' }), 'UNKNOWN');
  });
  it('rejects known access with contradictory observations', () => {
    const input = knownCatalogue();
    input.evidence.push(evidence({ id: 'evidence-two', access: 'NO' }));
    input.disclosures[0].evidenceIds.push('evidence-two');
    bad(input, 'CONFLICT');
  });
  it('rejects evidence linked to missing sources', () => {
    const input = knownCatalogue();
    input.evidence[0].sourceId = 'missing-source';
    bad(input, 'REFERENCE');
  });
  it('rejects a stale evidence observation', () => {
    const input = knownCatalogue();
    input.evidence[0].recordedOn = '2020-01-01';
    bad(input, 'STALE');
  });
  it('rejects an unsupported source reference on a disclosure', () => {
    const input = knownCatalogue();
    input.disclosures[0].sourceId = 'missing-source';
    bad(input, 'EVIDENCE');
  });
  it('retains the caller input without mutation', () => {
    const input = knownCatalogue();
    const snapshot = clone(input);
    auditDisclosures(input);
    assert.deepEqual(input, snapshot);
  });
  it('reports bilingual findings for unknown source references', () => {
    const report = auditDisclosures(changePage({ sourceIds: ['missing-source'] }));
    assert.ok(report.findings.every(item => item.en && item.fr));
  });
});
