// @ts-check
/** @typedef {'en' | 'fr'} ReaderLocale */

export const READER_COPY = {
  en: {
    title: 'Map pack sources',
    app: 'the App',
    intro: 'Find the source credits for a region or a layer in a saved map pack.',
    skip: 'Skip to main content',
    back: 'Sources and licences',
    switchTo: 'Français',
    open: 'Open a map pack manifest',
    hint: 'Choose the manifest.json file from a version 1 map pack (up to 8 MiB). The file stays on this device.',
    file: 'Manifest file',
    example: 'Explore an example',
    clear: 'Clear file',
    scope: 'Choose coverage',
    region: 'Region',
    allRegions: 'All regions',
    layer: 'Layer',
    allLayers: 'All layers',
    layers: {
      venue: 'Places',
      washroom: 'Washrooms',
      transit: 'Transit',
      path: 'Paths',
    },
    totals: 'In this selection',
    sources: 'Sources',
    partCount: 'Included files',
    recordCount: 'Records listed',
    withheldCount: 'Excluded files',
    countHint: 'A record is one entry listed by a source. Several entries can describe the same place.',
    sourceHint: 'UNKNOWN means the manifest supplies no usable value for that field.',
    notes: 'Manifest notes',
    sourceNotes: 'Notes about this source',
    notices: 'Source notices',
    download: 'Save source list',
    pageLabel: 'Source list pages',
    previous: 'Previous sources',
    next: 'Next sources',
    id: 'Source identifier',
    licence: 'Licence',
    retrieved: 'Retrieved on',
    tier: 'Evidence tier',
    noSources: 'No sources have files assigned to this selection.',
    localOrigin: 'Showing the manifest you opened.',
    exampleOrigin: 'Example · Four selected map files.',
    messages: {
      empty: '',
      loading: 'Reading the selected file…',
      loaded: 'Manifest opened.',
      sample: 'Example opened.',
      cleared: 'File and selection cleared.',
      saved: 'Source list prepared for download.',
    },
    errors: {
      limit: 'This file exceeds the reader’s size or item limits. Open a smaller manifest.',
      json: 'The file does not contain readable JSON. Choose a version 1 map pack manifest.',
      format: 'The file is missing required map pack details or contains invalid values. Choose a version 1 manifest.',
      version: 'This reader supports version 1 map pack manifests. Choose a version 1 file.',
      read: 'The file could not be read. Choose it again or open another manifest.',
      encoding: 'The file is not UTF-8 text. Choose the JSON manifest from the map pack.',
      download: 'The download could not start. Try saving the source list again.',
    },
  },
  fr: {
    title: 'Sources d’un jeu de données cartographiques',
    app: 'l’App',
    intro: 'Retrouvez les mentions de source d’une région ou d’une couche dans un jeu de données cartographiques enregistré.',
    skip: 'Aller au contenu principal',
    back: 'Sources et licences',
    switchTo: 'English',
    open: 'Ouvrir un manifeste cartographique',
    hint: 'Choisissez le fichier manifest.json d’un jeu de données cartographiques de version 1 (jusqu’à 8 Mio). Le fichier reste sur cet appareil.',
    file: 'Fichier manifeste',
    example: 'Explorer un exemple',
    clear: 'Effacer le fichier',
    scope: 'Choisir les données à afficher',
    region: 'Région',
    allRegions: 'Toutes les régions',
    layer: 'Couche',
    allLayers: 'Toutes les couches',
    layers: {
      venue: 'Lieux',
      washroom: 'Toilettes',
      transit: 'Transport en commun',
      path: 'Sentiers',
    },
    totals: 'Dans cette sélection',
    sources: 'Sources',
    partCount: 'Fichiers inclus',
    recordCount: 'Enregistrements recensés',
    withheldCount: 'Fichiers exclus',
    countHint: 'Un enregistrement correspond à une entrée d’une source. Plusieurs entrées peuvent décrire le même lieu.',
    sourceHint: 'UNKNOWN indique que le manifeste ne fournit aucune valeur exploitable pour ce champ.',
    notes: 'Notes sur le manifeste',
    sourceNotes: 'Notes sur cette source',
    notices: 'Mentions de source',
    download: 'Enregistrer la liste des sources',
    pageLabel: 'Pages de la liste des sources',
    previous: 'Sources précédentes',
    next: 'Sources suivantes',
    id: 'Identifiant de la source',
    licence: 'Licence',
    retrieved: 'Date de récupération',
    tier: 'Niveau de preuve',
    noSources: 'Aucune source n’a de fichier attribué à cette sélection.',
    localOrigin: 'Affichage du manifeste que vous avez ouvert.',
    exampleOrigin: 'Exemple · Quatre fichiers cartographiques sélectionnés.',
    messages: {
      empty: '',
      loading: 'Lecture du fichier sélectionné…',
      loaded: 'Manifeste ouvert.',
      sample: 'Exemple ouvert.',
      cleared: 'Fichier et sélection effacés.',
      saved: 'La liste des sources est prête à télécharger.',
    },
    errors: {
      limit: 'Ce fichier dépasse la limite de taille ou de nombre d’éléments du lecteur. Ouvrez un manifeste plus petit.',
      json: 'Ce fichier ne contient pas de données JSON lisibles. Choisissez un manifeste cartographique de version 1.',
      format: 'Ce fichier comporte des valeurs manquantes ou invalides. Choisissez un manifeste cartographique de version 1.',
      version: 'Ce lecteur accepte les manifestes cartographiques de version 1. Choisissez un fichier de version 1.',
      read: 'Impossible de lire le fichier. Choisissez-le de nouveau ou ouvrez un autre manifeste.',
      encoding: 'Ce fichier n’est pas un texte UTF-8. Choisissez le manifeste JSON du jeu de données.',
      download: 'Le téléchargement n’a pas pu démarrer. Essayez de nouveau d’enregistrer la liste des sources.',
    },
  },
};

/** @param {ReaderLocale} locale @param {number} value */
export function numberLabel(locale, value) {
  return value.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA');
}

/** @param {ReaderLocale} locale @param {number} first @param {number} last @param {number} total */
export function sourcesRange(locale, first, last, total) {
  const start = numberLabel(locale, first);
  const end = numberLabel(locale, last);
  const count = numberLabel(locale, total);
  return locale === 'fr' ? `Sources ${start} à ${end} sur ${count}` : `Sources ${start} to ${end} of ${count}`;
}

/** @param {ReaderLocale} locale @param {number} count */
export function unlocatedLabel(locale, count) {
  const n = numberLabel(locale, count);
  if (locale === 'fr') {
    return count === 1
      ? 'Un fichier exclu ne peut pas être rattaché à cette sélection. Il est omis du total.'
      : `${n} fichiers exclus ne peuvent pas être rattachés à cette sélection. Ils sont omis du total.`;
  }
  return count === 1
    ? 'One excluded file could not be assigned to this selection. It is omitted from the total.'
    : `${n} excluded files could not be assigned to this selection. They are omitted from the total.`;
}

/** @param {ReaderLocale} locale @param {number} count */
export function sourceCountLabel(locale, count) {
  const n = numberLabel(locale, count);
  if (locale === 'fr') return count === 1 ? '1 source dans la sélection.' : `${n} sources dans la sélection.`;
  return count === 1 ? '1 source in the selection.' : `${n} sources in the selection.`;
}
