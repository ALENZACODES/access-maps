// @ts-check

/** @typedef {'en' | 'fr'} Locale */

/**
 * Apply print spacing to authored labels before inserting any source data.
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
  title: localizedLabel('Service notice calendar', 'Calendrier des avis de service'),
  skip: localizedLabel('Skip to main content', 'Aller au contenu principal'),
  intro: localizedLabel(
    'Explore the periods reported in a service notice file and the source of each notice.',
    'Consultez les périodes indiquées dans un fichier d’avis de service et les sources de chaque avis.',
  ),
  language: localizedLabel('English', 'Français'),
  loadHeading: localizedLabel('Notice file', 'Fichier d’avis'),
  file: localizedLabel('Choose a local file', 'Choisir un fichier local'),
  fileHelp: localizedLabel(
    'Open a JSON array, a file with one JSON notice per line, or a gzip copy. The file stays in this browser tab.',
    'Ouvrez un tableau JSON, un fichier contenant un avis JSON par ligne ou une copie gzip. Le fichier reste dans cet onglet.',
  ),
  sample: localizedLabel('Explore a fictional example', 'Explorer un exemple fictif'),
  clear: localizedLabel('Clear notices', 'Effacer les avis'),
  localOrigin: localizedLabel('Local file: {0}', 'Fichier local : {0}'),
  startHelp: localizedLabel(
    'The first day defaults to the latest retrieval date. If none is listed, it uses the earliest reported period boundary or today when all dates are unknown.',
    'Le premier jour correspond à la date de collecte la plus récente. Si elle est inconnue, le calendrier commence à la première limite de période indiquée ou à la date du jour si toutes les dates sont inconnues.',
  ),
  exampleOrigin: localizedLabel('Fictional example', 'Exemple fictif'),
  exampleReady: localizedLabel('The fictional example is open.', 'L’exemple fictif est ouvert.'),
  fileReady: localizedLabel('The local file is open.', 'Le fichier local est ouvert.'),
  working: localizedLabel('Reading the file…', 'Lecture du fichier…'),
  cleared: localizedLabel('The notices have been cleared.', 'Les avis ont été effacés.'),
  windowHeading: localizedLabel('Dates and filters', 'Dates et filtres'),
  date: localizedLabel('First day', 'Premier jour'),
  days: localizedLabel('Number of days (1–31)', 'Nombre de jours (1 à 31)'),
  zone: localizedLabel('Time zone', 'Fuseau horaire'),
  eastern: localizedLabel('Eastern time', 'Heure de l’Est'),
  central: localizedLabel('Central time', 'Heure du Centre'),
  universal: localizedLabel('Coordinated Universal Time (UTC)', 'Temps universel coordonné (UTC)'),
  filters: localizedLabel('Filter notices', 'Filtrer les avis'),
  equipment: localizedLabel('Equipment', 'Équipement'),
  allEquipment: localizedLabel('All equipment', 'Tous les équipements'),
  elevator: localizedLabel('Elevator', 'Ascenseur'),
  escalator: localizedLabel('Escalator', 'Escalier mécanique'),
  bothEquipment: localizedLabel('Elevator and escalator', 'Ascenseur et escalier mécanique'),
  unknownEquipment: localizedLabel('Equipment unknown (UNKNOWN)', 'Équipement inconnu (UNKNOWN)'),
  stop: localizedLabel('Exact stop ID', 'Identifiant exact de l’arrêt'),
  route: localizedLabel('Exact route ID', 'Identifiant exact de la ligne'),
  query: localizedLabel('Search notice text and IDs', 'Rechercher dans le texte et les identifiants'),
  apply: localizedLabel('Apply dates and filters', 'Appliquer les dates et les filtres'),
  resetFilters: localizedLabel('Clear filters', 'Effacer les filtres'),
  pending: localizedLabel(
    'Apply your changes to update the calendar and the report.',
    'Appliquez vos changements pour actualiser le calendrier et le rapport.',
  ),
  resultsHeading: localizedLabel('Calendar', 'Calendrier'),
  summary: localizedLabel(
    'Notices in file: {0}. After filters: {1}. With a period in these dates: {2}.',
    'Avis dans le fichier : {0}. Après filtrage : {1}. Avec une période dans ces dates : {2}.',
  ),
  limits: localizedLabel(
    'A period shows what the source reported. Outside those periods, the equipment status is unknown.',
    'Les périodes correspondent aux indications de la source. En dehors de ces périodes, l’état de l’équipement est inconnu.',
  ),
  shownDay: localizedLabel('Day to display', 'Jour à afficher'),
  dayOption: localizedLabel('{0} · {1}', '{0} · {1}'),
  dayHeading: localizedLabel('Periods for {0}', 'Périodes du {0}'),
  previousDay: localizedLabel('Previous day', 'Jour précédent'),
  nextDay: localizedLabel('Next day', 'Jour suivant'),
  oneNotice: localizedLabel('1 notice', '1 avis'),
  notices: localizedLabel('{0} notices', '{0} avis'),
  emptyDay: localizedLabel(
    'No matching notice has a reported period on this day.',
    'Aucun avis correspondant ne comporte de période indiquée pour ce jour.',
  ),
  unknownTitle: localizedLabel('Undated notices ({0})', 'Avis sans période déterminée ({0})'),
  unknownHelp: localizedLabel(
    'For these notices, the available dates do not establish whether a period overlaps the selected dates.',
    'Pour ces avis, les dates disponibles ne permettent pas de savoir si une période chevauche les dates sélectionnées.',
  ),
  outsideTitle: localizedLabel('Outside these dates ({0})', 'Hors de ces dates ({0})'),
  outsideHelp: localizedLabel(
    'Each of these notices has dated periods and none overlap the selected dates.',
    'Chacun de ces avis comporte des périodes datées, toutes en dehors des dates sélectionnées.',
  ),
  emptyGroup: localizedLabel('No matching notices in this group.', 'Aucun avis correspondant dans ce groupe.'),
  timeSpan: localizedLabel('{0} to {1}', 'De {0} à {1}'),
  source: localizedLabel('Source', 'Source'),
  licence: localizedLabel('Licence', 'Licence'),
  retrieved: localizedLabel('Retrieval date', 'Date de collecte'),
  tier: localizedLabel('Source tier', 'Niveau de la source'),
  noticeId: localizedLabel('Notice ID', 'Identifiant de l’avis'),
  stopIds: localizedLabel('Stop IDs', 'Identifiants des arrêts'),
  routeIds: localizedLabel('Route IDs', 'Identifiants des lignes'),
  sourcePeriods: localizedLabel('Reported periods', 'Périodes indiquées'),
  sourcePeriodsHelp: localizedLabel(
    'Original bounds in the selected time zone. An end time is excluded.',
    'Limites d’origine dans le fuseau horaire sélectionné. L’heure de fin est exclue.',
  ),
  pageInfo: localizedLabel('Showing {0}–{1} of {2}.', 'Avis {0} à {1} sur {2}.'),
  previousPage: localizedLabel('Previous notices', 'Avis précédents'),
  nextPage: localizedLabel('Next notices', 'Avis suivants'),
  download: localizedLabel('Download the full text report', 'Télécharger le rapport texte complet'),
  downloaded: localizedLabel('The text report is ready to download.', 'Le rapport texte est prêt à être téléchargé.'),
  inputRow: localizedLabel('Record or line {0}.', 'Enregistrement ou ligne {0}.'),
  error_empty: localizedLabel('The file contains no notices.', 'Le fichier ne contient aucun avis.'),
  error_format: localizedLabel('The file does not match a supported JSON format.', 'Le format JSON du fichier n’est pas pris en charge.'),
  error_row: localizedLabel('A notice contains an invalid field.', 'Un avis contient un champ non valide.'),
  error_duplicate: localizedLabel('The file repeats a notice ID.', 'Un identifiant d’avis figure plusieurs fois dans le fichier.'),
  error_date: localizedLabel('A retrieval date is invalid.', 'Une date de collecte est non valide.'),
  error_period: localizedLabel('A reported period has invalid bounds.', 'Les limites d’une période indiquée sont non valides.'),
  error_limit: localizedLabel('The file exceeds a reading limit. Select a smaller collection.', 'Le fichier dépasse une limite de lecture. Choisissez un ensemble plus petit.'),
  error_encoding: localizedLabel('Save the text in UTF-8 and open it again.', 'Enregistrez le texte au format UTF-8, puis ouvrez-le de nouveau.'),
  error_compression: localizedLabel('The compressed file could not be opened. Try its uncompressed text.', 'Impossible d’ouvrir le fichier compressé. Essayez le texte décompressé.'),
  error_read: localizedLabel('The file could not be read. Choose it again.', 'La lecture du fichier a échoué. Sélectionnez-le de nouveau.'),
  invalidDate: localizedLabel('Enter a valid first day for this window.', 'Saisissez un premier jour valide pour cette période.'),
  invalidDays: localizedLabel('Enter a whole number from 1 to 31.', 'Saisissez un nombre entier de 1 à 31.'),
  invalidZone: localizedLabel('Select one of the listed time zones.', 'Choisissez un des fuseaux horaires proposés.'),
};

/**
 * Insert arguments literally, so identifiers containing braces or replacement
 * characters cannot alter the other slots in a label.
 * @param {string} key
 * @param {Locale} locale
 * @param {...(number|string)} values
 */
export function uiText(key, locale, ...values) {
  if (!Object.hasOwn(copy, key)) throw new RangeError('label');
  const template = copy[/** @type {keyof typeof copy} */ (key)][locale];
  return template.replace(/\{(\d+)\}/gu, (_, index) => String(values[Number(index)] ?? ''));
}
