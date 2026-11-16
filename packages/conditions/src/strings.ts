import type { ConditionType } from "./types";

export type Language = "en" | "fr";

interface Strings {
  heading: string;
  filter: string;
  all: string;
  unknown: string;
  needsCheck: string;
  lastFetched: string;
  lastChecked: string;
  source: string;
  licence: string;
  tier: string;
  empty: string;
  drafts: string;
  verify: string;
  export: string;
  noVerified: string;
  exported: string;
  types: Record<ConditionType, string>;
}

export const strings: Record<Language, Strings> = {
  en: {
    heading: "Road and winter conditions",
    filter: "Filter conditions",
    all: "All types",
    unknown: "Unknown",
    needsCheck: "Needs check \u2014 not a current condition",
    lastFetched: "Last fetched",
    lastChecked: "Last checked",
    source: "Source",
    licence: "Licence",
    tier: "Evidence tier",
    empty: "No conditions in this local list",
    drafts: "Unverified drafts",
    verify: "I checked this draft and approve exporting it",
    export: "Export verified obstacle drafts (JSON)",
    noVerified: "Select at least one verified draft to export.",
    exported: "JSON file prepared for saving",
    types: {
      snowbank: "Snowbank",
      ice: "Ice",
      construction: "Construction",
      road_restriction: "Road restriction",
      curb_blocked: "Blocked curb",
      other: "Other",
    },
  },
  fr: {
    heading: "\u00C9tat des routes et conditions hivernales",
    filter: "Filtrer les conditions",
    all: "Tous les types",
    unknown: "Inconnu",
    needsCheck: "\u00c0 v\u00e9rifier \u2014 condition non actuelle",
    lastFetched: "Derni\u00e8re r\u00e9cup\u00e9ration",
    lastChecked: "Derni\u00e8re v\u00e9rification",
    source: "Source",
    licence: "Licence",
    tier: "Niveau de preuve",
    empty: "Aucune condition dans cette liste locale",
    drafts: "Brouillons non v\u00e9rifi\u00e9s",
    verify: "J’ai v\u00e9rifi\u00e9 ce brouillon et j’autorise son exportation",
    export: "Exporter les brouillons v\u00e9rifi\u00e9s (JSON)",
    noVerified: "S\u00e9lectionnez au moins un brouillon v\u00e9rifi\u00e9.",
    exported: "Fichier JSON pr\u00e9par\u00e9 pour enregistrement",
    types: {
      snowbank: "Banc de neige",
      ice: "Glace",
      construction: "Travaux",
      road_restriction: "Restriction routi\u00e8re",
      curb_blocked: "Bordure bloqu\u00e9e",
      other: "Autre",
    },
  },
};
