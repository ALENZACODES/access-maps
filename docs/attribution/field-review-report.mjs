// @ts-check

import { KINDS, selectRows } from './field-review-compare.mjs';
import { dimensionLabel, kindLabel, localizedLabel } from './field-review-labels.mjs';

/** @typedef {import('./field-review-input.mjs').FieldEvidence} Evidence */
/** @typedef {Parameters<typeof selectRows>[0]} Comparison */
/** @typedef {NonNullable<Parameters<typeof selectRows>[1]>} Filters */
/** @typedef {'en'|'fr'} Locale */

const messages = {
  title: localizedLabel('Map field comparison', 'Comparaison des champs cartographiques'),
  scope: localizedLabel(
    'The two sides describe the selected files. An absent field has no entry on that side.',
    'Les deux côtés décrivent les fichiers choisis. Un champ absent ne figure pas dans le fichier correspondant.',
  ),
  beforeCount: localizedLabel('Records in the first file', 'Enregistrements du premier fichier'),
  afterCount: localizedLabel('Records in the second file', 'Enregistrements du second fichier'),
  included: localizedLabel('Comparison rows in this report', 'Lignes de comparaison dans ce rapport'),
  available: localizedLabel('Comparison rows before filtering', 'Lignes de comparaison avant filtrage'),
  changed: localizedLabel('Changed rows in this report', 'Lignes modifiées dans ce rapport'),
  query: localizedLabel('Search text', 'Texte recherché'),
  kind: localizedLabel('Change type', 'Type de changement'),
  field: localizedLabel('Field', 'Champ'),
  source: localizedLabel('Source', 'Source'),
  tranche: localizedLabel('Layer', 'Couche'),
  placement: localizedLabel('Record presence', 'Présence de l’enregistrement'),
  beforeOnly: localizedLabel('First file only', 'Premier fichier seulement'),
  afterOnly: localizedLabel('Second file only', 'Second fichier seulement'),
  both: localizedLabel('Both files', 'Les deux fichiers'),
  view: localizedLabel('View', 'Vue'),
  changes: localizedLabel('Changed rows only', 'Lignes modifiées seulement'),
  all: localizedLabel('All matching rows', 'Toutes les lignes correspondantes'),
  record: localizedLabel('Record', 'Enregistrement'),
  beforeRegion: localizedLabel('First region', 'Première région'),
  afterRegion: localizedLabel('Second region', 'Seconde région'),
  delta: localizedLabel('Differences', 'Différences'),
  before: localizedLabel('Before', 'Avant'),
  after: localizedLabel('After', 'Après'),
  absent: localizedLabel('Absent from this file', 'Absent de ce fichier'),
  value: localizedLabel('Value', 'Valeur'),
  copied: localizedLabel('Derived', 'Dérivé'),
  yes: localizedLabel('Yes', 'Oui'),
  no: localizedLabel('No', 'Non'),
  sourceKey: localizedLabel('Source field', 'Champ source'),
  raw: localizedLabel('Original token', 'Valeur brute'),
  provenance: localizedLabel('Source reference', 'Référence de la source'),
  sources: localizedLabel('Source references', 'Références des sources'),
  licence: localizedLabel('Licence', 'Licence'),
  retrievedOn: localizedLabel('Retrieval date', 'Date de collecte'),
  tier: localizedLabel('Evidence tier', 'Niveau de preuve'),
  none: localizedLabel('No rows match this selection.', 'Aucune ligne ne correspond à cette sélection.'),
};

/**
 * Use JSON notation for literal strings and numbers so a text code such as
 * "0" stays distinct from the number 0. Escape characters that could introduce
 * false headings or change the direction of the surrounding report. The data
 * remains recoverable, including its original line breaks.
 * @param {Evidence['value']|Evidence['raw']} value
 * @param {boolean} [unknownIsMarker]
 */
function token(value, unknownIsMarker = true) {
  if (unknownIsMarker && value === 'UNKNOWN') return value;
  return JSON.stringify(value).replace(
    /[\u0085\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu,
    char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}

/**
 * @param {Comparison} comparison
 * @param {Filters} filters
 * @param {Locale} locale
 */
function* reportLines(comparison, filters, locale) {
  const { rows, totals } = selectRows(comparison, filters);
  const text = (/** @type {keyof typeof messages} */ key) => messages[key][locale];
  const pair = (/** @type {keyof typeof messages} */ key, /** @type {string|number} */ value) =>
    text(key) + (locale === 'fr' ? '\u00a0: ' : ': ') + value;
  const place = (/** @type {'before'|'after'|'both'} */ side) =>
    text(side === 'before' ? 'beforeOnly' : side === 'after' ? 'afterOnly' : 'both');

  yield text('title');
  yield text('scope');
  yield '';
  const sides = comparison.totals.bySide;
  yield pair('beforeCount', sides.before + sides.both);
  yield pair('afterCount', sides.after + sides.both);
  yield pair('available', comparison.totals.rows);
  yield pair('included', totals.rows);
  yield pair('changed', totals.changed);
  yield pair('view', text(filters.changesOnly ? 'changes' : 'all'));
  if (filters.kind) {
    const kind = KINDS.find(candidate => candidate === filters.kind);
    yield pair('kind', kind ? kindLabel(kind, locale) : token(filters.kind));
  }
  if (filters.tranche) yield pair('tranche', token(filters.tranche));
  if (filters.field) yield pair('field', token(filters.field));
  if (filters.source) yield pair('source', token(filters.source));
  const side = filters.recordSide;
  if (side) {
    yield pair('placement', side === 'both' || side === 'before' || side === 'after' ? place(side) : token(side));
  }
  if (filters.query) yield pair('query', token(filters.query));

  if (!rows.length) {
    yield '';
    yield text('none');
    return;
  }

  // A source ID can carry different retrieval dates, licences or tiers.
  // Number distinct four-part references instead of grouping on the ID alone.
  /** @type {Map<string, number>} */
  const referenceNumbers = new Map();
  /** @type {Evidence[]} */
  const references = [];
  /** @param {Evidence} field */
  function referenceFor(field) {
    const key = JSON.stringify([field.source, field.licence, field.retrievedOn, field.tier]);
    let number = referenceNumbers.get(key);
    if (number === undefined) {
      references.push(field);
      number = references.length;
      referenceNumbers.set(key, number);
    }
    return '[' + number + ']';
  }

  /** @param {'before'|'after'} side @param {Evidence|null} field */
  function* sideLines(side, field) {
    if (!field) {
      yield '  ' + pair(side, text('absent'));
      return;
    }
    yield '  ' + pair(side, pair('value', token(field.value)));
    yield '    ' + pair('provenance', referenceFor(field));
    yield '    ' + pair('sourceKey', token(field.sourceKey));
    yield '    ' + pair('raw', field.rawPresent ? token(field.raw, false) : 'UNKNOWN');
    yield '    ' + pair('copied', field.derived === null ? 'UNKNOWN' : text(field.derived ? 'yes' : 'no'));
  }

  let lastId;
  let lastLayer;
  for (const row of rows) {
    if (row.id !== lastId || row.tranche !== lastLayer) {
      yield '';
      yield pair('record', token(row.id));
      yield pair('tranche', token(row.tranche));
      yield pair('placement', place(row.recordSide));
      yield pair('beforeRegion', row.regionBefore === null ? text('absent') : token(row.regionBefore));
      yield pair('afterRegion', row.regionAfter === null ? text('absent') : token(row.regionAfter));
      lastId = row.id;
      lastLayer = row.tranche;
    }
    if (row.field !== null) yield pair('field', token(row.field));
    yield pair('kind', kindLabel(row.kind, locale));
    if (row.dimensions.length) {
      yield pair('delta', row.dimensions.map(key => dimensionLabel(key, locale)).join(', '));
    }
    if (row.field !== null) {
      yield* sideLines('before', row.before);
      yield* sideLines('after', row.after);
    }
  }

  if (!references.length) return;
  yield '';
  yield text('sources');
  for (const [index, field] of references.entries()) {
    yield '[' + (index + 1) + '] ' + pair('source', token(field.source));
    yield '  ' + pair('licence', token(field.licence));
    yield '  ' + pair('retrievedOn', token(field.retrievedOn));
    yield '  ' + pair('tier', token(field.tier));
  }
}

const reportByteLimit = 64 * 1024 * 1024;

/**
 * Build the complete selected report in bounded chunks. A small display page
 * does not truncate the download. Smaller consumers may lower the byte limit.
 * Refuse an over-budget report as a whole, without creating a partial file.
 * @param {Comparison} comparison
 * @param {Filters} filters Applied filters, including the selected view.
 * @param {Locale} locale
 * @param {number} [maxBytes]
 */
export function fieldReport(comparison, filters, locale, maxBytes = reportByteLimit) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > reportByteLimit) {
    throw new RangeError('report-limit');
  }
  /** @type {Blob[]} */
  const chunks = [];
  let chunk = '';
  let bytes = 0;
  function flush() {
    if (!chunk) return;
    const part = new Blob([chunk]);
    bytes += part.size;
    if (bytes > maxBytes) throw new RangeError('report-limit');
    chunks.push(part);
    chunk = '';
  }
  for (const line of reportLines(comparison, filters, locale)) {
    chunk += line + '\n';
    if (chunk.length >= 32768) flush();
  }
  flush();
  return new Blob(chunks, { type: 'text/plain;charset=utf-8' });
}
