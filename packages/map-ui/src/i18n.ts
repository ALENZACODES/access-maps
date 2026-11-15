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
    mapControls: "Map controls",
    colon: ":",
    attribution: "Attribution",
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
    outageHeading: "Elevator and escalator outages",
    station: "Station",
    equipment: "Equipment",
    statusWord: "Status",
    reported: "Reported",
    expires: "Expires",
    noEndTime: "No end time was published. It stops showing 30 days after the report.",
    notCounted: "Listed by the operator and not counted as current",
    operatorText: "Operator text",
    tierFour: "Tier 4: operator status feed, not checked by the App.",
    outageOnLeg: "Outage on this leg",
    originalRoute: "Route with the outage",
    alternativesHeading: "Options that avoid the outage",
    alternative: "Option",
    profileChecks: "Checks against your profile",
    noProfileFlags: "No profile setting flags this option.",
    routeChoice: "Route shown in the feature list and map",
    shown: "shown",
    noAffected: "No route in this plan passes a reported elevator outage.",
    attributionTtc:
      "Stop names and positions: TTC GTFS data. Outage text: TTC GTFS-Realtime accessibility alerts. Contains information licensed under the Open Government Licence – Toronto. No endorsement by the TTC or the City of Toronto is implied.",
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
    mapControls: "Commandes de la carte",
    colon: " :",
    attribution: "Attribution",
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
    outageHeading: "Pannes d'ascenseurs et d'escaliers mécaniques",
    station: "Station",
    equipment: "Équipement",
    statusWord: "État",
    reported: "Signalé",
    expires: "Fin",
    noEndTime: "Aucune heure de fin n'a été publiée. L'avis n'est plus affiché 30 jours après le signalement.",
    notCounted: "Indiqué par l'exploitant et non compté comme en vigueur",
    operatorText: "Texte de l'exploitant",
    tierFour: "Niveau 4 : flux d'état de l'exploitant, non vérifié par l'application.",
    outageOnLeg: "Panne sur ce tronçon",
    originalRoute: "Parcours touché par la panne",
    alternativesHeading: "Options qui évitent la panne",
    alternative: "Option",
    profileChecks: "Vérifications selon votre profil",
    noProfileFlags: "Aucun réglage du profil ne signale cette option.",
    routeChoice: "Parcours affiché dans la liste et sur la carte",
    shown: "affiché",
    noAffected: "Aucun parcours de ce plan ne passe par une panne d'ascenseur signalée.",
    attributionTtc:
      "Noms et positions des arrêts : données GTFS de la TTC. Texte des pannes : alertes d'accessibilité GTFS-Realtime de la TTC. Contient des informations visées par la Licence du gouvernement ouvert – Toronto. Aucune approbation de la TTC ou de la Ville de Toronto n'est sous-entendue.",
  },
} as const;

export function mapCopyLocaleKeys(): { en: string[]; fr: string[] } {
  return { en: Object.keys(COPY.en), fr: Object.keys(COPY.fr) };
}

export type MapCopy = { [K in keyof (typeof COPY)["en"]]: string };

export function mapCopy(locale: MapLocale): MapCopy {
  return COPY[locale];
}

/** The status word without its symbol. Used where the text is read aloud. */
export function statusText(locale: MapLocale, code: string): string {
  const text = mapCopy(locale);
  if (code === "step-free") return text.stepFree;
  if (code === "not-step-free") return text.notStepFree;
  if (code === "info") return text.info;
  return text.unknown;
}

export function statusLabel(locale: MapLocale, code: string): string {
  const text = mapCopy(locale);
  if (code === "step-free") return `■ ${text.stepFree}`;
  if (code === "not-step-free") return `▲ ${text.notStepFree}`;
  if (code === "info") return `● ${text.info}`;
  return `? ${text.unknown}`;
}
