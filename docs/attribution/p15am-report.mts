import { PHASES, choice, compareText } from './p15am-model.mts';
import type { Cursor, Obstacle, Phase, Reason } from './p15am-model.mts';
import { inspectReviewQueue } from './p15am-queue.mts';

type Labels = Record<Phase | Reason | Obstacle, string>;
const english: Labels = {
  ready: 'Ready for assignment',
  claimed: 'Assigned',
  handoff: 'Awaiting transfer acceptance',
  blocked: 'Waiting for evidence',
  'peer-review': 'Awaiting an independent review',
  reviewed: 'Review recorded',
  'source-withdrawn': 'Source withdrawn',
  'licence-changed': 'Licence changed',
  'tier-changed': 'Verification tier changed',
  'content-changed': 'Source content changed',
  'conflicting-captures': 'Captures disagree',
  'source-unavailable': 'Source unavailable',
  'review-overdue': 'Review overdue',
  'review-due': 'Review due',
  'capture-needed': 'Capture needed',
  'rights-unclear': 'Usage rights unclear',
  'scope-unclear': 'Evidence coverage unclear',
  'metadata-mismatch': 'Metadata differs'
};

const french: Labels = {
  ready: 'Prête à attribuer',
  claimed: 'Attribuée',
  handoff: 'En attente d’acceptation du transfert',
  blocked: 'En attente de preuves',
  'peer-review': 'En attente d’une révision indépendante',
  reviewed: 'Révision consignée',
  'source-withdrawn': 'Source retirée',
  'licence-changed': 'Licence modifiée',
  'tier-changed': 'Niveau de vérification modifié',
  'content-changed': 'Contenu de la source modifié',
  'conflicting-captures': 'Captures contradictoires',
  'source-unavailable': 'Source indisponible',
  'review-overdue': 'Révision en retard',
  'review-due': 'Révision à effectuer',
  'capture-needed': 'Capture requise',
  'rights-unclear': 'Droits d’utilisation incertains',
  'scope-unclear': 'Portée des preuves incertaine',
  'metadata-mismatch': 'Métadonnées différentes'
};

interface PhaseCount {
  phase: Phase;
  label: string;
  count: number;
}

interface ReviewEntry {
  proposalId: string;
  source: string;
  licence: string;
  retrievedOn: string;
  verificationTier: number | 'UNKNOWN';
  verificationLabel: string;
  recordIds: string[];
  phase: Phase;
  phaseLabel: string;
  reasonLabel: string;
  obstacleLabel: string | null;
  owner: string | null;
  offeredTo: string | null;
  independentDesks: string[];
}

export interface WorkReport {
  lang: 'en' | 'fr';
  title: string;
  cursor: Cursor;
  phaseCounts: PhaseCount[];
  deskLoads: { deskId: string; occupied: number; capacity: number }[];
  entries: ReviewEntry[];
}

/** Administrative review labels never change the underlying access evidence. */
export function describeReviewQueue(input: unknown, language: unknown): WorkReport {
  const lang = choice(language, ['en', 'fr'] as const);
  const labels = lang === 'en' ? english : french;
  const view = inspectReviewQueue(input);
  const phaseCounts: PhaseCount[] = PHASES.map(phase => ({ phase, label: labels[phase], count: 0 }));
  const byPhase = new Map(phaseCounts.map(row => [row.phase, row]));
  const deskLoads = view.desks.map(desk => ({ deskId: desk.deskId, occupied: 0, capacity: desk.capacity }));
  const byDesk = new Map(deskLoads.map(desk => [desk.deskId, desk]));
  const exclusions = view.desks.map(desk => ({ deskId: desk.deskId, blocked: new Set(desk.excludedSources) }));
  const entries = view.items.map(item => {
    byPhase.get(item.phase)!.count++;
    if (item.owner) byDesk.get(item.owner)!.occupied++;
    const { proposalId, sourceId, provenance, recordIds, reason } = item.candidate;
    const independentDesks = item.phase === 'peer-review'
      ? exclusions.filter(desk => desk.deskId !== item.submittedBy && !desk.blocked.has(sourceId))
        .map(desk => desk.deskId)
      : [];
    const tier = provenance.verificationTier;
    const verificationLabel = tier === 'UNKNOWN'
      ? (lang === 'en' ? 'Unknown' : 'Inconnu')
      : (lang === 'en' ? 'Tier ' : 'Niveau ') + tier;
    return {
      proposalId, ...provenance, verificationLabel, recordIds, phase: item.phase,
      phaseLabel: labels[item.phase], reasonLabel: labels[reason],
      obstacleLabel: item.obstacle ? labels[item.obstacle] : null,
      owner: item.owner, offeredTo: item.offeredTo, independentDesks
    };
  });
  entries.sort((a, b) => compareText(a.source, b.source) || compareText(a.proposalId, b.proposalId));
  return {
    lang, title: lang === 'en' ? 'Offline source review queue' : 'File de révision des sources hors ligne',
    cursor: view.cursor, phaseCounts, deskLoads, entries
  };
}
