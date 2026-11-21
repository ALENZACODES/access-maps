import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allCopyKeysPaired, copyKeys, COPY, issueMessage, message } from './copy.mjs';
import { isFrenchTypography, reviewManifest } from './schema.mjs';
import { compareManifests } from './compare.mjs';
import {
  categories, combinedFindings, findingLevels, findingsCsv, groupedFindings,
  paginateFindings, safeReport, safeReportJson, searchFindings, sortFindings,
  sourceInventory, sourceLicenceCounts, summarizeChanges, summaryForScreen,
} from './report.mjs';
import { later, manifest, POLICY, stamp } from './test-helpers.mjs';

function blockedAudit() {
  const input = manifest(); input.assets[0].path = '../private';
  return reviewManifest(input, POLICY);
}
function findings() {
  return combinedFindings(blockedAudit());
}

describe('P15L privacy-preserving reports', () => {
  it('keeps a passing local report', () => assert.equal(safeReport(reviewManifest(manifest(), POLICY), null).ok, true));
  it('reports a blocking local result', () => assert.equal(safeReport(blockedAudit(), null).ok, false));
  it('includes the review date', () => assert.equal(safeReport(blockedAudit(), null).asOf, POLICY.asOf));
  it('preserves UNKNOWN observation counts', () => assert.equal(safeReport(reviewManifest(manifest(), POLICY), null).counts.unknown, 1));
  it('never exports input source descriptions into findings', () => {
    const report = safeReportJson(blockedAudit(), null);
    assert.ok(!report.includes('Municipal open information'));
  });
  it('omits source references from exported CSV', () => {
    const csv = findingsCsv(findings());
    assert.ok(!csv.includes('sources/source-a.json'));
  });
  it('exports CSV with a stable header', () => assert.ok(findingsCsv(findings()).startsWith('"origin","level","code","location"')));
  it('uses CRLF CSV row separators', () => assert.ok(findingsCsv(findings()).includes('\r\n')));
  it('escapes spreadsheet formula-like cells', () => {
    const csv = findingsCsv([{ origin: '=HYPERLINK(1)', severity: 'ERROR', code: 'X', path: 'a' }]);
    assert.ok(csv.includes("'="));
  });
  it('quotes CSV embedded quotation marks', () => {
    const csv = findingsCsv([{ origin: 'test', severity: 'ERROR', code: 'X', path: 'a"b' }]);
    assert.ok(csv.includes('a""b'));
  });
  it('keeps JSON reports parseable', () => assert.equal(JSON.parse(safeReportJson(blockedAudit(), null)).schemaVersion, 1));
  it('supports French JSON issue wording', () => {
    const result = safeReport(blockedAudit(), null, 'fr');
    assert.equal(result.locale, 'fr');
    assert.ok(result.findings[0].message.length > 5);
  });
  it('keeps codes intact across locales', () => {
    const a = safeReport(blockedAudit(), null, 'en').findings;
    const b = safeReport(blockedAudit(), null, 'fr').findings;
    assert.deepEqual(a.map(item => item.code), b.map(item => item.code));
  });
  it('returns source inventories without inventing missing values', () => {
    const result = sourceInventory(manifest());
    assert.equal(result[0].licence, 'OGL-ON-1.0');
  });
  it('filters sources by licence', () => assert.equal(sourceInventory(manifest(), 'OGL-ON').length, 1));
  it('filters sources by case-insensitive name', () => assert.equal(sourceInventory(manifest(), 'MUNICIPAL').length, 1));
  it('returns an empty inventory for unmatched query', () => assert.deepEqual(sourceInventory(manifest(), 'does-not-exist'), []));
  it('groups licence totals accurately', () => assert.deepEqual(sourceLicenceCounts(manifest()), [{ licence: 'OGL-ON-1.0', count: 1 }]));
  it('groups multiple sources with the same licence', () => {
    const input = manifest(); input.sources.push(stamp('source-b'));
    assert.equal(sourceLicenceCounts(input)[0].count, 2);
  });
  it('provides one issue category for an invalid asset', () => assert.ok(categories(findings()).includes('ASSET_SCHEMA')));
  it('returns category groups with counts', () => assert.equal(groupedFindings(findings())[0].count, 1));
  it('counts blocking findings separately from notices', () => assert.equal(findingLevels(findings()).errors, 1));
  it('filters errors only', () => assert.equal(searchFindings(findings(), { level: 'NOTICE' }).length, 0));
  it('filters findings by exact category', () => assert.equal(searchFindings(findings(), { code: 'ASSET_SCHEMA' }).length, 1));
  it('filters findings by case-insensitive query', () => assert.equal(searchFindings(findings(), { query: 'asset_schema' }).length, 1));
  it('filters findings by path prefix', () => assert.equal(searchFindings(findings(), { query: '$.assets' }).length, 1));
  it('returns no matches for unrelated query', () => assert.deepEqual(searchFindings(findings(), { query: 'unrelated' }), []));
  it('defaults page count to one for empty lists', () => assert.equal(paginateFindings([]).pages, 1));
  it('accepts the first page', () => assert.equal(paginateFindings(findings()).page, 1));
  it('clamps page values below one', () => assert.equal(paginateFindings(findings(), -100).page, 1));
  it('clamps pages beyond the last page', () => assert.equal(paginateFindings(findings(), 200).page, 1));
  it('rejects an unsupported page size', () => assert.equal(paginateFindings(findings(), 1, 3).perPage, 10));
  it('accepts a supported page size', () => assert.equal(paginateFindings(findings(), 1, 20).perPage, 20));
  it('orders findings by category when requested', () => assert.equal(sortFindings(findings(), 'category').length, 1));
  it('orders findings by path when requested', () => assert.equal(sortFindings(findings(), 'location').length, 1));
  it('does not mutate finding arrays while sorting', () => {
    const input = findings(); const previous = [...input]; sortFindings(input, 'severity');
    assert.deepEqual(input, previous);
  });
  it('includes comparison summary counts when supplied', () => {
    const after = later(); after.places.push({ ...manifest().places[0], id: 'place-b' });
    const comparison = compareManifests(manifest(), after, { validation: POLICY });
    assert.equal(summarizeChanges(comparison).addedPlaces, 1);
  });
  it('excludes private source details from comparison summary', () => {
    const comparison = compareManifests(manifest(), later(), { validation: POLICY });
    assert.ok(!JSON.stringify(summarizeChanges(comparison)).includes('Municipal'));
  });
  it('shows the comparison state in screen summary', () => {
    const comparison = compareManifests(manifest(), later(), { validation: POLICY });
    assert.equal(summaryForScreen(reviewManifest(later(), POLICY), comparison).hasComparison, true);
  });
  it('defaults to no comparison state when absent', () => {
    assert.equal(summaryForScreen(reviewManifest(manifest(), POLICY), null).hasComparison, false);
  });
});

describe('P15L complete bilingual strings and safe copy', () => {
  it('has exactly matching EN and FR keys', () => assert.equal(allCopyKeysPaired(), true));
  it('has the same key count for both languages', () => assert.equal(copyKeys('en').length, copyKeys('fr').length));
  it('renders French title from the dictionary', () => assert.match(message('fr', 'title'), /hors ligne/));
  it('renders English title from the dictionary', () => assert.match(message('en', 'title'), /Offline/));
  it('falls back to English for unsupported locale', () => assert.equal(message('de', 'title'), message('en', 'title')));
  it('rejects unknown localization keys', () => assert.throws(() => message('en', 'absent')));
  it('has no empty English labels', () => assert.ok(Object.values(COPY.en).every(value => value.length > 0)));
  it('has no empty French labels', () => assert.ok(Object.values(COPY.fr).every(value => value.length > 0)));
  it('keeps UNKNOWN literal in both languages', () => {
    assert.equal(message('fr', 'unknownToken'), 'UNKNOWN');
    assert.equal(message('en', 'unknownToken'), 'UNKNOWN');
  });
  it('uses correct French punctuation across the entire dictionary', () => {
    for (const [key, value] of Object.entries(COPY.fr)) {
      assert.equal(isFrenchTypography(value), true, `${key}: ${value}`);
    }
  });
  it('defines a French message for every blocking issue', () => assert.notEqual(issueMessage('fr', 'SOURCE_SCHEMA'), ''));
  it('defines an English message for every blocking issue', () => assert.notEqual(issueMessage('en', 'SOURCE_SCHEMA'), ''));
  it('offers a localized fallback for unknown issue codes', () => assert.notEqual(issueMessage('fr', 'MISSING_CODE'), issueMessage('en', 'MISSING_CODE')));
  it('does not describe missing data as available', () => assert.match(message('en', 'aboutText'), /UNKNOWN/));
  it('does not make unsupported status claims', () => {
    assert.doesNotMatch(JSON.stringify(COPY), /real-time|partnership|guarantee|AAA-conformant/iu);
  });
  it('explains the local-only file policy in both languages', () => {
    assert.match(message('en', 'fileHelp'), /Nothing is uploaded/);
    assert.match(message('fr', 'fileHelp'), /Rien n’est téléversé/);
  });
  it('keeps source licence labels visible in both languages', () => {
    assert.equal(message('en', 'licence'), 'Licence');
    assert.equal(message('fr', 'licence'), 'Licence');
  });
});

it('displays tier zero and distinguishes a missing stamp from an imported source', () => {
  const input = manifest();
  assert.equal(sourceInventory(input)[0].tier, '0');
  assert.equal(sourceInventory(input)[0].retrievedOn, '2026-11-12');
  delete input.sources[0].tier;
  delete input.sources[0].retrievedOn;
  assert.equal(sourceInventory(input)[0].tier, 'UNKNOWN');
  assert.equal(sourceInventory(input)[0].retrievedOn, 'UNKNOWN');
});
