import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditLocaleQa, OSM_CREDIT, ODBL_NAME, MIN_TARGET_PX,
  findingsForPage, findingsForSource, blockers,
} from './locale-qa-audit.mjs';
import {
  fixtureRelease, fixtureSource, fixtureNotice, fixturePage, copyFixture,
  withSource, withPage, withNotice, metrolinxRelease,
  ltcRelease, otherOpenRelease,
} from './locale-qa-fixtures.mjs';
import {
  METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR,
} from './attribution-utils.mjs';

const audit = value => auditLocaleQa(value);
const codes = value => audit(value).findings.map(f => f.code);
const has = (value, code) => assert.ok(codes(value).includes(code), `Missing finding ${code}; actual ${codes(value).join(', ')}`);
const clean = value => assert.equal(audit(value).blocked, false, JSON.stringify(audit(value).findings));

test('exact OpenStreetMap credit is required', () => {
  assert.equal(OSM_CREDIT, '© OpenStreetMap contributors');
  assert.equal(fixtureNotice().text, OSM_CREDIT);
  clean(fixtureRelease());
});
test('ODbL data licence name is separate from map credit', () => {
  assert.equal(ODBL_NAME, 'Open Database License (ODbL) 1.0');
  assert.notEqual(OSM_CREDIT, ODBL_NAME);
  clean(fixtureRelease());
});
test('the target minimum is 44 CSS pixels', () => {
  assert.equal(MIN_TARGET_PX, 44);
  clean(fixtureRelease());
});
test('an unknown dataset date is informational, not invented', () => {
  const result = audit(fixtureRelease());
  assert.equal(result.blocked, false);
  assert.ok(result.findings.some(f => f.code === 'DATASET_DATE_UNKNOWN' && f.severity === 'info'));
});
test('all source and page counts are reported', () => {
  const result = audit(fixtureRelease());
  assert.equal(result.sourceCount, 1);
  assert.equal(result.pageCount, 2);
});
test('zero source records block release', () => {
  has({ ...fixtureRelease(), sources: [] }, 'RELEASE_NO_SOURCES');
});
test('zero published pages block release', () => {
  has({ ...fixtureRelease(), pages: [] }, 'RELEASE_NO_PAGES');
});
test('source permissions NO or UNKNOWN block', () => {
  for (const permission of ['NO', 'UNKNOWN']) {
    const value = withSource(fixtureRelease(), { permission });
    has(value, 'SOURCE_PERMISSION_MISSING');
    assert.equal(audit(value).blocked, true);
  }
});
test('source licence evidence NO or UNKNOWN blocks', () => {
  for (const licenceEvidence of ['NO', 'UNKNOWN']) {
    has(withSource(fixtureRelease(), { licenceEvidence }), 'LICENCE_EVIDENCE_MISSING');
  }
});
test('unknown source links block an included source', () => {
  has(withSource(fixtureRelease(), { sourceUrl: 'UNKNOWN' }), 'SOURCE_URL_UNKNOWN');
});
test('unknown licence links block an included source', () => {
  has(withSource(fixtureRelease(), { licenceUrl: 'UNKNOWN' }), 'LICENCE_URL_UNKNOWN');
});
test('missing acquisition date blocks a release', () => {
  has(withSource(fixtureRelease(), { acquiredDate: 'UNKNOWN' }), 'ACQUISITION_DATE_UNKNOWN');
});
test('missing terms date blocks a release', () => {
  has(withSource(fixtureRelease(), { termsDate: 'UNKNOWN' }), 'TERMS_DATE_UNKNOWN');
});
test('evidence tier UNKNOWN blocks an included source', () => {
  has(withSource(fixtureRelease(), { evidenceTier: 'UNKNOWN' }), 'EVIDENCE_TIER_UNKNOWN');
});
test('a later dataset date remains visible as a review item', () => {
  const value = withSource(fixtureRelease(), { datasetDate: '2026-04-01' });
  has(value, 'DATASET_DATE_AFTER_ACQUISITION');
  assert.equal(audit(value).blocked, false);
});
test('a later terms date remains a review item', () => {
  const value = withSource(fixtureRelease(), { termsDate: '2026-03-01' });
  has(value, 'TERMS_DATE_AFTER_ACQUISITION');
  assert.equal(audit(value).blocked, false);
});
test('included but unreferenced sources are noted', () => {
  const value = fixtureRelease({ sources: [fixtureSource(), fixtureSource({ id: 'unused-source' })] });
  has(value, 'INCLUDED_SOURCE_UNUSED');
  assert.equal(audit(value).blocked, false);
});
test('an excluded source does not require publication permission', () => {
  const value = fixtureRelease({ sources: [fixtureSource({ status: 'excluded', permission: 'UNKNOWN' })], pages: [] });
  assert.ok(!codes(value).includes('SOURCE_PERMISSION_MISSING'));
});
test('a published page referencing an excluded source is blocked', () => {
  has(withSource(fixtureRelease(), { status: 'excluded' }), 'PAGE_SOURCE_NOT_INCLUDED');
});
test('a published page referencing a held source is blocked', () => {
  has(withSource(fixtureRelease(), { status: 'held' }), 'PAGE_SOURCE_NOT_INCLUDED');
});
test('missing declared source ID is blocked', () => {
  has(withPage(fixtureRelease(), 'page-en', { sourceIds: ['absent-source'] }), 'PAGE_SOURCE_UNKNOWN');
});
test('a notice about an unknown source is blocked', () => {
  has(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { sourceId: 'absent-source' }), 'NOTICE_SOURCE_UNKNOWN');
});
test('a notice cannot silently use a source omitted from the page', () => {
  const value = withPage(fixtureRelease(), 'page-en', { sourceIds: [] });
  has(value, 'NOTICE_SOURCE_UNDECLARED');
});
test('a published page must list at least one source', () => {
  has(withPage(fixtureRelease(), 'page-en', { sourceIds: [] }), 'PAGE_NO_SOURCES');
});
test('a published page must show notices', () => {
  has(withPage(fixtureRelease(), 'page-en', { notices: [] }), 'PAGE_NO_NOTICES');
});
test('unknown offline evidence blocks publication', () => {
  has(withPage(fixtureRelease(), 'page-en', { offline: 'UNKNOWN' }), 'PAGE_OFFLINE_UNKNOWN');
});
test('offline state NO blocks publication', () => {
  has(withPage(fixtureRelease(), 'page-en', { offline: 'NO' }), 'PAGE_OFFLINE_UNKNOWN');
});
test('unknown page target dimension blocks publication', () => {
  has(withPage(fixtureRelease(), 'page-en', { targetPx: 'UNKNOWN' }), 'PAGE_TARGET_UNKNOWN');
});
test('page target dimensions smaller than 44 block', () => {
  for (const targetPx of [0, 1, 20, 43]) has(withPage(fixtureRelease(), 'page-en', { targetPx }), 'PAGE_TARGET_SMALL');
});
test('page dimensions at or above 44 are accepted', () => {
  for (const targetPx of [44, 45, 60, 120]) clean(withPage(fixtureRelease(), 'page-en', { targetPx }));
});
test('UNKNOWN publication date is reported without guessing one', () => {
  const result = audit(withPage(fixtureRelease(), 'page-en', { publishedDate: 'UNKNOWN' }));
  assert.ok(result.findings.some(f => f.code === 'PAGE_DATE_UNKNOWN' && f.severity === 'review'));
  assert.equal(result.blocked, false);
});
test('a hidden notice blocks publication', () => {
  has(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { visible: 'NO' }), 'NOTICE_HIDDEN_OR_UNKNOWN');
});
test('UNKNOWN notice visibility blocks publication', () => {
  has(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { visible: 'UNKNOWN' }), 'NOTICE_HIDDEN_OR_UNKNOWN');
});
test('unknown keyboard evidence blocks publication', () => {
  has(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { keyboard: 'UNKNOWN' }), 'NOTICE_KEYBOARD_MISSING');
});
test('negative keyboard evidence blocks publication', () => {
  has(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { keyboard: 'NO' }), 'NOTICE_KEYBOARD_MISSING');
});
test('unknown screen-reader evidence blocks publication', () => {
  has(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { screenReader: 'UNKNOWN' }), 'NOTICE_SCREEN_READER_MISSING');
});
test('negative screen-reader evidence blocks publication', () => {
  has(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { screenReader: 'NO' }), 'NOTICE_SCREEN_READER_MISSING');
});
test('unknown contrast evidence blocks publication', () => {
  has(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { contrast: 'UNKNOWN' }), 'NOTICE_CONTRAST_MISSING');
});
test('negative contrast evidence blocks publication', () => {
  has(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { contrast: 'NO' }), 'NOTICE_CONTRAST_MISSING');
});
test('unknown notice target dimension blocks publication', () => {
  has(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { targetPx: 'UNKNOWN' }), 'NOTICE_TARGET_UNKNOWN');
});
test('notice target dimensions smaller than 44 block', () => {
  for (const targetPx of [0, 1, 24, 43]) has(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { targetPx }), 'NOTICE_TARGET_SMALL');
});
test('notice target dimensions at or above 44 are accepted', () => {
  for (const targetPx of [44, 45, 56, 96]) clean(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { targetPx }));
});
test('pending editorial review blocks publication', () => {
  has(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { review: 'pending' }), 'NOTICE_TRANSLATION_NOT_ACCEPTED');
});
test('rejected editorial review blocks publication', () => {
  has(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { review: 'rejected' }), 'NOTICE_TRANSLATION_NOT_ACCEPTED');
});
test('unknown editorial review blocks publication', () => {
  has(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { review: 'UNKNOWN' }), 'NOTICE_TRANSLATION_NOT_ACCEPTED');
});
test('unknown manual-review date blocks publication', () => {
  has(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { reviewDate: 'UNKNOWN' }), 'NOTICE_REVIEW_DATE_UNKNOWN');
});
test('unknown review evidence URL blocks publication', () => {
  has(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { evidenceUrl: 'UNKNOWN' }), 'NOTICE_EVIDENCE_UNKNOWN');
});
test('unknown licence URL at the notice blocks publication', () => {
  has(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { licenceUrl: 'UNKNOWN' }), 'NOTICE_TERMS_LINK_UNKNOWN');
});
test('notice terms URL must match its source', () => {
  has(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { licenceUrl: 'https://example.org/other' }), 'NOTICE_TERMS_LINK_MISMATCH');
});
test('map credits must be located close to the map', () => {
  has(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { nearContent: 'NO' }), 'MAP_CREDIT_NOT_NEAR_MAP');
});
test('map credit type must remain a credit rather than a licence', () => {
  has(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { kind: 'licence' }), 'OSM_CREDIT_MISSING');
});
test('near-map credit does not substitute for ODbL terms', () => {
  has(withNotice(fixtureRelease(), 'page-en', 'osm-licence', { text: OSM_CREDIT }), 'ODBL_TERMS_MISSING');
});
test('altered copyright wording does not pass exact attribution requirement', () => {
  for (const text of ['© OSM contributors', '© OpenStreetMap contributor', 'OpenStreetMap contributors', '© Open Street Map contributors']) {
    has(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { text }), 'OSM_CREDIT_MISSING');
  }
});
test('ODbL licence family requires OSM provider', () => {
  has(withSource(fixtureRelease(), { provider: 'other' }), 'ODBL_PROVIDER_MISMATCH');
});
test('provider-specific terms cannot be silently substituted', () => {
  has(withSource(fixtureRelease(), { terms: 'OTHER-OPEN' }), 'PROVIDER_TERMS_MISMATCH');
});
test('AUA legal legend must use exact catalogue text', () => {
  const value = metrolinxRelease('AUA');
  const notice = value.pages[0].notices.find(n => n.kind === 'disclaimer');
  assert.ok(notice.text.includes(METROLINX_AUA_LEGEND));
  clean(value);
  notice.text = 'The licence holder permits this data.';
  has(value, 'AUA_LEGEND_MISSING');
});
test('AUA requires the exact English applicable-laws line', () => {
  const value = metrolinxRelease('AUA');
  assert.ok(value.pages[0].notices.some(n => n.text === METROLINX_AUA_END_USER_LAWS_EN));
  value.pages[0].notices.find(n => n.text === METROLINX_AUA_END_USER_LAWS_EN).text = 'Users follow laws.';
  has(value, 'AUA_EN_LAWS_MISSING');
});
test('AUA requires the exact French applicable-laws line', () => {
  const value = metrolinxRelease('AUA');
  assert.ok(value.pages[1].notices.some(n => n.text === METROLINX_AUA_END_USER_LAWS_FR));
  value.pages[1].notices.find(n => n.text === METROLINX_AUA_END_USER_LAWS_FR).text = 'Lois applicables.';
  has(value, 'AUA_FR_LAWS_MISSING');
});
test('AUA cannot be presented as OGL terms without independent evidence', () => {
  const value = metrolinxRelease('AUA');
  value.pages[0].notices[0].text += `\n${METROLINX_OGL_NOTICE}`;
  has(value, 'AUA_OGL_MIXED');
});
test('OGL requires its exact licence line', () => {
  const value = metrolinxRelease('OGL');
  clean(value);
  value.pages[0].notices[0].text = 'Open government data.';
  has(value, 'OGL_NOTICE_MISSING');
});
test('OGL cannot silently absorb the AUA legal legend', () => {
  const value = metrolinxRelease('OGL');
  value.pages[0].notices[0].text += `\n${METROLINX_AUA_LEGEND}`;
  has(value, 'OGL_AUA_MIXED');
});
test('Metrolinx provider must declare the specific terms family', () => {
  const value = metrolinxRelease('AUA');
  value.sources[0].terms = 'ODbL-1.0';
  has(value, 'METROLINX_TERMS_MISMATCH');
});
test('AUA record with an incorrect provider is blocked', () => {
  const value = metrolinxRelease('AUA');
  value.sources[0].provider = 'other';
  has(value, 'AUA_PROVIDER_MISMATCH');
});
test('OGL record with an incorrect provider is blocked', () => {
  const value = metrolinxRelease('OGL');
  value.sources[0].provider = 'other';
  has(value, 'OGL_PROVIDER_MISMATCH');
});
test('LTC English credit must be the correct catalogue text', () => {
  const value = ltcRelease();
  clean(value);
  value.pages[0].notices[0].text = 'LTC data supplied';
  has(value, 'LTC_CREDIT_MISSING');
});
test('LTC French credit must be the language-appropriate catalogue text', () => {
  const value = ltcRelease();
  value.pages[1].notices[0].text = value.pages[0].notices[0].text;
  has(value, 'LTC_CREDIT_MISSING');
});
test('LTC provider must match its terms family', () => {
  const value = ltcRelease();
  value.sources[0].provider = 'other';
  has(value, 'LTC_PROVIDER_MISMATCH');
});
test('other open data must identify a specific licence', () => {
  const value = otherOpenRelease();
  clean(value);
  for (const licenceName of ['open', 'Other Open', 'proprietary', 'unknown', 'Open Data Licence']) {
    value.sources[0].licenceName = licenceName;
    has(value, 'OTHER_LICENCE_UNSPECIFIED');
  }
});
test('other open data must actually display its licence', () => {
  const value = otherOpenRelease();
  value.pages[0].notices[0].kind = 'credit';
  has(value, 'OTHER_LICENCE_MISSING');
});
test('other open licence provider must be declared as other', () => {
  const value = otherOpenRelease();
  value.sources[0].provider = 'osm';
  has(value, 'OTHER_PROVIDER_MISMATCH');
});
test('English and French pages are both required when parity is enabled', () => {
  has({ ...fixtureRelease(), pages: [fixturePage()] }, 'LOCALE_PAIR_MISSING');
});
test('English and French pages may be optional when explicitly disabled', () => {
  clean({ ...fixtureRelease(), requireBilingual: false, pages: [fixturePage()] });
});
test('missing English companion also blocks a required pair', () => {
  const value = fixtureRelease();
  value.pages = [value.pages[1]];
  has(value, 'LOCALE_PAIR_MISSING');
});
test('English and French pages must declare matching source IDs', () => {
  has(withPage(fixtureRelease(), 'page-fr', { sourceIds: [] }), 'LOCALE_SOURCE_MISMATCH');
});
test('paired pages must use compatible display modes', () => {
  has(withPage(fixtureRelease(), 'page-fr', { display: 'download' }), 'LOCALE_DISPLAY_MISMATCH');
});
test('paired pages must have consistent offline evidence', () => {
  has(withPage(fixtureRelease(), 'page-fr', { offline: 'UNKNOWN' }), 'LOCALE_OFFLINE_MISMATCH');
});
test('different target dimensions are recorded without a false regression block', () => {
  const value = withPage(fixtureRelease(), 'page-fr', { targetPx: 60 });
  has(value, 'LOCALE_TARGET_DIFFERENCE');
  assert.equal(audit(value).blocked, false);
});
test('paired pages require the same notice categories for each source', () => {
  const value = fixtureRelease();
  value.pages[1].notices.pop();
  has(value, 'LOCALE_NOTICE_KIND_MISMATCH');
});
test('French user copy uses typographic apostrophes', () => {
  const value = withNotice(fixtureRelease(), 'page-fr', 'credit-fr', { text: "L'attribution OpenStreetMap. © OpenStreetMap contributors" });
  has(value, 'FR_APOSTROPHE');
});
test('French colon punctuation requires nonbreaking space', () => {
  const value = withNotice(fixtureRelease(), 'page-fr', 'credit-fr', { text: 'Source : © OpenStreetMap contributors' });
  has(value, 'FR_COLON_SPACE');
});
test('French semicolon requires narrow no-break space', () => {
  const value = withNotice(fixtureRelease(), 'page-fr', 'credit-fr', { text: 'Source ; © OpenStreetMap contributors' });
  has(value, 'FR_PUNCTUATION_SPACE');
});
test('French exclamation requires narrow no-break space', () => {
  const value = withNotice(fixtureRelease(), 'page-fr', 'credit-fr', { text: 'Source ! © OpenStreetMap contributors' });
  has(value, 'FR_PUNCTUATION_SPACE');
});
test('French question mark requires narrow no-break space', () => {
  const value = withNotice(fixtureRelease(), 'page-fr', 'credit-fr', { text: 'Source ? © OpenStreetMap contributors' });
  has(value, 'FR_PUNCTUATION_SPACE');
});
test('French nonbreaking colon and narrow punctuation are accepted', () => {
  const value = withNotice(fixtureRelease(), 'page-fr', 'credit-fr', { text: 'Source\u00a0: © OpenStreetMap contributors\u202f!' });
  assert.ok(!codes(value).includes('FR_COLON_SPACE'));
  assert.ok(!codes(value).includes('FR_PUNCTUATION_SPACE'));
});
test('French guillemets must use narrow spaces inside', () => {
  const value = withNotice(fixtureRelease(), 'page-fr', 'credit-fr', { text: '« OpenStreetMap » © OpenStreetMap contributors' });
  has(value, 'FR_GUILLEMET_OPEN');
  has(value, 'FR_GUILLEMET_CLOSE');
});
test('French guillemets with correct narrow spaces are accepted', () => {
  const value = withNotice(fixtureRelease(), 'page-fr', 'credit-fr', { text: '«\u202fOpenStreetMap\u202f» © OpenStreetMap contributors' });
  assert.ok(!codes(value).includes('FR_GUILLEMET_OPEN'));
  assert.ok(!codes(value).includes('FR_GUILLEMET_CLOSE'));
});
test('findings are deterministically ordered by path and code', () => {
  const value = withSource(fixtureRelease(), { permission: 'UNKNOWN', termsDate: 'UNKNOWN', acquiredDate: 'UNKNOWN' });
  const findings = audit(value).findings;
  const sorted = [...findings].sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code) || String(a.pageId).localeCompare(String(b.pageId)));
  assert.deepEqual(findings, sorted);
});
test('findingsForPage returns scoped findings', () => {
  const report = audit(withNotice(fixtureRelease(), 'page-en', 'osm-credit', { visible: 'NO' }));
  assert.ok(findingsForPage(report, 'page-en').length > 0);
  assert.ok(findingsForPage(report, 'page-en').every(f => f.pageId === 'page-en'));
});
test('findingsForSource returns scoped findings', () => {
  const report = audit(withSource(fixtureRelease(), { permission: 'UNKNOWN' }));
  assert.ok(findingsForSource(report, 'osm-source').length > 0);
  assert.ok(findingsForSource(report, 'osm-source').every(f => f.sourceId === 'osm-source'));
});
test('blockers helper excludes review and informational findings', () => {
  const report = audit(withSource(fixtureRelease(), { permission: 'UNKNOWN' }));
  assert.ok(blockers(report).every(f => f.severity === 'block'));
  assert.equal(blockers(report).length, report.blockingCount);
});
test('the dependency index records both language pages', () => {
  assert.deepEqual(audit(fixtureRelease()).pageIdsBySource['osm-source'], ['page-en', 'page-fr']);
});
test('review and informational counts equal actual findings', () => {
  const report = audit(fixtureRelease());
  assert.equal(report.reviewCount, report.findings.filter(f => f.severity === 'review').length);
  assert.equal(report.informationCount, report.findings.filter(f => f.severity === 'info').length);
});
