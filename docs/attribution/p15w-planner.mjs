/** Local-only routing over an audited Ontario network. No network calls. */
import { distance, bounds, pathLength } from './p15w-geometry.mjs';
import { auditNetwork, identifier, SILOS } from './p15w-network.mjs';

export const DEFAULT_PROFILE = Object.freeze({
  mobility: 'wheelchair',
  allowUnknown: false,
  allowStairs: false,
  maximumGradePercent: 8,
  maximumDistanceMetres: 5000,
  maximumLegs: 150,
  unknownPenaltyMetres: 1000,
  transferPenaltyMetres: 25,
  avoidEdgeIds: [],
  avoidNodeIds: [],
});

const PROFILES = new Set(['wheelchair', 'walker', 'walking']);
const SETTINGS = Object.keys(DEFAULT_PROFILE);

export function profile(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !SETTINGS.includes(key))) return null;
  const settings = { ...DEFAULT_PROFILE, ...input };
  if (!PROFILES.has(settings.mobility) || typeof settings.allowUnknown !== 'boolean' ||
      typeof settings.allowStairs !== 'boolean' ||
      !Number.isFinite(settings.maximumGradePercent) || settings.maximumGradePercent < 0 ||
      settings.maximumGradePercent > 50 || !Number.isFinite(settings.maximumDistanceMetres) ||
      settings.maximumDistanceMetres < 1 || settings.maximumDistanceMetres > 200000 ||
      !Number.isSafeInteger(settings.maximumLegs) || settings.maximumLegs < 1 ||
      settings.maximumLegs > 1000 || !Number.isFinite(settings.unknownPenaltyMetres) ||
      settings.unknownPenaltyMetres < 0 || settings.unknownPenaltyMetres > 100000 ||
      !Number.isFinite(settings.transferPenaltyMetres) || settings.transferPenaltyMetres < 0 ||
      settings.transferPenaltyMetres > 10000 ||
      !Array.isArray(settings.avoidEdgeIds) || !Array.isArray(settings.avoidNodeIds) ||
      settings.avoidEdgeIds.length > 5000 || settings.avoidNodeIds.length > 5000 ||
      !settings.avoidEdgeIds.every(identifier) || !settings.avoidNodeIds.every(identifier) ||
      new Set(settings.avoidEdgeIds).size !== settings.avoidEdgeIds.length ||
      new Set(settings.avoidNodeIds).size !== settings.avoidNodeIds.length) return null;
  return Object.freeze({ ...settings, avoidEdgeIds: [...settings.avoidEdgeIds],
    avoidNodeIds: [...settings.avoidNodeIds] });
}

function arc(edge, origin, destination, reversed = false) {
  return Object.freeze({ edgeId: edge.id, from: origin, to: destination,
    lengthMetres: edge.lengthMetres, access: edge.access, kind: edge.kind,
    reversed, silo: edge.silo, tier: edge.tier, sourceIds: edge.sourceIds });
}

export function adjacency(network, silo) {
  if (!network || !(network.nodes instanceof Map) || !(network.edges instanceof Map) ||
      !SILOS.includes(silo)) return null;
  const graph = new Map();
  for (const node of network.nodes.values()) {
    if (node.silo === silo) graph.set(node.id, []);
  }
  for (const edge of network.edges.values()) {
    if (edge.silo !== silo || !graph.has(edge.from) || !graph.has(edge.to)) continue;
    graph.get(edge.from).push(arc(edge, edge.from, edge.to));
    if (edge.bidirectional) graph.get(edge.to).push(arc(edge, edge.to, edge.from, true));
  }
  for (const options of graph.values()) options.sort((a, b) => a.edgeId.localeCompare(b.edgeId) ||
    a.to.localeCompare(b.to));
  return graph;
}

export function edgeDecision(edge, fromNode, toNode, settings) {
  if (!edge || !fromNode || !toNode || !settings) return { allowed: false, code: 'MISSING' };
  if (settings.avoidEdgeIds.includes(edge.id) || settings.avoidNodeIds.includes(fromNode.id) ||
      settings.avoidNodeIds.includes(toNode.id)) return { allowed: false, code: 'AVOIDED' };
  if (edge.access === 'NO' || fromNode.access === 'NO' || toNode.access === 'NO') {
    return { allowed: false, code: 'BARRIER' };
  }
  const unknown = edge.access === 'UNKNOWN' || fromNode.access === 'UNKNOWN' || toNode.access === 'UNKNOWN';
  if (unknown && !settings.allowUnknown) return { allowed: false, code: 'UNKNOWN' };
  if (settings.mobility !== 'walking' && edge.kind === 'stair' && !settings.allowStairs) {
    return { allowed: false, code: 'STAIRS' };
  }
  if (settings.mobility === 'wheelchair' && edge.gradientPercent > settings.maximumGradePercent) {
    return { allowed: false, code: 'GRADE' };
  }
  if (edge.silo !== fromNode.silo || edge.silo !== toNode.silo) {
    return { allowed: false, code: 'SILO' };
  }
  const surcharge = (unknown ? settings.unknownPenaltyMetres : 0) +
    (edge.kind === 'transfer' ? settings.transferPenaltyMetres : 0);
  return Object.freeze({ allowed: true, code: unknown ? 'UNKNOWN' : 'KNOWN',
    penaltyMetres: surcharge, unknown });
}

class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(entry) {
    const a = this.items;
    a.push(entry);
    let i = a.length - 1;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (compareState(a[parent], a[i]) <= 0) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop() {
    const a = this.items;
    if (!a.length) return null;
    const first = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      while (true) {
        const left = i * 2 + 1;
        const right = left + 1;
        let best = i;
        if (left < a.length && compareState(a[left], a[best]) < 0) best = left;
        if (right < a.length && compareState(a[right], a[best]) < 0) best = right;
        if (best === i) break;
        [a[best], a[i]] = [a[i], a[best]];
        i = best;
      }
    }
    return first;
  }
}

function compareState(a, b) {
  return a.cost - b.cost || a.unknownCount - b.unknownCount ||
    a.distance - b.distance || a.legs - b.legs || a.node.localeCompare(b.node) ||
    a.signature.localeCompare(b.signature);
}

function key(state) {
  return `${state.node}/${state.legs}`;
}

function buildRoute(destination, all, network, settings, silo) {
  const edges = [];
  const nodeIds = [destination.node];
  let cursor = destination;
  while (cursor.previous !== null) {
    edges.push(cursor.via);
    cursor = all.get(cursor.previous);
    if (!cursor) return null;
    nodeIds.push(cursor.node);
  }
  edges.reverse();
  nodeIds.reverse();
  const unknownIds = [];
  const sourceIds = new Set();
  const coordinates = [];
  for (const id of nodeIds) {
    const node = network.nodes.get(id);
    if (!node) return null;
    coordinates.push(node.coordinate);
    for (const sourceId of node.sourceIds) sourceIds.add(sourceId);
    if (node.access === 'UNKNOWN') unknownIds.push(`node:${node.id}`);
  }
  const routeEdges = edges.map(arcValue => {
    const edge = network.edges.get(arcValue.edgeId);
    if (!edge) return null;
    for (const sourceId of edge.sourceIds) sourceIds.add(sourceId);
    if (edge.access === 'UNKNOWN') unknownIds.push(`edge:${edge.id}`);
    return Object.freeze({ id: edge.id, from: arcValue.from, to: arcValue.to,
      lengthMetres: edge.lengthMetres, kind: edge.kind, access: edge.access,
      tier: edge.tier, gradientPercent: edge.gradientPercent, reversed: arcValue.reversed,
      sourceIds: [...edge.sourceIds] });
  });
  if (routeEdges.some(x => x === null)) return null;
  const status = unknownIds.length ? 'UNKNOWN' : 'YES';
  return Object.freeze({ status, silo, origin: nodeIds[0], destination: nodeIds.at(-1),
    nodeIds, legs: routeEdges, legCount: routeEdges.length,
    distanceMetres: destination.distance, weightedCost: destination.cost,
    unknownIds: [...new Set(unknownIds)].sort(), sourceIds: [...sourceIds].sort(),
    bounds: bounds(coordinates), profile: settings.mobility });
}

/** Search accepts a fully audited network and never infers YES from missing information. */
export function findRoute(network, origin, destination, settingsInput = {}, silo = 'open') {
  const settings = profile(settingsInput);
  if (!settings) return { ok: false, code: 'PROFILE', route: null, examined: 0 };
  if (!network || !(network.nodes instanceof Map) || !(network.edges instanceof Map) ||
      !identifier(origin) || !identifier(destination) || !SILOS.includes(silo)) {
    return { ok: false, code: 'INPUT', route: null, examined: 0 };
  }
  const from = network.nodes.get(origin);
  const to = network.nodes.get(destination);
  if (!from || !to || from.silo !== silo || to.silo !== silo) {
    return { ok: false, code: 'ENDPOINT', route: null, examined: 0 };
  }
  if (settings.avoidNodeIds.includes(origin) || settings.avoidNodeIds.includes(destination) ||
      from.access === 'NO' || to.access === 'NO') {
    return { ok: false, code: 'BARRIER', route: null, examined: 0 };
  }
  if (!settings.allowUnknown && (from.access === 'UNKNOWN' || to.access === 'UNKNOWN')) {
    return { ok: false, code: 'UNKNOWN', route: null, examined: 0 };
  }
  const graph = adjacency(network, silo);
  if (!graph) return { ok: false, code: 'GRAPH', route: null, examined: 0 };
  const initial = Object.freeze({ node: origin, cost: 0, distance: 0, legs: 0,
    unknownCount: from.access === 'UNKNOWN' ? 1 : 0, signature: '', previous: null, via: null });
  const frontier = new MinHeap();
  const all = new Map([[key(initial), initial]]);
  frontier.push(initial);
  let examined = 0;
  while (frontier.size && examined < 200000) {
    const current = frontier.pop();
    if (all.get(key(current)) !== current) continue;
    examined++;
    if (current.node === destination) {
      return { ok: true, code: 'ROUTE', route: buildRoute(current, all, network, settings, silo), examined };
    }
    if (current.legs >= settings.maximumLegs) continue;
    for (const arcValue of graph.get(current.node) ?? []) {
      const edge = network.edges.get(arcValue.edgeId);
      const nextNode = network.nodes.get(arcValue.to);
      const decision = edgeDecision(edge, network.nodes.get(current.node), nextNode, settings);
      if (!decision.allowed) continue;
      const travelled = current.distance + edge.lengthMetres;
      if (travelled > settings.maximumDistanceMetres) continue;
      const candidate = Object.freeze({ node: arcValue.to,
        cost: current.cost + edge.lengthMetres + decision.penaltyMetres,
        distance: travelled, legs: current.legs + 1,
        unknownCount: current.unknownCount + Number(decision.unknown),
        signature: `${current.signature}/${edge.id}`, previous: key(current), via: arcValue });
      const old = all.get(key(candidate));
      if (!old || compareState(candidate, old) < 0) {
        all.set(key(candidate), candidate);
        frontier.push(candidate);
      }
    }
  }
  return { ok: false, code: examined >= 200000 ? 'SEARCH_LIMIT' : 'NO_ROUTE', route: null, examined };
}

export function findAlternatives(network, origin, destination, options = {}, silo = 'open', count = 3) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 10) {
    return { ok: false, code: 'COUNT', routes: [] };
  }
  const first = findRoute(network, origin, destination, options, silo);
  if (!first.ok || !first.route) return { ok: false, code: first.code, routes: [] };
  const routes = [first.route];
  const signatures = new Set([first.route.legs.map(x => x.id).join('|')]);
  const exclusions = new Set();
  const settings = profile(options);
  while (routes.length < count) {
    let best = null;
    let bestSig = null;
    for (const route of routes) {
      for (const leg of route.legs) {
        if (exclusions.has(leg.id)) continue;
        const candidate = findRoute(network, origin, destination,
          { ...settings, avoidEdgeIds: [...new Set([...settings.avoidEdgeIds, leg.id])] }, silo);
        if (!candidate.ok || !candidate.route) continue;
        const sig = candidate.route.legs.map(x => x.id).join('|');
        if (signatures.has(sig)) continue;
        if (!best || candidate.route.weightedCost < best.weightedCost ||
            (candidate.route.weightedCost === best.weightedCost && sig < bestSig)) {
          best = candidate.route;
          bestSig = sig;
        }
      }
    }
    if (!best) break;
    signatures.add(bestSig);
    routes.push(best);
    for (const leg of routes[0].legs) {
      if (routes.every(route => route.legs.some(x => x.id === leg.id))) exclusions.add(leg.id);
    }
  }
  return { ok: true, code: 'ROUTES', routes };
}

export function routeEvidence(network, route) {
  if (!network || !route || !Array.isArray(route.sourceIds)) return null;
  const sources = [];
  for (const id of route.sourceIds) {
    const item = network.sources.get(id);
    if (!item) return null;
    sources.push(Object.freeze({ id, licence: item.licence, observedOn: item.observedOn,
      reference: item.reference, en: item.en, fr: item.fr }));
  }
  return Object.freeze({ status: route.status, silo: route.silo, sources,
    unknownIds: [...route.unknownIds], distanceMetres: route.distanceMetres });
}

export function nearbyNodes(network, coordinate, limitMetres, silo = 'open', maximum = 10) {
  if (!network || !(network.nodes instanceof Map) || !Number.isFinite(limitMetres) ||
      limitMetres <= 0 || limitMetres > 100000 || !SILOS.includes(silo) ||
      !Number.isSafeInteger(maximum) || maximum < 1 || maximum > 100) return null;
  const matches = [];
  for (const item of network.nodes.values()) {
    if (item.silo !== silo) continue;
    const metres = distance(coordinate, item.coordinate);
    if (metres !== null && metres <= limitMetres) matches.push({ id: item.id,
      access: item.access, distanceMetres: metres, tier: item.tier });
  }
  return matches.sort((a, b) => a.distanceMetres - b.distanceMetres ||
    a.id.localeCompare(b.id)).slice(0, maximum);
}

export function routeGeometry(network, route) {
  if (!route || !Array.isArray(route.legs) || !route.legs.length) return null;
  const points = [];
  for (const [index, part] of route.legs.entries()) {
    const edge = network.edges.get(part.id);
    if (!edge) return null;
    const geometry = part.reversed ? [...edge.geometry].reverse() : edge.geometry;
    points.push(...(index ? geometry.slice(1) : geometry));
  }
  if (points.length < 2 || pathLength(points) === null) return null;
  return Object.freeze(points);
}

export function routeFromInput(snapshot, origin, destination, options = {}, silo = 'open') {
  const inspected = auditNetwork(snapshot);
  if (!inspected.ok) return { ok: false, code: 'AUDIT', findings: inspected.findings, route: null };
  const response = findRoute(inspected.network, origin, destination, options, silo);
  return { ...response, findings: [] };
}
