import test from 'node:test';
import assert from 'node:assert/strict';
import { CORRECTION_COPY, correctionCopy, fieldLabel, formatField, formatValue,
  escapeHtml, listFindingText, caseText, sourceText, surfaceText,
  renderCorrectionText, renderCorrectionJson, renderCorrectionHtml, correctionFormats } from './correction-report.mjs';
import { auditCorrections } from './correction-audit.mjs';
import { compareCorrections } from './correction-change.mjs';
import { register, clone, emptyRegister } from './correction-fixtures.mjs';
const get=(input=register())=>({input,audit:auditCorrections(input)});
test('English catalogue exists',()=>assert.ok(CORRECTION_COPY.en.title));
test('French catalogue exists',()=>assert.ok(CORRECTION_COPY.fr.title));
test('English is default copy',()=>assert.equal(correctionCopy('en'),CORRECTION_COPY.en));
test('French selection gets French copy',()=>assert.equal(correctionCopy('fr'),CORRECTION_COPY.fr));
test('unknown locale falls back to English',()=>assert.equal(correctionCopy('es'),CORRECTION_COPY.en));
test('French copy preserves typographic apostrophe',()=>assert.ok(correctionCopy('fr').disclaimer.includes('’')));
test('French copy does not provide a favourable unknown status',()=>assert.equal(correctionCopy('fr').unknown,'UNKNOWN'));
test('English copy leaves unknown literal',()=>assert.equal(correctionCopy('en').unknown,'UNKNOWN'));
test('field label English is localized',()=>assert.equal(fieldLabel('en','datasetDate'),'Dataset date'));
test('field label French is localized',()=>assert.equal(fieldLabel('fr','datasetDate'),'Données en date du'));
test('unrecognized field label is preserved',()=>assert.equal(fieldLabel('fr','customField'),'customField'));
test('French field has nonbreaking space before colon',()=>assert.equal(formatField('fr','language','fr'),'Langue\u00a0: fr'));
test('French data date uses nonbreaking space',()=>assert.equal(formatField('fr','datasetDate','UNKNOWN'),'Données en date du\u00a0: UNKNOWN'));
test('English field uses normal colon',()=>assert.equal(formatField('en','language','en'),'Language: en'));
test('UNKNOWN formatting is literal',()=>assert.equal(formatValue('UNKNOWN'),'UNKNOWN'));
test('undefined becomes UNKNOWN',()=>assert.equal(formatValue(undefined),'UNKNOWN'));
test('null becomes UNKNOWN',()=>assert.equal(formatValue(null),'UNKNOWN'));
test('numeric target is stringified',()=>assert.equal(formatValue(44),'44'));
test('array formats as joined list',()=>assert.equal(formatValue(['a','b']),'a, b'));
test('escapeHtml escapes markup opener',()=>assert.equal(escapeHtml('<script>'),'&lt;script&gt;'));
test('escapeHtml escapes ampersand',()=>assert.equal(escapeHtml('a&b'),'a&amp;b'));
test('escapeHtml escapes quotation marks',()=>assert.equal(escapeHtml('"a"'),'&quot;a&quot;'));
test('escapeHtml escapes apostrophe',()=>assert.equal(escapeHtml("it's"),'it&#39;s'));
test('escapeHtml escapes closing angle bracket',()=>assert.equal(escapeHtml('>'),'&gt;'));
test('empty English findings use a plain empty message',()=>assert.match(listFindingText([],'en'),/No entries/u));
test('empty French findings use a localized message',()=>assert.match(listFindingText([],'fr'),/Aucune entrée/u));
test('finding text includes path',()=>assert.match(listFindingText([{level:'block',code:'X',path:'a.b',detail:'missing'}],'en'),/a\.b/u));
test('finding text includes severity',()=>assert.match(listFindingText([{level:'block',code:'X',path:'a',detail:'missing'}],'en'),/\[block\]/u));
test('finding text includes detail',()=>assert.match(listFindingText([{level:'info',code:'X',path:'a',detail:'UNKNOWN'}],'en'),/UNKNOWN/u));
test('case text contains its identifier',()=>assert.match(caseText(register().cases[0],'en'),/case-one/u));
test('case text records disposition',()=>assert.match(caseText(register().cases[0],'en'),/accept/u));
test('case text includes supporting evidence ID',()=>assert.match(caseText(register().cases[0],'en'),/map-evidence/u));
test('case French text contains nonbreaking-colon label',()=>assert.match(caseText(register().cases[0],'fr'),/Décision\u00a0:/u));
test('source text contains licence',()=>assert.match(sourceText(register().sources[0],'en'),/ODbL-1\.0/u));
test('source text contains source URL',()=>assert.match(sourceText(register().sources[0],'en'),/openstreetmap/u));
test('source text preserves UNKNOWN dataset date',()=>assert.match(sourceText(register().sources[0],'en'),/Dataset date: UNKNOWN/u));
test('source text includes terms reviewed date',()=>assert.match(sourceText(register().sources[0],'en'),/2026-10-01/u));
test('surface text contains relative route',()=>assert.match(surfaceText(register().surfaces[0],'en'),/pages\/map-en\.html/u));
test('surface text contains 44 pixel target',()=>assert.match(surfaceText(register().surfaces[0],'en'),/44/u));
test('surface text includes source reference',()=>assert.match(surfaceText(register().surfaces[0],'en'),/osm-one/u));
test('text report contains release identifier',()=>{const {input,audit}=get();assert.match(renderCorrectionText(input,audit),/release-one/u);});
test('text report contains source heading',()=>{const {input,audit}=get();assert.match(renderCorrectionText(input,audit),/Sources/u);});
test('text report contains correction cases',()=>{const {input,audit}=get();assert.match(renderCorrectionText(input,audit),/Correction cases/u);});
test('text report includes recorded case rationale',()=>{const {input,audit}=get();assert.match(renderCorrectionText(input,audit),/Source conditions support/u);});
test('text report includes audit finding',()=>{const {input,audit}=get();assert.match(renderCorrectionText(input,audit),/DATASET_DATE_UNKNOWN/u);});
test('text report includes caveat about source evidence',()=>{const {input,audit}=get();assert.match(renderCorrectionText(input,audit),/supplied evidence/u);});
test('text report ends with a newline',()=>{const {input,audit}=get();assert.ok(renderCorrectionText(input,audit).endsWith('\n'));});
test('text report localized to French',()=>{const {input,audit}=get();assert.match(renderCorrectionText(input,audit,'fr'),/Dossiers de correction/u);});
test('text report carries unknown date in French',()=>{const {input,audit}=get();assert.match(renderCorrectionText(input,audit,'fr'),/Données en date du\u00a0: UNKNOWN/u);});
test('text report includes comparison heading',()=>{
 const x=register(),y=clone(x);y.sources[0].permission='NO';const comparison=compareCorrections(x,y);
 assert.match(renderCorrectionText(y,auditCorrections(y),'en',comparison),/Changes since previous release/u);
});
test('text report includes comparison direction',()=>{
 const x=register(),y=clone(x);y.sources[0].permission='NO';const comparison=compareCorrections(x,y);
 assert.match(renderCorrectionText(y,auditCorrections(y),'en',comparison),/YES → NO/u);
});
test('JSON report has exact schema',()=>{const {input,audit}=get();assert.equal(JSON.parse(renderCorrectionJson(input,audit)).schema,'attribution-correction-report/1');});
test('JSON report keeps complete audit',()=>{const {input,audit}=get();assert.equal(JSON.parse(renderCorrectionJson(input,audit)).audit.releaseId,'release-one');});
test('JSON report keeps source dates',()=>{const {input,audit}=get();assert.equal(JSON.parse(renderCorrectionJson(input,audit)).register.sources[0].datasetDate,'UNKNOWN');});
test('JSON report keeps collection shapes',()=>{const {input,audit}=get();assert.equal(JSON.parse(renderCorrectionJson(input,audit)).register.surfaces.length,1);});
test('JSON report retains null comparison',()=>{const {input,audit}=get();assert.equal(JSON.parse(renderCorrectionJson(input,audit)).comparison,null);});
test('JSON report ends in newline',()=>{const {input,audit}=get();assert.ok(renderCorrectionJson(input,audit).endsWith('\n'));});
test('HTML report has HTML5 doctype',()=>{const {input,audit}=get();assert.match(renderCorrectionHtml(input,audit),/^<!doctype html>/u);});
test('HTML English language is announced',()=>{const {input,audit}=get();assert.match(renderCorrectionHtml(input,audit),/<html lang="en">/u);});
test('HTML French language is announced',()=>{const {input,audit}=get();assert.match(renderCorrectionHtml(input,audit,'fr'),/<html lang="fr">/u);});
test('HTML report has a main landmark',()=>{const {input,audit}=get();assert.match(renderCorrectionHtml(input,audit),/<main id="main">/u);});
test('HTML report has a skip link',()=>{const {input,audit}=get();assert.match(renderCorrectionHtml(input,audit),/href="#main"/u);});
test('HTML report contains restrictive CSP',()=>{const {input,audit}=get();assert.match(renderCorrectionHtml(input,audit),/connect-src &#39;none&#39;/u);});
test('HTML report blocks form submissions',()=>{const {input,audit}=get();assert.match(renderCorrectionHtml(input,audit),/form-action &#39;none&#39;/u);});
test('HTML report contains no remote script',()=>{const {input,audit}=get();assert.doesNotMatch(renderCorrectionHtml(input,audit),/<script\b/iu);});
test('HTML report provides visible focus style',()=>{const {input,audit}=get();assert.match(renderCorrectionHtml(input,audit),/:focus-visible/u);});
test('HTML report minimum link target is 44px',()=>{const {input,audit}=get();assert.match(renderCorrectionHtml(input,audit),/min-width:44px;min-height:44px/u);});
test('HTML report supports reduced motion',()=>{const {input,audit}=get();assert.match(renderCorrectionHtml(input,audit),/prefers-reduced-motion/u);});
test('HTML report is self-contained',()=>{const {input,audit}=get();assert.doesNotMatch(renderCorrectionHtml(input,audit),/<link\b/iu);});
test('HTML report HTML-escapes a malicious case summary',()=>{
 const input=register();input.cases[0].summary='<img src=x onerror=alert(1)>';
 const report=renderCorrectionHtml(input,auditCorrections(input));
 assert.ok(report.includes('&lt;img'));assert.ok(!report.includes('<img src=x'));
});
test('HTML report HTML-escapes source name',()=>{
 const input=register();input.sources[0].name='<source>';
 const report=renderCorrectionHtml(input,auditCorrections(input));
 assert.ok(report.includes('&lt;source&gt;'));assert.ok(!report.includes('<source>'));
});
test('HTML report does not inject evidence string',()=>{
 const input=register();input.cases[0].decisionNote='</article><script>alert(1)</script>';
 const report=renderCorrectionHtml(input,auditCorrections(input));
 assert.ok(report.includes('&lt;/article&gt;'));assert.doesNotMatch(report,/<script>/u);
});
test('HTML report contains status region',()=>{const {input,audit}=get();assert.match(renderCorrectionHtml(input,audit),/role="status"/u);});
test('HTML report displays blocked status after bad source',()=>{
 const input=register();input.sources[0].permission='UNKNOWN';
 assert.match(renderCorrectionHtml(input,auditCorrections(input)),/Publication blocked/u);
});
test('HTML report displays empty state for no sources',()=>{
 const input=emptyRegister();assert.match(renderCorrectionHtml(input,auditCorrections(input)),/No entries/u);
});
test('HTML report renders comparison entries',()=>{
 const x=register(),y=clone(x);y.sources[0].permission='NO';
 assert.match(renderCorrectionHtml(y,auditCorrections(y),'en',compareCorrections(x,y)),/sources-changed/u);
});
test('HTML report includes actual source licence',()=>{const {input,audit}=get();assert.match(renderCorrectionHtml(input,audit),/ODbL-1\.0/u);});
test('HTML report includes UNKNOWN date',()=>{const {input,audit}=get();assert.match(renderCorrectionHtml(input,audit),/UNKNOWN/u);});
test('HTML French report uses typographic apostrophe',()=>{const {input,audit}=get();assert.match(renderCorrectionHtml(input,audit,'fr'),/d’attribution/u);});
test('HTML French report preserves nonbreaking space in displayed date label',()=>{const {input,audit}=get();assert.match(renderCorrectionHtml(input,audit,'fr'),/Données en date du/u);});
test('all three report formats are exposed',()=>{const {input,audit}=get();assert.deepEqual(Object.keys(correctionFormats(input,audit)).sort(),['html','json','text']);});
test('format collection does not mutate evidence',()=>{
 const input=register(),snapshot=JSON.stringify(input);correctionFormats(input,auditCorrections(input));assert.equal(JSON.stringify(input),snapshot);
});
