/**
 * Browser-safe attribution presentation logic.
 * Pure functions here are also shared by the directly-served route.
 * No network requests, clocks, storage writes, or location inference.
 */

export const SOURCE_IDS = Object.freeze(['osm', 'metrolinx', 'ltc']);
export const UNKNOWN = 'UNKNOWN';
export const MAX_QUERY_LENGTH = 1024;

export const MESSAGES = Object.freeze({
  en: Object.freeze({
    pageTitle: 'Sources and licences',
    workbench: 'Local dataset provenance workbench',
    appName: 'the App',
    skip: 'Skip to main content',
    intro: 'See where displayed information comes from and which terms apply. A source credit does not mean the information is current or complete.',
    language: 'Language',
    english: 'English',
    french: 'Français',
    showSources: 'Sources in this view',
    sourceOptions: 'Choose sources to show',
    all: 'All sources',
    none: 'No sources selected',
    source: 'Source',
    licence: 'Licence and terms',
    reviewed: 'Terms reviewed',
    updated: 'Dataset date',
    unknown: 'UNKNOWN',
    unknownHelp: 'No dataset date was supplied. UNKNOWN does not mean there are no changes.',
    notices: 'Required and supporting notices',
    explanation: 'About this source',
    terms: 'Open source terms',
    openLicence: 'Open licence information',
    disclaimer: 'This page describes source terms. It does not assess the accessibility of places, trips or services.',
    offline: 'Offline',
    online: 'Connection available',
    connectionUnknown: 'Connection status UNKNOWN',
    offlineHelp: 'This page and its notices work without a connection once saved. External source links require a connection.',
    copy: 'Copy page link',
    copied: 'Page link copied',
    copyFailed: 'Copy unavailable. Use the address bar to share this page.',
    print: 'Print this page',
    save: 'Export notices as text',
    downloadHint: 'The exported text contains the notices visible on this page.',
    selection: 'Selected sources',
    selectionInvalid: 'Unrecognised source identifiers were ignored.',
    details: 'Source details',
    osmMap: 'For maps using OpenStreetMap data, keep the credit close to the map as well.',
    noEndorsement: 'Listing a provider does not mean we approve or endorse them, or that the information is complete.',
    feedNotice: 'Check the terms attached to the particular feed before distributing its data.',
    sourceCount: 'sources selected',
    sourceCountOne: 'source selected',
    external: 'Opens an external website',
    share: 'Share selection',
    close: 'Close',
    error: 'The source list could not be displayed.',
    refreshed: 'Selection updated',
    osmlabel: 'OpenStreetMap',
    metrolinxlabel: 'Metrolinx',
    ltclabel: 'London Transit Commission',
    tools: 'Page actions',
    summary: 'Source summary',
    attribution: 'Attribution notice',
    dataAsOf: 'Data as of',
    reviewedOn: 'Terms reviewed on',
    exportTitle: 'Sources and licences — the App',
    exportDate: 'Exported source notices; dataset dates remain UNKNOWN unless separately supplied.',
    security: 'External links are not needed to view the notices displayed here.',
    filterHelp: 'Select only sources that are actually used in the view you are documenting.',
    legal: 'Licence names and required English notices are preserved as supplied.',
    selectedNone: 'No provider attributions are selected. This does not mean the page uses no outside data.',
  }),
  fr: Object.freeze({
    pageTitle: 'Sources et licences',
    workbench: 'Atelier local de provenance des données',
    appName: 'l’App',
    skip: 'Aller au contenu principal',
    intro: 'Consultez la provenance des informations affichées et les conditions applicables. Une mention de source n’établit ni l’actualité ni l’exhaustivité des informations.',
    language: 'Langue',
    english: 'English',
    french: 'Français',
    showSources: 'Sources de cette vue',
    sourceOptions: 'Choisir les sources à afficher',
    all: 'Toutes les sources',
    none: 'Aucune source sélectionnée',
    source: 'Source',
    licence: 'Licence et conditions',
    reviewed: 'Conditions consultées le',
    updated: 'Date des données',
    unknown: 'UNKNOWN',
    unknownHelp: 'Aucune date des données n’a été fournie. UNKNOWN ne signifie pas qu’aucun changement n’a eu lieu.',
    notices: 'Mentions obligatoires et complémentaires',
    explanation: 'À propos de cette source',
    terms: 'Ouvrir les conditions de la source',
    openLicence: 'Ouvrir les renseignements sur la licence',
    disclaimer: 'Cette page présente les conditions des sources. Elle n’évalue pas l’accessibilité des lieux, trajets ou services.',
    offline: 'Hors ligne',
    online: 'Connexion disponible',
    connectionUnknown: 'État de connexion UNKNOWN',
    offlineHelp: 'Cette page et ses mentions fonctionnent hors ligne après leur enregistrement. Les liens externes nécessitent une connexion.',
    copy: 'Copier le lien de la page',
    copied: 'Lien de la page copié',
    copyFailed: 'Copie indisponible. Utilisez la barre d’adresse pour partager cette page.',
    print: 'Imprimer cette page',
    save: 'Exporter les mentions en texte',
    downloadHint: 'Le texte exporté contient les mentions affichées sur cette page.',
    selection: 'Sources sélectionnées',
    selectionInvalid: 'Les identifiants de source non reconnus ont été ignorés.',
    details: 'Détails des sources',
    osmMap: 'Pour une carte utilisant les données OpenStreetMap, affichez aussi le crédit près de la carte.',
    noEndorsement: 'La présence d’un fournisseur ne suppose ni approbation ni soutien, et n’établit pas que les informations sont complètes.',
    feedNotice: 'Consultez les conditions du flux particulier avant de distribuer ses données.',
    sourceCount: 'sources sélectionnées',
    sourceCountOne: 'source sélectionnée',
    external: 'Ouvre un site externe',
    share: 'Partager la sélection',
    close: 'Fermer',
    error: 'Impossible d’afficher les sources.',
    refreshed: 'Sélection mise à jour',
    osmlabel: 'OpenStreetMap',
    metrolinxlabel: 'Metrolinx',
    ltclabel: 'London Transit Commission',
    tools: 'Actions de la page',
    summary: 'Résumé des sources',
    attribution: 'Mention de source',
    dataAsOf: 'Données en date du',
    reviewedOn: 'Conditions consultées le',
    exportTitle: 'Sources et licences — l’App',
    exportDate: 'Mentions de sources exportées ; les dates des données restent UNKNOWN si elles ne sont pas fournies séparément.',
    security: 'Il n’est pas nécessaire d’ouvrir les liens externes pour consulter les mentions affichées ici.',
    filterHelp: 'Choisissez uniquement les sources réellement utilisées dans la vue que vous documentez.',
    legal: 'Les noms des licences et les mentions anglaises obligatoires sont conservés.',
    selectedNone: 'Aucun fournisseur n’est sélectionné. Cela ne signifie pas que cette page n’utilise aucune donnée externe.',
  }),
});

export const METROLINX_AUA_LEGEND =
  'Data used in this product or service is provided with the permission of Metrolinx. ' +
  'Metrolinx makes no representations or warranties of any kind, express or implied, ' +
  'with respect to the Data and assumes no responsibility for the accuracy or currency ' +
  'of the data used in this product or service.';
export const METROLINX_OGL_NOTICE =
  'Contains information licensed under the Open Government Licence - Ontario - Metrolinx.';

const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright';
const METROLINX_TERMS = 'https://www.gotransit.com/en/partner-with-us/software-developers';
const METROLINX_OGL =
  'https://assets.metrolinx.com/image/upload/v1663237565/Documents/Metrolinx/Open-Government-Licence-Ontario-Metrolinx.pdf';
const LTC_TERMS = 'https://www.londontransit.ca/open-data/ltcs-open-data-terms-of-use/';

/** Source properties are read-only presentation metadata, not ingestion evidence. */
export const SOURCES = Object.freeze({
  osm: Object.freeze({
    id: 'osm',
    name: 'OpenStreetMap',
    licence: 'Open Database License (ODbL) 1.0',
    sourceUrl: OSM_COPYRIGHT,
    licenceUrl: OSM_COPYRIGHT,
    reviewed: '2026-11-15',
    datasetAsOf: UNKNOWN,
    notes: Object.freeze({
      en: 'Map data from OpenStreetMap. ODbL applies to the data. Place the attribution beside each map that uses these data.',
      fr: 'Données cartographiques d’OpenStreetMap. La licence ODbL s’applique aux données. Affichez le crédit près de chaque carte utilisant ces données.',
    }),
    notices: Object.freeze({
      en: Object.freeze(['© OpenStreetMap contributors — ODbL 1.0']),
      fr: Object.freeze(['© OpenStreetMap contributors — ODbL 1.0']),
    }),
  }),
  metrolinx: Object.freeze({
    id: 'metrolinx',
    name: 'Metrolinx (GO Transit / UP Express)',
    licence: 'Metrolinx Access and Use Agreement; Open Government Licence – Ontario – Metrolinx',
    sourceUrl: METROLINX_TERMS,
    licenceUrl: METROLINX_OGL,
    reviewed: '2026-11-15',
    datasetAsOf: UNKNOWN,
    notes: Object.freeze({
      en: 'The section 3 GTFS legend and the Open Government Licence statement are distinct. Review the specific feed terms before release.',
      fr: 'La mention de la section 3 du GTFS et celle de la licence gouvernementale ouverte sont distinctes. Consultez les conditions du flux avant diffusion.',
    }),
    notices: Object.freeze({
      en: Object.freeze([METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE]),
      fr: Object.freeze([METROLINX_AUA_LEGEND, METROLINX_OGL_NOTICE]),
    }),
  }),
  ltc: Object.freeze({
    id: 'ltc',
    name: 'London Transit Commission (LTC)',
    licence: 'LTC Open Data Terms of Use',
    sourceUrl: 'https://www.londontransit.ca/open-data/',
    licenceUrl: LTC_TERMS,
    reviewed: '2026-11-15',
    datasetAsOf: UNKNOWN,
    notes: Object.freeze({
      en: 'Source acknowledgement is encouraged. Listing these terms does not imply endorsement.',
      fr: 'La mention de la source est encouragée. L’affichage des conditions ne suppose aucune approbation.',
    }),
    notices: Object.freeze({
      en: Object.freeze(['Data provided by the London Transit Commission (LTC) under its Open Data Terms of Use.']),
      fr: Object.freeze(['Données fournies par la London Transit Commission (LTC) selon ses conditions d’utilisation des données ouvertes.']),
    }),
  }),
});

export function normalizeLocale(input) {
  if (typeof input !== 'string') return 'en';
  return input.toLowerCase().split(/[-_]/u, 1)[0] === 'fr' ? 'fr' : 'en';
}

export function isSourceId(value) {
  return typeof value === 'string' && Object.hasOwn(SOURCES, value);
}

export function normalizeSources(raw) {
  if (!Array.isArray(raw)) return { selected: [], rejected: [] };
  const selected = [];
  const rejected = [];
  const seen = new Set();
  for (const item of raw) {
    if (typeof item !== 'string' || !isSourceId(item)) {
      rejected.push(String(item));
      continue;
    }
    if (!seen.has(item)) {
      seen.add(item);
      selected.push(item);
    }
  }
  return { selected, rejected };
}

export function parseSelection(search) {
  if (typeof search !== 'string' || search.length > MAX_QUERY_LENGTH) {
    return { locale: 'en', selected: [], rejected: ['invalid-query'], explicit: false };
  }
  const query = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  const locale = normalizeLocale(params.get('lang') ?? 'en');
  const explicit = params.has('sources');
  const raw = params.getAll('sources').flatMap((s) => s.split(','));
  const normalized = normalizeSources(raw.filter((value) => value.length > 0));
  return { locale, ...normalized, explicit };
}

export function serializeSelection(locale, selected) {
  const normalized = normalizeSources(selected);
  const params = new URLSearchParams();
  params.set('lang', normalizeLocale(locale));
  params.set('sources', normalized.selected.join(','));
  return `?${params.toString()}`;
}

export function toggleSource(current, target, checked) {
  const normalized = normalizeSources(current).selected;
  if (!isSourceId(target)) return normalized;
  if (checked) return normalized.includes(target) ? normalized : [...normalized, target];
  return normalized.filter((id) => id !== target);
}

export function presentation(locale, selected) {
  const lang = normalizeLocale(locale);
  const labels = MESSAGES[lang];
  const ids = normalizeSources(selected).selected;
  return {
    locale: lang,
    labels,
    sources: ids.map((id) => {
      const item = SOURCES[id];
      return {
        id,
        name: item.name,
        licence: item.licence,
        sourceUrl: item.sourceUrl,
        licenceUrl: item.licenceUrl,
        reviewed: item.reviewed,
        datasetAsOf: item.datasetAsOf,
        notices: [...item.notices[lang]],
        notes: item.notes[lang],
      };
    }),
  };
}

export function countLabel(locale, count) {
  const labels = MESSAGES[normalizeLocale(locale)];
  return `${count} ${count === 1 ? labels.sourceCountOne : labels.sourceCount}`;
}

export function safeExternalUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function exportText(locale, selected) {
  const page = presentation(locale, selected);
  const t = page.labels;
  const lines = [t.exportTitle, '', t.exportDate, '', t.disclaimer, '', t.noEndorsement];
  for (const source of page.sources) {
    lines.push('', `## ${source.name}`, `${t.licence}: ${source.licence}`,
      `${t.source}: ${source.sourceUrl}`, `${t.openLicence}: ${source.licenceUrl}`,
      `${t.reviewedOn}: ${source.reviewed}`, `${t.dataAsOf}: ${source.datasetAsOf}`,
      t.explanation, source.notes, t.notices, ...source.notices);
  }
  if (page.sources.length === 0) lines.push('', t.selectedNone);
  return `${lines.join('\n')}\n`;
}

export function exportFilename(locale) {
  return `sources-licences-${normalizeLocale(locale)}.txt`;
}

export function noNetworkRequired() {
  // The page does not fetch or embed live provider content.
  return true;
}
