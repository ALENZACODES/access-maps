/** Time-aware route choices: base support and temporary evidence remain separate. */
import {
  ACCESS, bilingual, boundedDate, digest, exact, factEvidence, id, immutable,
  integer, issue, ordered, resultBlocked, resultOk, sourceIndex, uniqueStrings,
} from './p15z-common.mjs';
import { eventDecisions, eventTimeline, validateEventFeed } from './p15z-events.mjs';

const MAX_NODES = 20000;
const MAX_LINKS = 40000;
const MAX_QUEUE = 15000;
const MAX_EXPANSIONS = 20000;
const MAX_ALTERNATIVES = 6;
const MAX_HOPS = 60;

function nodeShape(value) {
  return exact(value, ['id', 'name', 'access', 'tier', 'sourceIds', 'evidence', 'silo']) &&
    id(value.id) && bilingual(value.name) && ACCESS.includes(value.access) &&
    integer(value.tier, 0, 3) && uniqueStrings(value.sourceIds, 100) &&
    Array.isArray(value.evidence) && value.evidence.length <= 100 &&
    ['open', 'odbl'].includes(value.silo);
}
function linkShape(value) {
  return exact(value, ['id', 'name', 'from', 'to', 'metres', 'access', 'tier', 'sourceIds',
    'evidence', 'silo', 'direction', 'gradient', 'kind']) &&
    id(value.id) && bilingual(value.name) && id(value.from) && id(value.to) &&
    value.from !== value.to && integer(value.metres, 1, 100000) &&
    ACCESS.includes(value.access) && integer(value.tier, 0, 3) &&
    uniqueStrings(value.sourceIds, 100) && Array.isArray(value.evidence) &&
    value.evidence.length <= 100 && ['open', 'odbl'].includes(value.silo) &&
    ['both', 'forward'].includes(value.direction) &&
    typeof value.gradient === 'number' && Number.isFinite(value.gradient) &&
    value.gradient >= 0 && value.gradient <= 100 &&
    ['path', 'crossing', 'ramp', 'lift', 'platform', 'door'].includes(value.kind);
}

export function validateRoutingNetwork(input) {
  const issues = [];
  const add = (code, path) => issues.push(issue(code, path));
  if (!exact(input, ['version', 'asOf', 'maxAgeDays', 'sources', 'nodes', 'links']) ||
    input.version !== 1 || !boundedDate(input.asOf, input.asOf, 0) ||
    !integer(input.maxAgeDays, 0, 3650) || !Array.isArray(input.sources) ||
    !Array.isArray(input.nodes) || !Array.isArray(input.links) ||
    input.sources.length > 4000 || input.nodes.length > MAX_NODES || input.links.length > MAX_LINKS) {
    return resultBlocked([issue('ROOT', '$')]);
  }
  const sources = sourceIndex(input.sources, input.asOf, input.maxAgeDays, add);
  const nodes = new Map();
  const links = new Map();
  input.nodes.forEach((value, index) => {
    const path = `nodes[${index}]`;
    if (!nodeShape(value)) { add('ROOT', path); return; }
    if (nodes.has(value.id)) add('DUPLICATE', `${path}.id`);
    factEvidence(value, sources, input.asOf, input.maxAgeDays, add, path);
    nodes.set(value.id, value);
  });
  input.links.forEach((value, index) => {
    const path = `links[${index}]`;
    if (!linkShape(value)) { add('ROOT', path); return; }
    if (links.has(value.id)) add('DUPLICATE', `${path}.id`);
    factEvidence(value, sources, input.asOf, input.maxAgeDays, add, path);
    if (!nodes.has(value.from) || !nodes.has(value.to)) add('REF', `${path}.nodes`);
    else if (nodes.get(value.from).silo !== value.silo || nodes.get(value.to).silo !== value.silo) {
      add('SILO', `${path}.nodes`);
    }
    links.set(value.id, value);
  });
  if (issues.length) return resultBlocked(issues);
  return resultOk({ version: 1, asOf: input.asOf, maxAgeDays: input.maxAgeDays,
    sources: [...sources.values()].sort((a, b) => a.id.localeCompare(b.id, 'en')),
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id, 'en')),
    links: [...links.values()].sort((a, b) => a.id.localeCompare(b.id, 'en')) });
}

function requestValid(request, nodes) {
  return exact(request, ['start', 'end', 'when', 'silo', 'allowUnknown', 'maximumMetres',
    'maximumHops', 'maximumGradient', 'alternatives', 'avoidKinds']) &&
    id(request.start) && id(request.end) && request.start !== request.end &&
    nodes.has(request.start) && nodes.has(request.end) &&
    typeof request.when === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(request.when) &&
    Number.isFinite(Date.parse(request.when)) &&
    ['open', 'odbl'].includes(request.silo) && typeof request.allowUnknown === 'boolean' &&
    integer(request.maximumMetres, 1, 1000000) && integer(request.maximumHops, 1, MAX_HOPS) &&
    integer(request.maximumGradient, 0, 100) && integer(request.alternatives, 1, MAX_ALTERNATIVES) &&
    Array.isArray(request.avoidKinds) && request.avoidKinds.length <= 20 &&
    request.avoidKinds.every(item => typeof item === 'string') &&
    new Set(request.avoidKinds).size === request.avoidKinds.length;
}

export function composeLinkStatus(link, from, to, overlay) {
  const statuses = [link.access, from.access, to.access];
  if (overlay) statuses.push(overlay.access);
  if (statuses.includes('NO')) return 'NO';
  if (statuses.includes('UNKNOWN')) return 'UNKNOWN';
  return 'YES';
}

function adjacency(network, overlays, request) {
  const nodes = new Map(network.nodes.map(node => [node.id, node]));
  const graph = new Map(network.nodes.map(node => [node.id, []]));
  for (const link of network.links) {
    const from = nodes.get(link.from);
    const to = nodes.get(link.to);
    const overlay = overlays.get(link.id);
    if (link.silo !== request.silo || from.silo !== request.silo ||
      to.silo !== request.silo || request.avoidKinds.includes(link.kind) ||
      link.gradient > request.maximumGradient) continue;
    const status = composeLinkStatus(link, from, to, overlay);
    if (status === 'NO' || (status === 'UNKNOWN' && !request.allowUnknown)) continue;
    graph.get(link.from).push({ link, from: link.from, to: link.to, status, overlay });
    if (link.direction === 'both') graph.get(link.to).push({ link, from: link.to, to: link.from, status, overlay });
  }
  for (const group of graph.values()) group.sort((a, b) => a.link.id.localeCompare(b.link.id, 'en') ||
    a.to.localeCompare(b.to, 'en'));
  return graph;
}
function priority(a, b) {
  return a.metres - b.metres || a.unknown - b.unknown ||
    a.linkIds.join('|').localeCompare(b.linkIds.join('|'), 'en');
}
function summarizePath(state, nodes) {
  const segments = state.steps.map(step => ({
    id: step.link.id,
    from: step.from,
    to: step.to,
    kind: step.link.kind,
    name: { ...step.link.name },
    metres: step.link.metres,
    gradient: step.link.gradient,
    access: step.status,
    tier: step.link.tier,
    sourceIds: ordered([...new Set([...step.link.sourceIds,
      ...nodes.get(step.from).sourceIds, ...nodes.get(step.to).sourceIds,
      ...(step.overlay?.sourceIds ?? [])])]),
    eventIds: step.overlay?.eventIds ?? [],
  }));
  return {
    metres: state.metres,
    unknownSegments: segments.filter(step => step.access === 'UNKNOWN').length,
    nodeIds: [...state.nodeIds],
    linkIds: [...state.linkIds],
    segments,
  };
}

/** Search does not assume that the absence of a feed means that a lift works. */
export function planTimeAwareRoutes(networkInput, feedInput, request) {
  const network = validateRoutingNetwork(networkInput);
  const feed = validateEventFeed(feedInput);
  if (!network.ok || !feed.ok) return resultBlocked([
    ...(!network.ok ? network.issues : []), ...(!feed.ok ? feed.issues : []),
  ]);
  const nodes = new Map(network.value.nodes.map(node => [node.id, node]));
  if (!requestValid(request, nodes)) return resultBlocked([issue('ROUTE', '$.request')]);
  const start = nodes.get(request.start);
  const end = nodes.get(request.end);
  if (start.silo !== request.silo || end.silo !== request.silo) {
    return resultBlocked([issue('SILO', '$.request.silo')]);
  }
  const overlayResult = eventDecisions(feedInput, request.when, request.silo);
  if (!overlayResult.ok) return overlayResult;
  const overlays = new Map(overlayResult.value.decisions.map(value => [value.segmentId, value]));
  const graph = adjacency(network.value, overlays, request);
  const queue = [{ nodeIds: [request.start], linkIds: [], steps: [], metres: 0, unknown: 0 }];
  const complete = [];
  const signatures = new Set();
  let expanded = 0;
  while (queue.length && complete.length < request.alternatives) {
    if (expanded >= MAX_EXPANSIONS || queue.length > MAX_QUEUE) {
      return resultBlocked([issue('BOUNDS', '$.request.search')]);
    }
    queue.sort(priority);
    const current = queue.shift();
    expanded++;
    const at = current.nodeIds.at(-1);
    if (at === request.end) {
      const signature = current.linkIds.join('|');
      if (!signatures.has(signature)) {
        signatures.add(signature);
        complete.push(summarizePath(current, nodes));
      }
      continue;
    }
    if (current.linkIds.length >= request.maximumHops) continue;
    for (const step of graph.get(at) ?? []) {
      if (current.nodeIds.includes(step.to) || current.linkIds.includes(step.link.id)) continue;
      const metres = current.metres + step.link.metres;
      if (metres > request.maximumMetres) continue;
      queue.push({
        nodeIds: [...current.nodeIds, step.to],
        linkIds: [...current.linkIds, step.link.id],
        steps: [...current.steps, step],
        metres,
        unknown: current.unknown + Number(step.status === 'UNKNOWN'),
      });
    }
  }
  const startUnknown = start.access === 'UNKNOWN' || end.access === 'UNKNOWN';
  const status = complete.length === 0 ? 'absent' :
    complete.some(route => route.unknownSegments > 0) || startUnknown ? 'conditional' : 'found';
  return resultOk({ status, when: request.when, silo: request.silo,
    routes: complete.map((route, index) => ({ ...route, rank: index + 1 })),
    expanded, eventCount: overlayResult.value.decisions.length });
}

/** Local segment report for a precise time. Never infers a clearing time. */
export function routeEventTimeline(networkInput, feedInput, route, startAt, endAt) {
  const network = validateRoutingNetwork(networkInput);
  const feed = validateEventFeed(feedInput);
  if (!network.ok || !feed.ok) return resultBlocked([
    ...(!network.ok ? network.issues : []), ...(!feed.ok ? feed.issues : []),
  ]);
  if (!route || !Array.isArray(route.segments) || route.segments.length > 200) {
    return resultBlocked([issue('ROUTE', '$.route')]);
  }
  const links = new Map(network.value.links.map(link => [link.id, link]));
  const windows = [];
  for (const segment of route.segments) {
    if (!id(segment.id) || !links.has(segment.id)) return resultBlocked([issue('REF', '$.route.segments')]);
    const entry = eventTimeline(feedInput, segment.id, links.get(segment.id).silo, startAt, endAt);
    if (!entry.ok) return entry;
    windows.push({ segmentId: segment.id, windows: entry.value.windows });
  }
  return resultOk({ startAt, endAt, segments: windows });
}

export function routeDecisionReceipt(result, locale = 'en') {
  if (!result?.ok || !['en', 'fr'].includes(locale)) return resultBlocked([issue('ROUTE', '$.result')]);
  const titles = {
    en: { found: 'Route supported', absent: 'No supported route', conditional: 'Conditional route includes UNKNOWN' },
    fr: { found: 'Parcours soutenu', absent: 'Aucun parcours soutenu', conditional: 'Le parcours conditionnel contient UNKNOWN' },
  };
  const title = titles[locale][result.value.status];
  const receipt = { title, when: result.value.when, silo: result.value.silo,
    status: result.value.status, routes: result.value.routes,
    expanded: result.value.expanded, eventCount: result.value.eventCount };
  return resultOk({ receipt, sha256: digest(receipt) });
}

export function routeSupportChanges(beforeResult, afterResult) {
  if (!beforeResult?.ok || !afterResult?.ok) return resultBlocked([issue('ROUTE', '$.comparison')]);
  const previous = new Map(beforeResult.value.routes.map(route => [route.linkIds.join('|'), route]));
  const next = new Map(afterResult.value.routes.map(route => [route.linkIds.join('|'), route]));
  const lost = [...previous.keys()].filter(key => !next.has(key)).sort();
  const gained = [...next.keys()].filter(key => !previous.has(key)).sort();
  const changed = [...previous.keys()].filter(key => next.has(key) &&
    digest(previous.get(key)) !== digest(next.get(key))).sort();
  return resultOk({ lost, gained, changed,
    beforeStatus: beforeResult.value.status, afterStatus: afterResult.value.status });
}
