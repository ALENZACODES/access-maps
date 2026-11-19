/** P15Y: deterministic, local Ontario multi-stop accessibility journey planning.
 * This module consumes the existing P15V snapshot parser and route planner.
 * No live network data or synthetic traversal times are introduced.
 */
import { parseOntarioSnapshot, diagnostic, orderIssues } from './p15v-ontario-model.mjs';
import { planOntarioRoutes, routeProvenance } from './p15v-ontario-routing.mjs';

const IDENT = /^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$/u;
const ALLOWED = new Set(['start', 'end', 'via', 'silo', 'allowUnknown', 'maximumMetres',
  'maximumHops', 'alternatives', 'avoidFeatures', 'maxCandidates', 'avoidNodes',
  'requiredFeatures', 'maxUnknownSegments']);
const CMP = (a, b) => a.localeCompare(b, 'en');
const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const validId = (v) => typeof v === 'string' && v.length <= 96 && IDENT.test(v);
const ids = (v, max) => Array.isArray(v) && v.length <= max && v.every(validId) &&
  new Set(v).size === v.length;
const nonnegative = (v, max) => Number.isSafeInteger(v) && v >= 0 && v <= max;
const output = (status, issues = [], journeys = [], summary = null) => Object.freeze({
  status, issues: orderIssues(issues), journeys: Object.freeze(journeys), summary,
});

export const WAYPOINT_LIMITS = Object.freeze({
  stops: 8, maxCandidates: 64, maximumMetres: 1000000,
  maximumHops: 1000, alternatives: 5, maxUnknownSegments: 10000,
});

/** A request contains only explicit, bounded requirements. */
export function inspectWaypointRequest(request, snapshot) {
  const issues = [];
  const add = (code, path) => issues.push(diagnostic(code, path));
  if (!record(request) || Object.keys(request).some((key) => !ALLOWED.has(key))) {
    add('ROOT', '$.request'); return { ok: false, issues: orderIssues(issues) };
  }
  if (!validId(request.start) || !validId(request.end) || request.start === request.end ||
      !ids(request.via, WAYPOINT_LIMITS.stops) || !ids(request.avoidNodes, 1000) ||
      !ids(request.requiredFeatures, 20) || !ids(request.avoidFeatures, 20)) {
    add('ROOT', '$.request.stops');
  }
  if (request.silo !== 'open' && request.silo !== 'odbl') add('SILO', '$.request.silo');
  if (typeof request.allowUnknown !== 'boolean') add('UNKNOWN', '$.request.allowUnknown');
  if (!nonnegative(request.maximumMetres, WAYPOINT_LIMITS.maximumMetres) ||
      !nonnegative(request.maximumHops, WAYPOINT_LIMITS.maximumHops) ||
      request.maximumHops === 0 || request.maximumMetres === 0) add('LIMIT', '$.request.bounds');
  if (!Number.isInteger(request.alternatives) || request.alternatives < 1 ||
      request.alternatives > WAYPOINT_LIMITS.alternatives ||
      !nonnegative(request.maxCandidates, WAYPOINT_LIMITS.maxCandidates) ||
      request.maxCandidates === 0 ||
      !nonnegative(request.maxUnknownSegments, WAYPOINT_LIMITS.maxUnknownSegments)) {
    add('LIMIT', '$.request.candidates');
  }
  if (issues.length) return { ok: false, issues: orderIssues(issues) };
  const sequence = [request.start, ...request.via, request.end];
  if (new Set(sequence).size !== sequence.length ||
      sequence.some((id) => request.avoidNodes.includes(id))) add('ROOT', '$.request.stops');
  const knownNodes = new Map(snapshot.nodes.map((node) => [node.id, node]));
  for (const [index, id] of sequence.entries()) {
    const node = knownNodes.get(id);
    if (!node) add('REF', `$.request.stops[${index}]`);
    else if (node.silo !== request.silo) add('SILO', `$.request.stops[${index}]`);
  }
  for (const name of request.requiredFeatures) {
    if (!snapshot.edges.some((edge) => edge.feature === name) &&
        !snapshot.nodes.some((node) => node.feature === name)) add('REF', `$.request.requiredFeatures.${name}`);
  }
  return { ok: issues.length === 0, issues: orderIssues(issues), sequence };
}

/** Merge citations from every segment and waypoint, excluding duplicate claims. */
export function gatherJourneyEvidence(legs) {
  const sources = new Map();
  const observations = new Map();
  for (const leg of legs) {
    const provenance = routeProvenance(leg);
    for (const segment of leg.segments) {
      for (const source of segment.sources) {
        if (source?.id) sources.set(source.id, { ...source });
      }
    }
    for (const item of provenance.observations) {
      const key = JSON.stringify([item.segmentId, item.sourceId, item.feature,
        item.access, item.observedOn, item.tier]);
      observations.set(key, { ...item });
    }
  }
  const ordered = [...observations.values()].sort((a, b) =>
    CMP(a.segmentId, b.segmentId) || CMP(a.sourceId, b.sourceId) ||
    CMP(a.observedOn, b.observedOn));
  return Object.freeze({
    sourceIds: Object.freeze([...sources.keys()].sort(CMP)),
    sources: Object.freeze([...sources.values()].sort((a, b) => CMP(a.id, b.id))),
    observations: Object.freeze(ordered),
  });
}

function connectLegs(parts, sequence, request) {
  const nodeIds = [sequence[0]];
  const edgeIds = [];
  const seenNodes = new Set([sequence[0]]);
  const sources = new Set();
  const places = new Set();
  let distance = 0;
  let unknown = 0;
  let minimumTier = 3;
  for (const leg of parts) {
    distance += leg.metres;
    unknown += leg.unknownSegments;
    for (const edge of leg.edgeIds) edgeIds.push(edge);
    for (const place of leg.placeIds) places.add(place);
    for (const segment of leg.segments) {
      minimumTier = Math.min(minimumTier, segment.tier);
      for (const source of segment.sourceIds) sources.add(source);
    }
    for (const node of leg.nodeIds.slice(1)) {
      if (seenNodes.has(node) && !sequence.includes(node)) return null;
      seenNodes.add(node);
      nodeIds.push(node);
    }
  }
  if (distance > request.maximumMetres || edgeIds.length > request.maximumHops ||
      unknown > request.maxUnknownSegments ||
      nodeIds.some((id) => request.avoidNodes.includes(id))) return null;
  return {
    distance, unknown, tier: minimumTier, edgeIds, nodeIds,
    sourceIds: [...sources].sort(CMP), placeIds: [...places].sort(CMP),
  };
}

/** Candidate generation deliberately limits combinations and memory. */
export function combineWaypointLegs(groups, sequence, request, snapshot) {
  const candidates = [];
  const signatures = new Set();
  let inspected = 0;
  const edges = new Map(snapshot.edges.map((edge) => [edge.id, edge]));
  function visit(index, chosen) {
    if (inspected >= request.maxCandidates) return;
    if (index === groups.length) {
      inspected++;
      const merged = connectLegs(chosen, sequence, request);
      if (!merged) return;
      const features = new Set(merged.edgeIds.map((id) => edges.get(id)?.feature));
      if (!request.requiredFeatures.every((item) => features.has(item))) return;
      const signature = merged.edgeIds.join('|');
      if (signatures.has(signature)) return;
      signatures.add(signature);
      const evidence = gatherJourneyEvidence(chosen);
      candidates.push(Object.freeze({
        ...merged, signature,
        status: merged.unknown > 0 ? 'UNKNOWN' : 'YES',
        stops: Object.freeze([...sequence]),
        legs: Object.freeze([...chosen]),
        evidence,
      }));
      return;
    }
    for (const leg of groups[index]) {
      if (inspected >= request.maxCandidates) break;
      chosen.push(leg);
      visit(index + 1, chosen);
      chosen.pop();
    }
  }
  visit(0, []);
  candidates.sort((a, b) => a.distance - b.distance || a.unknown - b.unknown ||
    CMP(a.signature, b.signature));
  return Object.freeze({
    candidates: Object.freeze(candidates.slice(0, request.alternatives).map((value, index) =>
      Object.freeze({ ...value, rank: index + 1 }))),
    inspected, truncated: inspected >= request.maxCandidates,
  });
}

/** Compose point-to-point P15V routes without inventing any missing connector. */
export function planWaypointJourney(input, request) {
  const parsed = parseOntarioSnapshot(input);
  if (!parsed.ok) return output('blocked', parsed.issues);
  const checked = inspectWaypointRequest(request, parsed.snapshot);
  if (!checked.ok) return output('invalid', checked.issues);
  const sequence = checked.sequence;
  const groups = [];
  for (let index = 0; index < sequence.length - 1; index++) {
    const legRequest = {
      start: sequence[index], end: sequence[index + 1],
      silo: request.silo, allowUnknown: request.allowUnknown,
      maximumMetres: request.maximumMetres, maximumHops: request.maximumHops,
      alternatives: request.alternatives, avoidFeatures: request.avoidFeatures,
    };
    const result = planOntarioRoutes(parsed.snapshot, legRequest);
    if (result.status === 'invalid' || result.status === 'blocked') {
      return output('blocked', result.issues);
    }
    if (result.routes.length === 0) {
      return output('absent', [], [], { missingLeg: index + 1, from: sequence[index], to: sequence[index + 1] });
    }
    groups.push(result.routes);
  }
  const combined = combineWaypointLegs(groups, sequence, request, parsed.snapshot);
  if (combined.truncated) return output('blocked', [diagnostic('LIMIT', '$.request.maxCandidates')]);
  if (combined.candidates.length === 0) return output('absent');
  const conditional = combined.candidates.some((route) => route.status === 'UNKNOWN') ||
    sequence.some((id) => parsed.snapshot.nodes.find((node) => node.id === id)?.access === 'UNKNOWN');
  return output(conditional ? 'conditional' : 'found', [], combined.candidates, Object.freeze({
    inspected: combined.inspected,
    returned: combined.candidates.length,
    stops: sequence.length,
    silo: request.silo,
  }));
}

/** Report an accessible route in concise bilingual text with no unsupported certainty. */
export function waypointJourneyText(report, locale = 'en') {
  if (locale !== 'en' && locale !== 'fr') throw new TypeError('Unsupported locale');
  const words = {
    en: { found: 'Routes from supplied offline data.', conditional: 'Routes contain UNKNOWN accessibility information.',
      absent: 'No supported connection in supplied offline data.', blocked: 'Offline route data blocked.',
      invalid: 'Route request is incomplete.', leg: 'Leg', distance: 'Distance', stop: 'Stop' },
    fr: { found: 'Parcours selon les données hors ligne fournies.', conditional: 'Les parcours contiennent des renseignements d’accès UNKNOWN.',
      absent: 'Aucune liaison soutenue par les données hors ligne fournies.', blocked: 'Données de parcours hors ligne bloquées.',
      invalid: 'La demande de parcours est incomplète.', leg: 'Étape', distance: 'Distance', stop: 'Arrêt' },
  }[locale];
  const lines = [words[report.status] ?? words.invalid];
  for (const journey of report.journeys ?? []) {
    lines.push(`${journey.rank}. ${words.distance}\u00a0: ${journey.distance} m`);
    for (const [index, leg] of journey.legs.entries()) {
      lines.push(`${words.leg} ${index + 1}\u00a0: ${leg.metres} m`);
      for (const node of [leg.nodeIds[0], leg.nodeIds.at(-1)]) {
        lines.push(`${words.stop} ${node}`);
      }
    }
  }
  return lines.join('\n') + '\n';
}
