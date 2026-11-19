import test from 'node:test';
import assert from 'node:assert/strict';
import { renderTierText, renderTierHtml, renderTierJson, renderComparisonText, escapeHtml, translations, displayValue } from './tier-report.mjs';
import { ledger,record,surface } from './tier-fixtures.mjs';
import { auditTierLedger } from './tier-audit.mjs';

test('both languages have complete translation key parity',()=>{
  assert.deepEqual(Object.keys(translations('en')).sort(),Object.keys(translations('fr')).sort());
});
test('unsupported language is rejected',()=>{
  for(const locale of ['de','es','FR','fr-CA',null,undefined])assert.throws(()=>translations(locale),TypeError);
});
test('all user-visible translation keys have non-empty values',()=>{
  for(const locale of ['en','fr'])for(const [key,value] of Object.entries(translations(locale))){assert.equal(typeof value,'string',key);assert.ok(value.length>0,key);}
});
test('unknown stays UNKNOWN in both languages',()=>{
  for(const locale of ['en','fr'])assert.equal(displayValue('UNKNOWN',locale),'UNKNOWN');
});
test('tier labels are translated without changing underlying value',()=>{
  assert.equal(displayValue('primary','en'),'Primary');assert.equal(displayValue('primary','fr'),'Primaire');
  assert.equal(displayValue('secondary','en'),'Secondary');assert.equal(displayValue('secondary','fr'),'Secondaire');
});
test('permission labels are translated',()=>{
  assert.equal(displayValue('YES','en'),'Yes');assert.equal(displayValue('YES','fr'),'Oui');
  assert.equal(displayValue('NO','en'),'No');assert.equal(displayValue('NO','fr'),'Non');
});
test('empty string remains empty instead of being mistaken for UNKNOWN',()=>assert.equal(displayValue('','fr'),''));
test('missing fields in output are UNKNOWN, not a guess',()=>assert.equal(displayValue(null,'en'),'UNKNOWN'));
test('arrays are rendered in their original order',()=>assert.equal(displayValue(['b','a'],'en'),'b, a'));
test('text output exposes recorded dates and no inferred dataset date',()=>{
  const report=renderTierText(ledger());
  assert.ok(report.includes('Dataset date: UNKNOWN'));
  assert.ok(report.includes('Acquired: 2026-11-01'));
  assert.ok(report.includes('Terms reviewed: 2026-11-02'));
});
test('French label uses U+00A0 immediately before colon',()=>{
  const report=renderTierText(ledger(),'fr');
  for(const label of ['Version','Données en date du','Niveau de preuve','Permission','Licence'])assert.ok(report.includes(`${label}\u00a0:`),label);
  assert.ok(!report.includes('Données en date du :'));
});
test('source names and links appear in text report',()=>{
  const report=renderTierText(ledger());
  assert.ok(report.includes('https://www.openstreetmap.org/copyright'));
  assert.ok(report.includes('Open Database License'));
  assert.ok(report.includes('© OpenStreetMap contributors'));
});
test('text report includes publication metadata',()=>{
  const report=renderTierText(ledger(),'fr');
  assert.ok(report.includes('map-en (en)'));
  assert.ok(report.includes('Cible minimale'));
  assert.ok(report.includes('44'));
});
test('text report includes audit findings',()=>{
  const report=renderTierText(ledger({records:[record({permission:'UNKNOWN'})]}));
  assert.ok(report.includes('PERMISSION_UNKNOWN'));
  assert.ok(report.includes('Permission UNKNOWN'));
});
test('healthy report has no fabricated blocked verdict',()=>{
  const report=renderTierText(ledger());
  assert.ok(report.includes('No blocking findings in supplied records'));
});
test('HTML uses required language attribute',()=>{
  assert.match(renderTierHtml(ledger(),'en'),/<html lang="en">/u);
  assert.match(renderTierHtml(ledger(),'fr'),/<html lang="fr">/u);
});
test('HTML contains restrictive CSP and no scripts',()=>{
  const html=renderTierHtml(ledger());
  assert.ok(html.includes("connect-src 'none'"));
  assert.ok(html.includes("script-src 'none'"));
  assert.ok(!/<script\b/iu.test(html));
});
test('HTML has skip navigation and semantic landmarks',()=>{
  const html=renderTierHtml(ledger());
  for(const tag of ['<header>','<main id="content">','<section','<h1>','<h2','<h3','<dl>','<dt>','<dd>'])assert.ok(html.includes(tag),tag);
  assert.ok(html.includes('href="#content"'));
});
test('HTML has at least 44px links and visible focus',()=>{
  const html=renderTierHtml(ledger());
  assert.match(html,/min-width:44px/u);
  assert.match(html,/min-height:44px/u);
  assert.match(html,/:focus-visible/u);
});
test('HTML includes reduced-motion CSS',()=>assert.ok(renderTierHtml(ledger()).includes('prefers-reduced-motion')));
test('HTML includes plain text status for assistive technology',()=>assert.ok(renderTierHtml(ledger()).includes('role="status"')));
test('HTML displays a valid HTTPS source link',()=>{
  const html=renderTierHtml(ledger());
  assert.ok(html.includes('href="https://www.openstreetmap.org/copyright"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
});
test('HTML never creates a link for UNKNOWN URL',()=>{
  const input=ledger({records:[record({sourceUrl:'UNKNOWN'})]});
  const html=renderTierHtml(input);
  assert.ok(html.includes('<span>UNKNOWN</span>'));
  assert.ok(!html.includes('href="UNKNOWN"'));
});
test('HTML escapes hostile record names and notes',()=>{
  const input=ledger({records:[record({name:'<script>alert(1)</script>',notes:'"><img src=x>'})]});
  const html=renderTierHtml(input);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;img src=x&gt;'));
});
test('HTML escapes hostile attribution instead of interpolating markup',()=>{
  const input=ledger({records:[record({attribution:'© OpenStreetMap contributors <b>bad</b>'})]});
  const html=renderTierHtml(input);
  assert.ok(html.includes('&lt;b&gt;bad&lt;/b&gt;'));
  assert.ok(!html.includes('<b>bad</b>'));
});
test('HTML escaping includes all structural punctuation',()=>{
  assert.equal(escapeHtml(`&<>"'`),'&amp;&lt;&gt;&quot;&#39;');
});
test('HTML renders release-specific findings with stable codes',()=>{
  const input=ledger({records:[record({permission:'NO'})]});
  assert.ok(renderTierHtml(input).includes('PERMISSION_DENIED'));
});
test('HTML uses locale-specific headings',()=>{
  assert.ok(renderTierHtml(ledger(),'fr').includes('Niveaux de preuve des sources'));
  assert.ok(renderTierHtml(ledger(),'en').includes('Attribution evidence tiers'));
});
test('HTML protects data from remote fetching',()=>{
  const html=renderTierHtml(ledger());
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(html.includes("img-src 'none'"));
});
test('HTML contains full source evidence and terms',()=>{
  const html=renderTierHtml(ledger(),'fr');
  assert.ok(html.includes('Open Database License (ODbL) 1.0'));
  assert.ok(html.includes('2026-11-02'));
});
test('JSON is structured and parseable',()=>{
  const payload=JSON.parse(renderTierJson(ledger()));
  assert.equal(payload.schema,'attribution-tier-report/1');
  assert.equal(payload.ledger.release,'release-one');
  assert.equal(payload.audit.blocked,false);
});
test('JSON keeps literal UNKNOWN',()=>{
  const payload=JSON.parse(renderTierJson(ledger()));
  assert.equal(payload.ledger.records[0].sourceDate,'UNKNOWN');
});
test('JSON includes blocking findings',()=>{
  const payload=JSON.parse(renderTierJson(ledger({records:[record({permission:'UNKNOWN'})]})));
  assert.ok(payload.audit.findings.some(f=>f.code==='PERMISSION_UNKNOWN'));
});
test('JSON does not include implicit clock dates',()=>{
  const payload=JSON.parse(renderTierJson(ledger()));
  assert.equal(payload.audit.asOf,'UNKNOWN');
});
test('JSON respects an explicitly supplied comparison date',()=>{
  const payload=JSON.parse(renderTierJson(ledger(),{asOf:'2026-11-01'}));
  assert.equal(payload.audit.asOf,'2026-11-01');
});
test('supplied audit can be used consistently in text output',()=>{
  const input=ledger();
  const audit=auditTierLedger(input);
  assert.equal(renderTierText(input,'en',audit),renderTierText(input,'en'));
});
test('supplied audit can be used consistently in HTML output',()=>{
  const input=ledger();
  const audit=auditTierLedger(input);
  assert.equal(renderTierHtml(input,'fr',audit),renderTierHtml(input,'fr'));
});
test('comparison text contains differences and status',()=>{
  const current=ledger({surfaces:[surface({targetPx:43})]});
  const output=renderComparisonText(ledger(),current);
  assert.ok(output.includes('Release changes'));
  assert.ok(output.includes('targetPx'));
  assert.ok(output.includes('Blocked'));
});
test('unchanged comparison indicates no differences',()=>{
  const output=renderComparisonText(ledger(),ledger(),'fr');
  assert.ok(output.includes('Aucun changement'));
});
test('comparison includes previous and current release IDs',()=>{
  const output=renderComparisonText(ledger(),ledger({release:'release-two'}),'fr');
  assert.ok(output.includes('release-one'));
  assert.ok(output.includes('release-two'));
});
test('French comparison labels use NBSP',()=>{
  const output=renderComparisonText(ledger(),ledger({release:'release-two'}),'fr');
  assert.ok(output.includes('Avant\u00a0:'));
  assert.ok(output.includes('Après\u00a0:'));
});
import { renderComparisonHtml } from './tier-report.mjs';
test('HTML comparison includes changed source and field names',()=>{
  const html=renderComparisonHtml(ledger(),ledger({surfaces:[surface({targetPx:43})]}));
  assert.ok(html.includes('targetPx'));
  assert.ok(html.includes('map-en'));
  assert.ok(html.includes('Blocked'));
});
test('HTML comparison escapes hostile metadata',()=>{
  const old=ledger();
  const next=ledger({records:[record({notes:'<svg onload=bad>'})]});
  const html=renderComparisonHtml(old,next);
  assert.ok(html.includes('&lt;svg onload=bad&gt;'));
  assert.ok(!html.includes('<svg onload=bad>'));
});
test('HTML comparison declares no changes when identical',()=>{
  const html=renderComparisonHtml(ledger(),ledger(),'fr');
  assert.ok(html.includes('Aucun changement'));
});
test('HTML comparison in French uses U+00A0 before colon',()=>{
  const html=renderComparisonHtml(ledger(),ledger(),'fr');
  assert.ok(html.includes('Avant\u00a0:'));
  assert.ok(html.includes('Après\u00a0:'));
});
