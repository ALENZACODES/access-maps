import type { Equipment, Locale, OutageRecord, OutageState } from "./types.js";

/** French copy is a draft for review, the same status as the journey package copy. */
export const OUTAGE_FRENCH_REVIEW = "draft-unreviewed" as const;

const TIME_ZONE = "America/Toronto";

export function formatTime(iso: string, locale: Locale): string {
  const value = Date.parse(iso);
  if (Number.isNaN(value)) return locale === "fr" ? "INCONNU" : "UNKNOWN";
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
    timeZone: TIME_ZONE,
  }).format(new Date(value));
}

const COPY = {
  en: {
    equipment: {
      elevator: "Elevator",
      escalator: "Escalator",
      elevator_and_escalator: "Elevator and escalator",
      UNKNOWN: "Equipment not named by the operator",
    } as Record<Equipment, string>,
    statusOut: "Out of service",
    statusUnknown: "Status not stated by the operator",
    stationUnknownName: "Station name not given",
    assetUnnamed: "No asset name given",
    states: {
      current: "Current",
      planned: "Planned, not yet in effect",
      expired: "Past its end time, not current",
      stale: "Older than 30 days, not current",
    } as Record<OutageState, string>,
    outageReported: "The operator lists an outage at this station.",
    noOutage: (source: string, asOf: string) =>
      `No outage reported by ${source} as of ${asOf}. This is not a check that the elevator works.`,
    stationUnknown: "Outage status for this station is unknown. The outage source does not cover it.",
    reported: (time: string) => `Reported ${time}.`,
    expires: (time: string) => `Expires ${time}.`,
    noEnd: "The operator gave no end time. It stops showing 30 days after the report.",
    source: (id: string, licence: string) =>
      `Source: ${id}. Licence: ${licence}. Tier 4: operator status feed, not checked by the App.`,
    demonstration: "Demonstration data: a dated operator snapshot. It is not current status.",
    lastKnown: (asOf: string) =>
      `The outage feed could not be read. Showing the last known status from ${asOf}. It may be out of date.`,
    manualSeed: (asOf: string) =>
      `The outage feed could not be read. Showing the dated outage seed from ${asOf}. It may be out of date.`,
    feedRead: (asOf: string) => `Outage status from the operator feed as of ${asOf}.`,
    lastChecked: (asOf: string) => `Last checked ${asOf}. This copy is not current status.`,
    escalatorInfo: "An escalator is not a step-free route. This does not change the step-free status.",
    legOutage: (equipment: string, asset: string, status: string, station: string) =>
      `${equipment} ${asset} at ${station}: ${status}.`,
    avoids: (stations: string) => `This option avoids ${stations}.`,
    noAlternative: (stations: string) =>
      `No option in the data avoids ${stations}. The original route stays listed with the outage.`,
    flag: (setting: string, reason: string) => `${setting}: ${reason}`,
    settings: {
      maxGradePercent: "Maximum gradient",
      widthMm: "Chair width",
      maxTravelMinutes: "Maximum travel time",
      maxDistanceMetres: "Maximum distance",
      maxMinutesBetweenWashrooms: "Time between washroom stops",
      cardsHeld: "Cards held",
      hasSmartphone: "Smartphone",
      registrations: "Paratransit registrations",
      chair: "Chair type",
    } as Record<string, string>,
    operatorText: "Operator text",
  },
  fr: {
    equipment: {
      elevator: "Ascenseur",
      escalator: "Escalier mécanique",
      elevator_and_escalator: "Ascenseur et escalier mécanique",
      UNKNOWN: "Équipement non nommé par l'exploitant",
    } as Record<Equipment, string>,
    statusOut: "Hors service",
    statusUnknown: "État non indiqué par l'exploitant",
    stationUnknownName: "Nom de station non indiqué",
    assetUnnamed: "Aucun nom d'appareil indiqué",
    states: {
      current: "En vigueur",
      planned: "Prévu, pas encore en vigueur",
      expired: "Après l'heure de fin, pas en vigueur",
      stale: "Plus de 30 jours, pas en vigueur",
    } as Record<OutageState, string>,
    outageReported: "L'exploitant indique une panne à cette station.",
    noOutage: (source: string, asOf: string) =>
      `Aucune panne signalée par ${source} au ${asOf}. Ce n'est pas une vérification que l'ascenseur fonctionne.`,
    stationUnknown: "L'état des pannes pour cette station est inconnu. La source ne couvre pas cette station.",
    reported: (time: string) => `Signalé ${time}.`,
    expires: (time: string) => `Prend fin ${time}.`,
    noEnd: "L'exploitant n'a pas donné d'heure de fin. L'avis n'est plus affiché 30 jours après le signalement.",
    source: (id: string, licence: string) =>
      `Source : ${id}. Licence : ${licence}. Niveau 4 : flux d'état de l'exploitant, non vérifié par l'application.`,
    demonstration: "Données de démonstration : un instantané daté de l'exploitant. Ce n'est pas l'état actuel.",
    lastKnown: (asOf: string) =>
      `Le flux des pannes n'a pas pu être lu. Dernier état connu au ${asOf}. Il peut être périmé.`,
    manualSeed: (asOf: string) =>
      `Le flux des pannes n'a pas pu être lu. Instantané daté des pannes au ${asOf}. Il peut être périmé.`,
    feedRead: (asOf: string) => `État des pannes selon le flux de l'exploitant au ${asOf}.`,
    lastChecked: (asOf: string) => `Dernière vérification ${asOf}. Cette copie n'est pas l'état actuel.`,
    escalatorInfo: "Un escalier mécanique n'est pas un parcours sans marches. Cela ne change pas l'état sans marches.",
    legOutage: (equipment: string, asset: string, status: string, station: string) =>
      `${equipment} ${asset} à ${station} : ${status}.`,
    avoids: (stations: string) => `Cette option évite ${stations}.`,
    noAlternative: (stations: string) =>
      `Aucune option dans les données n'évite ${stations}. Le parcours d'origine reste affiché avec la panne.`,
    flag: (setting: string, reason: string) => `${setting} : ${reason}`,
    settings: {
      maxGradePercent: "Pente maximale",
      widthMm: "Largeur du fauteuil",
      maxTravelMinutes: "Temps de trajet maximal",
      maxDistanceMetres: "Distance maximale",
      maxMinutesBetweenWashrooms: "Temps entre deux arrêts toilettes",
      cardsHeld: "Cartes détenues",
      hasSmartphone: "Téléphone intelligent",
      registrations: "Inscriptions au transport adapté",
      chair: "Type de fauteuil",
    } as Record<string, string>,
    operatorText: "Texte de l'exploitant",
  },
};

export type OutageCopy = (typeof COPY)["en"];

export function outageCopy(locale: Locale): OutageCopy {
  return COPY[locale] as OutageCopy;
}

export function outageCopyKeys(): { en: string[]; fr: string[] } {
  return { en: Object.keys(COPY.en).sort(), fr: Object.keys(COPY.fr).sort() };
}

/** One line for a record: equipment, asset, status, station. */
export function describeOutage(record: OutageRecord, locale: Locale): string {
  const text = outageCopy(locale);
  return text.legOutage(
    text.equipment[record.equipment],
    record.assetLabel ?? `(${text.assetUnnamed})`,
    record.status === "out_of_service" ? text.statusOut : text.statusUnknown,
    record.stationName === "UNKNOWN" ? text.stationUnknownName : record.stationName,
  );
}
