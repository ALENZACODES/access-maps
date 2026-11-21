/** Preference-based journey comparison. User choices are not clinical advice. */
import type { Journey, JourneyPlan, Leg, Provenance } from '@access-maps/journey';

export type Locale = 'en' | 'fr';
export type AccessValue = 'YES' | 'NO' | 'UNKNOWN';
export type RequirementId = 'no-steps' | 'distance' | 'slope' | 'surface' | 'return' | 'washroom' | 'entrance' | 'transfers' | 'source-date';
export type RequirementResult = 'met' | 'barrier' | 'UNKNOWN';
export type Priority = 'essential' | 'preferred' | 'off';
export type JourneyDirection = 'outbound' | 'return';

export interface Choice {
  id: RequirementId;
  priority: Priority;
  /** Explicit numeric settings; null means a person has not supplied a limit. */
  limit: number | null;
}
export interface NeedsProfile {
  choices: Choice[];
  includeReturn: boolean;
  includeBlocked: boolean;
  /** Date of assessment, supplied locally. Not fetched from a clock. */
  asOf: string;
  /** Records older than this many days are not treated as current evidence. */
  maximumSourceAgeDays: number;
}
export interface Observation {
  code: string;
  value: AccessValue;
  routeId: string;
  legId: string;
  direction: JourneyDirection;
  sourceId: string;
  licence: string;
  retrievedOn: string;
  tier: number | null;
  explanation: string;
}
export interface RequirementAssessment {
  id: RequirementId;
  priority: Priority;
  result: RequirementResult;
  reason: string;
  observations: Observation[];
  affectedLegIds: string[];
  reportedValue: number | null;
  limit: number | null;
}
export interface RouteAssessment {
  routeId: string;
  summary: string;
  blockedOption: boolean;
  requirements: RequirementAssessment[];
  status: RequirementResult;
  essentialBarriers: number;
  essentialUnknowns: number;
  preferredBarriers: number;
  preferredUnknowns: number;
  knownDistanceMetres: number | null;
  explanation: string;
  weakestRequirement: RequirementId | null;
}
export interface ComparisonResult {
  ok: boolean;
  error: string | null;
  asOf: string;
  routes: RouteAssessment[];
  requirements: Choice[];
  preferredRouteId: string | null;
  selectionExplanation: string;
}

export const REQUIREMENTS: readonly RequirementId[] = [
  'no-steps', 'distance', 'slope', 'surface', 'return', 'washroom', 'entrance', 'transfers', 'source-date',
];
export const DEFAULT_PROFILE: NeedsProfile = {
  choices: [
    { id: 'no-steps', priority: 'essential', limit: null },
    { id: 'distance', priority: 'preferred', limit: 1500 },
    { id: 'slope', priority: 'preferred', limit: 6 },
    { id: 'surface', priority: 'preferred', limit: null },
    { id: 'return', priority: 'essential', limit: null },
    { id: 'washroom', priority: 'off', limit: null },
    { id: 'entrance', priority: 'essential', limit: null },
    { id: 'transfers', priority: 'off', limit: 2 },
    { id: 'source-date', priority: 'preferred', limit: null },
  ],
  includeReturn: true,
  includeBlocked: false,
  asOf: '2026-11-19',
  maximumSourceAgeDays: 180,
};

const ALLOWED_LICENCES = new Set(['CC0-1.0', 'CC-BY-4.0', 'ODbL-1.0', 'OGL-Canada-2.0', 'OGL-ON-1.0', 'OGL-Toronto-1.0']);
export function isOpenLicence(value: string): boolean {
  return ALLOWED_LICENCES.has(value);
}
const STATE_ORDER: Record<RequirementResult, number> = { met: 0, UNKNOWN: 1, barrier: 2 };
const stableCompare = (a: string, b: string): number => a.localeCompare(b, 'en');

export function calendarDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.getTime() / 86_400_000;
}

export function dateFromProvenance(provenance: Provenance): string {
  const candidate = provenance.retrievedOn ?? provenance.retrievedAt;
  if (typeof candidate !== 'string') return 'UNKNOWN';
  const day = candidate.slice(0, 10);
  return calendarDay(day) === null ? 'UNKNOWN' : day;
}

export function provenanceQuality(provenance: Provenance, asOf: string, maxAge: number): AccessValue {
  const asOfDay = calendarDay(asOf);
  const date = dateFromProvenance(provenance);
  const sourceDay = calendarDay(date);
  if (asOfDay === null || sourceDay === null) return 'UNKNOWN';
  if (typeof provenance.sourceId !== 'string' || provenance.sourceId.trim().length === 0 ||
      provenance.sourceId === 'UNKNOWN') return 'UNKNOWN';
  if (!isOpenLicence(provenance.licence)) return 'UNKNOWN';
  if (sourceDay > asOfDay || asOfDay - sourceDay > maxAge) return 'UNKNOWN';
  if (provenance.tier === null || provenance.tier < 1) return 'UNKNOWN';
  return 'YES';
}

export function parseNumericFact(raw: string): number | null {
  if (typeof raw !== 'string' || raw.trim() === '' || raw === 'UNKNOWN') return null;
  const text = raw.trim().replace(',', '.');
  const match = /^([+-]?\d+(?:\.\d+)?)\s*(?:%|m|metres?|meters?)?$/iu.exec(text);
  if (!match) return null;
  const numeric = Number(match[1]);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

export function normalizeProfile(input: unknown): NeedsProfile | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const profile = input as Partial<NeedsProfile>;
  if (!Array.isArray(profile.choices) || profile.choices.length !== REQUIREMENTS.length ||
      typeof profile.includeReturn !== 'boolean' || typeof profile.includeBlocked !== 'boolean' ||
      typeof profile.asOf !== 'string' || calendarDay(profile.asOf) === null ||
      !Number.isInteger(profile.maximumSourceAgeDays) ||
      (profile.maximumSourceAgeDays ?? -1) < 0 || (profile.maximumSourceAgeDays ?? 9999) > 3650) return null;
  const seen = new Set<string>();
  const choices: Choice[] = [];
  for (const value of profile.choices) {
    if (!value || typeof value !== 'object') return null;
    const choice = value as Choice;
    if (!REQUIREMENTS.includes(choice.id) || seen.has(choice.id) ||
        !['essential', 'preferred', 'off'].includes(choice.priority) ||
        (choice.limit !== null && (!Number.isFinite(choice.limit) || choice.limit < 0 || choice.limit > 1_000_000))) return null;
    seen.add(choice.id);
    choices.push({ id: choice.id, priority: choice.priority, limit: choice.limit });
  }
  if (seen.size !== REQUIREMENTS.length) return null;
  choices.sort((a, b) => REQUIREMENTS.indexOf(a.id) - REQUIREMENTS.indexOf(b.id));
  return {
    choices,
    includeReturn: profile.includeReturn,
    includeBlocked: profile.includeBlocked,
    asOf: profile.asOf,
    maximumSourceAgeDays: profile.maximumSourceAgeDays as number,
  };
}

export function withChoice(profile: NeedsProfile, id: RequirementId, patch: Partial<Choice>): NeedsProfile {
  const choices = profile.choices.map((entry) => entry.id === id ? {
    id: entry.id, priority: patch.priority ?? entry.priority,
    limit: patch.limit === undefined ? entry.limit : patch.limit,
  } : { ...entry });
  return { ...profile, choices };
}

export function makeObservation(
  routeId: string,
  leg: Leg,
  direction: JourneyDirection,
  code: string,
  value: AccessValue,
  explanation: string,
): Observation {
  return {
    code, value, routeId, legId: leg.id, direction,
    sourceId: leg.provenance.sourceId || 'UNKNOWN',
    licence: leg.provenance.licence || 'UNKNOWN',
    retrievedOn: dateFromProvenance(leg.provenance),
    tier: leg.provenance.tier,
    explanation,
  };
}

export function selectLegs(journey: Journey, includeReturn: boolean): Array<{ leg: Leg; direction: JourneyDirection }> {
  const legs: Array<{ leg: Leg; direction: JourneyDirection }> = journey.legs.map((leg) => ({ leg, direction: 'outbound' }));
  if (includeReturn) legs.push(...journey.returnJourney.legs.map((leg) => ({ leg, direction: 'return' as const })));
  return legs;
}

export function combineEvidence(values: readonly AccessValue[]): AccessValue {
  if (values.includes('NO')) return 'NO';
  if (values.includes('UNKNOWN') || values.length === 0) return 'UNKNOWN';
  return 'YES';
}

export function evidenceForLeg(leg: Leg, profile: NeedsProfile): AccessValue {
  if (leg.stepFree.status === 'not-step-free') return 'NO';
  if (leg.stepFree.status !== 'step-free') return 'UNKNOWN';
  if (leg.stepFree.evidence.length === 0) return 'UNKNOWN';
  if (provenanceQuality(leg.provenance, profile.asOf, profile.maximumSourceAgeDays) !== 'YES') return 'UNKNOWN';
  return 'YES';
}

function resultFromValues(values: readonly AccessValue[]): RequirementResult {
  const combined = combineEvidence(values);
  return combined === 'YES' ? 'met' : combined === 'NO' ? 'barrier' : 'UNKNOWN';
}

function legFacts(routeId: string, items: Array<{ leg: Leg; direction: JourneyDirection }>,
  classifier: (leg: Leg) => { value: AccessValue; code: string; reason: string }): Observation[] {
  return items.map(({ leg, direction }) => {
    const fact = classifier(leg);
    return makeObservation(routeId, leg, direction, fact.code, fact.value, fact.reason);
  });
}

function sourceAssessment(routeId: string, items: Array<{ leg: Leg; direction: JourneyDirection }>, profile: NeedsProfile): Observation[] {
  return legFacts(routeId, items, (leg) => {
    const value = provenanceQuality(leg.provenance, profile.asOf, profile.maximumSourceAgeDays);
    return { value, code: value === 'YES' ? 'source-current' : 'source-UNKNOWN',
      reason: value === 'YES' ? 'Source date and licence are present.' : 'Source date, licence or tier is insufficient.' };
  });
}

function noStepsAssessment(routeId: string, items: Array<{ leg: Leg; direction: JourneyDirection }>, profile: NeedsProfile): Observation[] {
  return legFacts(routeId, items, (leg) => {
    const value = evidenceForLeg(leg, profile);
    return { value, code: value === 'NO' ? 'step-barrier' : value === 'YES' ? 'step-evidence' : 'step-UNKNOWN',
      reason: value === 'NO' ? 'A barrier is recorded.' : value === 'YES' ? 'Current supporting observation is present.' : 'Step status lacks sufficient evidence.' };
  });
}

function distanceAssessment(routeId: string, items: Array<{ leg: Leg; direction: JourneyDirection }>, limit: number | null): Observation[] {
  const observations: Observation[] = [];
  for (const { leg, direction } of items) {
    const value: AccessValue = leg.distanceKind === 'route' && leg.distanceMetres !== null && Number.isFinite(leg.distanceMetres) ? 'YES' : 'UNKNOWN';
    observations.push(makeObservation(routeId, leg, direction, 'route-distance', value,
      value === 'YES' ? 'Path distance is supplied.' : 'Only approximate or missing distance is available.'));
  }
  if (limit === null || observations.some((entry) => entry.value === 'UNKNOWN')) return observations;
  const total = items.reduce((sum, item) => sum + (item.leg.distanceMetres ?? 0), 0);
  if (total > limit) return observations.map((entry) => ({ ...entry, value: 'NO' as const, code: 'distance-limit', explanation: 'Known route distance exceeds the selected limit.' }));
  return observations;
}

function slopeAssessment(routeId: string, items: Array<{ leg: Leg; direction: JourneyDirection }>, limit: number | null): Observation[] {
  return legFacts(routeId, items, (leg) => {
    const grade = parseNumericFact(leg.gradient);
    if (grade === null || limit === null) return { value: 'UNKNOWN', code: 'slope-UNKNOWN', reason: 'Gradient or limit is not supplied.' };
    return grade <= limit ? { value: 'YES', code: 'slope-within', reason: 'Recorded gradient is within the selected limit.' } :
      { value: 'NO', code: 'slope-over', reason: 'Recorded gradient exceeds the selected limit.' };
  });
}

function surfaceAssessment(routeId: string, items: Array<{ leg: Leg; direction: JourneyDirection }>): Observation[] {
  return legFacts(routeId, items, (leg) => {
    const surface = leg.surface.trim().toLowerCase();
    if (!surface || surface === 'unknown' || surface === 'UNKNOWN') return { value: 'UNKNOWN', code: 'surface-UNKNOWN', reason: 'Surface has not been described.' };
    if (/(?:stairs|loose gravel|deep sand|step)/iu.test(surface)) return { value: 'NO', code: 'surface-barrier', reason: 'The reported surface includes a barrier.' };
    if (/(?:paved|asphalt|concrete|smooth)/iu.test(surface)) return { value: 'YES', code: 'surface-known', reason: 'A surface description is supplied.' };
    return { value: 'UNKNOWN', code: 'surface-unclassified', reason: 'Surface description does not establish accessibility.' };
  });
}

function transferAssessment(routeId: string, items: Array<{ leg: Leg; direction: JourneyDirection }>, limit: number | null): Observation[] {
  return legFacts(routeId, items, (leg) => {
    if (limit === null) return { value: 'UNKNOWN', code: 'transfer-UNKNOWN', reason: 'No transfer limit has been selected.' };
    const isTransfer = leg.mode === 'station-access' || leg.mode === 'handoff';
    const count = items.filter((item) => item.leg.mode === 'station-access' || item.leg.mode === 'handoff').length;
    return { value: count <= limit ? 'YES' : 'NO', code: isTransfer ? 'transfer-step' : 'transfer-total',
      reason: count <= limit ? 'Transfer count is within the selected limit.' : 'Transfer count exceeds the selected limit.' };
  });
}

function depthAssessment(routeId: string, journey: Journey, type: 'washroom' | 'entrance',
  items: Array<{ leg: Leg; direction: JourneyDirection }>, profile: NeedsProfile): Observation[] {
  const value: AccessValue = type === 'washroom' ?
    (journey.depth.washroom.usable && journey.depth.washroom.provenance &&
      provenanceQuality(journey.depth.washroom.provenance, profile.asOf, profile.maximumSourceAgeDays) === 'YES' ? 'YES' : 'UNKNOWN') :
    (journey.depth.entrance.provenance && journey.depth.entrance.stepCount === '0' &&
      provenanceQuality(journey.depth.entrance.provenance, profile.asOf, profile.maximumSourceAgeDays) === 'YES' ? 'YES' : 'UNKNOWN');
  return items.filter(({ leg }) => leg.mode === type || (type === 'entrance' && leg.mode === 'approach'))
    .map(({ leg, direction }) => makeObservation(routeId, leg, direction, `${type}-detail`, value,
      value === 'YES' ? 'A dated destination description is supplied.' : 'Destination detail remains UNKNOWN.'));
}

function returnAssessment(routeId: string, journey: Journey, profile: NeedsProfile): Observation[] {
  if (!profile.includeReturn) return [];
  return legFacts(routeId, journey.returnJourney.legs.map((leg) => ({ leg, direction: 'return' as const })),
    (leg) => ({ value: evidenceForLeg(leg, profile), code: 'return-evidence', reason: 'Return journey needs its own supporting observations.' }));
}

export function assessRequirement(journey: Journey, choice: Choice, profile: NeedsProfile): RequirementAssessment {
  const items = selectLegs(journey, profile.includeReturn);
  let observations: Observation[];
  switch (choice.id) {
    case 'no-steps': observations = noStepsAssessment(journey.id, items, profile); break;
    case 'distance': observations = distanceAssessment(journey.id, items, choice.limit); break;
    case 'slope': observations = slopeAssessment(journey.id, items, choice.limit); break;
    case 'surface': observations = surfaceAssessment(journey.id, items); break;
    case 'return': observations = returnAssessment(journey.id, journey, profile); break;
    case 'washroom': observations = depthAssessment(journey.id, journey, 'washroom', items, profile); break;
    case 'entrance': observations = depthAssessment(journey.id, journey, 'entrance', items, profile); break;
    case 'transfers': observations = transferAssessment(journey.id, items, choice.limit); break;
    case 'source-date': observations = sourceAssessment(journey.id, items, profile); break;
  }
  const effectivePriority = choice.id === 'return' && !profile.includeReturn ? 'off' : choice.priority;
  const result = resultFromValues(observations.map((entry) => entry.value));
  const affectedLegIds = [...new Set(observations.filter((entry) => entry.value !== 'YES').map((entry) => entry.legId))].sort(stableCompare);
  const total = choice.id === 'distance' && observations.every((entry) => entry.value !== 'UNKNOWN') ?
    items.reduce((sum, { leg }) => sum + (leg.distanceMetres ?? 0), 0) : null;
  return { id: choice.id, priority: effectivePriority, result, reason: effectivePriority === 'off' ? 'This preference is not active.' :
    result === 'met' ? 'The selected requirement has supporting information.' :
      result === 'barrier' ? 'A recorded barrier or exceeded limit affects this requirement.' :
        'There is not enough supporting information for this requirement.',
    observations, affectedLegIds, reportedValue: total, limit: choice.limit };
}

function severity(requirement: RequirementAssessment): number {
  if (requirement.priority === 'off') return 0;
  return (requirement.priority === 'essential' ? 10 : 1) * STATE_ORDER[requirement.result];
}

export function compareRoutes(plan: JourneyPlan, untrustedProfile: unknown): ComparisonResult {
  const profile = normalizeProfile(untrustedProfile);
  if (!profile) return { ok: false, error: 'Preference settings are incomplete.', asOf: 'UNKNOWN',
    routes: [], requirements: [], preferredRouteId: null, selectionExplanation: 'No comparison is available.' };
  const candidates = [
    ...plan.journeys.map((journey) => ({ journey, blocked: false })),
    ...(profile.includeBlocked ? plan.blocked.map((journey) => ({ journey, blocked: true })) : []),
  ];
  const routes = candidates.map(({ journey, blocked }): RouteAssessment => {
    const requirements = profile.choices.map((choice) => assessRequirement(journey, choice, profile));
    const essentialBarriers = requirements.filter((r) => r.priority === 'essential' && r.result === 'barrier').length;
    const essentialUnknowns = requirements.filter((r) => r.priority === 'essential' && r.result === 'UNKNOWN').length;
    const preferredBarriers = requirements.filter((r) => r.priority === 'preferred' && r.result === 'barrier').length;
    const preferredUnknowns = requirements.filter((r) => r.priority === 'preferred' && r.result === 'UNKNOWN').length;
    const knownDistanceMetres = journey.legs.every((leg) => leg.distanceKind === 'route' && leg.distanceMetres !== null) ?
      journey.legs.reduce((sum, leg) => sum + (leg.distanceMetres ?? 0), 0) : null;
    const status: RequirementResult = blocked || essentialBarriers > 0 ? 'barrier' : essentialUnknowns > 0 ? 'UNKNOWN' : 'met';
    const weakestRequirement = [...requirements].filter((r) => r.priority !== 'off')
      .sort((a, b) => severity(b) - severity(a) || stableCompare(a.id, b.id))[0]?.id ?? null;
    return { routeId: journey.id, summary: journey.summary, blockedOption: blocked,
      requirements, status, essentialBarriers, essentialUnknowns, preferredBarriers,
      preferredUnknowns, knownDistanceMetres, weakestRequirement,
      explanation: status === 'met' ? 'No essential requirement has a reported barrier or missing fact.' :
        status === 'barrier' ? 'A reported barrier affects an essential requirement.' : 'Essential requirements contain UNKNOWN information.' };
  });
  routes.sort((a, b) => a.essentialBarriers - b.essentialBarriers || a.essentialUnknowns - b.essentialUnknowns ||
    a.preferredBarriers - b.preferredBarriers || a.preferredUnknowns - b.preferredUnknowns ||
    (a.knownDistanceMetres ?? Infinity) - (b.knownDistanceMetres ?? Infinity) || stableCompare(a.routeId, b.routeId));
  const selected = routes.find((route) => route.status === 'met');
  return { ok: true, error: null, asOf: profile.asOf, routes, requirements: profile.choices,
    preferredRouteId: selected?.routeId ?? null,
    selectionExplanation: selected ? 'This option has the fewest reported conflicts with the selected preferences; it is not a safety assessment.' :
      'No route has sufficient support for every essential preference. Review the UNKNOWN information.' };
}

export function focusedObservations(route: RouteAssessment, id: RequirementId): Observation[] {
  return route.requirements.find((item) => item.id === id)?.observations ?? [];
}

export function summarizeComparison(report: ComparisonResult) {
  return { total: report.routes.length, supported: report.routes.filter((r) => r.status === 'met').length,
    barriers: report.routes.filter((r) => r.status === 'barrier').length,
    unknown: report.routes.filter((r) => r.status === 'UNKNOWN').length,
    preferredRouteId: report.preferredRouteId };
}
