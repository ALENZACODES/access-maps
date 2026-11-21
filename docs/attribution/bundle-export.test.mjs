import test from 'node:test';
import assert from 'node:assert/strict';
import {
  htmlEscape,safeLink,selectedView,disclosureModel,disclosureHtml,manifestJson,
  findingsText,coverageTsv,defaultFilename,
} from './bundle-export.mjs';
import {fixture,changedFixture,secondSourceFixture} from './bundle-fixture.mjs';
import {UNKNOWN,OSM_CREDIT} from './bundle-core.mjs';
import {COPY,labelled,locale,queryLocale} from './bundle-copy.mjs';

const modified=fn=>changedFixture(fn);
const html=(input=fixture(),language='en')=>disclosureHtml(input,'fictional-map',language);
const manifest=(input=fixture(),language='en')=>JSON.parse(manifestJson(input,'fictional-map',language));

test('English HTML exports a complete standalone document',()=>{
  const result=html();
  assert.match(result,/<!doctype html>/iu);
  assert.match(result,/<html lang="en">/u);
  assert.match(result,/<main id="disclosure-main">/u);
  assert.match(result,/<\/html>/u);
});
test('French HTML uses a French document language',()=>{
  const result=html(fixture(),'fr');
  assert.match(result,/<html lang="fr">/u);
  assert.ok(result.includes('Carte fictive'));
});
test('self-contained disclosure blocks scripts and connections',()=>{
  const result=html();
  assert.ok(result.includes("script-src 'none'"));
  assert.ok(result.includes("connect-src 'none'"));
  assert.ok(result.includes("object-src 'none'"));
  assert.ok(result.includes("form-action 'none'"));
  assert.ok(!result.includes('<script'));
});
test('self-contained page does not load remote styles or scripts',()=>{
  const result=html();
  assert.ok(result.includes('<style>'));
  assert.ok(!result.includes('<link rel="stylesheet"'));
  assert.ok(!result.includes('src="https://'));
  assert.ok(!result.includes('fetch('));
});
test('self-contained page retains skip navigation',()=>{
  const result=html();
  assert.ok(result.includes('href="#disclosure-main"'));
  assert.ok(result.includes('Skip to main content'));
});
test('French page retains French skip navigation',()=>{
  const result=html(fixture(),'fr');
  assert.ok(result.includes('Aller au contenu principal'));
});
test('export retains exact OpenStreetMap attribution',()=>{
  const result=html();
  assert.ok(result.includes(OSM_CREDIT));
  assert.ok(result.includes('© OpenStreetMap contributors'));
});
test('export retains distinct licence text',()=>{
  const result=html();
  assert.ok(result.includes('Open Database License 1.0'));
  assert.ok(result.includes('© OpenStreetMap contributors'));
});
test('export records the retrieval date supplied by the record',()=>{
  assert.ok(html().includes('2026-11-19'));
});
test('export does not invent dataset dates',()=>{
  assert.ok(html().includes(UNKNOWN));
});
test('export preserves source evidence tier',()=>{
  assert.ok(html().includes('imported'));
});
test('export retains exact entered displayed notice',()=>{
  const altered=modified(b=>{
    b.sources[0].credit='User-supplied credit';
    b.notices[0].text='User-supplied credit';
    b.notices[1].text='User-supplied credit';
    b.sources[0].family='other';
  });
  assert.ok(html(altered).includes('User-supplied credit'));
});
test('export does not insert a notice when none was supplied',()=>{
  const input=modified(b=>{b.notices=[];});
  const result=html(input);
  assert.ok(result.includes(UNKNOWN));
  assert.ok(result.includes('Draft'));
});
test('export marks incomplete evidence as draft',()=>{
  const input=modified(b=>{b.sources[0].permission=UNKNOWN;});
  assert.ok(html(input).includes('Draft evidence'));
});
test('export with complete fictional metadata still requires human review',()=>{
  assert.ok(html().includes('Human review required'));
});
test('French draft message is translated',()=>{
  const input=modified(b=>{b.notices=[];});
  assert.ok(html(input,'fr').includes('Preuves préliminaires'));
});
test('HTML output does not imply agency endorsement',()=>{
  assert.ok(html().includes('not an endorsement'));
});
test('HTML output does not claim rights or WCAG conformance',()=>{
  assert.ok(html().includes('does not establish'));
  assert.ok(html().includes('WCAG'));
});
for(const input of ['<tag>','&word','"quoted"',"'single'",'<script>alert(1)</script>']) {
  test(`HTML escape never emits raw markup: ${input}`,()=>{
    const output=htmlEscape(input);
    assert.ok(!output.includes('<'));
    assert.ok(!output.includes('>'));
  });
}
test('HTML export escapes asset label injection',()=>{
  const input=modified(b=>{b.assets[0].label='<img src=x onerror=alert(1)>';});
  const result=html(input);
  assert.ok(result.includes('&lt;img'));
  assert.ok(!result.includes('<img'));
});
test('HTML export escapes source name injection',()=>{
  const input=modified(b=>{b.sources[0].name='<script>alert(1)</script>';});
  const result=html(input);
  assert.ok(result.includes('&lt;script&gt;'));
  assert.ok(!result.includes('<script>alert'));
});
test('HTML export escapes title injection',()=>{
  const input=modified(b=>{b.views[0].titleEn='<svg onload=alert(1)>';});
  const result=html(input);
  assert.ok(result.includes('&lt;svg'));
  assert.ok(!result.includes('<svg'));
});
test('HTML export escapes notice body injection',()=>{
  const input=modified(b=>{
    b.sources[0].credit='<b>Example</b>';b.sources[0].family='other';
    b.notices[0].text='<b>Example</b>';b.notices[1].text='<b>Example</b>';
  });
  const result=html(input);
  assert.ok(result.includes('&lt;b&gt;Example&lt;/b&gt;'));
  assert.ok(!result.includes('<b>Example</b>'));
});
test('HTTPS source links open with safe rel attributes',()=>{
  const result=html();
  assert.ok(result.includes('rel="noopener noreferrer"'));
  assert.ok(result.includes('target="_blank"'));
  assert.ok(result.includes('https://www.openstreetmap.org/copyright'));
});
test('unknown link is plain text, not a fake anchor',()=>{
  assert.equal(safeLink(UNKNOWN,'Terms','en'),UNKNOWN);
});
test('unsafe link does not render clickable URL',()=>{
  assert.equal(safeLink('javascript:alert(1)','Terms','en'),UNKNOWN);
});
test('safe link escapes user-facing text',()=>{
  const result=safeLink('https://example.org','<Example>','en');
  assert.ok(result.includes('&lt;Example&gt;'));
});
test('selectedView returns the actual referenced object',()=>{
  const result=selectedView(fixture(),'fictional-map');
  assert.equal(result.view.route,'/fictional-map');
});
test('selectedView rejects an unknown view',()=>{
  assert.throws(()=>selectedView(fixture(),'missing'),RangeError);
});
test('model uses selected language for title and notice',()=>{
  const en=disclosureModel(fixture(),'fictional-map','en');
  const fr=disclosureModel(fixture(),'fictional-map','fr');
  assert.equal(en.title,'Fictional sample map');
  assert.equal(fr.title,'Carte fictive');
  assert.equal(en.noticeRows[0].notice.locale,'en');
  assert.equal(fr.noticeRows[0].notice.locale,'fr');
});
test('model sorts assets deterministically',()=>{
  const input=fixture();
  assert.deepEqual(disclosureModel(input,'fictional-map').assets.map(a=>a.id),['fictional-path']);
});
test('model lists only explicit included uses',()=>{
  const input=modified(b=>{b.uses[0].required='no';});
  assert.equal(disclosureModel(input,'fictional-map').noticeRows.length,0);
});
test('model never creates a notice for missing language',()=>{
  const input=modified(b=>{b.notices=b.notices.filter(n=>n.locale==='en');});
  assert.equal(disclosureModel(input,'fictional-map','fr').noticeRows[0].notice,null);
});
test('manifest retains source URL, licence, tier and date',()=>{
  const data=manifest();
  assert.equal(data.sourceRecords[0].retrievedOn,'2026-11-19');
  assert.equal(data.sourceRecords[0].tier,'imported');
  assert.equal(data.sourceRecords[0].family,'ODbL');
  assert.equal(data.sourceRecords[0].licenceUrl,'https://www.openstreetmap.org/copyright');
});
test('manifest contains the exact display notice',()=>{
  const data=manifest();
  assert.equal(data.notices[0].credit,OSM_CREDIT);
  assert.equal(data.notices[0].placement,'near-map');
});
test('manifest preserves UNKNOWN missing notice',()=>{
  const input=modified(b=>{b.notices=[];});
  const data=manifest(input);
  assert.equal(data.notices[0].credit,UNKNOWN);
  assert.equal(data.notices[0].observedOn,UNKNOWN);
});
test('manifest does not expose a storage or network request',()=>{
  const output=manifestJson(fixture(),'fictional-map','en');
  assert.ok(!output.includes('localStorage'));
  assert.ok(!output.includes('XMLHttpRequest'));
});
test('manifest identifies specific publication view and locale',()=>{
  const data=manifest(fixture(),'fr');
  assert.equal(data.viewId,'fictional-map');
  assert.equal(data.locale,'fr');
});
test('manifest is valid JSON with versioned schema',()=>{
  const data=manifest();
  assert.equal(data.schema,'map-notice-disclosure-manifest/1');
});
test('manifest records draft on absent evidence',()=>{
  const data=manifest(modified(b=>{b.notices=[];}));
  assert.equal(data.reviewState,'draft');
});
test('manifest includes blocking findings rather than hiding them',()=>{
  const data=manifest(modified(b=>{b.sources[0].tier=UNKNOWN;}));
  assert.ok(data.findings.some(f=>f.code==='TIER_UNKNOWN'));
});
for(const language of ['en','fr']) {
  test(`${language} findings export has corresponding title`,()=>{
    const result=findingsText(fixture(),language);
    assert.ok(result.includes(COPY[language].title));
  });
  test(`${language} findings export preserves relevant gap codes`,()=>{
    const input=modified(b=>{b.notices=[];});
    const result=findingsText(input,language);
    assert.ok(result.includes('NOTICE_MISSING'));
  });
  test(`${language} findings export includes human-review caution`,()=>{
    const result=findingsText(fixture(),language);
    assert.ok(result.includes(COPY[language].caution));
  });
}
test('French labels use NBSP before colon',()=>{
  assert.equal(labelled('fr','Source',UNKNOWN),'Source\u00a0: UNKNOWN');
});
test('English labels use ordinary colon',()=>{
  assert.equal(labelled('en','Source',UNKNOWN),'Source: UNKNOWN');
});
test('language selection accepts only exact fr',()=>{
  assert.equal(locale('fr'),'fr');
  assert.equal(locale('fr-CA'),'en');
  assert.equal(locale('en'),'en');
});
test('query language limits invalid and unexpected values',()=>{
  assert.equal(queryLocale('?lang=fr'),'fr');
  assert.equal(queryLocale('?lang=en'),'en');
  assert.equal(queryLocale('?lang=fr-CA'),'en');
  assert.equal(queryLocale('?lang=fr'.padEnd(600,'x')),'en');
});
test('copy dictionaries have identical interface keys',()=>{
  assert.deepEqual(Object.keys(COPY.en).sort(),Object.keys(COPY.fr).sort());
});
test('French copy has no user-facing prohibited phrases',()=>{
  const text=JSON.stringify(COPY.fr);
  assert.ok(!/vérif|verify|real-time|guarantee|partnership/iu.test(text));
});
test('coverage TSV has one header and one view row',()=>{
  const lines=coverageTsv(fixture()).trim().split('\n');
  assert.equal(lines.length,2);
  assert.ok(lines[0].includes('recordedNotices'));
});
test('coverage TSV preserves explicit counts',()=>{
  const lines=coverageTsv(fixture()).trim().split('\n');
  assert.ok(lines[1].includes('"2"'));
});
test('coverage TSV removes newline injection from view title',()=>{
  const input=modified(b=>{b.views[0].titleEn='First\nSecond';});
  assert.equal(coverageTsv(input).trim().split('\n').length,2);
});
test('coverage TSV neutralizes formula-prefixed view names',()=>{
  const input=modified(b=>{b.views[0].titleEn='=SUM(A1:A2)';});
  assert.ok(coverageTsv(input).includes("'=SUM(A1:A2)"));
});
test('coverage TSV neutralizes leading hyphen formula',()=>{
  const input=modified(b=>{b.views[0].titleEn='-2+3';});
  assert.ok(coverageTsv(input).includes("'-2+3"));
});
test('coverage TSV escapes double quotes',()=>{
  const input=modified(b=>{b.views[0].titleEn='A "quote"';});
  assert.ok(coverageTsv(input).includes('""quote""'));
});
for(const extension of ['html','json','txt','tsv']) {
  test(`download filename supports ${extension}`,()=>{
    const result=defaultFilename('fictional-map','fr',extension);
    assert.ok(result.endsWith(`-fr.${extension}`));
  });
}
test('download filename removes unsafe path characters',()=>{
  const result=defaultFilename('../evil/file','en','html');
  assert.ok(!result.includes('/'));
  assert.ok(result.endsWith('-en.html'));
});
test('download filename rejects unsupported extension',()=>{
  assert.throws(()=>defaultFilename('fictional-map','en','exe'),RangeError);
});
test('second fictional source does not get invented notice',()=>{
  const output=disclosureModel(secondSourceFixture(),'fictional-map');
  assert.equal(output.noticeRows.length,2);
  assert.ok(output.noticeRows.some(x=>x.source.id==='fictional-other'&&x.notice===null));
});
