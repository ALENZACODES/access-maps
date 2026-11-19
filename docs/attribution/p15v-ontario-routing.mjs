/** Bounded offline path search on a complete validated Ontario snapshot. */
import { parseOntarioSnapshot, diagnostic, orderIssues } from './p15v-ontario-model.mjs';

const MAX_VISITS = 25000;
const MAX_QUEUED = 50000;
const MAX_ALTERNATIVES = 5;
const safeInteger = (value) => Number.isSafeInteger(value) && value >= 0;
const stable = (a, b) => a.localeCompare(b, 'en');
const summaries = Object.freeze({
  en: Object.freeze({
    found: 'Route available from the supplied offline snapshot.',
    conditional: 'Conditional route includes UNKNOWN access information.',
    absent: 'No supported route in the supplied offline snapshot.',
    invalid: 'The offline route request is incomplete.',
    blocked: 'The supplied route data is incomplete.',
    step: 'Route segment', unknown: 'Unknown access', no: 'Reported barrier',
  }),
  fr: Object.freeze({
    found: 'Parcours disponible selon les données hors ligne fournies.',
    conditional: 'Le parcours conditionnel contient des renseignements d’accès UNKNOWN.',
    absent: 'Aucun parcours soutenu par les données hors ligne fournies.',
    invalid: 'La demande de parcours hors ligne est incomplète.',
    blocked: 'Les données de parcours fournies sont incomplètes.',
    step: 'Segment du parcours', unknown: 'Accès inconnu', no: 'Obstacle signalé',
  }),
});

export function routeText(report, locale = 'en') {
  if (!Object.hasOwn(summaries, locale)) throw new TypeError('Locale must be en or fr');
  const words = summaries[locale];
  const line = words[report.status] ?? words.invalid;
  if (!report.routes?.length) return line + '\n';
  const details = report.routes.flatMap((route, index) => [
    `${index + 1}. ${route.metres} m`,
    ...route.segments.map((segment) =>
      `${words.step} ${segment.id}: ${segment.access === 'UNKNOWN' ? words.unknown :
        segment.access === 'NO' ? words.no : segment.name[locale]}`),
  ]);
  return [line, ...details].join('\n') + '\n';
}

function keyFor(path) {
  return path.join('|');
}
function indices(snapshot) {
  return {
    sources: new Map(snapshot.sources.map((item) => [item.id, item])),
    places: new Map(snapshot.places.map((item) => [item.id, item])),
    nodes: new Map(snapshot.nodes.map((item) => [item.id, item])),
    edges: new Map(snapshot.edges.map((item) => [item.id, item])),
  };
}

function requestValid(value, idx) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every((key) => ['start', 'end', 'silo', 'allowUnknown',
      'maximumMetres', 'maximumHops', 'alternatives', 'avoidFeatures'].includes(key)) &&
    typeof value.start === 'string' && idx.nodes.has(value.start) &&
    typeof value.end === 'string' && idx.nodes.has(value.end) &&
    value.start !== value.end && (value.silo === 'open' || value.silo === 'odbl') &&
    typeof value.allowUnknown === 'boolean' &&
    safeInteger(value.maximumMetres) && value.maximumMetres <= 1_000_000 &&
    safeInteger(value.maximumHops) && value.maximumHops >= 1 && value.maximumHops <= 1000 &&
    Number.isInteger(value.alternatives) && value.alternatives >= 1 &&
    value.alternatives <= MAX_ALTERNATIVES &&
    Array.isArray(value.avoidFeatures) && value.avoidFeatures.length <= 20 &&
    value.avoidFeatures.every((item) => typeof item === 'string') &&
    new Set(value.avoidFeatures).size === value.avoidFeatures.length;
}

function edgeAllowed(edge, from, to, request) {
  if (edge.silo !== request.silo || from.silo !== request.silo || to.silo !== request.silo) return false;
  if (request.avoidFeatures.includes(edge.feature) || request.avoidFeatures.includes(to.feature)) return false;
  if (edge.access === 'NO' || from.access === 'NO' || to.access === 'NO') return false;
  if (!request.allowUnknown && (edge.access !== 'YES' || from.access !== 'YES' || to.access !== 'YES')) return false;
  return true;
}

export function createAdjacency(snapshot, request) {
  const nodes = new Map(snapshot.nodes.map((node) => [node.id, node]));
  const graph = new Map(snapshot.nodes.map((node) => [node.id, []]));
  for (const edge of snapshot.edges) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to || !edgeAllowed(edge, from, to, request)) continue;
    graph.get(from.id).push(Object.freeze({ edge, from: from.id, to: to.id }));
    if (edge.direction === 'both') {
      graph.get(to.id).push(Object.freeze({ edge, from: to.id, to: from.id }));
    }
  }
  for (const rows of graph.values()) rows.sort((a, b) => stable(a.edge.id, b.edge.id) || stable(a.to, b.to));
  return graph;
}

function nextCandidate(queue) {
  queue.sort((a, b) => a.metres - b.metres || a.unknown - b.unknown ||
    stable(keyFor(a.edgeIds), keyFor(b.edgeIds)));
  return queue.shift();
}

function segmentInfo(row, nodes, sources) {
  const edge = row.edge;
  const end = nodes.get(row.to);
  const evidence = [...edge.evidence, ...end.evidence];
  const sourceIds = [...new Set([...edge.sourceIds, ...end.sourceIds])].sort(stable);
  return Object.freeze({
    id: edge.id,
    from: row.from,
    to: row.to,
    metres: edge.metres,
    name: Object.freeze({ ...edge.name }),
    access: edge.access === 'UNKNOWN' || end.access === 'UNKNOWN' ? 'UNKNOWN' : 'YES',
    tier: Math.min(edge.tier, end.tier),
    sourceIds: Object.freeze(sourceIds),
    evidence: Object.freeze(evidence.map((item) => Object.freeze({ ...item }))),
    sources: Object.freeze(sourceIds.map((id) => Object.freeze({ ...sources.get(id) }))),
  });
}

function createRoute(path, idx, rank) {
  const segments = path.rows.map((row) => segmentInfo(row, idx.nodes, idx.sources));
  const placeIds = [...new Set(path.nodeIds.map((id) => idx.nodes.get(id)?.placeId))]
    .filter((id) => typeof id === 'string');
  return Object.freeze({
    rank,
    metres: path.metres,
    unknownSegments: segments.filter((part) => part.access === 'UNKNOWN').length,
    nodeIds: Object.freeze([...path.nodeIds]),
    edgeIds: Object.freeze([...path.edgeIds]),
    placeIds: Object.freeze(placeIds),
    segments: Object.freeze(segments),
  });
}

/** Route without fabricated connectivity. A missing valid path remains absent. */
export function planOntarioRoutes(input, request) {
  const result = parseOntarioSnapshot(input);
  if (!result.ok) {
    return Object.freeze({ status: 'blocked', routes: Object.freeze([]), issues: result.issues });
  }
  const snapshot = result.snapshot;
  const idx = indices(snapshot);
  if (!requestValid(request, idx)) {
    return Object.freeze({ status: 'invalid', routes: Object.freeze([]),
      issues: orderIssues([diagnostic('ROOT', '$.request')]) });
  }
  const start = idx.nodes.get(request.start);
  const end = idx.nodes.get(request.end);
  if (start.silo !== request.silo || end.silo !== request.silo || start.access === 'NO' || end.access === 'NO' ||
      (!request.allowUnknown && (start.access !== 'YES' || end.access !== 'YES'))) {
    return Object.freeze({ status: 'absent', routes: Object.freeze([]), issues: Object.freeze([]) });
  }
  const graph = createAdjacency(snapshot, request);
  const queue = [{ nodeIds: [request.start], edgeIds: [], rows: [], metres: 0, unknown: 0 }];
  const discovered = [];
  const signatures = new Set();
  let visits = 0;
  let truncated = false;
  while (queue.length && discovered.length < request.alternatives && visits < MAX_VISITS) {
    const next = nextCandidate(queue);
    if (!next) break;
    visits++;
    const node = next.nodeIds.at(-1);
    if (node === request.end) {
      const signature = keyFor(next.edgeIds);
      if (!signatures.has(signature)) {
        signatures.add(signature);
        discovered.push(createRoute(next, idx, discovered.length + 1));
      }
      continue;
    }
    if (next.edgeIds.length >= request.maximumHops) continue;
    for (const row of graph.get(node) ?? []) {
      if (next.nodeIds.includes(row.to) || next.edgeIds.includes(row.edge.id)) continue;
      const metres = next.metres + row.edge.metres;
      if (metres > request.maximumMetres) continue;
      const unknown = next.unknown + Number(row.edge.access === 'UNKNOWN' ||
        idx.nodes.get(row.to)?.access === 'UNKNOWN');
      if (queue.length >= MAX_QUEUED) { truncated = true; break; }
      queue.push({
        nodeIds: [...next.nodeIds, row.to],
        edgeIds: [...next.edgeIds, row.edge.id],
        rows: [...next.rows, row],
        metres,
        unknown,
      });
    }
  }
  if (truncated || (visits >= MAX_VISITS && queue.length)) {
    return Object.freeze({ status: 'blocked', routes: Object.freeze([]),
      issues: orderIssues([diagnostic('LIMIT', '$.request.search')]) });
  }
  const conditional = discovered.some((route) => route.unknownSegments > 0 ||
    start.access === 'UNKNOWN');
  return Object.freeze({
    status: discovered.length === 0 ? 'absent' : conditional ? 'conditional' : 'found',
    routes: Object.freeze(discovered),
    issues: Object.freeze([]),
  });
}

/** Collect route citations without exposing an unsupported claim. */
export function routeProvenance(route) {
  const sourceIds = new Set();
  const observations = [];
  for (const part of route.segments) {
    for (const id of part.sourceIds) sourceIds.add(id);
    for (const entry of part.evidence) observations.push({ ...entry, segmentId: part.id });
  }
  observations.sort((a, b) => stable(a.segmentId, b.segmentId) ||
    stable(a.sourceId, b.sourceId) || stable(a.observedOn, b.observedOn));
  return Object.freeze({
    sourceIds: Object.freeze([...sourceIds].sort(stable)),
    observations: Object.freeze(observations),
  });
}

/** Reject routes that have become ungrounded in a newer local snapshot. */
export function compareRouteSupport(beforeRoute, nextSnapshot) {
  const idx = indices(nextSnapshot);
  const findings = [];
  for (const part of beforeRoute.segments) {
    const edge = idx.edges.get(part.id);
    if (!edge) { findings.push(diagnostic('REF', `edges.${part.id}`)); continue; }
    if (edge.from !== part.from &&
        !(edge.direction === 'both' && edge.to === part.from)) {
      findings.push(diagnostic('DIRECTION', `edges.${part.id}`));
    }
    if (edge.access === 'NO') findings.push(diagnostic('ASSERTION', `edges.${part.id}.access`));
    if (edge.tier < part.tier) findings.push(diagnostic('TIER', `edges.${part.id}.tier`));
    for (const sourceId of part.sourceIds) {
      if (!idx.sources.has(sourceId)) findings.push(diagnostic('REF', `sources.${sourceId}`));
    }
  }
  return Object.freeze({ supported: findings.length === 0, issues: orderIssues(findings) });
}
