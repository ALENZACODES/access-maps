import type { Locale, StepFreeAssessment } from "./types.js";

/**
 * French copy in this package is a draft for review. It is not a professional translation
 * and it is not a claim that the App is fully bilingual.
 */
export const FRENCH_REVIEW = "draft-unreviewed" as const;

const COPY = {
  en: {
    scheduled: "Scheduled",
    unknown: "UNKNOWN",
    straightLine: (distance: string) =>
      `Straight-line distance only: ${distance}. This is not a route distance.`,
    surface: (value: string) => `Surface: ${value}.`,
    gradient: (value: string) => `Gradient: ${value}.`,
    notAppVerified: "Open-data and operator flags are not checks by the App.",
    noEvidence: "No step-free evidence is recorded.",
    steps: "A step count above zero is recorded.",
    wheelchairNo: "A wheelchair=no value is recorded.",
    boardingNo: "The operator boarding field says this is not wheelchair accessible.",
    boardingNotPath: "The operator boarding flag is not a step-free path.",
    elevatorOut: "An elevator on this access is out of service, and no step-free alternate is recorded.",
    elevatorUnknown: "Elevator status is not recorded. A station flag is not a status check.",
    elevatorStale: "The elevator status is too old to treat as current. It is unknown, not working.",
    elevatorLastChecked: (when: string) => `Elevator status was last checked ${when}.`,
    snowBlocked: "A snow blockage is recorded on this access.",
    construction: "A construction closure is recorded on this access.",
    summerNotWinter: "A warmer-season record is not a winter check.",
    gradeOver: "The recorded gradient is above the maximum you set.",
    widthUnder: "The recorded width is below the width you set.",
    singleElevator: "This access depends on one elevator. That is a single point of failure even when the status is in service.",
    systemEvent:
      "Several elevators on this network are out of service together. Do not start a subway or rail trip from this plan.",
    noGo: "No route is free of a recorded barrier. The blocked options stay visible so the gap is not hidden.",
    washroomNone: "No washroom is recorded for this destination.",
    washroomUnverified: "A washroom record exists, and it is not usable from the fields that are present. Call ahead. The App is not recommending it.",
    washroomTransfer: "The recorded transfer side does not match the side you set.",
    parkingNone: "No parking is recorded for this destination.",
    emergency: "If you need emergency help, call 911. This plan does not give health guidance.",
    offlineBanner: (asOf: string) =>
      `Saved plan as of ${asOf}. Elevator and disruption status in this copy is not current.`,
    returnNoTrip: "No return trip is recorded. The return is not a confirmed trip.",
    paratransitLink: "This is operator information and a link. It is not a confirmed trip.",
    supply: "On-demand wheelchair-vehicle supply is not confirmed. It is not a fallback.",
    timingOver: "A leg is longer than the maximum time you set between washroom stops.",
    travelOver: "This option is longer than the maximum travel time you set.",
    durationUnknown: "Duration is unknown, so the plan cannot confirm it is inside the time you set.",
    cold: "Cold weather can reduce range. This plan does not estimate range.",
    noCharger: "No charging point is recorded on this option.",
    gradeUnknown: "Gradient is unknown, so the plan cannot confirm it is inside the maximum you set.",
    assistanceLate: (deadline: string, phone: string) =>
      `Assistance has to be requested by ${deadline}. Phone ${phone}. This option is not step-free without that request.`,
    windowClosed: (phone: string) =>
      `The booking window for this departure is already closed. Phone ${phone}. There is no guarantee.`,
    windowFuture: (from: string, phone: string) =>
      `Booking opens ${from}. Phone ${phone}. There is no guarantee.`,
    callNow: (phone: string) => `Call now at ${phone}. There is no guarantee of a trip.`,
    registrationGap: (name: string) =>
      `Registration with ${name} is not in the profile. A separate application can take days. This is not one system.`,
    handoffUnverified: "Transfer-point shelter, washroom, and step-free status are not recorded.",
    cardMissing: (card: string) => `This leg needs ${card}, which is not in the cards you listed.`,
    supportDiffers: "Support-person rules differ by operator. A free ride on one leg is not a free ride on the next.",
    appOnly: "This parking record is app-only, and the profile says there is no smartphone.",
    reservationCutoff: (when: string) => `The reservation cutoff in the record is ${when}.`,
    notVan: "The recorded bay is not marked van-accessible.",
    fareUnknown: "Fare and support-person rules are not in the data.",
    bookingUnknown: "Booking rules for this operator are not in the data.",
    activityUnknown: "Activity access is not inherited from the venue. It is unknown.",
    interiorUnknown: "Interior route measurements are not recorded.",
    homeUnknown: "Home exit, building elevator, and curb detail are not recorded.",
    weakest: (title: string, reason: string) => `The weakest link is ${title}: ${reason}`,
    whyDirect: "This option stays on footways and paths in the catalog.",
    whyTransit: "This option uses a scheduled transit trip plus separate access and approach legs.",
    whyPara: "This option is directory information for a paratransit operator.",
    whyIntercity: "This option is a scheduled intercity service with its assistance rule attached.",
    conflict: (feed: string, report: string) =>
      `Operator status at ${feed} and a user report at ${report} disagree. Use the operator phone.`,
    lastCheckedWord: "last checked",
    inService: "in service",
    outOfService: "out of service",
    statusUnknown: "status unknown",
    phoneUnknown: "Help phone: UNKNOWN.",
    alternateMissing: "No verified step-free alternate is recorded.",
  },
  fr: {
    scheduled: "Horaire",
    unknown: "INCONNU",
    straightLine: (distance: string) =>
      `Distance en ligne droite seulement : ${distance}. Ce n'est pas une distance de parcours.`,
    surface: (value: string) => `Surface : ${value}.`,
    gradient: (value: string) => `Pente : ${value}.`,
    notAppVerified: "Les données ouvertes et les indications de l'exploitant ne sont pas des vérifications par l'application.",
    noEvidence: "Aucune donnée sur l'absence de marches n'est enregistrée.",
    steps: "Un nombre de marches supérieur à zéro est enregistré.",
    wheelchairNo: "La valeur wheelchair=no est enregistrée.",
    boardingNo: "Le champ d'embarquement de l'exploitant indique un accès non accessible en fauteuil.",
    boardingNotPath: "L'indicateur d'embarquement n'est pas un chemin sans marches.",
    elevatorOut: "Un ascenseur de cet accès est hors service, et aucun autre chemin sans marches n'est enregistré.",
    elevatorUnknown: "L'état de l'ascenseur n'est pas enregistré. L'indicateur de la station ne remplace pas une vérification.",
    elevatorStale: "L'état de l'ascenseur est trop ancien pour être traité comme actuel. Il est inconnu, pas en service.",
    elevatorLastChecked: (when: string) => `État de l'ascenseur vérifié pour la dernière fois ${when}.`,
    snowBlocked: "Un blocage par la neige est enregistré sur cet accès.",
    construction: "Une fermeture pour travaux est enregistrée sur cet accès.",
    summerNotWinter: "Un relevé de saison chaude n'est pas une vérification d'hiver.",
    gradeOver: "La pente enregistrée dépasse le maximum que vous avez fixé.",
    widthUnder: "La largeur enregistrée est inférieure à la largeur que vous avez fixée.",
    singleElevator: "Cet accès dépend d'un seul ascenseur. C'est un point de défaillance unique, même si l'état est en service.",
    systemEvent:
      "Plusieurs ascenseurs de ce réseau sont hors service en même temps. Ne commencez pas un trajet de métro ou de train avec ce plan.",
    noGo: "Aucun parcours n'est libre d'un obstacle enregistré. Les options bloquées restent visibles pour ne pas cacher le manque.",
    washroomNone: "Aucune toilette n'est enregistrée pour cette destination.",
    washroomUnverified: "Une fiche de toilette existe, et les champs présents ne permettent pas de la recommander. Appelez avant. L'application ne la recommande pas.",
    washroomTransfer: "Le côté de transfert enregistré ne correspond pas au côté que vous avez fixé.",
    parkingNone: "Aucun stationnement n'est enregistré pour cette destination.",
    emergency: "En cas d'urgence, composez le 911. Ce plan ne donne pas de conseil de santé.",
    offlineBanner: (asOf: string) =>
      `Plan enregistré au ${asOf}. L'état des ascenseurs et des perturbations dans cette copie n'est pas actuel.`,
    returnNoTrip: "Aucun trajet de retour n'est enregistré. Le retour n'est pas un trajet confirmé.",
    paratransitLink: "Ceci est une information de l'exploitant et un lien. Ce n'est pas un trajet confirmé.",
    supply: "La disponibilité des véhicules accessibles à la demande n'est pas confirmée. Ce n'est pas une solution de rechange.",
    timingOver: "Un tronçon dépasse le temps maximum que vous avez fixé entre deux arrêts toilettes.",
    travelOver: "Cette option dépasse le temps de trajet maximum que vous avez fixé.",
    durationUnknown: "La durée est inconnue, donc le plan ne peut pas confirmer qu'elle reste dans le temps que vous avez fixé.",
    cold: "Le froid peut réduire l'autonomie. Ce plan n'estime pas l'autonomie.",
    noCharger: "Aucun point de charge n'est enregistré sur cette option.",
    gradeUnknown: "La pente est inconnue, donc le plan ne peut pas confirmer qu'elle reste sous le maximum que vous avez fixé.",
    assistanceLate: (deadline: string, phone: string) =>
      `L'assistance doit être demandée avant ${deadline}. Téléphone ${phone}. Cette option n'est pas sans marches sans cette demande.`,
    windowClosed: (phone: string) =>
      `La fenêtre de réservation pour ce départ est déjà fermée. Téléphone ${phone}. Il n'y a pas de garantie.`,
    windowFuture: (from: string, phone: string) =>
      `La réservation ouvre ${from}. Téléphone ${phone}. Il n'y a pas de garantie.`,
    callNow: (phone: string) => `Appelez maintenant au ${phone}. Le trajet n'est pas garanti.`,
    registrationGap: (name: string) =>
      `L'inscription à ${name} n'est pas dans le profil. Une demande séparée peut prendre des jours. Ce n'est pas un seul réseau.`,
    handoffUnverified: "L'abri, la toilette et l'accès sans marches du point de correspondance ne sont pas enregistrés.",
    cardMissing: (card: string) => `Ce tronçon exige ${card}, qui n'est pas dans les cartes que vous avez indiquées.`,
    supportDiffers: "Les règles d'accompagnateur changent selon l'exploitant. La gratuité sur un tronçon ne vaut pas pour le suivant.",
    appOnly: "Ce stationnement est indiqué comme payable seulement dans une application, et le profil indique l'absence de téléphone.",
    reservationCutoff: (when: string) => `L'heure limite de réservation enregistrée est ${when}.`,
    notVan: "La place enregistrée n'est pas indiquée comme accessible pour une fourgonnette.",
    fareUnknown: "Les règles de tarif et d'accompagnateur ne sont pas dans les données.",
    bookingUnknown: "Les règles de réservation de cet exploitant ne sont pas dans les données.",
    activityUnknown: "L'accès à l'activité n'est pas hérité du lieu. Il est inconnu.",
    interiorUnknown: "Les mesures du parcours intérieur ne sont pas enregistrées.",
    homeUnknown: "La sortie du domicile, l'ascenseur de l'immeuble et le détail du bateau ne sont pas enregistrés.",
    weakest: (title: string, reason: string) => `Le maillon le plus faible est ${title} : ${reason}`,
    whyDirect: "Cette option reste sur les chemins présents dans le catalogue.",
    whyTransit: "Cette option utilise un trajet de transport à l'horaire, plus des accès et une approche séparés.",
    whyPara: "Cette option est une information d'annuaire pour un exploitant de transport adapté.",
    whyIntercity: "Cette option est un service interurbain à l'horaire, avec sa règle d'assistance.",
    conflict: (feed: string, report: string) =>
      `L'état de l'exploitant à ${feed} et un signalement à ${report} ne concordent pas. Utilisez le téléphone de l'exploitant.`,
    lastCheckedWord: "dernière vérification",
    inService: "en service",
    outOfService: "hors service",
    statusUnknown: "état inconnu",
    phoneUnknown: "Téléphone d'aide : INCONNU.",
    alternateMissing: "Aucun autre chemin sans marches vérifié n'est enregistré.",
  },
} as const;

export type Copy = (typeof COPY)["en"];

export function copy(locale: Locale): Copy {
  return COPY[locale] as Copy;
}

export function statusSentence(locale: Locale, assessment: StepFreeAssessment): string {
  const text = copy(locale);
  const reason = assessment.reasons[0] ?? "no-evidence";
  const table: Record<string, string> = {
    "no-evidence": text.noEvidence,
    "steps-zero-only": text.noEvidence,
    "boarding-flag-is-not-a-path": text.boardingNotPath,
    stairs: text.steps,
    "wheelchair-no": text.wheelchairNo,
    "boarding-not-accessible": text.boardingNo,
    "ramp-no": text.noEvidence,
    "summer-not-winter": text.summerNotWinter,
    surveyed: text.notAppVerified,
    "operator-claim": text.notAppVerified,
    "open-data-claim": text.notAppVerified,
    "elevator-out": text.elevatorOut,
    "elevator-unknown": text.elevatorUnknown,
    "elevator-stale": text.elevatorStale,
    "snow-blocked": text.snowBlocked,
    construction: text.construction,
    "grade-over-limit": text.gradeOver,
    "width-under-chair": text.widthUnder,
    blocked: text.construction,
  };
  return table[reason] ?? text.noEvidence;
}
