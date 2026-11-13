export type MapLocale = "en" | "fr";

/**
 * French strings are a draft for review, not a professional translation.
 */
export const MAP_FRENCH_REVIEW = "draft-unreviewed" as const;

const COPY = {
  en: {
    mapHeading: "Map and feature list",
    instructions:
      "The list shows every feature on the map. Use Tab to reach it, then the arrow keys to move. The map canvas is optional.",
    skip: "Skip the map canvas and go to the feature list",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    listLabel: "Map features",
    empty: "No features to list.",
    mapUnavailable: "The map canvas did not start. Use the feature list.",
    source: "Source",
    tier: "Tier",
    selected: "Selected",
    resultsHeading: "Journey results",
    blockedHeading: "Blocked options",
    returnHeading: "Return",
    warningsHeading: "Before you go",
    stepFree: "Step-free",
    unknown: "Unknown",
    notStepFree: "Not step-free",
    info: "Information",
    emergency: "Emergency",
    entrance: "Entrance",
    washroom: "Washroom",
    parking: "Parking",
  },
  fr: {
    mapHeading: "Carte et liste des éléments",
    instructions:
      "La liste montre chaque élément de la carte. Utilisez Tab pour l'atteindre, puis les flèches pour vous déplacer. La carte est facultative.",
    skip: "Passer la carte et aller à la liste des éléments",
    zoomIn: "Zoom avant",
    zoomOut: "Zoom arrière",
    listLabel: "Éléments de la carte",
    empty: "Aucun élément à lister.",
    mapUnavailable: "La carte ne s'est pas affichée. Utilisez la liste.",
    source: "Source",
    tier: "Niveau",
    selected: "Sélectionné",
    resultsHeading: "Résultats du trajet",
    blockedHeading: "Options bloquées",
    returnHeading: "Retour",
    warningsHeading: "Avant de partir",
    stepFree: "Sans marches",
    unknown: "Inconnu",
    notStepFree: "Avec marches ou obstacle",
    info: "Information",
    emergency: "Urgence",
    entrance: "Entrée",
    washroom: "Toilettes",
    parking: "Stationnement",
  },
} as const;

export type MapCopy = { [K in keyof (typeof COPY)["en"]]: string };

export function mapCopy(locale: MapLocale): MapCopy {
  return COPY[locale];
}

export function statusLabel(locale: MapLocale, code: string): string {
  const text = mapCopy(locale);
  if (code === "step-free") return `■ ${text.stepFree}`;
  if (code === "not-step-free") return `▲ ${text.notStepFree}`;
  if (code === "info") return `● ${text.info}`;
  return `? ${text.unknown}`;
}
