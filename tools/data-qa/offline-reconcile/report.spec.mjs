import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COPY, copy, localeKeys, visibleFindings, safeResult, reportJson,
  reportCsv, findingCounts, groupedFindings, textReport, exportFilename,
  readableTotal } from './report.mjs';
import { audit, finding, finish } from './audit.mjs';
import { base, known } from './fixtures.mjs';

const FAIL = finish([finding('SOURCE', '$.sources[0]'),
  finding('UNREFERENCED', '$.sources[1]', 'NOTICE')], { sources: 2 });
const PASS = audit(base());

describe('bilingual report dictionary', () => {
  it('has matching dictionary keys', () => assert.deepEqual(localeKeys().en, localeKeys().fr));
  for (const language of ['en', 'fr']) {
    it(`has a localized heading ${language}`, () => assert.ok(copy(language).heading.length > 15));
    it(`has a localized privacy disclosure ${language}`, () => assert.ok(copy(language).privacy.length > 20));
    it(`preserves UNKNOWN ${language}`, () => assert.equal(copy(language).unknown, 'UNKNOWN'));
    it(`describes offline processing ${language}`, () => assert.ok(copy(language).offline.length > 15));
    it(`has a source label ${language}`, () => assert.ok(copy(language).source));
    it(`has a licence label ${language}`, () => assert.ok(copy(language).licence));
    it(`has an observation date label ${language}`, () => assert.ok(copy(language).date));
    it(`has a CSV export label ${language}`, () => assert.ok(copy(language).exportCsv));
    it(`has a JSON export label ${language}`, () => assert.ok(copy(language).exportJson));
    it(`disallows server uploads by description ${language}`, () => {
      assert.match(copy(language).intro, language === 'fr' ? /serveur/ : /server/);
    });
  }
  it('defaults unknown language to English', () => assert.equal(copy('xx'), COPY.en));
  it('separates language dictionaries', () => assert.notEqual(copy('fr').heading, copy('en').heading));
  it('avoids unsupported source claims', () => {
    const text = JSON.stringify(COPY);
    assert.doesNotMatch(text, /real-time|partnership|guarantee|AAA-conformant/iu);
  });
  it('has curly French apostrophes', () => assert.doesNotMatch(JSON.stringify(COPY.fr), /[a-zà-ÿ]'[a-zà-ÿ]/iu));
});

describe('report finding filters', () => {
  it('lists both findings for all', () => assert.equal(visibleFindings(FAIL).length, 2));
  it('lists one blocking error', () => assert.equal(visibleFindings(FAIL, 'ERROR').length, 1));
  it('lists one notice', () => assert.equal(visibleFindings(FAIL, 'NOTICE').length, 1));
  it('lists no issues for passing record', () => assert.deepEqual(visibleFindings(PASS), []));
  it('returns empty list for null', () => assert.deepEqual(visibleFindings(null), []));
  it('returns empty list for non-array findings', () => assert.deepEqual(visibleFindings({ findings: 3 }), []));
  it('keeps original finding ordering', () => assert.deepEqual(visibleFindings(FAIL), FAIL.findings));
  it('does not mutate the report during filtering', () => {
    const old = structuredClone(FAIL); visibleFindings(FAIL, 'ERROR'); assert.deepEqual(FAIL, old);
  });
});

describe('privacy-preserving export report', () => {
  it('uses Boolean pass status', () => assert.equal(safeResult(PASS).ok, true));
  it('uses Boolean blocked status', () => assert.equal(safeResult(FAIL).ok, false));
  it('keeps safe totals', () => assert.equal(safeResult(FAIL).totals.sources, 2));
  it('does not include original evidence notes', () => {
    const report = safeResult({ ok: false, notes: ['private'], findings: [] });
    assert.equal(JSON.stringify(report).includes('private'), false);
  });
  it('keeps only required finding keys', () => {
    const report = safeResult({ ok: false, findings: [{ code: 'SOURCE', path: '$',
      severity: 'ERROR', en: 'Failure', fr: 'Erreur', secret: 'do not export' }] });
    assert.equal(JSON.stringify(report).includes('do not export'), false);
  });
  it('JSON export ends with newline', () => assert.match(reportJson(FAIL), /\n$/u));
  it('JSON export parses successfully', () => assert.equal(JSON.parse(reportJson(FAIL)).ok, false));
  it('JSON export includes English and French findings', () => {
    const item = JSON.parse(reportJson(FAIL)).findings[0];
    assert.ok(item.en); assert.ok(item.fr);
  });
  it('JSON export does not serialize the entire source package', () => {
    const fake = { ...FAIL, input: known('YES') };
    assert.equal(reportJson(fake).includes('obs-a'), false);
  });
  it('CSV export contains standard header columns', () => {
    assert.match(reportCsv(FAIL), /^"severity","code","path","message"/);
  });
  it('CSV export writes CRLF rows', () => assert.match(reportCsv(FAIL), /\r\n/u));
  it('CSV export has a French message when requested', () => {
    assert.match(reportCsv(FAIL, 'fr'), /Les détails/u);
  });
  it('CSV export has an English message by default', () => {
    assert.match(reportCsv(FAIL), /Source details/u);
  });
  it('CSV export handles empty findings', () => {
    assert.equal(reportCsv(PASS).trim(), '"severity","code","path","message"');
  });
  it('CSV export does not expose private fields', () => {
    const withSecret = { ...FAIL, hidden: 'private-note' };
    assert.doesNotMatch(reportCsv(withSecret), /private-note/u);
  });
  it('CSV export escapes quotes', () => {
    const f = { ...FAIL, findings: [{ ...FAIL.findings[0], en: 'A "quoted" note' }] };
    assert.match(reportCsv(f), /""quoted""/);
  });
  it('CSV export neutralizes spreadsheet formula text', () => {
    const f = { ...FAIL, findings: [{ ...FAIL.findings[0], en: '=SUM(1,2)' }] };
    assert.match(reportCsv(f), /'=SUM\(1,2\)/);
  });
  it('CSV export neutralizes initial plus sign', () => {
    const f = { ...FAIL, findings: [{ ...FAIL.findings[0], en: '+123' }] };
    assert.match(reportCsv(f), /'\+123/);
  });
  it('CSV export neutralizes initial at-sign', () => {
    const f = { ...FAIL, findings: [{ ...FAIL.findings[0], en: '@SUM' }] };
    assert.match(reportCsv(f), /'@SUM/);
  });
});

describe('counts and grouping', () => {
  it('counts all findings', () => assert.equal(findingCounts(FAIL).all, 2));
  it('counts errors', () => assert.equal(findingCounts(FAIL).errors, 1));
  it('counts notices', () => assert.equal(findingCounts(FAIL).notices, 1));
  it('counts none on good package', () => assert.equal(findingCounts(PASS).all, 0));
  it('groups repeated code into one group', () => {
    const repeated = { ...FAIL, findings: [...FAIL.findings, FAIL.findings[0]] };
    assert.equal(groupedFindings(repeated).find(g => g.code === 'SOURCE').count, 2);
  });
  it('groups in sorted code order', () => {
    assert.deepEqual(groupedFindings(FAIL).map(g => g.code), ['SOURCE','UNREFERENCED']);
  });
  it('records number of errors in each group', () => {
    assert.equal(groupedFindings(FAIL).find(g => g.code === 'UNREFERENCED').errors, 0);
  });
  it('renders passing text in English', () => assert.match(textReport(PASS), /^Checks passed/u));
  it('renders passing text in French', () => assert.match(textReport(PASS, 'fr'), /^Contrôles réussis/u));
  it('renders blocked text in English', () => assert.match(textReport(FAIL), /^Publication blocked/u));
  it('renders blocked text in French', () => assert.match(textReport(FAIL, 'fr'), /^Publication bloquée/u));
  it('reports an issue path in human-readable text', () => assert.match(textReport(FAIL), /\$\.sources\[0\]/u));
});

describe('download naming and display totals', () => {
  for (const [mode, format, name] of [
    ['audit', 'json', 'offline-audit-report.json'],
    ['audit', 'csv', 'offline-audit-report.csv'],
    ['compare', 'json', 'offline-comparison-report.json'],
    ['compare', 'csv', 'offline-comparison-report.csv'],
  ]) {
    it(`names ${mode} ${format} export safely`, () => assert.equal(exportFilename(mode, format), name));
  }
  it('prints integer zero', () => assert.equal(readableTotal(0), '0'));
  it('does not print invalid negative total', () => assert.equal(readableTotal(-1), 'UNKNOWN'));
  it('does not print NaN', () => assert.equal(readableTotal(NaN), 'UNKNOWN'));
  it('does not print a fraction', () => assert.equal(readableTotal(.5), 'UNKNOWN'));
  it('does not print infinity', () => assert.equal(readableTotal(Infinity), 'UNKNOWN'));
});
