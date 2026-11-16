import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditOfflinePages, pageText, type PageInput } from './p15d-pages.js';

function shell(lang: 'en' | 'fr'): PageInput {
  const other = lang === 'en' ? 'fr' : 'en';
  return { file: `${lang}.html`, html: `<!doctype html>
<html lang="${lang}"><head><title>Local places</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="data-source" content="Town open data">
<meta name="data-licence" content="OGL-ON-1.0">
<meta name="data-observed-on" content="2026-11-10">
</head><body>
<a href="#main" data-min-target="44">${lang === 'en' ? 'Skip to content' : 'Éviter le contenu'}</a>
<a href="${other}.html" hreflang="${other}" data-min-target="44">${other}</a>
<main id="main"><h1>Local places</h1><p>UNKNOWN</p>
<button type="button" data-min-target="44">Refresh local view</button>
<img src="logo.png" alt="">
<label for="area">Area</label><input id="area" data-min-target="44">
</main></body></html>` };
}
function run(edit: (html: string) => string, lang: 'en' | 'fr' = 'en'): string[] {
  const source = shell(lang);
  const pages = [shell('en'), shell('fr')];
  const index = lang === 'en' ? 0 : 1;
  pages[index] = { ...source, html: edit(source.html) };
  return auditOfflinePages(pages).issues.map(issue => issue.code);
}

describe('offline page checks', () => {
  it('accepts a basic bilingual shell with explicit metadata', () => {
    const result = auditOfflinePages([shell('en'), shell('fr')]);
    assert.equal(result.ok, true);
    assert.equal(result.issues.length, 0);
    assert.equal(result.pages, 2);
  });
  it('blocks a missing translated page', () => {
    assert.ok(auditOfflinePages([shell('en')]).issues.some(issue => issue.code === 'LANG_PAIR'));
  });
  it('blocks a missing doctype', () => {
    assert.ok(run(html => html.replace('<!doctype html>', '')).includes('DOCUMENT'));
  });
  it('blocks a missing closing document tag', () => {
    assert.ok(run(html => html.replace('</html>', '')).includes('DOCUMENT'));
  });
  it('blocks a missing language', () => {
    assert.ok(run(html => html.replace('lang="en"', '')).includes('LANG'));
  });
  it('blocks an unsupported document language', () => {
    assert.ok(run(html => html.replace('lang="en"', 'lang="es"')).includes('LANG'));
  });
  it('blocks an empty page title', () => {
    assert.ok(run(html => html.replace('<title>Local places</title>', '<title> </title>')).includes('TITLE'));
  });
  it('requires a responsive viewport', () => {
    assert.ok(run(html => html.replace('width=device-width', 'width=1000')).includes('VIEWPORT'));
  });
  it('requires exactly one main landmark', () => {
    assert.ok(run(html => html.replace('<main id="main">', '<div id="main">').replace('</main>', '</div>'))
      .includes('MAIN'));
  });
  it('rejects duplicated main landmarks', () => {
    assert.ok(run(html => html.replace('</main>', '<main>Extra</main></main>')).includes('MAIN'));
  });
  it('requires a keyboard skip link', () => {
    assert.ok(run(html => html.replace('Skip to content', 'Other')).includes('SKIP_LINK'));
  });
  it('requires an existing skip destination', () => {
    assert.ok(run(html => html.replace('href="#main"', 'href="#not-found"')).includes('SKIP_TARGET'));
  });
  it('requires a local language switch', () => {
    assert.ok(run(html => html.replace('hreflang="fr"', 'hreflang="en"')).includes('LANG_SWITCH'));
  });
  it('blocks remote stylesheet dependencies', () => {
    assert.ok(run(html => html.replace('</head>', '<link rel="stylesheet" href="https://cdn.example.org/a.css"></head>'))
      .includes('EXTERNAL_RESOURCE'));
  });
  it('blocks remote image URLs', () => {
    assert.ok(run(html => html.replace('logo.png', '//tiles.example.org/logo.png'))
      .includes('EXTERNAL_RESOURCE'));
  });
  it('blocks unsafe javascript links', () => {
    assert.ok(run(html => html.replace('href="fr.html"', 'href="javascript:alert(1)"'))
      .includes('INSECURE_REFERENCE'));
  });
  it('blocks inline event handlers', () => {
    assert.ok(run(html => html.replace('type="button"', 'type="button" onclick="go()"'))
      .includes('INLINE_HANDLER'));
  });
  it('blocks automatic refresh', () => {
    assert.ok(run(html => html.replace('</head>', '<meta http-equiv="refresh" content="5"></head>'))
      .includes('AUTO_REFRESH'));
  });
  it('blocks images without explicit alt text', () => {
    assert.ok(run(html => html.replace('alt=""', '')).includes('IMAGE_ALT'));
  });
  it('accepts deliberately empty decorative alt text', () => {
    assert.ok(!run(html => html).includes('IMAGE_ALT'));
  });
  it('blocks an unnamed button', () => {
    assert.ok(run(html => html.replace('Refresh local view', '')).includes('BUTTON_NAME'));
  });
  it('blocks an unnamed link', () => {
    assert.ok(run(html => html.replace('>fr</a>', '></a>')).includes('LINK_NAME'));
  });
  it('blocks an input with no accessible name', () => {
    assert.ok(run(html => html.replace('<label for="area">Area</label>', '')).includes('FORM_LABEL'));
  });
  it('accepts a labelled input', () => {
    assert.ok(!run(html => html).includes('FORM_LABEL'));
  });
  it('blocks controls below 44 pixels', () => {
    assert.ok(run(html => html.replace('data-min-target="44">Refresh', 'data-min-target="32">Refresh'))
      .includes('TOUCH_TARGET'));
  });
  it('accepts a CSS inline target with minimum dimensions', () => {
    assert.ok(!run(html => html.replace('data-min-target="44">Refresh',
      'style="min-width:44px;min-height:44px">Refresh')).includes('TOUCH_TARGET'));
  });
  it('blocks positive tab order', () => {
    assert.ok(run(html => html.replace('type="button"', 'tabindex="2" type="button"'))
      .includes('TABINDEX'));
  });
  it('blocks hidden focus outlines', () => {
    assert.ok(run(html => html.replace('</head>', '<style>:focus { outline: none; }</style></head>'))
      .includes('FOCUS_HIDDEN'));
  });
  it('blocks automatic media playback', () => {
    assert.ok(run(html => html.replace('</main>', '<audio autoplay controls></audio></main>'))
      .includes('AUTOPLAY'));
  });
  it('blocks duplicated ids', () => {
    assert.ok(run(html => html.replace('id="area"', 'id="main"')).includes('DUPLICATE_ID'));
  });
  it('blocks bad text direction', () => {
    assert.ok(run(html => html.replace('lang="en"', 'lang="en" dir="sideways"'))
      .includes('BAD_DIRECTION'));
  });
  it('requires a source metadata field', () => {
    assert.ok(run(html => html.replace('name="data-source"', 'name="other"'))
      .includes('MISSING_PROVENANCE'));
  });
  it('requires a licence metadata field', () => {
    assert.ok(run(html => html.replace('name="data-licence"', 'name="other"'))
      .includes('MISSING_LICENCE'));
  });
  it('rejects non-open document licences', () => {
    assert.ok(run(html => html.replace('content="OGL-ON-1.0"', 'content="private"'))
      .includes('MISSING_LICENCE'));
  });
  it('requires a calendar-valid observation date', () => {
    assert.ok(run(html => html.replace('2026-11-10', '2026-02-30')).includes('MISSING_DATE'));
  });
  it('blocks over-budget pages', () => {
    const result = auditOfflinePages([{ ...shell('en'), maxBytes: 10 }, shell('fr')]);
    assert.ok(result.issues.some(issue => issue.code === 'PAGE_SIZE'));
  });
  it('provides bilingual diagnostics', () => {
    const report = auditOfflinePages([shell('en')]);
    assert.match(pageText(report, 'en'), /Both English and French/);
    assert.match(pageText(report, 'fr'), /Les pages anglaise et française/);
  });
});
