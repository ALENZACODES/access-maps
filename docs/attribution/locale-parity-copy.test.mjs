import assert from 'node:assert/strict';
import test from 'node:test';
import { COPY, localeFromSearch, localizedLabel } from './locale-parity-copy.mjs';
import { auditFrenchTypography } from './locale-parity-audit.mjs';

test('English and French expose the same set of labels', () => {
  assert.deepEqual(Object.keys(COPY.en).sort(), Object.keys(COPY.fr).sort());
  assert.ok(!/vérif|verify|real-time|partnership|guarantee/iu.test(JSON.stringify(COPY)));
});

test('the selector supports the explicit French and English query values', () => {
  assert.equal(localeFromSearch('?panel=x&lang=fr'), 'fr');
  for (const search of ['', '?lang=en', '?lang=fr-CA', '?lang=%22x']) {
    assert.equal(localeFromSearch(search), 'en');
  }
});

test('standalone copy, label/value punctuation and literal labels use one formatter', () => {
  assert.equal(localizedLabel('load', undefined, 'fr'), 'Charger le catalogue JSON');
  assert.equal(localizedLabel('licence extérieure', 'ODbL', 'fr'), 'licence extérieure\u00a0: ODbL');
  assert.equal(localizedLabel('Licence', 'ODbL', 'en'), 'Licence: ODbL');
  assert.equal(localizedLabel('coverage', 0, 'fr'), 'Couverture des paires\u00a0: 0');
  assert.equal(localizedLabel('loaded', '', 'fr'), 'Catalogue chargé\u00a0: ');
  assert.equal(localizedLabel('toString', 'text', 'en'), 'toString: text');
});

test('paired values retain exact imported French punctuation for the reviewer', () => {
  const original = 'Texte : « Exemple ! »';
  assert.equal(localizedLabel('french', original, 'fr'), 'Français\u00a0: ' + original);
  assert.equal(localizedLabel('french', '© OpenStreetMap contributors', 'fr'),
    'Français\u00a0: © OpenStreetMap contributors');
});

test('all built-in French captions and generated label/value lines obey the audit', () => {
  for (const key of Object.keys(COPY.fr)) {
    assert.deepEqual(auditFrenchTypography(localizedLabel(key, undefined, 'fr')), [], key);
    assert.deepEqual(auditFrenchTypography(localizedLabel(key, 'UNKNOWN', 'fr')), [], key);
  }
});

test('French typography findings explain the required nonbreaking space characters', () => {
  const punctuation = localizedLabel('FR_NBSP_REQUIRED', undefined, 'fr');
  assert.match(punctuation, /U\+00A0.*deux-points/u);
  assert.match(punctuation, /U\+202F.*point-virgule.*point d’exclamation.*point d’interrogation/u);
  const quotes = localizedLabel('FR_GUILLEMET_SPACING', undefined, 'fr');
  assert.match(quotes, /U\+202F.*guillemet ouvrant.*guillemet fermant/u);
});
