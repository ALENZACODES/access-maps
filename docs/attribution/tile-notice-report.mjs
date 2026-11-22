// @ts-check

import { localizedLabel, tileLabel } from './tile-notice-labels.mjs';
import { tileBounds } from './tile-notice-position.mjs';

/** @typedef {import('./tile-notice-archive.mjs').TileArchive} TileArchive */
/** @typedef {import('./tile-notice-position.mjs').TilePosition} TilePosition */
/** @typedef {import('./tile-notice-sources.mjs').SourceRow} SourceRow */
/** @typedef {import('./tile-notice-sources.mjs').TileSources} TileSources */
/** @typedef {'en'|'fr'} Locale */
/**
 * @typedef {object} ReportState
 * @property {Pick<TileArchive,'header'|'metadata'>} archive
 * @property {TilePosition} position
 * @property {TileSources|null} tile
 * @property {SourceRow[]} rows
 * @property {boolean} hasRegistry
 */

const labels = {
  title: localizedLabel('Tile source report', 'Rapport sur les sources de la tuile'),
  archive: localizedLabel('Archive', 'Archive'),
  description: localizedLabel('Archive description', 'Description de l’archive'),
  notice: localizedLabel('Notice stored in the archive', 'Mention enregistrée dans l’archive'),
  address: localizedLabel('Tile (zoom / column / row)', 'Tuile (zoom / colonne / ligne)'),
  bounds: localizedLabel('Tile bounds (west, south, east, north)', 'Limites de la tuile (ouest, sud, est, nord)'),
  extent: localizedLabel('Archive bounds (west, south, east, north)', 'Limites de l’archive (ouest, sud, est, nord)'),
  zooms: localizedLabel('Archive zoom range', 'Plage de zoom de l’archive'),
  registry: localizedLabel('Local registry supplied', 'Registre local fourni'),
  yes: localizedLabel('Yes', 'Oui'),
  no: localizedLabel('No', 'Non'),
  present: localizedLabel('The selected tile is present in the archive.', 'La tuile choisie figure dans l’archive.'),
  absent: localizedLabel('The archive has no tile at this address.', 'L’archive ne contient aucune tuile à cette adresse.'),
  scope: localizedLabel(
    'Counts describe encoded features at this address and zoom. A feature can appear at other zooms or in adjacent tiles.',
    'Le décompte porte sur les éléments encodés à cette adresse et à ce zoom. Un élément peut figurer à d’autres zooms ou dans des tuiles voisines.',
  ),
  count: localizedLabel('Encoded features', 'Éléments encodés'),
  layerCount: localizedLabel('Layers in this tile', 'Couches dans cette tuile'),
  layer: localizedLabel('Layer', 'Couche'),
  emptyLayer: localizedLabel('No features encoded in this layer.', 'Aucun élément encodé dans cette couche.'),
  matched: localizedLabel('Source ID found in the supplied registry.', 'Identifiant de source trouvé dans le registre fourni.'),
  refs: localizedLabel('Source details', 'Renseignements sur les sources'),
  source: localizedLabel('Source ID', 'Identifiant de source'),
  name: localizedLabel('Source name', 'Nom de la source'),
  licence: localizedLabel('Licence', 'Licence'),
  date: localizedLabel('Retrieval date', 'Date de collecte'),
  tier: localizedLabel('Evidence tier', 'Niveau de preuve'),
  attribution: localizedLabel('Registry attribution', 'Mention du registre'),
};

/**
 * Leave single-line notices verbatim, including their typography. Quote and
 * escape multiline or direction-changing text so a source cannot add a fake
 * heading or reverse the direction of neighbouring fields in the text report.
 * @param {string|number} value
 */
function printable(value) {
  const text = String(value);
  if (!/[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069]/u.test(text)) return text;
  return JSON.stringify(text).replace(/[\u007f-\u009f\u2028-\u202e\u2066-\u2069]/gu,
    char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
}

/** @param {ReportState} state @param {Locale} locale */
function* linesFor(state, locale) {
  const label = (/** @type {keyof typeof labels} */ key) => labels[key][locale];
  const field = (/** @type {keyof typeof labels} */ key, /** @type {number|string} */ value) =>
    label(key) + (locale === 'fr' ? '\u00a0: ' : ': ') + printable(value);
  const {header, metadata} = state.archive;
  const {z, x, y} = state.position;
  const number = new Intl.NumberFormat(locale === 'fr' ? 'fr-CA' : 'en-CA', {
    maximumFractionDigits: 12, useGrouping: false,
  });
  const boundsText = (/** @type {readonly number[]} */ bounds) =>
    bounds.map(value => number.format(value)).join(' | ');

  yield label('title');
  yield field('archive', metadata.name);
  yield field('description', metadata.description);
  yield field('notice', metadata.attribution);
  yield field('extent', boundsText(header.bounds));
  yield field('zooms', header.minZoom + ' – ' + header.maxZoom);
  yield '';
  yield field('address', [z, x, y].join(' / '));
  yield field('bounds', boundsText(tileBounds(z, x, y)));
  yield field('registry', label(state.hasRegistry ? 'yes' : 'no'));
  if (state.tile === null) {
    yield label('absent');
    return;
  }
  yield label('present');
  yield field('count', state.tile.featureCount);
  yield field('layerCount', state.tile.layers.length);
  yield label('scope');

  // A source can occur in more than one layer. Keep counts with the layer,
  // and print its full credit and evidence once in the reference list.
  /** @type {Map<string,{number:number,row:SourceRow}>} */
  const references = new Map();
  /** @type {Map<string,SourceRow[]>} */
  const groups = new Map();
  for (const row of state.rows) {
    const list = groups.get(row.layer);
    if (list) list.push(row);
    else groups.set(row.layer, [row]);
  }
  for (const layer of state.tile.layers) {
    yield '';
    yield field('layer', layer);
    const list = groups.get(layer);
    if (!list?.length) {
      yield label('emptyLayer');
      continue;
    }
    for (const row of list) {
      let reference = references.get(row.sourceId);
      if (!reference) {
        reference = {number: references.size + 1, row};
        references.set(row.sourceId, reference);
      }
      yield '[' + reference.number + '] ' + field('source', row.sourceId);
      yield '  ' + field('count', row.count);
    }
  }
  if (!references.size) return;
  yield '';
  yield label('refs');
  for (const {number: ref, row} of references.values()) {
    yield '[' + ref + '] ' + field('source', row.sourceId);
    yield '  ' + (row.match === 'matched' ? label('matched') : tileLabel(row.match, locale));
    yield '  ' + field('name', row.name);
    yield '  ' + field('licence', row.licence);
    yield '  ' + field('date', row.retrievedOn);
    yield '  ' + field('tier', row.tier);
    yield '  ' + field('attribution', row.attribution);
  }
}

/**
 * Export every source group, including groups on other display pages.
 * Chunk the UTF-8 payload so the browser need not concatenate all metadata
 * into an additional large flat string at download time.
 * @param {ReportState} state
 * @param {Locale} locale
 */
export function tileReport(state, locale) {
  /** @type {Blob[]} */
  const parts = [];
  let chunk = '';
  for (const line of linesFor(state, locale)) {
    chunk += line + '\n';
    if (chunk.length >= 32768) {
      parts.push(new Blob([chunk]));
      chunk = '';
    }
  }
  if (chunk) parts.push(new Blob([chunk]));
  return new Blob(parts, {type: 'text/plain;charset=utf-8'});
}
