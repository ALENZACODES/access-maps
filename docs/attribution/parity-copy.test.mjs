import test from 'node:test';
import assert from 'node:assert/strict';
import {COPY,labeled,localeFromSearch,findingText,findingReport,findingsTsv,FINDING_COLUMNS} from './parity-copy.mjs';
import {auditParity} from './parity-audit.mjs';
import {fixture} from './parity-fixture.mjs';
for(const locale of ['en','fr']) {
  test(`${locale}: all interface translation keys exist`,()=>assert.deepEqual(Object.keys(COPY[locale]).sort(),Object.keys(COPY.en).sort()));
  test(`${locale}: report includes the title and counts`,()=>{const f=fixture();const t=findingReport(auditParity(f.trace,f.pairs),locale);assert.ok(t.includes(f.pairs.title));assert.ok(t.includes(COPY[locale].blocking));});
  test(`${locale}: report retains UNKNOWN when present`,()=>{const f=fixture();f.trace.sources[0].retrievedOn='UNKNOWN';const t=findingReport(auditParity(f.trace,f.pairs),locale);assert.ok(t.includes('UNKNOWN')||t.includes('unknown'));});
  test(`${locale}: report does not invent a provider date`,()=>{const f=fixture();f.trace.sources[0].retrievedOn='UNKNOWN';const t=findingReport(auditParity(f.trace,f.pairs),locale);assert.ok(!t.includes('2026-12-01'));});
  test(`${locale}: all audit message codes have readable copy`,()=>{const f=fixture();f.trace.notices=[];const findings=auditParity(f.trace,f.pairs).findings;for(const issue of findings)assert.ok(findingText(locale,issue.code).length>3);});
}
test('French colon uses U+00A0',()=>assert.equal(labeled('fr','Source','UNKNOWN'),'Source\u00a0: UNKNOWN'));
test('English colon does not insert U+00A0',()=>assert.equal(labeled('en','Source','UNKNOWN'),'Source: UNKNOWN'));
test('French report uses U+00A0 before all label colons',()=>{const f=fixture();const t=findingReport(auditParity(f.trace,f.pairs),'fr');assert.match(t,/Associations\u00a0:/u);assert.match(t,/Écarts bloquants\u00a0:/u);assert.ok(!t.includes('Associations:'));});
test('French locale comes from precise lang query only',()=>{assert.equal(localeFromSearch('?lang=fr'),'fr');assert.equal(localeFromSearch('?lang=fr-CA'),'en');assert.equal(localeFromSearch('?lang=en'),'en');});
test('unsafely long locale query defaults to English',()=>assert.equal(localeFromSearch('x'.repeat(2000)),'en'));
test('unrecognized finding code displays literal code',()=>assert.equal(findingText('fr','FUTURE_CODE'),'FUTURE_CODE'));
test('TSV has full stable columns',()=>{const f=fixture();const text=findingsTsv(auditParity(f.trace,f.pairs));assert.equal(text.split('\n')[0],FINDING_COLUMNS.join('\t'));});
test('TSV includes affected source ID',()=>{const f=fixture();f.trace.notices=[];assert.ok(findingsTsv(auditParity(f.trace,f.pairs)).includes('fictional-osm'));});
test('TSV line endings remain consistent',()=>{const f=fixture();const t=findingsTsv(auditParity(f.trace,f.pairs));assert.ok(t.endsWith('\n'));assert.ok(!t.includes('\r'));});
test('TSV does not contain data rows for passing pair',()=>{const f=fixture();assert.equal(findingsTsv(auditParity(f.trace,f.pairs)).trim().split('\n').length,1);});
test('report is deterministic across repeated calls',()=>{const f=fixture();const r=auditParity(f.trace,f.pairs);assert.equal(findingReport(r,'fr'),findingReport(r,'fr'));});
test('report does not contain user-facing barred wording',()=>{for(const locale of ['en','fr'])assert.ok(!/vérif|verify|real-time|partnership|guarantee/iu.test(JSON.stringify(COPY[locale])));});
