/** Attribution-page content; importing this module performs no I/O. */
export type Locale = "en" | "fr";
export type ProviderId = "osm" | "metrolinx" | "ltc";
export type KnowledgeDate = `${number}-${number}-${number}` | "UNKNOWN";

export interface AttributionEntry {
  readonly id: ProviderId;
  readonly title: string;
  readonly licence: string;
  readonly licenceUrl: string;
  readonly sourceUrl: string;
  readonly termsReviewedOn: KnowledgeDate;
  readonly datasetAsOf: KnowledgeDate;
  readonly notices: readonly string[];
  readonly explanation: string;
}

export interface AttributionPage {
  readonly heading: string;
  readonly unknownLabel: string;
  readonly entries: readonly AttributionEntry[];
}

/** The English notice is intentionally verbatim in both languages. */
export const METROLINX_AUA_SECTION_3_LEGEND =
  "Data used in this product or service is provided with the permission of Metrolinx. " +
  "Metrolinx makes no representations or warranties of any kind, express or implied, " +
  "with respect to the Data and assumes no responsibility for the accuracy or currency " +
  "of the data used in this product or service.";

/** Exact fallback line from the Metrolinx Open Government Licence. */
export const METROLINX_OGL_LINE =
  "Contains information licensed under the Open Government Licence - Ontario - Metrolinx.";

/** End-user applicable-laws lines from the Metrolinx Access and Use Agreement. */
export const METROLINX_AUA_END_USER_LAWS_EN =
  "You must follow all applicable laws when using the transit data.";
export const METROLINX_AUA_END_USER_LAWS_FR =
  "Vous devez respecter toutes les lois applicables lorsque vous utilisez les données de transport en commun.";

export const OSM_ATTRIBUTION_LINE = "© OpenStreetMap contributors";

const OSM_URL = "https://www.openstreetmap.org/copyright";
const METROLINX_AUA_URL =
  "https://www.gotransit.com/en/partner-with-us/software-developers";
const METROLINX_OGL_URL =
  "https://assets.metrolinx.com/image/upload/v1663237565/Documents/Metrolinx/Open-Government-Licence-Ontario-Metrolinx.pdf";
const LTC_URL = "https://www.londontransit.ca/open-data/ltcs-open-data-terms-of-use/";

/**
 * Only show sources actually used by a page. In particular, this catalogue
 * does not establish which licence governs any particular downloaded feed.
 * Record the feed URL and acquisition date separately at ingestion.
 */
export function buildAttributionPage(
  locale: Locale,
  usedSources: readonly ProviderId[],
): AttributionPage {
  const french = locale === "fr";
  const entries: Record<ProviderId, AttributionEntry> = {
    osm: {
      id: "osm",
      title: "OpenStreetMap",
      licence: "Open Database License (ODbL) 1.0",
      licenceUrl: OSM_URL,
      sourceUrl: OSM_URL,
      termsReviewedOn: "2026-11-15",
      datasetAsOf: "UNKNOWN",
      notices: [OSM_ATTRIBUTION_LINE, "Open Database License (ODbL) 1.0"],
      explanation: french
        ? "Données cartographiques d’OpenStreetMap. La licence ODbL s’applique aux données. Afficher aussi le crédit près de chaque carte qui utilise ces données."
        : "Map data from OpenStreetMap. Its data is under the ODbL. Also display attribution beside each map using this data.",
    },
    metrolinx: {
      id: "metrolinx",
      title: "Metrolinx (GO Transit / UP Express)",
      licence: "Metrolinx Access and Use Agreement; Open Government Licence – Ontario – Metrolinx",
      licenceUrl: METROLINX_OGL_URL,
      sourceUrl: METROLINX_AUA_URL,
      termsReviewedOn: "2026-11-15",
      datasetAsOf: "UNKNOWN",
      notices: [
        METROLINX_AUA_SECTION_3_LEGEND,
        METROLINX_OGL_LINE,
        METROLINX_AUA_END_USER_LAWS_EN,
        METROLINX_AUA_END_USER_LAWS_FR,
      ],
      explanation: french
        ? "La section 3 de l’accord d’utilisation du GTFS exige la mention anglaise exacte et bien visible. La ligne de la licence gouvernementale ouverte est distincte. Consulter les conditions du flux utilisé avant sa publication."
        : "GTFS Access and Use Agreement section 3 requires the exact prominent English legend. The Open Government Licence line is separate. Check the terms for the particular feed before publishing.",
    },
    ltc: {
      id: "ltc",
      title: "London Transit Commission (LTC)",
      licence: "LTC Open Data Terms of Use",
      licenceUrl: LTC_URL,
      sourceUrl: "https://www.londontransit.ca/open-data/",
      termsReviewedOn: "2026-11-15",
      datasetAsOf: "UNKNOWN",
      notices: [french
        ? "Données fournies par la London Transit Commission (LTC) selon ses conditions d’utilisation des données ouvertes."
        : "Data provided by the London Transit Commission (LTC) under its Open Data Terms of Use."],
      explanation: french
        ? "La mention de la source est facultative, mais encouragée. Aucune approbation de LTC n’est sous-entendue."
        : "Source acknowledgement is optional but encouraged. No endorsement by LTC is implied.",
    },
  };

  const seen = new Set<ProviderId>();
  const selected: AttributionEntry[] = [];
  for (const id of usedSources) {
    if (!Object.prototype.hasOwnProperty.call(entries, id)) {
      throw new Error(`Unknown attribution provider: ${String(id)}`);
    }
    if (!seen.has(id)) {
      seen.add(id);
      selected.push(entries[id]);
    }
  }

  return {
    heading: french ? "Sources et licences" : "Sources and licences",
    unknownLabel: french ? "INCONNU (UNKNOWN)" : "UNKNOWN",
    entries: selected,
  };
}
