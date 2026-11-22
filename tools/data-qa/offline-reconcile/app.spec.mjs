import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createModel, applyFile, chooseMode, chooseLocale, chooseFilter, perform,
  clear, renderModel, fileOptions, readLocalJson, exportPayload, keysAligned } from './app.mjs';
import { base, known, corrected } from './fixtures.mjs';

describe('offline review state model', () => {
  it('defaults to English', () => assert.equal(createModel().locale, 'en'));
  it('defaults to publication audit', () => assert.equal(createModel().mode, 'audit'));
  it('starts without files', () => assert.equal(createModel().current, null));
  it('starts without report', () => assert.equal(createModel().result, null));
  it('starts with all findings selected', () => assert.equal(createModel().filter, 'ALL'));
  it('can accept current input', () => assert.deepEqual(applyFile(createModel(), 'current', base()).current, base()));
  it('can accept a previous input', () => assert.deepEqual(applyFile(createModel(), 'previous', base()).previous, base()));
  it('can accept an explicit removal policy', () => {
    const policy = { removedDecisions: [], maxRemovals: 0 };
    assert.deepEqual(applyFile(createModel(), 'policy', policy).policy, policy);
  });
  it('rejects an unknown file target', () => assert.throws(() => applyFile(createModel(), 'secret', {})));
  it('does not mutate original state when selecting file', () => {
    const original = createModel(); applyFile(original, 'current', base());
    assert.equal(original.current, null);
  });
  it('switches to comparison mode', () => assert.equal(chooseMode(createModel(), 'compare').mode, 'compare'));
  it('switches back to audit mode', () => assert.equal(chooseMode(chooseMode(createModel(), 'compare'), 'audit').mode, 'audit'));
  it('rejects unsupported mode', () => assert.throws(() => chooseMode(createModel(), 'upload')));
  it('switches to French', () => assert.equal(chooseLocale(createModel(), 'fr').locale, 'fr'));
  it('switches back to English', () => assert.equal(chooseLocale(chooseLocale(createModel(), 'fr'), 'en').locale, 'en'));
  it('rejects unsupported language', () => assert.throws(() => chooseLocale(createModel(), 'de')));
  it('selects errors', () => assert.equal(chooseFilter(createModel(), 'ERROR').filter, 'ERROR'));
  it('selects notices', () => assert.equal(chooseFilter(createModel(), 'NOTICE').filter, 'NOTICE'));
  it('rejects unsupported filter', () => assert.throws(() => chooseFilter(createModel(), 'SKIP')));
  it('clears a report but preserves selected locale', () => {
    const model = chooseLocale(createModel(), 'fr');
    const reset = clear(applyFile(model, 'current', base()));
    assert.equal(reset.locale, 'fr');
    assert.equal(reset.current, null);
  });
  it('requires a local input before auditing', () => assert.equal(perform(createModel()).error, 'noFile'));
  it('audits a complete package', () => {
    const result = perform(applyFile(createModel(), 'current', base()));
    assert.equal(result.result.ok, true);
  });
  it('blocks invalid publication', () => {
    const result = perform(applyFile(createModel(), 'current', { broken: true }));
    assert.equal(result.result.ok, false);
  });
  it('comparison requires the earlier package', () => {
    const model = chooseMode(applyFile(createModel(), 'current', base()), 'compare');
    assert.equal(perform(model).error, 'noFile');
  });
  it('compares two complete packages', () => {
    let model = createModel();
    model = applyFile(model, 'previous', known('YES'));
    model = applyFile(model, 'current', corrected(known('YES'), 'NO'));
    model = perform(chooseMode(model, 'compare'));
    assert.equal(model.result.ok, true);
    assert.equal(model.result.totals.changed, 1);
  });
  it('reruns and resets stale report after file change', () => {
    let model = perform(applyFile(createModel(), 'current', base()));
    assert.ok(model.result);
    model = applyFile(model, 'current', known('YES'));
    assert.equal(model.result, null);
  });
});

describe('localized presentation', () => {
  it('keeps EN/FR keys aligned', () => assert.equal(keysAligned(), true));
  it('returns English heading', () => assert.match(renderModel(createModel()).dict.heading, /Offline evidence/u));
  it('returns French heading', () => assert.match(renderModel(chooseLocale(createModel(), 'fr')).dict.heading, /hors ligne/u));
  it('reports no status before running', () => assert.equal(renderModel(createModel()).status, ''));
  it('shows passing English status', () => {
    const model = perform(applyFile(createModel(), 'current', base()));
    assert.equal(renderModel(model).status, 'Checks passed');
  });
  it('shows passing French status', () => {
    const model = perform(applyFile(chooseLocale(createModel(), 'fr'), 'current', base()));
    assert.equal(renderModel(model).status, 'Contrôles réussis');
  });
  it('shows blocked French status', () => {
    const model = perform(applyFile(chooseLocale(createModel(), 'fr'), 'current', {}));
    assert.equal(renderModel(model).status, 'Publication bloquée');
  });
  it('shows comparison input fields in comparison mode', () => {
    assert.equal(renderModel(chooseMode(createModel(), 'compare')).showPrevious, true);
  });
  it('hides comparison fields in audit mode', () => assert.equal(renderModel(createModel()).showPrevious, false));
  it('shows translated error for missing file', () => {
    const model = perform(chooseLocale(createModel(), 'fr'));
    assert.match(renderModel(model).error, /Choisissez/u);
  });
  it('filters notices without dropping blocking issues from the result', () => {
    const bad = base(); bad.sources[0].licence = 'private';
    const model = chooseFilter(perform(applyFile(createModel(), 'current', bad)), 'NOTICE');
    assert.equal(renderModel(model).rows.length, 0);
    assert.equal(model.result.ok, false);
  });
});

describe('local file and download handling', () => {
  it('accepts a small JSON file', () => assert.equal(fileOptions({ name: 'data.json', size: 3 }), true));
  it('rejects empty upload', () => assert.equal(fileOptions({ name: 'data.json', size: 0 }), false));
  it('rejects non-JSON file name', () => assert.equal(fileOptions({ name: 'data.txt', size: 100 }), false));
  it('rejects file larger than 6 MiB', () => assert.equal(fileOptions({ name: 'data.json', size: 7*1024*1024 }), false));
  it('rejects null upload', () => assert.equal(fileOptions(null), false));
  it('loads a local JSON blob-like object', async () => {
    const value = await readLocalJson({ name: 'data.json', size: 2, text: async () => '{"x":1}' });
    assert.equal(value.x, 1);
  });
  it('throws on broken JSON text', async () => {
    await assert.rejects(readLocalJson({ name: 'data.json', size: 1, text: async () => '{oops' }));
  });
  it('does not create export without audit result', () => assert.equal(exportPayload(createModel(), 'json'), null));
  it('does not create unsupported export type', () => {
    const model = perform(applyFile(createModel(), 'current', base()));
    assert.equal(exportPayload(model, 'html'), null);
  });
  it('exports a JSON report without notes', () => {
    const model = perform(applyFile(createModel(), 'current', base()));
    const output = exportPayload(model, 'json');
    assert.equal(output.filename, 'offline-audit-report.json');
    assert.doesNotMatch(output.content, /No source conclusion/u);
  });
  it('exports a CSV report without notes', () => {
    const model = perform(applyFile(createModel(), 'current', base()));
    const output = exportPayload(model, 'csv');
    assert.equal(output.filename, 'offline-audit-report.csv');
    assert.doesNotMatch(output.content, /No source conclusion/u);
  });
  it('sets correct JSON MIME type', () => {
    const model = perform(applyFile(createModel(), 'current', base()));
    assert.match(exportPayload(model, 'json').mime, /application\/json/u);
  });
  it('sets correct CSV MIME type', () => {
    const model = perform(applyFile(createModel(), 'current', base()));
    assert.match(exportPayload(model, 'csv').mime, /text\/csv/u);
  });
});
