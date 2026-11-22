// @ts-check

/** @typedef {'en' | 'fr'} Locale */
/** @typedef {import('./field-review-compare.mjs').Kind} Kind */
/** @typedef {import('./field-review-compare.mjs').Dimension} Dimension */

/**
 * Format authored French punctuation before interpolating file contents.
 * @param {string} en
 * @param {string} fr
 */
export function localizedLabel(en, fr) {
  return {
    en,
    fr: fr.replace(/[ \u00a0\u202f]*:/gu, '\u00a0:')
      .replace(/[ \u00a0\u202f]*([;!?»])/gu, '\u202f$1')
      .replace(/«[ \u00a0\u202f]*/gu, '«\u202f'),
  };
}

const kinds = {
  'field-before': localizedLabel('Field only in earlier file', 'Champ présent seulement dans le premier fichier'),
  'field-after': localizedLabel('Field only in later file', 'Champ présent seulement dans le second fichier'),
  reported: localizedLabel('Previously unknown value reported', 'Valeur auparavant inconnue, maintenant renseignée'),
  'became-unknown': localizedLabel('Reported value became UNKNOWN', 'Valeur renseignée devenue UNKNOWN'),
  value: localizedLabel('Reported value changed', 'Valeur renseignée modifiée'),
  evidence: localizedLabel('Source details changed', 'Renseignements sur la source modifiés'),
  same: localizedLabel('Unchanged field', 'Champ inchangé'),
  region: localizedLabel('Region changed', 'Région modifiée'),
  empty: localizedLabel('Record without fields', 'Enregistrement sans champ'),
};

const dimensions = {
  value: localizedLabel('Value', 'Valeur'),
  source: localizedLabel('Source', 'Source'),
  licence: localizedLabel('Licence', 'Licence'),
  retrievedOn: localizedLabel('Retrieval date', 'Date de collecte'),
  tier: localizedLabel('Evidence tier', 'Niveau de preuve'),
  sourceKey: localizedLabel('Source column or tag', 'Colonne ou clé source'),
  raw: localizedLabel('Original token', 'Valeur brute'),
  derived: localizedLabel('Derived value', 'Valeur dérivée'),
  region: localizedLabel('Region', 'Région'),
};

/** @param {Kind} kind @param {Locale} locale */
export const kindLabel = (kind, locale) => kinds[kind][locale];

/** @param {Dimension} dimension @param {Locale} locale */
export const dimensionLabel = (dimension, locale) => dimensions[dimension][locale];

const strings = {
  skip: localizedLabel('Skip to main content', 'Aller au contenu principal'),
  title: localizedLabel('Compare map fields', 'Comparer les champs cartographiques'),
  intro: localizedLabel(
    'Choose two files to compare their field values and the evidence supplied with each value.',
    'Choisissez deux fichiers pour comparer les valeurs et les renseignements sur leurs sources.',
  ),
  language: localizedLabel('English', 'Français'),
  files: localizedLabel('Map files', 'Fichiers cartographiques'),
  fileHelp: localizedLabel(
    'Use local map records in JSON, newline-delimited JSON or gzip. Each file can contain up to 32 MiB of uncompressed text.',
    'Utilisez des enregistrements locaux au format JSON, JSON par ligne ou gzip. Chaque fichier peut contenir jusqu’à 32 Mio de texte décompressé.',
  ),
  beforeFile: localizedLabel('Earlier file', 'Premier fichier'),
  afterFile: localizedLabel('Later file', 'Second fichier'),
  beforeClear: localizedLabel('Clear earlier file', 'Effacer le premier fichier'),
  afterClear: localizedLabel('Clear later file', 'Effacer le second fichier'),
  bothNeeded: localizedLabel(
    'Choose both files to see the comparison. Their contents stay in this tab.',
    'Choisissez les deux fichiers pour voir la comparaison. Leur contenu reste dans cet onglet.',
  ),
  needBefore: localizedLabel('Choose the earlier file to compare these records.', 'Choisissez le premier fichier pour comparer ces enregistrements.'),
  needAfter: localizedLabel('Choose the later file to compare these records.', 'Choisissez le second fichier pour comparer ces enregistrements.'),
  noneLoaded: localizedLabel('No file loaded.', 'Aucun fichier chargé.'),
  reading: localizedLabel('Reading {0}…', 'Lecture de {0}…'),
  loaded: localizedLabel('Loaded {0}. Records: {1}.', 'Fichier chargé : {0}. Enregistrements : {1}.'),
  readWithOriginal: localizedLabel(
    'Reading {0}… The current file is {1}.',
    'Lecture de {0}… Le fichier utilisé est {1}.',
  ),
  errorPrefix: localizedLabel('Could not open {0}.', 'Impossible d’ouvrir {0}.'),
  previousKept: localizedLabel('The loaded file is still in use.', 'Le fichier déjà chargé reste en usage.'),
  inputRow: localizedLabel('Record or line {0}.', 'Enregistrement ou ligne {0}.'),
  errFormat: localizedLabel('Use a JSON object, a JSON array, or one record per line.', 'Utilisez un objet JSON, un tableau JSON ou un enregistrement par ligne.'),
  errRecord: localizedLabel('A record has an invalid structure or identifier.', 'La structure ou l’identifiant d’un enregistrement est non valide.'),
  errField: localizedLabel('A field value or its source details are invalid.', 'Une valeur ou les renseignements sur sa source sont non valides.'),
  errDuplicate: localizedLabel('A record identifier occurs twice in the same map layer.', 'Un identifiant figure deux fois dans la même couche.'),
  errLimit: localizedLabel('A file or record exceeds a reading limit. Choose a smaller extract.', 'Un fichier ou un enregistrement dépasse une limite de lecture. Choisissez un extrait plus petit.'),
  errEncoding: localizedLabel('Use a UTF-8 text file.', 'Utilisez un fichier texte au format UTF-8.'),
  errCompression: localizedLabel('The compressed file could not be read. Try its uncompressed version.', 'Impossible de lire le fichier compressé. Essayez sa version décompressée.'),
  errRead: localizedLabel('Choose the local file again.', 'Sélectionnez le fichier local de nouveau.'),
  filters: localizedLabel('Filter the comparison', 'Filtrer la comparaison'),
  show: localizedLabel('Show', 'Afficher'),
  changes: localizedLabel('Changes only', 'Changements seulement'),
  all: localizedLabel('All rows', 'Toutes les lignes'),
  tranche: localizedLabel('Map layer', 'Couche cartographique'),
  allTranches: localizedLabel('All layers', 'Toutes les couches'),
  venue: localizedLabel('Places', 'Lieux'),
  washroom: localizedLabel('Washrooms', 'Toilettes'),
  path: localizedLabel('Paths', 'Chemins'),
  transit: localizedLabel('Transit stops', 'Arrêts de transport'),
  fieldFilter: localizedLabel('Exact field name', 'Nom exact du champ'),
  sourceFilter: localizedLabel('Exact source ID on either side', 'Identifiant exact de la source dans l’un ou l’autre fichier'),
  sideFilter: localizedLabel('Record present in', 'Enregistrement présent dans'),
  allRecords: localizedLabel('Either file', 'L’un ou l’autre fichier'),
  both: localizedLabel('Both files', 'Les deux fichiers'),
  beforeOnly: localizedLabel('Earlier file only', 'Le premier fichier seulement'),
  afterOnly: localizedLabel('Later file only', 'Le second fichier seulement'),
  query: localizedLabel('Search words', 'Mots à rechercher'),
  searchHelp: localizedLabel(
    'Search the record ID, field, source, layer or region. Search words ignore accents and case.',
    'Recherchez dans les identifiants, les champs, les sources, les couches ou les régions. Les mots recherchés sont insensibles aux accents et à la casse.',
  ),
  apply: localizedLabel('Apply filters', 'Appliquer les filtres'),
  reset: localizedLabel('Reset filters', 'Réinitialiser les filtres'),
  pending: localizedLabel('Apply the edited filters to update the results and download.', 'Appliquez les filtres modifiés pour actualiser les résultats et le téléchargement.'),
  results: localizedLabel('Comparison', 'Comparaison'),
  summary: localizedLabel(
    'Rows shown by filters: {0} of {1}. Records in selection: {2}. Changed rows in both files combined: {3}.',
    'Lignes retenues : {0} sur {1}. Enregistrements retenus : {2}. Lignes modifiées dans l’ensemble de la comparaison : {3}.',
  ),
  coverage: localizedLabel(
    'A missing field describes the contents of these files. An explicitly unknown value appears as UNKNOWN.',
    'Un champ absent décrit le contenu de ces fichiers. Une valeur explicitement inconnue porte la mention UNKNOWN.',
  ),
  previous: localizedLabel('Previous page', 'Page précédente'),
  next: localizedLabel('Next page', 'Page suivante'),
  page: localizedLabel('Page {0} of {1} · Rows {2}–{3}', 'Page {0} sur {1} · Lignes {2} à {3}'),
  noRows: localizedLabel('No matching rows', 'Aucune ligne correspondante'),
  unchangedEmpty: localizedLabel(
    'No changes were found. Choose All rows to inspect the matching fields.',
    'Aucun changement relevé. Choisissez « Toutes les lignes » pour consulter les champs correspondants.',
  ),
  filtersEmpty: localizedLabel('Try another filter to view other records or fields.', 'Modifiez un filtre pour consulter d’autres enregistrements ou champs.'),
  bothEmpty: localizedLabel('Both files contain zero records.', 'Les deux fichiers contiennent zéro enregistrement.'),
  identity: localizedLabel('Record ID: {0}', 'Identifiant de l’enregistrement : {0}'),
  context: localizedLabel('Layer: {0}. Record present in: {1}.', 'Couche : {0}. Enregistrement présent dans : {1}.'),
  differences: localizedLabel('Differences: {0}.', 'Différences : {0}.'),
  details: localizedLabel('Compare values and source details', 'Comparer les valeurs et leurs sources'),
  compareRegions: localizedLabel('Compare record regions', 'Comparer les régions de l’enregistrement'),
  compareRecords: localizedLabel('Compare record presence', 'Comparer la présence de l’enregistrement'),
  noRecord: localizedLabel('Record absent from this file.', 'Enregistrement absent de ce fichier.'),
  noField: localizedLabel('Field absent from this record.', 'Champ absent de cet enregistrement.'),
  noFields: localizedLabel('The record contains no fields.', 'L’enregistrement ne contient aucun champ.'),
  scalarText: localizedLabel('Text', 'Texte'),
  emptyText: localizedLabel('Empty text', 'Texte vide'),
  whitespaceText: localizedLabel('Spacing characters ({0}): {1}', 'Caractères d’espacement ({0}) : {1}'),
  scalarNumber: localizedLabel('Number', 'Nombre'),
  dataType: localizedLabel('Value type', 'Type de valeur'),
  geometry: localizedLabel('Coordinate sequence', 'Suite de coordonnées'),
  points: localizedLabel('Coordinate pairs: {0}', 'Paires de coordonnées : {0}'),
  pointPosition: localizedLabel('Pairs {0}–{1} of {2}', 'Paires {0} à {1} sur {2}'),
  previousPoints: localizedLabel('Previous coordinates', 'Coordonnées précédentes'),
  nextPoints: localizedLabel('Next coordinates', 'Coordonnées suivantes'),
  yes: localizedLabel('Yes', 'Oui'),
  no: localizedLabel('No', 'Non'),
  token: localizedLabel('{0} ({1})', '{0} ({1})'),
  download: localizedLabel('Download filtered text report', 'Télécharger le rapport texte filtré'),
  downloaded: localizedLabel('The filtered report is ready to download.', 'Le rapport filtré est prêt à être téléchargé.'),
  largeReport: localizedLabel('The report exceeds 64 MiB. Narrow the filters before downloading.', 'Le rapport dépasse 64 Mio. Précisez les filtres avant de le télécharger.'),
  downloadError: localizedLabel('The report could not be prepared. Try downloading it again.', 'Impossible de préparer le rapport. Essayez de le télécharger de nouveau.'),
};

/** @typedef {keyof typeof strings} LabelKey */

/** @param {LabelKey} key @param {Locale} locale @param {...(string|number)} args */
export function reviewLabel(key, locale, ...args) {
  return strings[key][locale].replace(/\{(\d+)\}/gu, (_, index) => String(args[Number(index)] ?? ''));
}
