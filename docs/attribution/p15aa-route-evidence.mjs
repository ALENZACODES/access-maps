/** Route-facing evidence assessments for already validated local records. */
import {
  accepted, blocked, dateDistance, diagnostic, independentSources,
  isDate, isId, isObject, isSilo, isTier, isUniqueIds, stableDigest,
} from './p15aa-contract.mjs';
import { parseEvidenceRegister, provenanceForFeature } from './p15aa-intake.mjs';

const REQUEST_KEYS = ['routeId', 'featureIds', 'silo', 'asOf', 'maximumAgeDays', 'minimumTier', 'allowUnknown'];
const ROUTE_LIMIT = 500;
const SORT = (a, b) => a.localeCompare(b, 'en');
const exact = (row, names) => isObject(row) && Object.keys(row).length === names.length &&
  names.every((name) => Object.hasOwn(row, name));

export function validateRouteEvidenceRequest(request, register) {
  if (!exact(request, REQUEST_KEYS) || !isId(request.routeId) ||
      !isUniqueIds(request.featureIds, ROUTE_LIMIT) || request.featureIds.length === 0 ||
      !isSilo(request.silo) || !isDate(request.asOf) ||
      !Number.isInteger(request.maximumAgeDays) || request.maximumAgeDays < 0 ||
      request.maximumAgeDays > 3650 || !isTier(request.minimumTier) ||
      typeof request.allowUnknown !== 'boolean') return false;
  if (dateDistance(register.asOf, request.asOf) < 0) return false;
  return true;
}

function selectObservations(feature, observationsById, sourcesById, request) {
  const selected = [];
  const expired = [];
  const future = [];
  for (const id of feature.observationIds) {
    const row = observationsById.get(id);
    if (!row) continue;
    const source = sourcesById.get(row.sourceId);
    if (!source) continue;
    const age = dateDistance(row.observedOn, request.asOf);
    const sourceAge = dateDistance(source.observedOn, request.asOf);
    if (age === null || sourceAge === null) continue;
    if (age < 0 || sourceAge < 0) {
      future.push(row);
      continue;
    }
    if (age > request.maximumAgeDays || sourceAge > request.maximumAgeDays) {
      expired.push(row);
      continue;
    }
    selected.push(row);
  }
  return { selected, expired, future };
}

export function assessFeatureAtTime(feature, register, request) {
  const observations = new Map(register.observations.map((row) => [row.id, row]));
  const sources = new Map(register.sources.map((row) => [row.id, row]));
  const { selected, expired, future } = selectObservations(feature, observations, sources, request);
  const yes = selected.filter((row) => row.access === 'YES');
  const no = selected.filter((row) => row.access === 'NO');
  const conflict = yes.length > 0 && no.length > 0;
  const highest = selected.reduce((tier, row) => Math.max(tier, row.tier), 0);
  const eligibleYes = yes.filter((row) => row.tier >= request.minimumTier);
  const eligibleNo = no.filter((row) => row.tier >= request.minimumTier);
  const groupsYes = independentSources(eligibleYes, sources);
  const groupsNo = independentSources(eligibleNo, sources);
  const evidenceAccess = conflict ? 'UNKNOWN' : eligibleNo.length ? 'NO' : eligibleYes.length ? 'YES' : 'UNKNOWN';
  let access = 'UNKNOWN';
  const reasons = [];
  if (feature.silo !== request.silo) reasons.push('SILO');
  if (conflict) reasons.push('CONFLICT');
  if (selected.length === 0) reasons.push('EMPTY');
  if (expired.length) reasons.push('AGE');
  if (future.length) reasons.push('FUTURE');
  if (highest < request.minimumTier) reasons.push('TIER');
  if (evidenceAccess !== 'UNKNOWN' && feature.access === evidenceAccess &&
      feature.silo === request.silo && !conflict && highest >= request.minimumTier) {
    const matched = evidenceAccess === 'YES' ? eligibleYes : eligibleNo;
    const independent = evidenceAccess === 'YES' ? groupsYes : groupsNo;
    if (request.minimumTier === 3 && independent < 2) reasons.push('INDEPENDENCE');
    else if (matched.length > 0) access = evidenceAccess;
  }
  if (access === 'UNKNOWN' && feature.access !== 'UNKNOWN' &&
      !reasons.includes('CONFLICT') && !reasons.includes('TIER')) reasons.push('UNKNOWN');
  if (feature.access === 'UNKNOWN' && access !== 'UNKNOWN') access = 'UNKNOWN';
  if (feature.tier < request.minimumTier) {
    access = 'UNKNOWN';
    if (!reasons.includes('TIER')) reasons.push('TIER');
  }
  const matching = selected.filter((row) => row.access === access);
  return Object.freeze({
    featureId: feature.id,
    featureKind: feature.kind,
    access,
    declaredAccess: feature.access,
    tier: access === 'UNKNOWN' ? 0 : Math.min(feature.tier, highest),
    requestedTier: request.minimumTier,
    silo: feature.silo,
    sourceIds: Object.freeze([...new Set(matching.map((row) => row.sourceId))].sort(SORT)),
    observationIds: Object.freeze(matching.map((row) => row.id).sort(SORT)),
    expiredIds: Object.freeze(expired.map((row) => row.id).sort(SORT)),
    futureIds: Object.freeze(future.map((row) => row.id).sort(SORT)),
    reasons: Object.freeze([...new Set(reasons)].sort(SORT)),
  });
}

/** Records with NO prevent a route; UNKNOWN is conditional only by explicit opt-in. */
export function assessRouteEvidence(input, request) {
  const result = parseEvidenceRegister(input);
  if (!result.ok) return blocked(result.issues);
  const register = result.value;
  if (!validateRouteEvidenceRequest(request, register)) {
    return blocked([diagnostic('ROUTE', '$.request')]);
  }
  const byId = new Map(register.features.map((row) => [row.id, row]));
  const issues = [];
  const parts = [];
  for (const id of request.featureIds) {
    const feature = byId.get(id);
    if (!feature) {
      issues.push(diagnostic('REFERENCE', `route.${request.routeId}.${id}`));
      continue;
    }
    if (feature.silo !== request.silo) {
      issues.push(diagnostic('SILO', `route.${request.routeId}.${id}`));
      continue;
    }
    parts.push(assessFeatureAtTime(feature, register, request));
  }
  if (issues.length) return blocked(issues);
  const no = parts.some((row) => row.access === 'NO');
  const unknown = parts.some((row) => row.access === 'UNKNOWN');
  const status = no ? 'blocked' : unknown ? (request.allowUnknown ? 'conditional' : 'absent') : 'available';
  const detailed = Object.freeze({
    routeId: request.routeId,
    status,
    access: no ? 'NO' : unknown ? 'UNKNOWN' : 'YES',
    asOf: request.asOf,
    minimumTier: request.minimumTier,
    silo: request.silo,
    sections: Object.freeze(parts),
    evidenceDigest: stableDigest(parts),
  });
  return accepted(detailed, {
    parts: parts.length,
    unknown: parts.filter((row) => row.access === 'UNKNOWN').length,
    barriers: parts.filter((row) => row.access === 'NO').length,
  });
}

export function compareRouteEvidence(previous, next) {
  if (!previous?.ok || !next?.ok) return blocked([diagnostic('ROOT', '$.routes')]);
  if (previous.value.routeId !== next.value.routeId ||
      previous.value.silo !== next.value.silo) return blocked([diagnostic('IDENTITY', '$.routes')]);
  const oldParts = new Map(previous.value.sections.map((row) => [row.featureId, row]));
  const newParts = new Map(next.value.sections.map((row) => [row.featureId, row]));
  const ids = [...new Set([...oldParts.keys(), ...newParts.keys()])].sort(SORT);
  const changes = [];
  for (const id of ids) {
    const oldPart = oldParts.get(id);
    const newPart = newParts.get(id);
    const kind = !oldPart ? 'added' : !newPart ? 'removed' :
      stableDigest(oldPart) === stableDigest(newPart) ? 'unchanged' : 'changed';
    changes.push(Object.freeze({ featureId: id, kind,
      before: oldPart?.access ?? 'UNKNOWN', after: newPart?.access ?? 'UNKNOWN',
      oldTier: oldPart?.tier ?? 0, nextTier: newPart?.tier ?? 0 }));
  }
  const statusChanged = previous.value.status !== next.value.status;
  const nextIsWorse = previous.value.status === 'available' && next.value.status !== 'available';
  const result = Object.freeze({
    routeId: next.value.routeId,
    before: previous.value.status,
    after: next.value.status,
    statusChanged,
    nextIsWorse,
    changes: Object.freeze(changes),
  });
  return accepted(result, { changed: changes.filter((row) => row.kind !== 'unchanged').length });
}

export function routeEvidenceText(result, locale = 'en') {
  if (locale !== 'en' && locale !== 'fr') throw new TypeError('Locale must be en or fr');
  if (!result.ok) return locale === 'fr' ? 'Contrôle bloqué\n' : 'Check blocked\n';
  const labels = locale === 'fr' ? {
    available: 'Parcours disponible selon les observations fournies.',
    conditional: 'Parcours conditionnel avec accès UNKNOWN.',
    absent: 'Aucun parcours soutenu par les observations fournies.',
    blocked: 'Un obstacle est signalé sur le parcours.',
    section: 'Section',
  } : {
    available: 'Route supported by supplied observations.',
    conditional: 'Conditional route with UNKNOWN access.',
    absent: 'No route supported by supplied observations.',
    blocked: 'A barrier is reported on the route.',
    section: 'Section',
  };
  return [labels[result.value.status], ...result.value.sections.map((part) =>
    `${labels.section} ${part.featureId}: ${part.access}`)].join('\n') + '\n';
}

export function provenanceForRoute(register, assessment) {
  if (!assessment.ok) return null;
  const seen = new Set(assessment.value.sections.flatMap((section) => section.sourceIds));
  return Object.freeze({
    routeId: assessment.value.routeId,
    sources: Object.freeze(register.sources.filter((source) => seen.has(source.id))),
    features: Object.freeze(assessment.value.sections.map((part) => provenanceForFeature(register, part.featureId))),
  });
}
