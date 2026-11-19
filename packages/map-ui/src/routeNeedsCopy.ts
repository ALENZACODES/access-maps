/** EN/FR messages for the explicit route-needs comparison panel. */
import type { Locale, RequirementId, RequirementResult, Priority } from './routeNeeds.js';

export interface NeedsCopy {
  heading: string;
  intro: string;
  disclaimer: string;
  preferencesHeading: string;
  compareHeading: string;
  noRoutes: string;
  noEvidence: string;
  showBlocked: string;
  includeReturn: string;
  dateLabel: string;
  ageLabel: string;
  distanceLabel: string;
  slopeLabel: string;
  transfersLabel: string;
  choosePriority: string;
  chooseLimit: string;
  routeLabel: string;
  details: string;
  closeDetails: string;
  showDetails: string;
  source: string;
  licence: string;
  retrieved: string;
  tier: string;
  direction: string;
  outbound: string;
  returning: string;
  unresolved: string;
  barrierCount: string;
  supportedCount: string;
  noSupported: string;
  noSelection: string;
  filtered: string;
  all: string;
  essential: string;
  preferred: string;
  off: string;
  met: string;
  barrier: string;
  UNKNOWN: string;
  export: string;
  exportHelp: string;
  summary: string;
  selected: string;
  reportDate: string;
  reset: string;
  statusHeading: string;
  observations: string;
  affectedLegs: string;
  routeDistance: string;
  noDistance: string;
  limitUnset: string;
  requirements: Record<RequirementId, string>;
  priorities: Record<Priority, string>;
  results: Record<RequirementResult, string>;
}

const EN: NeedsCopy = {
  heading: 'Compare routes with your accessibility preferences',
  intro: 'Choose what matters for this journey. Each option shows recorded barriers and information gaps.',
  disclaimer: 'This comparison uses the supplied route data. It cannot determine personal safety or suitability.',
  preferencesHeading: 'Your route preferences',
  compareHeading: 'Comparison of journey options',
  noRoutes: 'No route options are provided in this plan.',
  noEvidence: 'No dated observations are available for this item.',
  showBlocked: 'Include routes with reported barriers',
  includeReturn: 'Include return journey in each assessment',
  dateLabel: 'Assessment date',
  ageLabel: 'Maximum age of source information, days',
  distanceLabel: 'Maximum distance in metres',
  slopeLabel: 'Maximum gradient, percent',
  transfersLabel: 'Maximum transfers',
  choosePriority: 'Importance',
  chooseLimit: 'Selected limit',
  routeLabel: 'Journey option',
  details: 'Evidence details',
  closeDetails: 'Hide evidence details',
  showDetails: 'Show evidence details',
  source: 'Source',
  licence: 'Licence',
  retrieved: 'Retrieved',
  tier: 'Tier',
  direction: 'Direction',
  outbound: 'Outbound',
  returning: 'Return',
  unresolved: 'Unresolved information',
  barrierCount: 'Reported barriers',
  supportedCount: 'Options without a reported essential conflict',
  noSupported: 'No option has enough information for every essential preference.',
  noSelection: 'No option is selected.',
  filtered: 'Review this issue',
  all: 'All requirements',
  essential: 'Essential',
  preferred: 'Preferred',
  off: 'Not considered',
  met: 'Supported by supplied information',
  barrier: 'Recorded barrier or exceeded limit',
  UNKNOWN: 'UNKNOWN',
  export: 'Save comparison as JSON',
  exportHelp: 'Saves a local report. Nothing is sent to a server.',
  summary: 'Assessment summary',
  selected: 'Option with fewer reported conflicts',
  reportDate: 'Report date',
  reset: 'Restore initial preferences',
  statusHeading: 'Requirement result',
  observations: 'Supporting observations',
  affectedLegs: 'Affected journey segments',
  routeDistance: 'Known outbound distance',
  noDistance: 'UNKNOWN distance',
  limitUnset: 'UNKNOWN limit',
  requirements: {
    'no-steps': 'No recorded steps or barriers',
    distance: 'Route distance',
    slope: 'Gradient',
    surface: 'Surface information',
    return: 'Return journey',
    washroom: 'Destination washroom',
    entrance: 'Destination entrance',
    transfers: 'Transfer count',
    'source-date': 'Source dates and licences',
  },
  priorities: { essential: 'Essential', preferred: 'Preferred', off: 'Not considered' },
  results: { met: 'Supported by supplied information', barrier: 'Recorded barrier or exceeded limit', UNKNOWN: 'UNKNOWN' },
};

const FR: NeedsCopy = {
  heading: 'Comparer les parcours selon vos préférences d’accessibilité',
  intro: 'Choisissez vos priorités pour ce trajet. Chaque option montre les obstacles signalés et les renseignements manquants.',
  disclaimer: 'Cette comparaison utilise les données fournies. Elle ne détermine pas la sécurité ni l’adéquation à une situation personnelle.',
  preferencesHeading: 'Vos préférences de parcours',
  compareHeading: 'Comparaison des options de trajet',
  noRoutes: 'Aucune option de trajet n’est fournie dans ce plan.',
  noEvidence: 'Aucune observation datée n’est disponible pour cet élément.',
  showBlocked: 'Inclure les parcours avec des obstacles signalés',
  includeReturn: 'Inclure le trajet de retour dans chaque évaluation',
  dateLabel: 'Date de l’évaluation',
  ageLabel: 'Âge maximal des renseignements des sources, en jours',
  distanceLabel: 'Distance maximale en mètres',
  slopeLabel: 'Pente maximale, en pourcentage',
  transfersLabel: 'Nombre maximal de correspondances',
  choosePriority: 'Importance',
  chooseLimit: 'Limite choisie',
  routeLabel: 'Option de trajet',
  details: 'Détails des observations',
  closeDetails: 'Masquer les observations',
  showDetails: 'Afficher les observations',
  source: 'Source',
  licence: 'Licence',
  retrieved: 'Récupéré',
  tier: 'Niveau',
  direction: 'Direction',
  outbound: 'Aller',
  returning: 'Retour',
  unresolved: 'Renseignements non résolus',
  barrierCount: 'Obstacles signalés',
  supportedCount: 'Options sans conflit essentiel signalé',
  noSupported: 'Aucune option ne possède assez de renseignements pour toutes les préférences essentielles.',
  noSelection: 'Aucune option n’est sélectionnée.',
  filtered: 'Examiner cet élément',
  all: 'Toutes les exigences',
  essential: 'Essentiel',
  preferred: 'Souhaité',
  off: 'Non pris en compte',
  met: 'Soutenu par les renseignements fournis',
  barrier: 'Obstacle signalé ou limite dépassée',
  UNKNOWN: 'UNKNOWN',
  export: 'Enregistrer la comparaison en JSON',
  exportHelp: 'Enregistre un rapport local. Rien n’est envoyé à un serveur.',
  summary: 'Résumé de l’évaluation',
  selected: 'Option avec moins de conflits signalés',
  reportDate: 'Date du rapport',
  reset: 'Rétablir les préférences initiales',
  statusHeading: 'Résultat de l’exigence',
  observations: 'Observations à l’appui',
  affectedLegs: 'Segments du trajet concernés',
  routeDistance: 'Distance connue à l’aller',
  noDistance: 'Distance UNKNOWN',
  limitUnset: 'Limite UNKNOWN',
  requirements: {
    'no-steps': 'Sans marches ni obstacles signalés',
    distance: 'Distance du parcours',
    slope: 'Pente',
    surface: 'État de la surface',
    return: 'Trajet de retour',
    washroom: 'Toilettes à destination',
    entrance: 'Entrée à destination',
    transfers: 'Nombre de correspondances',
    'source-date': 'Dates des sources et licences',
  },
  priorities: { essential: 'Essentiel', preferred: 'Souhaité', off: 'Non pris en compte' },
  results: { met: 'Soutenu par les renseignements fournis', barrier: 'Obstacle signalé ou limite dépassée', UNKNOWN: 'UNKNOWN' },
};

export function needsCopy(locale: Locale): NeedsCopy {
  return locale === 'fr' ? FR : EN;
}
export function needsCopyKeys(): { en: string[]; fr: string[] } {
  return { en: Object.keys(EN).sort(), fr: Object.keys(FR).sort() };
}
export function frenchTypography(value: string): boolean {
  if (/[a-zÀ-ÿ]'[a-zÀ-ÿ]/iu.test(value)) return false;
  for (let i = 0; i < value.length; i++) {
    const character = value[i];
    if (character === ':' && i > 0 && value[i - 1] !== '\u00a0') return false;
    if (';!?'.includes(character ?? '') && i > 0 && value[i - 1] !== '\u202f') return false;
    if (character === '«' && value[i + 1] !== '\u202f') return false;
    if (character === '»' && value[i - 1] !== '\u202f') return false;
  }
  return true;
}
export function localLabel(locale: Locale, result: RequirementResult): string {
  return needsCopy(locale).results[result];
}
