import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES, METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE,
  METROLINX_AUA_END_USER_LAWS_EN, METROLINX_AUA_END_USER_LAWS_FR } from './attribution-utils.mjs';
import {parseStaticRelease, parseStaticReleaseJson, relativePage, StaticInputError} from './static-release.mjs';
import {inspectStaticHtml, auditStaticPage, auditStaticRelease, compareStaticReleases, decodeHtml} from './static-scan.mjs';
import {renderStaticText, renderStaticHtml, renderStaticJson} from './static-report.mjs';

export function credit(patch = {}) {
  return {id: 'osm-one', provider: 'osm', licence: 'ODbL-1.0',
    sourceUrl: SOURCES.osm.sourceUrl, licenceUrl: SOURCES.osm.licenceUrl,
    permission: 'YES', tier: 'primary', datasetDate: 'UNKNOWN', collectedDate: '2026-11-15',
    termsDate: '2026-11-15', notice: SOURCES.osm.notices.en.join(' '), ...patch};
}
export function page(patch = {}) {
  return {id: 'map-en', file: 'en/map.html', locale: 'en', credits: [credit()],
    offline: 'YES', minimumTargetPx: 44, navigationLabel: 'Navigation', mapView: 'YES', ...patch};
}
export function release(patch = {}) {return {schema: 'attribution-static-pages/1', releaseId: 'release-one', pages: [page()], ...patch};}
export function html(p = page()) {
  const notices = p.credits.map(c => c.notice).join(' ');
  const links = p.credits.map(c => `<a href="${c.sourceUrl}">Source</a><a href="${c.licenceUrl}">Licence</a>`).join('');
  return `<!doctype html><html lang="${p.locale}"><head><title>Sources</title></head><body><nav>Navigation</nav><main><h1>Sources</h1><p>${notices}</p>${links}</main></body></html>`;
}
const bad = (callback) => assert.throws(callback, StaticInputError);

test('schema parses known EN map metadata', () => {const result = parseStaticRelease(release());assert.equal(result.pages[0].credits[0].datasetDate, 'UNKNOWN');});
test('schema JSON parser preserves UNKNOWN', () => {const result = parseStaticReleaseJson(JSON.stringify(release()));assert.equal(result.pages[0].credits[0].datasetDate, 'UNKNOWN');});
test('schema rejects unsupported version', () => bad(() => parseStaticRelease(release({schema: 'old'}))));
test('schema rejects unknown root field', () => bad(() => parseStaticRelease({...release(), extra: true})));
test('schema rejects empty release identifier', () => bad(() => parseStaticRelease(release({releaseId: ''}))));
test('schema rejects invalid identifier', () => bad(() => parseStaticRelease(release({releaseId: 'Invalid ID'}))));
test('schema rejects duplicate page IDs', () => bad(() => parseStaticRelease(release({pages: [page(), page({file: 'fr/map.html'})]}))));
test('schema rejects duplicate file paths', () => bad(() => parseStaticRelease(release({pages: [page(), page({id: 'other'})]}))));
test('schema rejects duplicate credit IDs', () => bad(() => parseStaticRelease(release({pages: [page({credits: [credit(), credit()]})]}))));
test('schema rejects unknown credit field', () => bad(() => parseStaticRelease(release({pages: [page({credits: [{...credit(), unwanted: 1}]})]}))));
test('schema rejects omitted credit field', () => {const {notice: _removed, ...rest} = credit();bad(() => parseStaticRelease(release({pages: [page({credits: [rest]})]})));});
test('schema rejects fake positive permission', () => bad(() => parseStaticRelease(release({pages: [page({credits: [credit({permission: 'true'})]})]}))));
test('schema accepts explicit UNKNOWN permission', () => assert.equal(parseStaticRelease(release({pages: [page({credits: [credit({permission: 'UNKNOWN'})]})]})).pages[0].credits[0].permission, 'UNKNOWN'));
test('schema rejects fabricated source provider', () => bad(() => parseStaticRelease(release({pages: [page({credits: [credit({provider: 'municipal'})]})]}))));
test('schema rejects malformed calendar date', () => bad(() => parseStaticRelease(release({pages: [page({credits: [credit({termsDate: '2026-02-30'})]})]}))));
test('schema rejects unsafe URLs', () => {for (const url of ['http://x.example', 'javascript:alert(1)', 'https://localhost/', 'https://127.0.0.1/', 'https://name:pass@example.org/']) bad(() => parseStaticRelease(release({pages: [page({credits: [credit({sourceUrl: url})]})]})));});
test('schema accepts HTTPS provider links', () => assert.equal(parseStaticRelease(release()).pages[0].credits[0].sourceUrl, SOURCES.osm.sourceUrl));
test('schema rejects oversized content', () => bad(() => parseStaticReleaseJson('x'.repeat(1_048_577))));
test('schema rejects invalid JSON', () => bad(() => parseStaticReleaseJson('{')));
test('schema rejects control characters', () => bad(() => parseStaticRelease(release({pages: [page({navigationLabel: '\u0000'})]}))));
test('schema rejects unsupported locale', () => bad(() => parseStaticRelease(release({pages: [page({locale: 'es'})]}))));
test('schema rejects missing target metadata', () => {const {minimumTargetPx: _missing, ...rest} = page();bad(() => parseStaticRelease(release({pages: [rest]})));});
test('schema permits UNKNOWN target for auditing', () => assert.equal(parseStaticRelease(release({pages: [page({minimumTargetPx: 'UNKNOWN'})]})).pages[0].minimumTargetPx, 'UNKNOWN'));
test('schema rejects negative target', () => bad(() => parseStaticRelease(release({pages: [page({minimumTargetPx: -1})]}))));
test('schema rejects floating target', () => bad(() => parseStaticRelease(release({pages: [page({minimumTargetPx: 43.5})]}))));
test('paths reject traversal', () => {for(const name of ['../index.html','a/../index.html','/index.html','.hidden.html','file:///a.html','a\\b.html'])bad(()=>relativePage(name));});
test('paths accept nested HTML', () => assert.equal(relativePage('pages/fr/map.html'), 'pages/fr/map.html'));
test('paths reject non-HTML', () => bad(() => relativePage('assets/map.js')));
test('HTML decoder resolves safe named entities', () => assert.equal(decodeHtml('A &amp; B &copy;'), 'A & B ©'));
test('HTML decoder resolves numeric entities', () => assert.equal(decodeHtml('&#169; &#xA0;'), '© \u00a0'));
test('HTML decoder leaves invalid numbers alone', () => assert.equal(decodeHtml('&#x110000;'), '&#x110000;'));
test('HTML inspector extracts visible text', () => assert.match(inspectStaticHtml(html()).text, /OpenStreetMap contributors/u));
test('HTML inspector ignores hidden text', () => assert.doesNotMatch(inspectStaticHtml('<html><body><p hidden>SECRET</p><main>OPEN</main></body></html>').text, /SECRET/u));
test('HTML inspector ignores aria-hidden text', () => assert.doesNotMatch(inspectStaticHtml('<main><p aria-hidden="true">SECRET</p>OPEN</main>').text, /SECRET/u));
test('HTML inspector ignores script content', () => assert.doesNotMatch(inspectStaticHtml('<script>SECRET</script><main>OPEN</main>').text, /SECRET/u));
test('HTML inspector extracts source links', () => assert.equal(inspectStaticHtml(html()).links[0].href, SOURCES.osm.sourceUrl));
test('HTML inspector extracts language', () => assert.equal(inspectStaticHtml(html()).lang, 'en'));
test('HTML inspector tracks main landmark', () => assert.equal(inspectStaticHtml(html()).mainCount, 1));
test('HTML inspector tracks heading', () => assert.equal(inspectStaticHtml(html()).h1Count, 1));
test('HTML inspector tracks nav landmark', () => assert.equal(inspectStaticHtml(html()).navCount, 1));
test('HTML inspector rejects oversized input', () => assert.throws(() => inspectStaticHtml('X'.repeat(2_097_153)), TypeError));
test('valid page carries no blocking findings', () => {const p = page();assert.equal(auditStaticPage(p, html(p)).blocked, false);});
test('valid page keeps unknown dataset date informational', () => assert.ok(auditStaticPage(page(), html()).findings.some(f=>f.code==='DATASET_DATE_UNKNOWN' && f.severity==='info')));
test('language mismatch blocks release', () => assert.ok(auditStaticPage(page({locale:'fr'}), html()).findings.some(f=>f.code==='LANGUAGE_MISMATCH')));
test('missing heading blocks release', () => assert.ok(auditStaticPage(page(), html().replace('<h1>Sources</h1>', '')).findings.some(f=>f.code==='PAGE_HEADING')));
test('missing main blocks release', () => assert.ok(auditStaticPage(page(), html().replace(/<\/?main>/gu, '')).findings.some(f=>f.code==='MAIN_LANDMARK')));
test('missing navigation blocks release', () => assert.ok(auditStaticPage(page(), html().replace(/<\/?nav>/gu, '')).findings.some(f=>f.code==='NAV_LANDMARK')));
test('remote scripts block release', () => assert.ok(auditStaticPage(page(), html().replace('</body>', '<script src="https://cdn.example/asset.js"></script></body>')).findings.some(f=>f.code==='REMOTE_ASSETS')));
test('unknown permission blocks release', () => {const p=page({credits:[credit({permission:'UNKNOWN'})]});assert.ok(auditStaticPage(p,html(p)).findings.some(f=>f.code==='PERMISSION_UNKNOWN'));});
test('denied permission blocks release', () => {const p=page({credits:[credit({permission:'NO'})]});assert.ok(auditStaticPage(p,html(p)).findings.some(f=>f.code==='PERMISSION_DENIED'));});
test('unknown tier blocks release', () => {const p=page({credits:[credit({tier:'UNKNOWN'})]});assert.ok(auditStaticPage(p,html(p)).findings.some(f=>f.code==='TIER_UNKNOWN'));});
test('unknown dataset date does not block alone', () => assert.equal(auditStaticPage(page(),html()).blocked, false));
test('unknown source URL blocks release', () => {const p=page({credits:[credit({sourceUrl:'UNKNOWN'})]});assert.ok(auditStaticPage(p,html(p)).findings.some(f=>f.code==='SOURCE_URL_UNKNOWN'));});
test('unknown licence URL blocks release', () => {const p=page({credits:[credit({licenceUrl:'UNKNOWN'})]});assert.ok(auditStaticPage(p,html(p)).findings.some(f=>f.code==='LICENCE_URL_UNKNOWN'));});
test('missing source link blocks release', () => assert.ok(auditStaticPage(page(), html().replaceAll(`<a href="${SOURCES.osm.sourceUrl}">Source</a>`, '').replaceAll(`<a href="${SOURCES.osm.licenceUrl}">Licence</a>`, '')).findings.some(f=>f.code==='SOURCE_LINK_MISSING')));
test('hidden notice does not count as visible', () => assert.ok(auditStaticPage(page(), html().replace(`<p>${credit().notice}</p>`, `<p hidden>${credit().notice}</p>`)).findings.some(f=>f.code==='LEGAL_TEXT_MISSING')));
test('wrong ODbL notice blocks release', () => {const p=page({credits:[credit({notice:'© OpenStreetMap contributors'})]});assert.ok(auditStaticPage(p, html(p)).findings.some(f=>f.code==='EVIDENCE_NOTICE_MISSING'));});
test('mixed wrong licence blocks release', () => {const p=page({credits:[credit({licence:'LTC-Open-Data-Terms'})]});assert.ok(auditStaticPage(p,html(p)).findings.some(f=>f.code==='LICENCE_MISMATCH'));});
test('target 43 blocks release', () => assert.ok(auditStaticPage(page({minimumTargetPx:43}), html()).findings.some(f=>f.code==='TARGET_TOO_SMALL')));
test('target 44 passes', () => assert.equal(auditStaticPage(page({minimumTargetPx:44}), html()).blocked, false));
test('target unknown blocks release', () => assert.ok(auditStaticPage(page({minimumTargetPx:'UNKNOWN'}),html()).findings.some(f=>f.code==='TARGET_UNKNOWN')));
test('offline NO blocks release', () => assert.ok(auditStaticPage(page({offline:'NO'}),html()).findings.some(f=>f.code==='OFFLINE_UNKNOWN_OR_NO')));
test('missing navigation text blocks release', () => assert.ok(auditStaticPage(page(),html().replace('Navigation','')).findings.some(f=>f.code==='NAVIGATION_LABEL_MISSING')));
test('page result includes file path', () => assert.equal(auditStaticPage(page(),html()).file,'en/map.html'));
test('missing HTML file blocks release', () => assert.equal(auditStaticRelease(parseStaticRelease(release()),new Map()).blocked,true));
test('release audit reads actual HTML', () => assert.equal(auditStaticRelease(parseStaticRelease(release()),new Map([['en/map.html',html()]])).blocked,false));
test('release audit counts blocking findings', () => assert.ok(auditStaticRelease(parseStaticRelease(release()),new Map()).blockingCount>=1));
test('comparison marks removed page', () => {const before=auditStaticRelease(parseStaticRelease(release()),new Map([['en/map.html',html()]]));const after={releaseId:'later',blocked:false,results:[]};assert.ok(compareStaticReleases(before,after).changes.some(c=>c.code==='PAGE_REMOVED'));});
test('comparison catches new missing notice', () => {const before=auditStaticRelease(parseStaticRelease(release()),new Map([['en/map.html',html()]]));const after=auditStaticRelease(parseStaticRelease(release()),new Map([['en/map.html',html().replace(`<p>${credit().notice}</p>`,'')]]));assert.ok(compareStaticReleases(before,after).changes.some(c=>c.code==='NEW_BLOCKER'));});
test('comparison unchanged page is unblocked', () => {const r=auditStaticRelease(parseStaticRelease(release()),new Map([['en/map.html',html()]]));assert.equal(compareStaticReleases(r,r).blocked,false);});
test('French report uses no-break colon', () => {const r=auditStaticRelease(parseStaticRelease(release()),new Map([['en/map.html',html()]]));assert.ok(renderStaticText(r,'fr').includes('Version\u00a0:'));});
test('HTML report uses strict CSP', () => {const r=auditStaticRelease(parseStaticRelease(release()),new Map());assert.ok(renderStaticHtml(r).includes("connect-src 'none'"));});
test('HTML report escapes unsafe finding text', () => {const r={releaseId:'<BAD>',blocked:true,results:[]};assert.ok(renderStaticHtml(r).includes('&lt;BAD&gt;'));});
test('HTML report contains no script tag', () => {const r=auditStaticRelease(parseStaticRelease(release()),new Map());assert.doesNotMatch(renderStaticHtml(r),/<script/u);});
test('JSON report describes schema', () => {const r=auditStaticRelease(parseStaticRelease(release()),new Map());assert.equal(JSON.parse(renderStaticJson(r)).schema,'attribution-static-report/1');});
test('report comparison includes new findings', () => {const r=auditStaticRelease(parseStaticRelease(release()),new Map());assert.ok(renderStaticText(r,'en',{changes:[{code:'PAGE_REMOVED',pageId:'p'}]}).includes('PAGE_REMOVED'));});
test('Metrolinx AUA requires both applicable-law lines', () => {const c=credit({provider:'metrolinx',licence:'Metrolinx-AUA',notice:[METROLINX_AUA_LEGEND,METROLINX_AUA_END_USER_LAWS_EN,METROLINX_AUA_END_USER_LAWS_FR].join(' ')});const p=page({credits:[c],mapView:'NO'});assert.equal(auditStaticPage(p,html(p)).blocked,false);});
test('Metrolinx OGL does not require AUA notice', () => {const c=credit({provider:'metrolinx',licence:'OGL-Ontario-Metrolinx',notice:METROLINX_OGL_NOTICE});const p=page({credits:[c],mapView:'NO'});assert.equal(auditStaticPage(p,html(p)).blocked,false);});
test('Metrolinx AUA cannot carry OGL statement', () => {const c=credit({provider:'metrolinx',licence:'Metrolinx-AUA',notice:[METROLINX_AUA_LEGEND,METROLINX_OGL_NOTICE,METROLINX_AUA_END_USER_LAWS_EN,METROLINX_AUA_END_USER_LAWS_FR].join(' ')});const p=page({credits:[c],mapView:'NO'});assert.ok(auditStaticPage(p,html(p)).findings.some(f=>f.code==='INCOMPATIBLE_NOTICE'));});
test('LTC notice requires LTC licence', () => {const c=credit({provider:'ltc',licence:'LTC-Open-Data-Terms',notice:SOURCES.ltc.notices.en[0]});const p=page({credits:[c],mapView:'NO'});assert.equal(auditStaticPage(p,html(p)).blocked,false);});

test('multiline legal notices are accepted', () => {const c=credit({notice:`${SOURCES.osm.notices.en[0]}\n${SOURCES.osm.notices.en[1]}`});assert.match(parseStaticRelease(release({pages:[page({credits:[c]})]})).pages[0].credits[0].notice,/\n/u);});
