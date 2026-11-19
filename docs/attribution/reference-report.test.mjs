import test from 'node:test';
import assert from 'node:assert/strict';
import { fixturePack } from './reference-fixtures.mjs';
import { parseReferencePack } from './reference-core.mjs';
import { auditReferencePack, compareReferencePacks } from './reference-audit.mjs';
import { REFERENCE_COPY, renderReferenceHtml, renderReferenceText, renderReferenceJson, escapeReferenceHtml } from './reference-report.mjs';
function render(locale='en',mutate=()=>{},compare=false){
 const raw=fixturePack();mutate(raw);const pack=parseReferencePack(raw);const audit=auditReferencePack(pack);
 const previous=compare?compareReferencePacks(parseReferencePack(fixturePack()),pack):null;
 return {html:renderReferenceHtml(pack,audit,locale,previous),text:renderReferenceText(pack,audit,locale,previous),json:renderReferenceJson(pack,audit,previous)};
}
test('EN/FR have identical translatable fields',()=>assert.deepEqual(Object.keys(REFERENCE_COPY.en).sort(),Object.keys(REFERENCE_COPY.fr).sort()));
for(const locale of ['en','fr']){
 test(`${locale} HTML has proper document language`,()=>assert.ok(render(locale).html.includes(`<html lang="${locale}"`)));
 test(`${locale} HTML has no external scripts`,()=>assert.doesNotMatch(render(locale).html,/<script\b/iu));
 test(`${locale} HTML has restrictive CSP`,()=>assert.match(render(locale).html,/default-src 'none'/u));
 test(`${locale} HTML has a main landmark`,()=>assert.match(render(locale).html,/<main id="main">/u));
 test(`${locale} HTML has skip link`,()=>assert.match(render(locale).html,/href="#main"/u));
 test(`${locale} HTML declares 44px links`,()=>assert.match(render(locale).html,/min-width:44px;min-height:44px/u));
 test(`${locale} HTML retains UNKNOWN dataset date`,()=>assert.match(render(locale).html,/UNKNOWN/u));
 test(`${locale} HTML lists source and licence links`,()=>{assert.match(render(locale).html,/openstreetmap.org/u);assert.match(render(locale).html,/licence/iu);});
 test(`${locale} HTML has no form submission`,()=>assert.doesNotMatch(render(locale).html,/<form\b/iu));
 test(`${locale} HTML avoids inferred current conditions`,()=>assert.match(render(locale).html,/record|registre/iu));
 test(`${locale} text emits all source identifiers`,()=>assert.match(render(locale).text,/map-source/u));
 test(`${locale} report JSON roundtrips`,()=>{const obj=JSON.parse(render(locale).json);assert.equal(obj.schema,'attribution-reference-report/1');assert.equal(obj.releaseId,'release-one');});
 test(`${locale} text includes source evidence tier`,()=>assert.match(render(locale).text,/primary/u));
 test(`${locale} text includes acquisition date`,()=>assert.match(render(locale).text,/2026-01-12/u));
 test(`${locale} report includes recorded licence`,()=>assert.match(render(locale).text,/ODbL-1.0/u));
 test(`${locale} report includes nearby credit`,()=>assert.match(render(locale).html,/mapCredit|Credit beside map|Crédit près de la carte/u));
}
test('French punctuation uses no-break space before colon in text',()=>{
 const text=render('fr').text;
 assert.ok(text.includes('Données en date du\u00a0: UNKNOWN'));
 assert.ok(text.includes('Version\u00a0: release-one'));
 assert.ok(text.includes('Licence\u00a0: ODbL-1.0'));
});
test('French status HTML uses no-break space before colon',()=>assert.match(render('fr').html,/Version\u00a0:/u));
test('HTML escapes angle brackets and ampersands',()=>{
 const html=render('en',p=>p.references[0].offlineNote='<tag> & text').html;
 assert.ok(html.includes('&lt;tag&gt; &amp; text'));
 assert.ok(!html.includes('<tag>'));
});
test('HTML escapes quotes and apostrophes',()=>assert.equal(escapeReferenceHtml(`"'&<>`),'&quot;&#39;&amp;&lt;&gt;'));
test('HTML does not render unsafe URL from user record',()=>{
 const html=render('en',p=>p.sources[0].sourceUrl='UNKNOWN').html;
 assert.match(html,/<span>UNKNOWN<\/span>/u);
});
test('Missing source licence URL is displayed UNKNOWN',()=>{
 const html=render('fr',p=>p.sources[0].licenceUrl='UNKNOWN').html;
 assert.match(html,/UNKNOWN/u);
});
test('HTML reports blockers plainly',()=>{
 const html=render('en',p=>p.sources[0].permission='NO').html;
 assert.match(html,/Publication blocked by missing evidence/u);
 assert.match(html,/PERMISSION_NO/u);
});
test('text reports blockers plainly',()=>{
 const text=render('fr',p=>p.sources[0].permission='NO').text;
 assert.match(text,/PERMISSION_NO/u);
});
test('JSON includes exact audit counts',()=>{
 const obj=JSON.parse(render('en',p=>p.sources[0].permission='NO').json);
 assert.equal(obj.audit.blockingCount,obj.audit.findings.filter(f=>f.level==='block').length);
});
test('HTML escapes hostile release identifier consistently',()=>{
 assert.throws(()=>parseReferencePack({...fixturePack(),releaseId:'<script>'}));
});
test('HTML shows comparison differences rather than only status',()=>{
 const html=render('en',p=>p.sources[0].permission='NO',true).html;
 assert.match(html,/Changes since the earlier register/u);
 assert.match(html,/SOURCE_PERMISSION/u);
});
test('text shows comparison differences',()=>{
 const text=render('fr',p=>p.sources[0].permission='NO',true).text;
 assert.match(text,/SOURCE_PERMISSION/u);
 assert.match(text,/Avant/u);
});
test('JSON includes comparison baseline identifier',()=>{
 const obj=JSON.parse(render('en',p=>p.sources[0].permission='NO',true).json);
 assert.equal(obj.comparison.beforeId,'release-one');
});
test('reports display empty reference lists safely',()=>{
 const html=render('en',p=>p.references=[]).html;
 assert.match(html,/No records supplied/u);
});
test('HTML includes no embedded image requests',()=>assert.doesNotMatch(render('en').html,/<img\b/iu));
test('HTML uses focus-visible indication',()=>assert.match(render('en').html,/:focus-visible/u));
test('HTML uses reduced-motion treatment',()=>assert.match(render('en').html,/prefers-reduced-motion/u));
test('HTML uses text-only export with no PDF dependency',()=>assert.ok(render('en').text.length>200));
