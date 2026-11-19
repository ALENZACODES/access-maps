/** Compare two local Ontario snapshots and describe route-impact changes. */
import { parseOntarioSnapshot, diagnostic, orderIssues, dayNumber } from './p15v-ontario-model.mjs';
import { planOntarioRoutes, routeProvenance } from './p15v-ontario-routing.mjs';

const compare = (a, b) => a.localeCompare(b, 'en');
const stable = (value) => JSON.stringify(value);
const collectionNames = ['sources', 'places', 'nodes', 'edges', 'assets'];
const classification = Object.freeze({
  added: ['A new record is included.', 'Une nouvelle fiche est incluse.'],
  removed: ['A previously available record is missing.', 'Une fiche auparavant disponible est absente.'],
  source: ['The underlying source declaration changed.', 'La déclaration de source sous-jacente a changé.'],
  licence: ['The licence declaration changed.', 'La déclaration de licence a changé.'],
  silo: ['The export group changed.', 'Le groupe d’exportation a changé.'],
  access: ['The accessibility value changed.', 'L’état d’accès a changé.'],
  tier: ['The evidence level changed.', 'Le niveau des observations a changé.'],
  evidence: ['The dated observations changed.', 'Les observations datées ont changé.'],
  date: ['The observation date changed.', 'La date d’observation a changé.'],
  language: ['The bilingual description changed.', 'La description bilingue a changé.'],
  geometry: ['The local route geometry changed.', 'La géométrie du parcours local a changé.'],
  direction: ['The segment direction changed.', 'La direction du segment a changé.'],
  asset: ['An offline asset declaration changed.', 'La déclaration d’un fichier hors ligne a changé.'],
});

function event(type, collection, id, before, after) {
  const words = classification[type];
  return Object.freeze({
    type, collection, id,
    en: words[0], fr: words[1],
    before: before === undefined ? null : structuredClone(before),
    after: after === undefined ? null : structuredClone(after),
  });
}

function fieldChange(events, key, id, before, after, kind, get) {
  if (stable(get(before)) !== stable(get(after))) events.push(event(kind, key, id, get(before), get(after)));
}

function compareRecord(events, key, id, before, after) {
  if (key === 'sources') {
    fieldChange(events, key, id, before, after, 'source', (item) => [item.kind, item.reference]);
    fieldChange(events, key, id, before, after, 'licence', (item) => item.licence);
    fieldChange(events, key, id, before, after, 'silo', (item) => item.silo);
    fieldChange(events, key, id, before, after, 'date', (item) => item.observedOn);
    fieldChange(events, key, id, before, after, 'language', (item) => item.name);
    return;
  }
  if (key === 'assets') {
    fieldChange(events, key, id, before, after, 'asset', (item) =>
      [item.path, item.bytes, item.sha256, item.sourceIds]);
    fieldChange(events, key, id, before, after, 'silo', (item) => item.silo);
    return;
  }
  fieldChange(events, key, id, before, after, 'access', (item) => item.access);
  fieldChange(events, key, id, before, after, 'tier', (item) => item.tier);
  fieldChange(events, key, id, before, after, 'silo', (item) => item.silo);
  fieldChange(events, key, id, before, after, 'language', (item) => item.name);
  fieldChange(events, key, id, before, after, 'source', (item) => item.sourceIds);
  fieldChange(events, key, id, before, after, 'evidence', (item) => item.evidence);
  if (key === 'nodes') {
    fieldChange(events, key, id, before, after, 'geometry', (item) => [item.placeId, item.lat, item.lon]);
  }
  if (key === 'edges') {
    fieldChange(events, key, id, before, after, 'geometry', (item) => [item.from, item.to, item.metres]);
    fieldChange(events, key, id, before, after, 'direction', (item) => item.direction);
  }
  if (key === 'places') {
    fieldChange(events, key, id, before, after, 'geometry', (item) => item.nodeIds);
  }
}

function collectEvents(previous, current) {
  const events = [];
  for (const key of collectionNames) {
    const earlier = new Map(previous[key].map((item) => [item.id, item]));
    const later = new Map(current[key].map((item) => [item.id, item]));
    const ids = [...new Set([...earlier.keys(), ...later.keys()])].sort(compare);
    for (const id of ids) {
      const before = earlier.get(id);
      const after = later.get(id);
      if (!before) events.push(event('added', key, id, undefined, after));
      else if (!after) events.push(event('removed', key, id, before, undefined));
      else compareRecord(events, key, id, before, after);
    }
  }
  return Object.freeze(events.sort((a, b) => compare(a.collection, b.collection) ||
    compare(a.id, b.id) || compare(a.type, b.type)));
}

export function inspectOntarioDelta(before, after) {
  const previous = parseOntarioSnapshot(before);
  const next = parseOntarioSnapshot(after);
  const issues = [];
  if (!previous.ok) issues.push(...previous.issues.map((item) =>
    ({ ...item, path: `before.${item.path}` })));
  if (!next.ok) issues.push(...next.issues.map((item) =>
    ({ ...item, path: `after.${item.path}` })));
  if (issues.length) return Object.freeze({ ok: false, issues: orderIssues(issues), events: Object.freeze([]) });
  if (dayNumber(after.asOf) < dayNumber(before.asOf)) {
    return Object.freeze({ ok: false, issues: orderIssues([diagnostic('TIME', '$.after.asOf')]),
      events: Object.freeze([]) });
  }
  return Object.freeze({ ok: true, issues: Object.freeze([]),
    events: collectEvents(previous.snapshot, next.snapshot) });
}

export function impactOnRoute(before, after, request) {
  const delta = inspectOntarioDelta(before, after);
  if (!delta.ok) return Object.freeze({ ok: false, issues: delta.issues, impact: null });
  const oldPlan = planOntarioRoutes(before, request);
  const nextPlan = planOntarioRoutes(after, request);
  if (oldPlan.status === 'invalid' || oldPlan.status === 'blocked' ||
      nextPlan.status === 'invalid' || nextPlan.status === 'blocked') {
    return Object.freeze({ ok: false,
      issues: orderIssues([...oldPlan.issues, ...nextPlan.issues]), impact: null });
  }
  const previousRoutes = oldPlan.routes.map((route) => route.edgeIds.join('|'));
  const nextRoutes = nextPlan.routes.map((route) => route.edgeIds.join('|'));
  const previousSources = new Set(oldPlan.routes.flatMap((route) => routeProvenance(route).sourceIds));
  const nextSources = new Set(nextPlan.routes.flatMap((route) => routeProvenance(route).sourceIds));
  const relevantEdgeIds = new Set([...oldPlan.routes, ...nextPlan.routes].flatMap((route) => route.edgeIds));
  const relevantNodeIds = new Set([...oldPlan.routes, ...nextPlan.routes].flatMap((route) => route.nodeIds));
  const changes = delta.events.filter((item) =>
    (item.collection === 'edges' && relevantEdgeIds.has(item.id)) ||
    (item.collection === 'nodes' && relevantNodeIds.has(item.id)) ||
    (item.collection === 'sources' && (previousSources.has(item.id) || nextSources.has(item.id))));
  const routeChanged = JSON.stringify(previousRoutes) !== JSON.stringify(nextRoutes);
  const changedStatus = oldPlan.status !== nextPlan.status;
  const impact = Object.freeze({
    routeChanged,
    changedStatus,
    previousStatus: oldPlan.status,
    currentStatus: nextPlan.status,
    priorRouteCount: oldPlan.routes.length,
    currentRouteCount: nextPlan.routes.length,
    changes: Object.freeze(changes),
    oldRoutes: oldPlan.routes,
    newRoutes: nextPlan.routes,
  });
  return Object.freeze({ ok: true, issues: Object.freeze([]), impact });
}

export function deltaText(result, locale = 'en') {
  if (!['en', 'fr'].includes(locale)) throw new TypeError('Invalid locale');
  const heading = locale === 'en' ? (result.ok ? 'Offline change report' : 'Change report blocked') :
    (result.ok ? 'Rapport des changements hors ligne' : 'Rapport des changements bloqué');
  const entries = result.ok ? result.events.map((change) =>
    `${change.collection}.${change.id}: ${change[locale]}`) :
    result.issues.map((issue) => `${issue.code} ${issue.path}: ${issue[locale]}`);
  return [heading, ...entries].join('\n') + '\n';
}

export function sourceDateChanges(delta) {
  if (!delta.ok) return Object.freeze([]);
  return Object.freeze(delta.events.filter((item) => item.collection === 'sources' && item.type === 'date'));
}

export function licenceChanges(delta) {
  if (!delta.ok) return Object.freeze([]);
  return Object.freeze(delta.events.filter((item) => item.type === 'licence' || item.type === 'silo'));
}

export function potentiallyLostAccess(delta) {
  if (!delta.ok) return Object.freeze([]);
  return Object.freeze(delta.events.filter((item) => item.type === 'access' &&
    item.before === 'YES' && item.after !== 'YES'));
}

export function routeStatistics(plan) {
  if (!plan.routes.length) return Object.freeze({ count: 0, shortestMetres: null,
    longestMetres: null, unknownRouteCount: 0, sourceCount: 0 });
  const distances = plan.routes.map((route) => route.metres);
  const sources = new Set(plan.routes.flatMap((route) => routeProvenance(route).sourceIds));
  return Object.freeze({
    count: plan.routes.length,
    shortestMetres: Math.min(...distances),
    longestMetres: Math.max(...distances),
    unknownRouteCount: plan.routes.filter((route) => route.unknownSegments > 0).length,
    sourceCount: sources.size,
  });
}
