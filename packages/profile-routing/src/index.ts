/** Pure, offline, profile-aware routing over caller-supplied open-data segments. */
export type Licence = 'ODbL' | 'OGL-Ontario' | 'OGL-Canada' | 'CC-BY' | 'CC0';
export type Tier = 0 | 1 | 2 | 3;
export type Fact<T> = {
  value: T | 'UNKNOWN';
  source_id: string;
  licence: Licence;
  retrieved_at: string;
  tier: Tier;
  source_key?: string;
  raw?: unknown;
  derived?: boolean;
};
export type Surface = string;
export type Point = { lat: number; lon: number; elevationM?: number };
export type MobilityProfile = {
  maxSlopePercent: number;
  minWidthMm: number;
  surfacesAllowed: readonly Surface[];
  /** Defaults to false; explicit opt-in is required to traverse UNKNOWN facts. */
  allowUnknownSegments?: boolean;
  /** Optional personal reminder setting; no medical interpretation. */
  breakIntervalMinutes?: number;
};
export type Segment = {
  id: string;
  from: string;
  to: string;
  /** Length is a sourced fact; elevations in geometry never imply incline. */
  lengthM: Fact<number>;
  slopePercent?: Fact<number>;
  widthMm?: Fact<number>;
  surface?: Fact<Surface>;
  stepCount?: Fact<number>;
  geometry?: readonly Point[];
  /** Default false: false allows travel both directions. */
  oneWay?: boolean;
};
export type Need = 'slope' | 'width' | 'surface' | 'steps';
export type Fit = 'known-yes' | 'known-no' | 'Unknown';
export type Reason = 'too-steep' | 'too-narrow' | 'surface-not-allowed' | 'steps' | 'unknown-slope' | 'unknown-width' | 'unknown-surface' | 'unknown-steps' | 'unknown-length';
export type Assessment = { need: Need; fit: Fit; reason?: Reason; fact?: Fact<number | string> };
export type Refused = { segmentId: string; reasons: Reason[] };
export type FlaggedUnknown = { segmentId: string; reasons: Reason[]; used: boolean };
export type Leg = { segmentId: string; from: string; to: string; distanceM: number; durationSeconds: number; assessments: Assessment[] };
export type RouteOptions = { paceMps?: number };
export type RouteResult = {
  legs: Leg[];
  distanceM: number;
  durationSeconds: number;
  paceMps: number;
  found: boolean;
  refused: Refused[];
  flaggedUnknown: FlaggedUnknown[];
};
export type PlaceDoor = { id: string; doorNodeId: string };
export type ApproachSegment = { segmentId: string; distanceFromDoorM: number; assessments: Assessment[] };
export type ApproachResult = { placeId: string; radiusM: number; segments: ApproachSegment[]; byNeed: Record<Need, Fit> };

const NEEDS: readonly Need[] = ['slope', 'width', 'surface', 'steps'];
const UNKNOWN: Record<Need, Reason> = {
  slope: 'unknown-slope', width: 'unknown-width', surface: 'unknown-surface', steps: 'unknown-steps',
};

/** Tier-0 drafts and malformed/unsupported provenance are never promoted to facts. */
function verifiedValue<T>(fact: Fact<T> | undefined): T | undefined {
  if (!fact || fact.value === 'UNKNOWN' || fact.tier === 0) return undefined;
  if (!['ODbL', 'OGL-Ontario', 'OGL-Canada', 'CC-BY', 'CC0'].includes(fact.licence)) return undefined;
  if (!fact.source_id || !/^\d{4}-\d\d-\d\d/.test(fact.retrieved_at)) return undefined;
  return fact.value as T;
}
function finiteNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
function validProfile(profile: MobilityProfile): void {
  if (!finiteNonnegative(profile.maxSlopePercent) || !finiteNonnegative(profile.minWidthMm) ||
      !Array.isArray(profile.surfacesAllowed) || profile.surfacesAllowed.some(s => typeof s !== 'string') ||
      (profile.breakIntervalMinutes !== undefined && !finiteNonnegative(profile.breakIntervalMinutes))) {
    throw new RangeError('Invalid mobility profile');
  }
}

/** An assessment concerns the supplied evidence, never inferred accessibility. */
export function assess(profile: MobilityProfile, segment: Segment): Assessment[] {
  validProfile(profile);
  const slope = verifiedValue(segment.slopePercent);
  const width = verifiedValue(segment.widthMm);
  const surface = verifiedValue(segment.surface);
  const steps = verifiedValue(segment.stepCount);
  const check = (need: Need, _value: unknown, valid: boolean, pass: boolean, reason: Reason, fact?: Fact<number | string>): Assessment => {
    if (!valid) return { need, fit: 'Unknown', reason: UNKNOWN[need], ...(fact ? { fact } : {}) };
    return { need, fit: pass ? 'known-yes' : 'known-no', ...(!pass ? { reason } : {}), ...(fact ? { fact } : {}) };
  };
  return [
    check('slope', slope, finiteNonnegative(slope), typeof slope === 'number' && slope <= profile.maxSlopePercent, 'too-steep', segment.slopePercent),
    check('width', width, finiteNonnegative(width), typeof width === 'number' && width >= profile.minWidthMm, 'too-narrow', segment.widthMm),
    check('surface', surface, typeof surface === 'string' && surface.length > 0, typeof surface === 'string' && profile.surfacesAllowed.includes(surface), 'surface-not-allowed', segment.surface),
    check('steps', steps, Number.isInteger(steps) && finiteNonnegative(steps), steps === 0, 'steps', segment.stepCount),
  ];
}

function lengthOf(segment: Segment): number | undefined {
  const value = verifiedValue(segment.lengthM);
  return finiteNonnegative(value) ? value : undefined;
}
function reasonsOf(assessments: Assessment[], unknownAllowed: boolean): Reason[] {
  return assessments.filter(a => a.fit === 'known-no' || (a.fit === 'Unknown' && !unknownAllowed && a.need !== 'steps'))
    .map(a => a.reason!).filter(Boolean);
}
function adjacency(segments: readonly Segment[]): Map<string, { segment: Segment; to: string }[]> {
  const graph = new Map<string, { segment: Segment; to: string }[]>();
  const add = (from: string, to: string, segment: Segment) => {
    const row = graph.get(from) ?? [];
    row.push({ segment, to });
    graph.set(from, row);
  };
  for (const segment of segments) {
    add(segment.from, segment.to, segment);
    if (!segment.oneWay) add(segment.to, segment.from, segment);
  }
  return graph;
}

/** Dijkstra by sourced distance, with deterministic ties and no network or map data. */
export function route(profile: MobilityProfile, from: string, to: string, segments: readonly Segment[], opts: RouteOptions = {}): RouteResult {
  validProfile(profile);
  const paceMps = opts.paceMps ?? 1.0; // Editable estimate, not a prescribed or measured pace.
  if (!Number.isFinite(paceMps) || paceMps <= 0) throw new RangeError('paceMps must be positive');
  const refused: Refused[] = [];
  const flaggedUnknown: FlaggedUnknown[] = [];
  const usable = new Set<string>();
  const assessments = new Map<string, Assessment[]>();
  const lengths = new Map<string, number>();
  const ids = new Set<string>();
  for (const segment of segments) {
    if (ids.has(segment.id)) throw new Error(`Duplicate segment id: ${segment.id}`);
    ids.add(segment.id);
    const checks = assess(profile, segment);
    assessments.set(segment.id, checks);
    const length = lengthOf(segment);
    const unknown = checks.filter(a => a.fit === 'Unknown').map(a => a.reason!);
    if (length === undefined) unknown.push('unknown-length');
    if (unknown.length) flaggedUnknown.push({ segmentId: segment.id, reasons: unknown, used: false });
    const reasons = reasonsOf(checks, profile.allowUnknownSegments === true);
    if (length === undefined) reasons.push('unknown-length'); // Cannot route without a known distance.
    if (reasons.length) refused.push({ segmentId: segment.id, reasons });
    else { usable.add(segment.id); lengths.set(segment.id, length!); }
  }
  const graph = adjacency(segments.filter(s => usable.has(s.id)));
  const dist = new Map<string, number>([[from, 0]]);
  const previous = new Map<string, { node: string; segment: Segment }>();
  const visited = new Set<string>();
  while (true) {
    const current = [...dist.entries()].filter(([node]) => !visited.has(node))
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0];
    if (!current) break;
    const [node, distance] = current;
    if (node === to) break;
    visited.add(node);
    for (const edge of graph.get(node) ?? []) {
      const candidate = distance + lengths.get(edge.segment.id)!;
      if (candidate < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, candidate);
        previous.set(edge.to, { node, segment: edge.segment });
      }
    }
  }
  const legs: Leg[] = [];
  let node = to;
  const seen = new Set<string>();
  while (node !== from && previous.has(node) && !seen.has(node)) {
    seen.add(node);
    const prev = previous.get(node)!;
    const distanceM = lengths.get(prev.segment.id)!;
    legs.unshift({ segmentId: prev.segment.id, from: prev.node, to: node, distanceM,
      durationSeconds: distanceM / paceMps, assessments: assessments.get(prev.segment.id)! });
    node = prev.node;
  }
  const found = from === to || (node === from && legs.length > 0);
  if (!found) legs.length = 0;
  const used = new Set(legs.map(leg => leg.segmentId));
  for (const flag of flaggedUnknown) flag.used = used.has(flag.segmentId);
  const distanceM = found ? legs.reduce((sum, leg) => sum + leg.distanceM, 0) : 0;
  return { legs, distanceM, durationSeconds: distanceM / paceMps, paceMps, found, refused, flaggedUnknown };
}

/** Inspect sourced facts on segments within path-distance radius of a door.
 * A branch is not an assured arrival route; byNeed is a conservative aggregate,
 * not an accessibility score. Unknown evidence remains Unknown.
 */
export function approach(profile: MobilityProfile, place: PlaceDoor, segments: readonly Segment[], radiusM = 200): ApproachResult {
  validProfile(profile);
  if (!finiteNonnegative(radiusM)) throw new RangeError('radiusM must be nonnegative');
  const graph = adjacency(segments);
  const distances = new Map<string, number>([[place.doorNodeId, 0]]);
  const visited = new Set<string>();
  while (true) {
    const next = [...distances.entries()].filter(([node]) => !visited.has(node))
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0];
    if (!next || next[1] > radiusM) break;
    const [node, distance] = next;
    visited.add(node);
    for (const edge of graph.get(node) ?? []) {
      const length = lengthOf(edge.segment);
      if (length === undefined || distance + length > radiusM) continue;
      if (distance + length < (distances.get(edge.to) ?? Infinity)) distances.set(edge.to, distance + length);
    }
  }
  const result: ApproachSegment[] = [];
  const seen = new Set<string>();
  for (const [node, distance] of distances) {
    for (const edge of graph.get(node) ?? []) {
      const length = lengthOf(edge.segment);
      if (seen.has(edge.segment.id) || length === undefined || distance + length > radiusM) continue;
      seen.add(edge.segment.id);
      result.push({ segmentId: edge.segment.id, distanceFromDoorM: distance, assessments: assess(profile, edge.segment) });
    }
  }
  result.sort((a, b) => a.distanceFromDoorM - b.distanceFromDoorM || a.segmentId.localeCompare(b.segmentId));
  const byNeed = {} as Record<Need, Fit>;
  for (const need of NEEDS) {
    const fits = result.flatMap(item => item.assessments.filter(a => a.need === need).map(a => a.fit));
    byNeed[need] = fits.length === 0 || fits.includes('Unknown') ? 'Unknown' :
      fits.includes('known-no') ? 'known-no' : 'known-yes';
  }
  return { placeId: place.id, radiusM, segments: result, byNeed };
}
