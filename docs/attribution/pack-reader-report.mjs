// @ts-check
import {
  METROLINX_AUA_END_USER_LAWS_EN,
  METROLINX_AUA_END_USER_LAWS_FR,
  METROLINX_AUA_LEGEND,
  METROLINX_OGL_NOTICE,
  SOURCES,
  UNKNOWN,
} from './attribution-utils.mjs';

import { LTC_AVAILABILITY_EN, LTC_AVAILABILITY_FR } from './pack-reader-provider.mjs';

/** @typedef {'en' | 'fr'} Locale */
/** @typedef {import('./pack-reader-model.mjs').PackCoverage} Coverage */
/** @typedef {import('./pack-reader-model.mjs').PackSourceRow} SourceRow */
/** @typedef {{text: string, lang: Locale | 'und', href?: string}} Notice */

const reportCopy = {
  en: {
    title: 'Sources in the selected map files',
    scope: 'Counts refer to records listed in the selected map files. Several records can describe one place.',
    dates: 'The retrieval date describes the source copy. The v1 manifest does not supply a record-level evidence tier.',
    region: 'Region',
    tranche: 'Data type',
    sources: 'Sources',
    records: 'Listed records',
    parts: 'Included files',
    withheld: 'Withheld files in this selection',
    unlocated: 'Withheld files that could not be assigned to this selection',
    name: 'Source',
    id: 'Source identifier',
    licence: 'Licence in the file',
    retrieved: 'Retrieved on',
    tier: 'Evidence tier',
    issues: 'Items to review',
    notice: 'Source notices',
    empty: 'No source rows match this selection.',
    osmTerms: 'OpenStreetMap copyright and licence',
    aua: 'Metrolinx Access and Use Agreement',
    ogl: 'Open Government Licence – Ontario – Metrolinx',
    ltcTerms: 'London Transit Commission terms of use',
  },
  fr: {
    title: 'Sources des fichiers cartographiques sélectionnés',
    scope: 'Le nombre indiqué correspond aux fiches des fichiers sélectionnés. Plusieurs fiches peuvent décrire le même lieu.',
    dates: 'La date de récupération concerne la copie de la source. Le manifeste v1 ne fournit pas le niveau de preuve de chaque fiche.',
    region: 'Région',
    tranche: 'Type de données',
    sources: 'Sources',
    records: 'Fiches répertoriées',
    parts: 'Fichiers inclus',
    withheld: 'Fichiers écartés dans cette sélection',
    unlocated: 'Fichiers écartés impossibles à rattacher à cette sélection',
    name: 'Source',
    id: 'Identifiant de la source',
    licence: 'Licence dans le fichier',
    retrieved: 'Date de récupération',
    tier: 'Niveau de preuve',
    issues: 'Points à examiner',
    notice: 'Mentions de source',
    empty: 'Aucune source ne correspond à cette sélection.',
    osmTerms: 'Droits d’auteur et licence OpenStreetMap',
    aua: 'Accord d’accès et d’utilisation de Metrolinx',
    ogl: 'Licence du gouvernement ouvert – Ontario – Metrolinx',
    ltcTerms: 'Conditions d’utilisation de la London Transit Commission',
  },
};

/** @satisfies {Record<string, [string, string]>} */
const issueLabels = {
  'metadata-gap': [
    'Some source details are missing or unreadable in the file.',
    'Certains renseignements sur la source sont absents ou illisibles dans le fichier.',
  ],
  'licence-mismatch': [
    'The licence or terms address in the file differs from the source declaration used by the map pack.',
    'La licence ou l’adresse des conditions dans le fichier diffère de la déclaration de source du lot cartographique.',
  ],
  'notice-mismatch': [
    'The notice in the file is missing or differs from the provider notice.',
    'La mention du fichier est absente ou diffère de celle du fournisseur.',
  ],
  'missing-source': [
    'A file names a source that has no entry in the manifest.',
    'Un fichier désigne une source sans entrée dans le manifeste.',
  ],
  'held-source': [
    'A listed file refers to a source that the manifest marks as held.',
    'Un fichier répertorié renvoie à une source que le manifeste indique comme écartée.',
  ],
  'duplicate-part': [
    'The manifest lists the same file more than once.',
    'Le manifeste répertorie plusieurs fois le même fichier.',
  ],
  'conflicting-part': [
    'Different entries describe the same file inconsistently.',
    'Les entrées donnent des renseignements contradictoires sur le même fichier.',
  ],
  'withheld-conflict': [
    'The same file appears in both the included and withheld lists.',
    'Le même fichier figure parmi les fichiers inclus et les fichiers écartés.',
  ],
  'count-mismatch': [
    'The pack totals and the file inventory disagree.',
    'Les totaux du lot diffèrent de ceux de la liste des fichiers.',
  ],
};

/** Keep internal diagnostic codes and imported text out of interface labels.
 * @param {string} code @param {Locale} locale */
export function issueText(code, locale) {
  if (Object.hasOwn(issueLabels, code)) {
    const pair = issueLabels[/** @type {keyof typeof issueLabels} */ (code)];
    return pair[locale === 'fr' ? 1 : 0];
  }
  return locale === 'fr' ? 'Une entrée du manifeste nécessite un examen.' : 'A manifest entry needs review.';
}

/**
 * The manifest supplies evidence of inclusion. The repository catalogue supplies
 * the known providers' exact notices and trusted links. Never create a link
 * from an imported notice, a user-editable source name or a filename.
 * @param {Pick<SourceRow, 'sourceId' | 'attribution' | 'partCount'>} row
 * @param {Locale} locale
 * @returns {Notice[]}
 */
export function sourceNotices(row, locale) {
  if (row.partCount === 0) return [];
  const t = reportCopy[locale];
  switch (row.sourceId) {
    case 'osm':
    case 'osm-ontario':
      return [
        ...SOURCES.osm.notices.en.map(text => ({ text, lang: /** @type {const} */ ('en') })),
        { text: t.osmTerms, lang: locale, href: SOURCES.osm.licenceUrl },
      ];
    case 'metrolinx-go':
    case 'metrolinx-up':
      return [
        { text: METROLINX_AUA_LEGEND, lang: 'en' },
        { text: METROLINX_OGL_NOTICE, lang: 'en' },
        { text: METROLINX_AUA_END_USER_LAWS_EN, lang: 'en' },
        { text: METROLINX_AUA_END_USER_LAWS_FR, lang: 'fr' },
        { text: t.aua, lang: locale, href: SOURCES.metrolinx.sourceUrl },
        { text: t.ogl, lang: locale, href: SOURCES.metrolinx.licenceUrl },
      ];
    case 'gtfs-ltc':
      return [
        { text: LTC_AVAILABILITY_EN, lang: 'en' },
        { text: LTC_AVAILABILITY_FR, lang: 'fr' },
        { text: t.ltcTerms, lang: locale, href: SOURCES.ltc.licenceUrl },
      ];
    default:
      return [{ text: row.attribution || UNKNOWN, lang: 'und' }];
  }
}

/**
 * UTF-8 plain text uses the same projections as the source cards. Each export
 * covers the entire current selection, including sources beyond the visible
 * page. Locale changes only affect labels and number formatting.
 * @param {Coverage} view @param {Locale} locale
 * @param {string} regionLabel @param {string} trancheLabel
 */
export function coverageText(view, locale, regionLabel, trancheLabel) {
  const t = reportCopy[locale];
  const separator = locale === 'fr' ? ' : ' : ': ';
  const number = new Intl.NumberFormat(locale === 'fr' ? 'fr-CA' : 'en-CA');
  /** @param {string} label @param {string | number} value */
  const field = (label, value) => label + separator + (typeof value === 'number' ? number.format(value) : value);
  /** @param {readonly string[]} codes */
  const issueLines = codes => codes.length
    ? [t.issues, ...codes.map(code => '• ' + issueText(code, locale))]
    : [];
  const lines = [
    t.title, '',
    field(t.region, regionLabel), field(t.tranche, trancheLabel),
    field(t.sources, view.rows.length), field(t.records, view.recordCount),
    field(t.parts, view.partCount), field(t.withheld, view.withheldCount),
    field(t.unlocated, view.unlocatedCount),
    '', t.scope, t.dates, ...issueLines(view.issues),
  ];
  if (view.rows.length === 0) lines.push('', t.empty);
  for (const row of view.rows) {
    lines.push(
      '', field(t.name, row.source), field(t.id, row.sourceId),
      field(t.licence, row.licence), field(t.retrieved, row.retrievedOn), field(t.tier, row.tier),
      field(t.parts, row.partCount), field(t.records, row.recordCount), field(t.withheld, row.withheldCount),
      ...issueLines(row.issues),
    );
    const notices = sourceNotices(row, locale);
    if (notices.length) lines.push(t.notice);
    for (const notice of notices) {
      lines.push(notice.text);
      if (notice.href) lines.push(notice.href);
    }
  }
  return lines.join('\n') + '\n';
}
