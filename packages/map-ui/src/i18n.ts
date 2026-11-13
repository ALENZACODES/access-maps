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
    zoomedIn: "Zoomed in",
    zoomedOut: "Zoomed out",
    panUp: "Pan up",
    panDown: "Pan down",
    panLeft: "Pan left",
    panRight: "Pan right",
    showOnMap: "Show on map",
    listLabel: "Map features",
    empty: "No features to list.",
    mapUnavailable: "The map canvas did not start. Use the feature list.",
    source: "Source",
    licence: "Licence",
    retrieved: "Retrieved",
    tier: "Tier",
    surface: "Surface",
    gradient: "Gradient",
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
    attributionPlain:
      "Map canvas by MapLibre GL (BSD-3-Clause). This demo uses a plain background, not a tile service. No agency, municipality, or project endorsement is implied.",
    attributionOsm:
      "© OpenStreetMap contributors. Catalogue path geometry is OpenStreetMap data under the Open Database Licence. Map canvas by MapLibre GL (BSD-3-Clause). No agency, municipality, or project endorsement is implied.",
  },
  fr: {
    mapHeading: "Carte et liste des éléments",
    instructions:
      "La liste montre chaque élément de la carte. Utilisez Tab pour l'atteindre, puis les flèches pour vous déplacer. La carte est facultative.",
    skip: "Passer la carte et aller à la liste des éléments",
    zoomIn: "Zoom avant",
    zoomOut: "Zoom arrière",
    zoomedIn: "Zoom avant effectué",
    zoomedOut: "Zoom arrière effectué",
    panUp: "Déplacer vers le haut",
    panDown: "Déplacer vers le bas",
    panLeft: "Déplacer vers la gauche",
    panRight: "Déplacer vers la droite",
    showOnMap: "Montrer sur la carte",
    listLabel: "Éléments de la carte",
    empty: "Aucun élément à lister.",
    mapUnavailable: "La carte ne s'est pas affichée. Utilisez la liste.",
    source: "Source",
    licence: "Licence",
    retrieved: "Récupéré",
    tier: "Niveau",
    surface: "Surface",
    gradient: "Pente",
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
    attributionPlain:
      "Canevas de carte par MapLibre GL (BSD-3-Clause). Cette démo utilise un fond uni, pas un service de tuiles. Aucune approbation d'un organisme, d'une municipalité ou d'un projet n'est sous-entendue.",
    attributionOsm:
      "© OpenStreetMap contributors. La géométrie des chemins du catalogue est une donnée OpenStreetMap sous l'Open Database Licence. Canevas par MapLibre GL (BSD-3-Clause). Aucune approbation n'est sous-entendue.",
  },
} as const;

export function mapCopyLocaleKeys(): { en: string[]; fr: string[] } {
  return { en: Object.keys(COPY.en), fr: Object.keys(COPY.fr) };
}

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
