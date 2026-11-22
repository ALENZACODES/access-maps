// @ts-check
/** @typedef {'en'|'fr'} Locale */

/**
 * Apply French spacing to authored labels. Insert names, IDs and file notices
 * only after formatting so their original text remains intact.
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

const copy = {
  title: localizedLabel('Tile sources', 'Sources d’une tuile'),
  skip: localizedLabel('Skip to main content', 'Aller au contenu principal'),
  intro: localizedLabel('Inspect the sources of features encoded in one local map tile.', 'Consultez les sources des éléments encodés dans une tuile cartographique locale.'),
  language: localizedLabel('English', 'Français'),
  files: localizedLabel('Local files', 'Fichiers locaux'),
  archiveFile: localizedLabel('Vector tile archive', 'Archive de tuiles vectorielles'),
  archiveHelp: localizedLabel('Choose a local PMTiles v3 vector file. Its contents stay in this tab.', 'Choisissez un fichier vectoriel local au format PMTiles v3. Son contenu reste dans cet onglet.'),
  archiveClear: localizedLabel('Clear archive', 'Retirer l’archive'),
  registryFile: localizedLabel('Source registry (optional)', 'Registre des sources (facultatif)'),
  registryHelp: localizedLabel('Open the matching JSON registry to see the source details for a tile.', 'Ouvrez le registre JSON correspondant pour consulter les renseignements sur les sources d’une tuile.'),
  registryClear: localizedLabel('Clear registry', 'Retirer le registre'),
  pendingFile: localizedLabel('Opening {0}…', 'Ouverture de {0}…'),
  loadedFile: localizedLabel('Open file: {0}', 'Fichier ouvert : {0}'),
  registryCount: localizedLabel('Source entries: {0}.', 'Entrées du registre : {0}.'),
  archiveEmpty: localizedLabel('Choose an archive to begin.', 'Choisissez une archive pour commencer.'),
  registryEmpty: localizedLabel('No registry selected.', 'Aucun registre sélectionné.'),
  failedFile: localizedLabel('Could not open {0}.', 'Impossible d’ouvrir {0}.'),
  item: localizedLabel('Registry entry: {0}.', 'Entrée du registre : {0}.'),
  readingOld: localizedLabel('Still displaying {0}.', 'Le fichier {0} est toujours affiché.'),
  archiveHeading: localizedLabel('Archive notice', 'Mention de l’archive'),
  archiveName: localizedLabel('Archive name', 'Nom de l’archive'),
  archiveDescription: localizedLabel('Description', 'Description'),
  archiveCredit: localizedLabel('Attribution as stored in the archive', 'Mention conservée dans l’archive'),
  archiveArea: localizedLabel('Archive bounds', 'Limites de l’archive'),
  zoomRange: localizedLabel('Zoom range', 'Niveaux de zoom'),
  reportedCount: localizedLabel('Tile addresses reported by the header', 'Adresses de tuiles indiquées dans l’en-tête'),
  lookupHeading: localizedLabel('Choose a tile', 'Choisir une tuile'),
  mode: localizedLabel('Find a tile by', 'Mode de recherche'),
  byAddress: localizedLabel('Tile address', 'Adresse de tuile'),
  byPoint: localizedLabel('Longitude and latitude', 'Longitude et latitude'),
  zoom: localizedLabel('Zoom level', 'Niveau de zoom'),
  column: localizedLabel('Tile column (x)', 'Colonne de la tuile (x)'),
  row: localizedLabel('Tile row (y)', 'Rangée de la tuile (y)'),
  pointHelp: localizedLabel('Use decimal degrees with a point or a comma. This grid covers latitudes between about 85.05° south and 85.05° north.', 'Utilisez les degrés décimaux avec un point ou une virgule. Cette grille couvre les latitudes entre environ 85,05° sud et 85,05° nord.'),
  longitude: localizedLabel('Longitude', 'Longitude'),
  latitude: localizedLabel('Latitude', 'Latitude'),
  lookup: localizedLabel('Inspect tile', 'Examiner la tuile'),
  invalidZoom: localizedLabel('Enter a whole zoom level from {0} to {1}.', 'Saisissez un niveau de zoom entier de {0} à {1}.'),
  invalidAxis: localizedLabel('Enter a whole number from 0 to {0} for this zoom.', 'Saisissez un entier de 0 à {0} pour ce niveau de zoom.'),
  invalidLon: localizedLabel('Enter a longitude from −180 to 180 degrees.', 'Saisissez une longitude de −180 à 180 degrés.'),
  invalidLat: localizedLabel('Enter a latitude inside the tile grid (about −85.05 to 85.05 degrees).', 'Saisissez une latitude dans la grille des tuiles (environ −85,05 à 85,05 degrés).'),
  readingTile: localizedLabel('Reading tile {0}…', 'Lecture de la tuile {0}…'),
  loadedTile: localizedLabel('Tile {0} is open.', 'La tuile {0} est ouverte.'),
  edited: localizedLabel('Inspect the edited address to update the result.', 'Examinez l’adresse modifiée pour actualiser le résultat.'),
  tileTitle: localizedLabel('Tile {0}', 'Tuile {0}'),
  absent: localizedLabel('This address has no tile entry in the archive.', 'L’archive ne contient aucune entrée de tuile à cette adresse.'),
  presentEmpty: localizedLabel('The tile is present and contains no encoded features.', 'La tuile est présente et ne contient aucun élément encodé.'),
  counts: localizedLabel('Encoded features: {0}. Source groups: {1}.', 'Éléments encodés : {0}. Groupes de sources : {1}.'),
  tileArea: localizedLabel('Tile bounds', 'Limites de la tuile'),
  bounds: localizedLabel('West {0}°, south {1}°, east {2}°, north {3}°', 'Ouest {0}°, sud {1}°, est {2}°, nord {3}°'),
  tileLayers: localizedLabel('Layers in the tile', 'Couches de la tuile'),
  noLayers: localizedLabel('No layers encoded', 'Aucune couche encodée'),
  adjacent: localizedLabel('Adjacent tiles', 'Tuiles voisines'),
  north: localizedLabel('Move north', 'Aller vers le nord'),
  south: localizedLabel('Move south', 'Aller vers le sud'),
  west: localizedLabel('Move west', 'Aller vers l’ouest'),
  east: localizedLabel('Move east', 'Aller vers l’est'),
  sourceGroups: localizedLabel('Sources by layer', 'Sources par couche'),
  groupHelp: localizedLabel('Each count is the number of feature occurrences in this layer of this tile.', 'Chaque nombre indique les occurrences d’éléments dans cette couche de cette tuile.'),
  noGroups: localizedLabel('There are no source groups to display.', 'Aucun groupe de sources à afficher.'),
  previous: localizedLabel('Previous groups', 'Groupes précédents'),
  next: localizedLabel('Next groups', 'Groupes suivants'),
  page: localizedLabel('Groups {0}–{1} of {2}', 'Groupes {0} à {1} sur {2}'),
  sourceId: localizedLabel('Source ID', 'Identifiant de la source'),
  layer: localizedLabel('Layer', 'Couche'),
  features: localizedLabel('Encoded features', 'Éléments encodés'),
  sourceName: localizedLabel('Source name', 'Nom de la source'),
  licence: localizedLabel('Licence', 'Licence'),
  retrieved: localizedLabel('Retrieval date', 'Date de collecte'),
  tier: localizedLabel('Evidence tier', 'Niveau de preuve'),
  groupCredit: localizedLabel('Attribution in the registry', 'Mention dans le registre'),
  'no-registry': localizedLabel('Open a source registry to look up this ID.', 'Ouvrez un registre des sources pour y rechercher cet identifiant.'),
  unlisted: localizedLabel('This source ID has no entry in the selected registry.', 'Le registre sélectionné ne contient aucune entrée pour cet identifiant de source.'),
  'unknown-source': localizedLabel('These features have no usable source ID.', 'Ces éléments ne comportent aucun identifiant de source utilisable.'),
  download: localizedLabel('Download tile source report', 'Télécharger le rapport des sources de la tuile'),
  saved: localizedLabel('The tile report is ready to download.', 'Le rapport de la tuile est prêt à être téléchargé.'),
  exportError: localizedLabel('The report could not be prepared.', 'Impossible de préparer le rapport.'),
  format: localizedLabel('Choose a supported vector archive.', 'Choisissez une archive vectorielle prise en charge.'),
  boundsError: localizedLabel('The archive contains invalid section ranges or geographic bounds.', 'Les sections ou les limites géographiques de l’archive sont non valides.'),
  metadata: localizedLabel('The archive metadata could not be read.', 'Impossible de lire les métadonnées de l’archive.'),
  directory: localizedLabel('The tile directory contains invalid entries.', 'Le répertoire des tuiles contient des entrées non valides.'),
  compression: localizedLabel('The compressed content could not be decoded.', 'Impossible de décoder le contenu compressé.'),
  limit: localizedLabel('The selected content exceeds a reading limit.', 'Le contenu choisi dépasse une limite de lecture.'),
  coordinate: localizedLabel('The tile address is outside the supported grid.', 'L’adresse de la tuile se trouve en dehors de la grille prise en charge.'),
  read: localizedLabel('The file could not be read.', 'Impossible de lire le fichier.'),
  cancelled: localizedLabel('Reading was cancelled.', 'Lecture annulée.'),
  tileFormat: localizedLabel('The vector tile contains an invalid feature or layer.', 'La tuile vectorielle contient un élément ou une couche non valide.'),
  registryFormat: localizedLabel('The file does not contain a supported source registry.', 'Le fichier ne contient pas de registre des sources pris en charge.'),
  duplicate: localizedLabel('The registry repeats a source ID.', 'Un identifiant de source figure plusieurs fois dans le registre.'),
};

/**
 * @param {string} key
 * @param {Locale} locale
 * @param {...(number|string)} args
 */
export function tileLabel(key, locale, ...args) {
  if (!Object.hasOwn(copy, key)) throw new RangeError('label');
  return copy[/** @type {keyof typeof copy} */ (key)][locale]
    .replace(/\{(\d+)\}/gu, (_, index) => String(args[Number(index)] ?? ''));
}
