import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditLocaleCatalog, type LocaleCatalog, type LocalizedEntry } from './p15e-locales.js';

const label = (key: string, kind: LocalizedEntry['kind'], en: string, fr: string,
  targetPx?: number): LocalizedEntry => ({
    key, kind, en, fr, placeholders: [], context: 'Offline navigation',
    ...(targetPx === undefined ? {} : { targetPx }),
  });
const entries: LocalizedEntry[] = [
  label('title', 'heading', 'Places', 'Lieux'),
  label('skip', 'action', 'Skip content', 'Aller au contenu', 44),
  label('switch', 'action', 'Change language', 'Changer de langue', 44),
  label('unknown', 'status', 'Unknown', 'Inconnu'),
];
const page = {
  id: 'places', enPath: 'en/places.html', frPath: 'fr/places.html',
  keyRefs: ['title', 'skip', 'switch', 'unknown'],
  headingKey: 'title', skipKey: 'skip', switchKey: 'switch', statusKey: 'unknown',
};
const base: LocaleCatalog = { schemaVersion: 1, entries, pages: [page] };
function check(changes: Record<string, unknown> = {}) {
  return auditLocaleCatalog({ ...base, ...changes });
}
function fail(changes: Record<string, unknown>, code: string) {
  const result = check(changes);
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.ok(result.findings.some(f => f.code === code), JSON.stringify(result.findings));
  assert.ok(result.findings.every(f => f.en.length > 5 && f.fr.length > 5));
  return result;
}
function edited(key: string, change: Partial<LocalizedEntry>): LocalizedEntry[] {
  return entries.map(value => value.key === key ? { ...value, ...change } : value);
}
describe('offline bilingual catalogue', () => {
  it('accepts a complete bilingual offline page catalogue', () => {
    const report = check();
    assert.equal(report.ok, true, JSON.stringify(report));
    assert.equal(report.summary.unknownLabels, 1);
    assert.equal(report.summary.actions, 2);
  });
  it('fails on missing French text', () => {
    fail({ entries: edited('skip', { fr: '' }) }, 'ENTRY');
  });
  it('fails on missing English text', () => {
    fail({ entries: edited('skip', { en: '' }) }, 'ENTRY');
  });
  it('fails on unsafe HTML', () => {
    fail({ entries: edited('title', { en: '<script>alert(1)</script>' }) }, 'UNSAFE');
  });
  it('fails on inline event handlers', () => {
    fail({ entries: edited('title', { en: '<span onclick=evil()>Places</span>' }) }, 'UNSAFE');
  });
  it('fails on personal emails in user-facing text', () => {
    fail({ entries: edited('title', { en: 'Ask somebody@example.com' }) }, 'UNSAFE');
  });
  it('enforces 44px on action targets', () => {
    fail({ entries: edited('skip', { targetPx: 43 }) }, 'TARGET');
  });
  it('enforces an explicit target declaration', () => {
    fail({ entries: edited('switch', { targetPx: undefined }) }, 'TARGET');
  });
  it('rejects target sizes that are not integers', () => {
    fail({ entries: edited('skip', { targetPx: 44.5 }) }, 'TARGET');
  });
  it('accepts a declared 48px target', () => {
    assert.equal(check({ entries: edited('skip', { targetPx: 48 }) }).ok, true);
  });
  it('requires the unknown label to remain explicit', () => {
    fail({ entries: edited('unknown', { en: 'Accessible' }) }, 'STATUS');
  });
  it('requires the French unknown label to remain explicit', () => {
    fail({ entries: edited('unknown', { fr: 'Accessible' }) }, 'STATUS');
  });
  it('requires a status label named unknown', () => {
    fail({ entries: entries.filter(e => e.key !== 'unknown') }, 'STATUS');
  });
  it('blocks blanket accessibility promises in status text', () => {
    fail({ entries: edited('unknown', { en: 'Always accessible' }) }, 'UNSAFE');
  });
  it('blocks different placeholder tokens across languages', () => {
    fail({ entries: edited('title', {
      en: 'Place {place}', fr: 'Lieu {nom}', placeholders: ['place'],
    }) }, 'PLACEHOLDERS');
  });
  it('accepts identical placeholders in both translations', () => {
    assert.equal(check({ entries: edited('title', {
      en: 'Place {place}', fr: 'Lieu {place}', placeholders: ['place'],
    }) }).ok, true);
  });
  it('blocks undeclared placeholder tokens', () => {
    fail({ entries: edited('title', { en: 'Place {place}' }) }, 'PLACEHOLDERS');
  });
  it('blocks extra braces which could create broken UI text', () => {
    fail({ entries: edited('title', { en: 'Place {broken' }) }, 'PLACEHOLDERS');
  });
  it('rejects duplicate tokens in declared placeholder list', () => {
    fail({ entries: edited('title', { en: '{place} {place}', fr: '{place} {place}',
      placeholders: ['place', 'place'] }) }, 'PLACEHOLDER_NAME');
  });
  it('enforces typographic French apostrophes', () => {
    fail({ entries: edited('title', { fr: "L'accessibilité" }) }, 'FR_APOSTROPHE');
  });
  it('accepts typographic French apostrophes', () => {
    assert.equal(check({ entries: edited('title', { fr: 'L’accessibilité' }) }).ok, true);
  });
  it('enforces nonbreaking space before French colon', () => {
    fail({ entries: edited('title', { fr: 'Lieu : accès' }) }, 'FR_COLON');
  });
  it('accepts nonbreaking space before French colon', () => {
    assert.equal(check({ entries: edited('title', { fr: 'Lieu\u00a0: accès' }) }).ok, true);
  });
  it('enforces narrow nonbreaking space before French question mark', () => {
    fail({ entries: edited('title', { fr: 'Où ?' }) }, 'FR_PUNCT');
  });
  it('enforces narrow nonbreaking space before French semicolon', () => {
    fail({ entries: edited('title', { fr: 'Oui ; non' }) }, 'FR_PUNCT');
  });
  it('enforces narrow nonbreaking space before French exclamation mark', () => {
    fail({ entries: edited('title', { fr: 'Attention !' }) }, 'FR_PUNCT');
  });
  it('accepts narrow nonbreaking spaces for French punctuation', () => {
    assert.equal(check({ entries: edited('title', { fr: 'Oui\u202f; non\u202f!' }) }).ok, true);
  });
  it('enforces spaces inside French guillemets', () => {
    fail({ entries: edited('title', { fr: '«Lieu»' }) }, 'FR_GUILLEMET');
  });
  it('accepts French guillemets with narrow nonbreaking spaces', () => {
    assert.equal(check({ entries: edited('title', { fr: '«\u202fLieu\u202f»' }) }).ok, true);
  });
  it('requires local page paths', () => {
    fail({ pages: [{ ...page, enPath: 'https://example.org/en' }] }, 'PAGE_PATH');
  });
  it('requires separate English and French page paths', () => {
    fail({ pages: [{ ...page, frPath: 'en/places.html' }] }, 'PAGE_PATH');
  });
  it('rejects path traversal in locale paths', () => {
    fail({ pages: [{ ...page, frPath: '../fr/places.html' }] }, 'PAGE_PATH');
  });
  it('rejects missing linked translation', () => {
    fail({ pages: [{ ...page, keyRefs: [...page.keyRefs, 'missing'] }] }, 'REFERENCE');
  });
  it('rejects omitted heading references', () => {
    fail({ pages: [{ ...page, keyRefs: ['skip', 'switch', 'unknown'] }] }, 'PAGE_REQUIRED');
  });
  it('rejects incorrect heading kind', () => {
    fail({ entries: edited('title', { kind: 'text' }) }, 'KIND');
  });
  it('rejects incorrect skip-action kind', () => {
    fail({ entries: edited('skip', { kind: 'text', targetPx: undefined }) }, 'KIND');
  });
  it('rejects duplicate page ids', () => {
    fail({ pages: [page, page] }, 'DUPLICATE');
  });
  it('rejects duplicate translation ids', () => {
    fail({ entries: [...entries, entries[0]] }, 'DUPLICATE');
  });
  it('rejects duplicate key references', () => {
    fail({ pages: [{ ...page, keyRefs: [...page.keyRefs, 'title'] }] }, 'DUPLICATE');
  });
  it('rejects remote links in the offline catalogue', () => {
    fail({ entries: [...entries, { ...label('help', 'link', 'Help page', 'Page d’aide', 44),
      href: 'https://example.org/' }], pages: [{ ...page,
      keyRefs: [...page.keyRefs, 'help'] }] }, 'HREF');
  });
  it('accepts safe local links with 44px controls', () => {
    const link = { ...label('help', 'link', 'Help page', 'Page d’aide', 44),
      href: 'en/help.html' };
    assert.equal(check({ entries: [...entries, link], pages: [{ ...page,
      keyRefs: [...page.keyRefs, 'help'] }] }).ok, true);
  });
  it('detects unsafe action URLs', () => {
    fail({ entries: edited('switch', { href: 'javascript:alert(1)' }) }, 'HREF');
  });
  it('reports unreferenced catalogue keys as notices', () => {
    const report = check({ entries: [...entries, label('unused', 'text', 'Extra', 'Autre')] });
    assert.equal(report.ok, true, JSON.stringify(report));
    assert.ok(report.findings.some(f => f.code === 'UNUSED' && f.level === 'NOTICE'));
  });
  it('rejects missing page contract fields', () => {
    fail({ pages: [{ id: 'places' }] }, 'PAGE');
  });
  it('rejects root input that is not a catalogue', () => {
    assert.equal(auditLocaleCatalog(null).ok, false);
    assert.equal(auditLocaleCatalog([]).ok, false);
    assert.equal(auditLocaleCatalog({}).ok, false);
  });
  it('reports deterministic bilingual errors', () => {
    const input = { entries: edited('skip', { targetPx: 20 }) };
    assert.deepEqual(check(input), check(input));
  });
});

describe('independent bilingual route contracts', () => {
  it('supports two pages sharing the same global labels', () => {
    const second = { ...page, id: 'about', enPath: 'en/about.html', frPath: 'fr/about.html' };
    assert.equal(check({ pages: [page, second] }).ok, true);
  });
  it('blocks colliding local page paths', () => {
    const second = { ...page, id: 'about' };
    fail({ pages: [page, second] }, 'PAGE_PATH');
  });
  it('blocks status controls linked to a non-unknown key', () => {
    const custom = label('other-status', 'status', 'No', 'Non');
    fail({ entries: [...entries, custom], pages: [{ ...page,
      keyRefs: [...page.keyRefs, 'other-status'], statusKey: 'other-status',
    }] }, 'STATUS');
  });
  it('rejects malformed external-page-like language targets', () => {
    fail({ pages: [{ ...page, enPath: '//host.invalid/en/places.html' }] }, 'PAGE_PATH');
  });
  it('rejects an unsafe translated HTML iframe', () => {
    fail({ entries: edited('title', { fr: '<iframe src="out"></iframe>' }) }, 'UNSAFE');
  });
  it('retains explicit UNKNOWN rather than silently using a blank string', () => {
    const result = check({ entries: edited('unknown', { fr: '' }) });
    assert.equal(result.ok, false);
  });
});
