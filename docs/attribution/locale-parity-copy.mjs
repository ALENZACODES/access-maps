// @ts-check
/** @typedef {'en' | 'fr'} Locale */

/** Pairs share a key so a report and the page cannot select different wording.
 * @satisfies {Record<string, [string, string]>} */
const labels = {
  title: ['Bilingual Notice Content & Locale Parity', 'Correspondance des mentions bilingues'],
  intro: [
    'Compare English and French source notices, check placeholders and review French typography. The files stay on this device.',
    'Comparez les mentions de source en anglais et en français, examinez les variables et la typographie française. Les fichiers restent sur cet appareil.',
  ],
  load: ['Load catalog JSON', 'Charger le catalogue JSON'],
  currentFile: ['Current catalog file', 'Fichier du catalogue actuel'],
  previousFile: ['Previous catalog file', 'Fichier du catalogue précédent'],
  audit: ['Audit catalog', 'Examiner le catalogue'],
  coverage: ['Pair coverage', 'Couverture des paires'],
  compare: ['Compare another catalog', 'Comparer un autre catalogue'],
  export: ['Export report', 'Exporter le rapport'],
  language: ['Language', 'Langue'],
  skip: ['Skip to main content', 'Aller au contenu principal'],
  app: ['the App', 'l’App'],
  disclaimer: [
    'This tool checks supplied notice text and metadata. It does not determine legal rights or accessibility facts about real places.',
    'Cet outil examine les textes et les métadonnées fournis. Il ne détermine ni les droits juridiques ni l’accessibilité de lieux réels.',
  ],
  loading: ['Reading file', 'Lecture du fichier'],
  invalidField: ['Invalid catalog field', 'Champ de catalogue invalide'],
  loaded: ['Catalog loaded', 'Catalogue chargé'],
  previousLoaded: ['Previous catalog loaded', 'Catalogue précédent chargé'],
  needCatalog: ['Load a catalog first.', 'Chargez d’abord un catalogue.'],
  needBoth: ['Load both catalogs first.', 'Chargez d’abord les deux catalogues.'],
  readFailed: ['Could not read the file.', 'Impossible de lire le fichier.'],
  invalidJson: ['The file does not contain valid JSON.', 'Le fichier ne contient pas de JSON valide.'],
  unsupported: ['This catalog format is unsupported.', 'Ce format de catalogue n’est pas pris en charge.'],
  tooLarge: ['The file is too large.', 'Le fichier est trop volumineux.'],
  malformed: ['Some catalog fields are invalid.', 'Certains champs du catalogue sont invalides.'],
  missingFrench: ['Missing French notice', 'Mention française manquante'],
  missingEnglish: ['Missing English notice', 'Mention anglaise manquante'],
  noChanges: ['No changes', 'Aucun changement'],
  noFindings: ['No findings', 'Aucun constat'],
  auditDone: ['Audit complete', 'Examen terminé'],
  comparisonDone: ['Comparison complete', 'Comparaison terminée'],
  reportTitle: ['Bilingual notice parity report', 'Rapport de correspondance des mentions bilingues'],
  catalog: ['Catalog', 'Catalogue'],
  date: ['Created on', 'Date de création'],
  decision: ['Review decision', 'Décision d’examen'],
  complete: ['Complete pairs', 'Paires complètes'],
  findings: ['Findings', 'Constats'],
  english: ['English', 'Anglais'],
  french: ['French', 'Français'],
  pairId: ['Pair identifier', 'Identifiant de la paire'],
  blocked: ['Blocked', 'Bloqué'],
  'hold-for-review': ['On hold for review', 'En attente d’examen'],
  'review-needed': ['Review needed', 'Examen requis'],
  block: ['Blocking', 'Bloquant'],
  high: ['High priority', 'Priorité élevée'],
  medium: ['Medium priority', 'Priorité moyenne'],
  low: ['Low priority', 'Priorité faible'],
  info: ['Information', 'Information'],
  'entry-removed': ['Entry removed', 'Entrée retirée'],
  'entry-added': ['Entry added', 'Entrée ajoutée'],
  'entry-text-changed': ['Notice text changed', 'Texte de la mention modifié'],
  'entry-licence-changed': ['Licence changed', 'Licence modifiée'],
  'entry-sourceId-changed': ['Source identifier changed', 'Identifiant de la source modifié'],
  'entry-required-changed': ['Requirement changed', 'Caractère obligatoire modifié'],
  'entry-tokens-changed': ['Placeholder list changed', 'Liste des variables modifiée'],
  'entry-sourceUrl-changed': ['Source address changed', 'Adresse de la source modifiée'],
  'entry-licenceUrl-changed': ['Licence address changed', 'Adresse de la licence modifiée'],
  EN_ENTRY_MISSING: ['Missing English entry', 'Entrée anglaise manquante'],
  FR_ENTRY_MISSING: ['Missing French entry', 'Entrée française manquante'],
  EN_ENTRY_DUPLICATED: ['Duplicate English entry', 'Entrée anglaise en double'],
  FR_ENTRY_DUPLICATED: ['Duplicate French entry', 'Entrée française en double'],
  KIND_MISMATCH: ['Notice kinds differ', 'Les types de mention diffèrent'],
  SOURCE_ID_MISMATCH: ['Source identifiers differ', 'Les identifiants de source diffèrent'],
  LICENCE_MISMATCH: ['Licences differ', 'Les licences diffèrent'],
  REQUIRED_FLAG_MISMATCH: ['Requirements differ', 'Le caractère obligatoire diffère'],
  SOURCE_URL_MISMATCH: ['Source addresses differ', 'Les adresses de source diffèrent'],
  LICENCE_URL_MISMATCH: ['Licence addresses differ', 'Les adresses de licence diffèrent'],
  TOKEN_PARITY_MISMATCH: ['Placeholders differ between languages', 'Les variables diffèrent selon la langue'],
  EN_TOKEN_MANIFEST_MISMATCH: ['English placeholders differ from the list', 'Les variables anglaises diffèrent de la liste'],
  FR_TOKEN_MANIFEST_MISMATCH: ['French placeholders differ from the list', 'Les variables françaises diffèrent de la liste'],
  FR_NBSP_REQUIRED: [
    'Use a nonbreaking space (U+00A0) before a colon and a narrow nonbreaking space (U+202F) before a semicolon, exclamation mark or question mark',
    'Insérez une espace insécable (U+00A0) avant le deux-points et une espace fine insécable (U+202F) avant le point-virgule, le point d’exclamation ou le point d’interrogation',
  ],
  FR_GUILLEMET_SPACING: [
    'Use a narrow nonbreaking space (U+202F) after the opening French quotation mark and before the closing mark',
    'Insérez une espace fine insécable (U+202F) après le guillemet ouvrant et avant le guillemet fermant',
  ],
  FR_DOUBLE_SPACE: ['Repeated space', 'Espace en double'],
  PROHIBITED_WORDING: ['Wording needs review', 'Formulation à examiner'],
  REQUIRED_SOURCE_UNKNOWN: ['Source missing for a required notice', 'Source manquante pour une mention obligatoire'],
  REQUIRED_LICENCE_UNKNOWN: ['Licence missing for a required notice', 'Licence manquante pour une mention obligatoire'],
  OSM_CREDIT_NOT_EXACT: ['OpenStreetMap credit differs from the required wording', 'La mention OpenStreetMap diffère du texte exigé'],
  SOURCE_URL_UNKNOWN: ['Missing source address', 'Adresse de la source manquante'],
};

/** @param {0 | 1} index */
function vocabulary(index) {
  return Object.freeze(Object.fromEntries(Object.entries(labels).map(([key, pair]) => [key, pair[index]])));
}

export const COPY = Object.freeze({ en: vocabulary(0), fr: vocabulary(1) });

/** @param {unknown} locale @returns {Locale} */
export function supportedLocale(locale) {
  return locale === 'fr' ? 'fr' : 'en';
}

/** @param {string} search */
export function localeFromSearch(search) {
  return supportedLocale(new URLSearchParams(search).get('lang'));
}

/**
 * A standalone label has no separator. A label followed by a value uses the
 * selected language's colon spacing. Keep supplied evidence text verbatim.
 * The existing label/value API also accepts a caller-provided literal label.
 * @param {string} key @param {string | number} [value] @param {string} [locale]
 */
export function localizedLabel(key, value, locale = 'en') {
  const lang = supportedLocale(locale);
  const dictionary = COPY[lang];
  const label = Object.hasOwn(dictionary, key) ? (dictionary[key] ?? key) : key;
  if (value === undefined) return label;
  return label + (lang === 'fr' ? '\u00a0: ' : ': ') + value;
}
