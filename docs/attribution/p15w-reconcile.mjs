/** Snapshot comparison and route impact analysis; all findings are local. */
import { auditNetwork, calendarDay } from './p15w-network.mjs';
import { findRoute, routeEvidence, profile } from './p15w-planner.mjs';

const COPY = Object.freeze({
  INVALID: ['One or both routing snapshots are incomplete.', 'Un ou plusieurs jeux de parcours sont incomplets.'],
  CLOCK: ['The newer snapshot has an earlier date.', 'Le nouveau jeu porte une date antérieure.'],
  SOURCE_REMOVED: ['A cited source is no longer present.', 'Une source citée n’est plus présente.'],
  SOURCE_CHANGED: ['A source identifier refers to changed attribution.', 'Un identifiant de source renvoie à une attribution modifiée.'],
  SOURCE_OLDER: ['A source observation moved backwards in time.', 'Une observation de source a reculé dans le temps.'],
  NODE_REMOVED: ['A location no longer appears in the route graph.', 'Un lieu n’apparaît plus dans le graphe de parcours.'],
  NODE_MOVED: ['A location coordinate changed.', 'La position d’un lieu a changé.'],
  NODE_ACCESS: ['The reported access of a location changed.', 'L’état d’accès déclaré d’un lieu a changé.'],
  EDGE_REMOVED: ['A connection is missing in the newer graph.', 'Une liaison manque dans le nouveau graphe.'],
  EDGE_CHANGED: ['A connection geometry or length changed.', 'La géométrie ou la longueur d’une liaison a changé.'],
  EDGE_ACCESS: ['The access state of a connection changed.', 'L’état d’accès d’une liaison a changé.'],
  EVIDENCE_REMOVED: ['An earlier observation is no longer attached.', 'Une observation antérieure n’est plus associée.'],
  EVIDENCE_CHANGED: ['An observation chain changed.', 'Une chaîne d’observations a changé.'],
  SILO_CHANGED: ['A record moved between licence export groups.', 'Une fiche a changé de groupe d’exportation de licence.'],
  TIER_LOWERED: ['The confidence tier decreased.', 'Le niveau de confiance a diminué.'],
  TRANSLATION_CHANGED: ['Bilingual labels changed.', 'Les libellés bilingues ont changé.'],
  ASSET_REMOVED: ['An offline asset is no longer present.', 'Un fichier hors ligne n’est plus présent.'],
  ASSET_CHANGED: ['An offline asset digest, size, or path changed.', 'L’empreinte, la taille ou le chemin d’un fichier hors ligne a changé.'],
  ROUTE_LOST: ['A previously usable route is no longer available.', 'Un parcours auparavant utilisable n’est plus disponible.'],
  ROUTE_GAINED: ['A previously unavailable route is now available.', 'Un parcours auparavant indisponible est désormais proposé.'],
  ROUTE_UNKNOWN: ['The route now depends on UNKNOWN evidence.', 'Le parcours dépend désormais de preuves UNKNOWN.'],
  ROUTE_LONGER: ['The available route became longer.', 'Le parcours disponible est devenu plus long.'],
  ROUTE_SHORTER: ['The available route became shorter.', 'Le parcours disponible est devenu plus court.'],
  ROUTE_REPLACED: ['The route uses different connections.', 'Le parcours utilise d’autres liaisons.'],
});

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function observationIdentity(item) {
  return stable({ sourceId: item.sourceId, observedOn: item.observedOn,
    access: item.access, tier: item.tier, feature: item.feature });
}

export function comparisonEntry(code, path, detail = null) {
  const labels = COPY[code];
  if (!labels) return null;
  const [en, fr] = labels;
  return Object.freeze({ code, path, en, fr, detail });
}

export function compareSources(previous, next) {
  const changes = [];
  for (const [id, old] of previous.sources) {
    const now = next.sources.get(id);
    if (!now) { changes.push(comparisonEntry('SOURCE_REMOVED', `$.sources.${id}`)); continue; }
    if (old.name !== now.name || old.licence !== now.licence || old.reference !== now.reference) {
      changes.push(comparisonEntry('SOURCE_CHANGED', `$.sources.${id}`));
    }
    if (calendarDay(now.observedOn) < calendarDay(old.observedOn)) {
      changes.push(comparisonEntry('SOURCE_OLDER', `$.sources.${id}.observedOn`));
    }
    if (old.en !== now.en || old.fr !== now.fr) {
      changes.push(comparisonEntry('TRANSLATION_CHANGED', `$.sources.${id}`));
    }
  }
  return changes;
}

function compareEvidence(previous, next, kind, id) {
  const changes = [];
  const old = new Set(previous.evidence.map(observationIdentity));
  const now = new Set(next.evidence.map(observationIdentity));
  if ([...old].some(key => !now.has(key))) {
    changes.push(comparisonEntry('EVIDENCE_REMOVED', `$.${kind}.${id}.evidence`));
  }
  if ([...now].some(key => !old.has(key))) {
    changes.push(comparisonEntry('EVIDENCE_CHANGED', `$.${kind}.${id}.evidence`));
  }
  return changes;
}

export function compareNodes(previous, next) {
  const changes = [];
  for (const [id, old] of previous.nodes) {
    const now = next.nodes.get(id);
    if (!now) { changes.push(comparisonEntry('NODE_REMOVED', `$.nodes.${id}`)); continue; }
    if (old.coordinate.lat !== now.coordinate.lat || old.coordinate.lon !== now.coordinate.lon) {
      changes.push(comparisonEntry('NODE_MOVED', `$.nodes.${id}.coordinate`));
    }
    if (old.access !== now.access) changes.push(comparisonEntry('NODE_ACCESS', `$.nodes.${id}.access`));
    if (old.tier > now.tier) changes.push(comparisonEntry('TIER_LOWERED', `$.nodes.${id}.tier`));
    if (old.silo !== now.silo) changes.push(comparisonEntry('SILO_CHANGED', `$.nodes.${id}.silo`));
    if (old.en !== now.en || old.fr !== now.fr) {
      changes.push(comparisonEntry('TRANSLATION_CHANGED', `$.nodes.${id}`));
    }
    changes.push(...compareEvidence(old, now, 'nodes', id));
  }
  return changes;
}

export function compareEdges(previous, next) {
  const changes = [];
  for (const [id, old] of previous.edges) {
    const now = next.edges.get(id);
    if (!now) { changes.push(comparisonEntry('EDGE_REMOVED', `$.edges.${id}`)); continue; }
    if (old.from !== now.from || old.to !== now.to || old.lengthMetres !== now.lengthMetres ||
        stable(old.geometry) !== stable(now.geometry) || old.bidirectional !== now.bidirectional) {
      changes.push(comparisonEntry('EDGE_CHANGED', `$.edges.${id}`));
    }
    if (old.access !== now.access) changes.push(comparisonEntry('EDGE_ACCESS', `$.edges.${id}.access`));
    if (old.tier > now.tier) changes.push(comparisonEntry('TIER_LOWERED', `$.edges.${id}.tier`));
    if (old.silo !== now.silo) changes.push(comparisonEntry('SILO_CHANGED', `$.edges.${id}.silo`));
    if (old.en !== now.en || old.fr !== now.fr) {
      changes.push(comparisonEntry('TRANSLATION_CHANGED', `$.edges.${id}`));
    }
    changes.push(...compareEvidence(old, now, 'edges', id));
  }
  return changes;
}

export function compareAssets(previous, next) {
  const changes = [];
  for (const [id, old] of previous.assets) {
    const now = next.assets.get(id);
    if (!now) { changes.push(comparisonEntry('ASSET_REMOVED', `$.assets.${id}`)); continue; }
    if (old.path !== now.path || old.bytes !== now.bytes || old.sha256 !== now.sha256) {
      changes.push(comparisonEntry('ASSET_CHANGED', `$.assets.${id}`));
    }
    if (old.silo !== now.silo) changes.push(comparisonEntry('SILO_CHANGED', `$.assets.${id}.silo`));
    if (old.en !== now.en || old.fr !== now.fr) {
      changes.push(comparisonEntry('TRANSLATION_CHANGED', `$.assets.${id}`));
    }
  }
  return changes;
}

function sortChanges(values) {
  return values.sort((a, b) => a.path.localeCompare(b.path, 'en') ||
    a.code.localeCompare(b.code, 'en'));
}

export function compareNetworks(before, after) {
  const oldAudit = auditNetwork(before);
  const newAudit = auditNetwork(after);
  if (!oldAudit.ok || !newAudit.ok) {
    return Object.freeze({ ok: false, code: 'INVALID', findings: [comparisonEntry('INVALID', '$')],
      changes: [], before: null, after: null });
  }
  const changes = [
    ...compareSources(oldAudit.network, newAudit.network),
    ...compareNodes(oldAudit.network, newAudit.network),
    ...compareEdges(oldAudit.network, newAudit.network),
    ...compareAssets(oldAudit.network, newAudit.network),
  ];
  if (calendarDay(after.asOf) < calendarDay(before.asOf)) {
    changes.push(comparisonEntry('CLOCK', '$.asOf'));
  }
  return Object.freeze({ ok: true, code: 'COMPARISON', findings: [],
    changes: sortChanges(changes), before: oldAudit.network, after: newAudit.network });
}

export function routeImpact(before, after, requests) {
  const compared = compareNetworks(before, after);
  if (!compared.ok || !Array.isArray(requests) || requests.length > 1000) {
    return Object.freeze({ ok: false, code: 'INPUT', changes: compared.changes, routes: [] });
  }
  const results = [];
  const changes = [...compared.changes];
  const seen = new Set();
  for (const [i, request] of requests.entries()) {
    if (!request || typeof request !== 'object' || Array.isArray(request) ||
        !['from', 'to', 'options', 'silo'].every(key => Object.hasOwn(request, key)) ||
        Object.keys(request).some(key => !['from', 'to', 'options', 'silo'].includes(key)) ||
        !profile(request.options)) {
      return Object.freeze({ ok: false, code: 'REQUEST', changes: [], routes: [] });
    }
    const requestKey = stable(request);
    if (seen.has(requestKey)) {
      return Object.freeze({ ok: false, code: 'DUPLICATE', changes: [], routes: [] });
    }
    seen.add(requestKey);
    const oldRoute = findRoute(compared.before, request.from, request.to, request.options, request.silo);
    const newRoute = findRoute(compared.after, request.from, request.to, request.options, request.silo);
    const prefix = `$.requests[${i}]`;
    if (oldRoute.ok && !newRoute.ok) changes.push(comparisonEntry('ROUTE_LOST', prefix));
    if (!oldRoute.ok && newRoute.ok) changes.push(comparisonEntry('ROUTE_GAINED', prefix));
    if (oldRoute.ok && newRoute.ok) {
      if (oldRoute.route.status !== 'UNKNOWN' && newRoute.route.status === 'UNKNOWN') {
        changes.push(comparisonEntry('ROUTE_UNKNOWN', prefix));
      }
      if (newRoute.route.distanceMetres > oldRoute.route.distanceMetres + 1) {
        changes.push(comparisonEntry('ROUTE_LONGER', prefix));
      }
      if (newRoute.route.distanceMetres + 1 < oldRoute.route.distanceMetres) {
        changes.push(comparisonEntry('ROUTE_SHORTER', prefix));
      }
      if (stable(newRoute.route.legs.map(x => x.id)) !== stable(oldRoute.route.legs.map(x => x.id))) {
        changes.push(comparisonEntry('ROUTE_REPLACED', prefix));
      }
    }
    results.push(Object.freeze({ request, before: oldRoute.ok ? routeEvidence(compared.before, oldRoute.route) : null,
      after: newRoute.ok ? routeEvidence(compared.after, newRoute.route) : null,
      beforeCode: oldRoute.code, afterCode: newRoute.code }));
  }
  return Object.freeze({ ok: true, code: 'IMPACT', changes: sortChanges(changes), routes: results });
}

export function impactText(report, locale = 'en') {
  if (!report || !['en', 'fr'].includes(locale) || !Array.isArray(report.changes)) return null;
  const title = locale === 'fr' ? 'Modifications du parcours' : 'Route changes';
  return [title, ...report.changes.map(change => `${change.code} ${change.path}: ${change[locale]}`)].join('\n') + '\n';
}
