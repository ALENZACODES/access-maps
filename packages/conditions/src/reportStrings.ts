import type { Language } from "./strings";
import type {
  GroupState,
  ReportIssueCode,
  ReportKind,
  ReportObservation,
  ReportPart,
  ReporterRole,
  ReportTier,
  ReportWarningCode,
} from "./reportTypes";

export interface ReportStrings {
  heading: string;
  intro: string;
  empty: string;
  unknown: string;
  sample: string;
  kinds: Record<ReportKind, string>;
  states: Record<GroupState, string>;
  tiers: Record<ReportTier, string>;
  parts: Record<ReportPart, string>;
  observations: Record<ReportObservation, string>;
  roles: Record<ReporterRole, string>;
  observed: string;
  lastObserved: string;
  expires: string;
  expired: string;
  confidence: string;
  confidenceNote: string;
  reporters: string;
  source: string;
  licence: string;
  tier: string;
  photo: string;
  photoAttached: string;
  photoNone: string;
  individual: string;
  formHeading: string;
  formIntro: string;
  location: string;
  kindLabel: string;
  observationLegend: string;
  observedLabel: string;
  observedHelp: string;
  roleLabel: string;
  noteLabel: string;
  noteHelp: string;
  submit: string;
  saved: string;
  errorSummary: string;
  errors: Record<ReportIssueCode, string>;
  warnings: Record<ReportWarningCode, string>;
}

export const reportStrings: Record<Language, ReportStrings> = {
  en: {
    heading: "Route reports from people",
    intro:
      "These are observations people recorded. They are not inspections, and a place with no report has not been checked.",
    empty: "No route reports in this local list. That does not mean the way is clear.",
    unknown: "Unknown",
    sample: "Sample data — not a real observation",
    kinds: {
      snowbank: "Snowbank",
      curb_cut_blocked: "Blocked curb cut",
      ice: "Ice",
      surface: "Surface problem",
      gradient: "Steep or tilted section",
      obstruction: "Obstruction",
      other: "Other",
    },
    states: {
      active: "Reported",
      disputed: "Reports disagree",
      reported_cleared: "Reported as cleared — not confirmed clear",
      expired: "Expired — not a current condition",
      needs_check: "Needs check — report time is not usable",
    },
    tiers: {
      0: "Tier 0 — unconfirmed report",
      2: "Tier 2 — reported independently by more than one person; not surveyed",
    },
    parts: {
      supporting: "Counted",
      clearing: "Says it was cleared",
      superseded: "Replaced by a later report",
      expired: "Expired",
      needs_check: "Needs check",
    },
    observations: {
      present: "It is there",
      cleared: "It is gone",
    },
    roles: {
      wheelchair_user: "Wheelchair user",
      mobility_aid_user: "Uses another mobility aid",
      companion: "Travelling with someone",
      passerby: "Passing by",
      site_staff: "Works at this place",
      UNKNOWN: "Prefer not to say",
    },
    observed: "Observed",
    lastObserved: "Last observed",
    expires: "Expires",
    expired: "Expired",
    confidence: "Freshness weight",
    confidenceNote: "A weight that falls with age. Not a probability.",
    reporters: "Independent reporters counted",
    source: "Source",
    licence: "Licence",
    tier: "Evidence tier",
    photo: "Photo",
    photoAttached: "Photo attached on this device",
    photoNone: "No photo",
    individual: "Individual reports",
    formHeading: "Report a route condition",
    formIntro:
      "Your report is saved on this device as an unconfirmed observation. Nothing is sent.",
    location: "Place",
    kindLabel: "What did you see?",
    observationLegend: "Is it there now?",
    observedLabel: "When did you see it?",
    observedHelp: "Give the time you saw it, not the time you are writing this.",
    roleLabel: "How were you travelling? (optional)",
    noteLabel: "Note (optional)",
    noteHelp: "Up to 500 characters. Do not include personal details.",
    submit: "Save report on this device",
    saved: "Report saved on this device.",
    errorSummary: "The report was not saved. Check these fields:",
    errors: {
      not_an_object: "The report could not be read.",
      missing: "This field is required.",
      invalid: "This value is not valid.",
      unknown_kind: "Choose what you saw from the list.",
      unknown_observation: "Choose whether it is there or gone.",
      unknown_role: "Choose an option from the list.",
      invalid_time: "Enter the date and time you saw it.",
      saved_before_observed: "The time you saw it cannot be in the future.",
      invalid_location: "A place is required.",
      tier_must_be_zero: "A new report must be unconfirmed.",
      note_too_long: "The note must be 500 characters or fewer.",
      invalid_photo: "The photo details could not be read.",
    },
    warnings: {
      photo_time_differs:
        "The photo time differs from the time you gave. Your stated time is kept.",
    },
  },
  fr: {
    heading: "Signalements d’itinéraire par des personnes",
    intro:
      "Ce sont des observations consignées par des personnes. Ce ne sont pas des inspections, et un lieu sans signalement n’a pas été vérifié.",
    empty:
      "Aucun signalement dans cette liste locale. Cela ne veut pas dire que le passage est dégagé.",
    unknown: "Inconnu",
    sample: "Données d’exemple — pas une observation réelle",
    kinds: {
      snowbank: "Banc de neige",
      curb_cut_blocked: "Bateau de trottoir bloqué",
      ice: "Glace",
      surface: "Problème de surface",
      gradient: "Section raide ou inclinée",
      obstruction: "Obstacle",
      other: "Autre",
    },
    states: {
      active: "Signalé",
      disputed: "Les signalements se contredisent",
      reported_cleared: "Signalé comme dégagé — dégagement non confirmé",
      expired: "Expiré — condition non actuelle",
      needs_check: "À vérifier — heure du signalement inutilisable",
    },
    tiers: {
      0: "Niveau 0 — signalement non confirmé",
      2: "Niveau 2 — signalé indépendamment par plus d’une personne; sans relevé sur place",
    },
    parts: {
      supporting: "Compté",
      clearing: "Indique que c’est dégagé",
      superseded: "Remplacé par un signalement plus récent",
      expired: "Expiré",
      needs_check: "À vérifier",
    },
    observations: {
      present: "C’est là",
      cleared: "Ce n’est plus là",
    },
    roles: {
      wheelchair_user: "Personne en fauteuil roulant",
      mobility_aid_user: "Utilise une autre aide à la mobilité",
      companion: "Accompagne quelqu’un",
      passerby: "De passage",
      site_staff: "Travaille à cet endroit",
      UNKNOWN: "Préfère ne pas répondre",
    },
    observed: "Observé",
    lastObserved: "Dernière observation",
    expires: "Expire",
    expired: "Expiré",
    confidence: "Poids de fraîcheur",
    confidenceNote: "Un poids qui diminue avec le temps. Ce n’est pas une probabilité.",
    reporters: "Personnes indépendantes comptées",
    source: "Source",
    licence: "Licence",
    tier: "Niveau de preuve",
    photo: "Photo",
    photoAttached: "Photo jointe sur cet appareil",
    photoNone: "Aucune photo",
    individual: "Signalements individuels",
    formHeading: "Signaler une condition d’itinéraire",
    formIntro:
      "Votre signalement est enregistré sur cet appareil comme observation non confirmée. Rien n’est envoyé.",
    location: "Lieu",
    kindLabel: "Qu’avez-vous vu?",
    observationLegend: "Est-ce là maintenant?",
    observedLabel: "Quand l’avez-vous vu?",
    observedHelp:
      "Indiquez l’heure à laquelle vous l’avez vu, pas l’heure à laquelle vous écrivez.",
    roleLabel: "Comment vous déplaciez-vous? (facultatif)",
    noteLabel: "Note (facultatif)",
    noteHelp: "Jusqu’à 500 caractères. N’indiquez aucun renseignement personnel.",
    submit: "Enregistrer le signalement sur cet appareil",
    saved: "Signalement enregistré sur cet appareil.",
    errorSummary: "Le signalement n’a pas été enregistré. Vérifiez ces champs :",
    errors: {
      not_an_object: "Le signalement n’a pas pu être lu.",
      missing: "Ce champ est obligatoire.",
      invalid: "Cette valeur n’est pas valide.",
      unknown_kind: "Choisissez dans la liste ce que vous avez vu.",
      unknown_observation: "Indiquez si c’est là ou non.",
      unknown_role: "Choisissez une option dans la liste.",
      invalid_time: "Entrez la date et l’heure de votre observation.",
      saved_before_observed: "L’heure de votre observation ne peut pas être dans le futur.",
      invalid_location: "Un lieu est requis.",
      tier_must_be_zero: "Un nouveau signalement doit être non confirmé.",
      note_too_long: "La note doit compter 500 caractères ou moins.",
      invalid_photo: "Les détails de la photo n’ont pas pu être lus.",
    },
    warnings: {
      photo_time_differs:
        "L’heure de la photo diffère de l’heure indiquée. L’heure que vous avez indiquée est conservée.",
    },
  },
};
