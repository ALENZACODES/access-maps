import type { Fit, Reason } from './index.js';

export const strings: Record<'en' | 'fr', { reasons: Record<Reason, string>; fits: Record<Fit, string>; labels: { pace: string; estimate: string; source: string; licence: string; date: string; tier: string; odbl: string } }> = {
  en: {
    reasons: {
      'too-steep': 'Slope exceeds your setting', 'too-narrow': 'Clear width is below your setting',
      'surface-not-allowed': 'Surface is not in your allowed list', steps: 'Recorded steps on this segment',
      'unknown-slope': 'Slope unknown', 'unknown-width': 'Clear width unknown',
      'unknown-surface': 'Surface unknown', 'unknown-steps': 'Steps unknown', 'unknown-length': 'Distance unknown',
    },
    fits: { 'known-yes': 'Known yes', 'known-no': 'Known no', Unknown: 'Unknown' },
    labels: { pace: 'Estimated rolling pace (m/s)', estimate: 'Estimated travel time', source: 'Source',
      licence: 'Licence', date: 'Retrieved', tier: 'Evidence tier', odbl: '© OpenStreetMap contributors, ODbL' },
  },
  fr: {
    reasons: {
      'too-steep': 'La pente dépasse votre limite', 'too-narrow': 'La largeur libre est inférieure à votre minimum',
      'surface-not-allowed': 'La surface ne figure pas dans votre liste', steps: 'Marches consignées sur ce tronçon',
      'unknown-slope': 'Pente inconnue', 'unknown-width': 'Largeur libre inconnue',
      'unknown-surface': 'Surface inconnue', 'unknown-steps': 'Marches inconnues', 'unknown-length': 'Distance inconnue',
    },
    fits: { 'known-yes': 'Oui confirmé', 'known-no': 'Non confirmé', Unknown: 'Inconnu' },
    labels: { pace: 'Vitesse de déplacement estimée (m/s)', estimate: 'Durée estimée', source: 'Source',
      licence: 'Licence', date: 'Récupéré le', tier: 'Niveau de preuve', odbl: '© contributeurs OpenStreetMap, ODbL' },
  },
};
