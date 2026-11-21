/** Explain how a locally supplied plan or preference change affects an assessment. */
import type { JourneyPlan } from '@access-maps/journey';
import { compareRoutes, dateFromProvenance, normalizeProfile, type ComparisonResult,
  isOpenLicence, type NeedsProfile, type RequirementAssessment, type RequirementId, type RouteAssessment } from './routeNeeds.js';

export type ChangeKind = 'added' | 'removed' | 'changed' | 'unchanged';
export type Concern = 'barrier' | 'UNKNOWN' | 'source' | 'distance' | 'configuration';
export interface RouteDifference {
  routeId: string;
  kind: ChangeKind;
  beforeStatus: string;
  afterStatus: string;
  beforeDistance: number | null;
  afterDistance: number | null;
  changedRequirements: RequirementId[];
  affectedSources: string[];
  warnings: Concern[];
}
export interface ChangeReview {
  status: 'ok' | 'blocked';
  date: string;
  beforeRouteCount: number;
  afterRouteCount: number;
  changes: RouteDifference[];
  newBarriers: number;
  newUnknowns: number;
  removedRoutes: number;
  addedRoutes: number;
  summary: string;
}
export interface EvidenceInventoryRow {
  sourceId: string;
  licence: string;
  date: string;
  tier: number | null;
  routes: string[];
  directions: string[];
  requirements: RequirementId[];
}
export interface SourceInventory {
  status: 'complete' | 'UNKNOWN';
  sources: EvidenceInventoryRow[];
  missingCitations: number;
  unlicensed: number;
  unsupportedObservations: number;
  missingDates: number;
  totalObservations: number;
}
export interface PortableComparison {
  version: 1;
  reportDate: string;
  locale: 'en' | 'fr';
  status: 'complete' | 'UNKNOWN';
  profile: NeedsProfile;
  routes: Array<{
    routeId: string;
    status: RouteAssessment['status'];
    requirements: Array<{ id: RequirementId; result: RequirementAssessment['result']; sourceIds: string[] }>;
  }>;
  sourceInventory: SourceInventory;
}

const compare = (a: string, b: string) => a.localeCompare(b, 'en');
function routeMap(report: ComparisonResult): Map<string, RouteAssessment> {
  return new Map(report.routes.map((item) => [item.routeId, item]));
}
function requirementMap(route: RouteAssessment) {
  return new Map(route.requirements.map((item) => [item.id, item]));
}
function sourceIds(route: RouteAssessment): string[] {
  return [...new Set(route.requirements.flatMap((item) => item.observations.map((row) => row.sourceId)))].sort(compare);
}
function difference(before: RouteAssessment | undefined, after: RouteAssessment | undefined, id: string): RouteDifference {
  if (!before && !after) throw new Error('At least one route state is needed');
  const oldRows = before ? requirementMap(before) : new Map();
  const newRows = after ? requirementMap(after) : new Map();
  const keys = new Set<RequirementId>([...oldRows.keys(), ...newRows.keys()] as RequirementId[]);
  const changedRequirements = [...keys].filter((key) => {
    const old = oldRows.get(key);
    const current = newRows.get(key);
    return !old || !current || old.result !== current.result || old.priority !== current.priority ||
      old.limit !== current.limit || old.affectedLegIds.join('|') !== current.affectedLegIds.join('|');
  }).sort(compare);
  const oldSources = before ? sourceIds(before) : [];
  const currentSources = after ? sourceIds(after) : [];
  const affectedSources = [...new Set([...oldSources, ...currentSources])]
    .filter((source) => !oldSources.includes(source) || !currentSources.includes(source)).sort(compare);
  const warnings: Concern[] = [];
  if (after?.status === 'barrier' && before?.status !== 'barrier') warnings.push('barrier');
  if ((after?.status === 'UNKNOWN' && before?.status !== 'UNKNOWN') ||
      [...newRows.entries()].some(([id, row]) => row.result === 'UNKNOWN' && oldRows.get(id)?.result !== 'UNKNOWN')) {
    warnings.push('UNKNOWN');
  }
  if (affectedSources.length) warnings.push('source');
  if (before?.knownDistanceMetres !== after?.knownDistanceMetres) warnings.push('distance');
  if (changedRequirements.length) warnings.push('configuration');
  const kind: ChangeKind = !before ? 'added' : !after ? 'removed' :
    warnings.length || before.status !== after.status ? 'changed' : 'unchanged';
  return {
    routeId: id, kind,
    beforeStatus: before?.status ?? 'UNKNOWN',
    afterStatus: after?.status ?? 'UNKNOWN',
    beforeDistance: before?.knownDistanceMetres ?? null,
    afterDistance: after?.knownDistanceMetres ?? null,
    changedRequirements, affectedSources, warnings,
  };
}

export function compareNeedsSnapshots(before: JourneyPlan, after: JourneyPlan, untrustedProfile: unknown): ChangeReview {
  const profile = normalizeProfile(untrustedProfile);
  if (!profile) return { status: 'blocked', date: 'UNKNOWN', beforeRouteCount: 0, afterRouteCount: 0,
    changes: [], newBarriers: 0, newUnknowns: 0, removedRoutes: 0, addedRoutes: 0,
    summary: 'Preference settings are incomplete.' };
  const oldReport = compareRoutes(before, profile);
  const currentReport = compareRoutes(after, profile);
  if (!oldReport.ok || !currentReport.ok) return { status: 'blocked', date: profile.asOf,
    beforeRouteCount: 0, afterRouteCount: 0, changes: [], newBarriers: 0, newUnknowns: 0,
    removedRoutes: 0, addedRoutes: 0, summary: 'One comparison could not be assessed.' };
  const oldMap = routeMap(oldReport);
  const newMap = routeMap(currentReport);
  const ids = [...new Set([...oldMap.keys(), ...newMap.keys()])].sort(compare);
  const changes = ids.map((id) => difference(oldMap.get(id), newMap.get(id), id));
  const newBarriers = changes.filter((item) => item.warnings.includes('barrier')).length;
  const newUnknowns = changes.filter((item) => item.warnings.includes('UNKNOWN')).length;
  const removedRoutes = changes.filter((item) => item.kind === 'removed').length;
  const addedRoutes = changes.filter((item) => item.kind === 'added').length;
  return {
    status: 'ok', date: profile.asOf, beforeRouteCount: oldReport.routes.length,
    afterRouteCount: currentReport.routes.length, changes,
    newBarriers, newUnknowns, removedRoutes, addedRoutes,
    summary: newBarriers || newUnknowns || removedRoutes ?
      'One or more route conditions changed. Review the supplied evidence.' :
      'No new barrier or information gap is identified by this comparison.',
  };
}

export function sourceInventory(report: ComparisonResult): SourceInventory {
  const bySource = new Map<string, EvidenceInventoryRow>();
  let totalObservations = 0;
  let missingCitations = 0;
  let unlicensed = 0;
  let unsupportedObservations = 0;
  let missingDates = 0;
  for (const route of report.routes) {
    for (const requirement of route.requirements) {
      for (const observation of requirement.observations) {
        totalObservations++;
        if (observation.sourceId === 'UNKNOWN') missingCitations++;
        if (!isOpenLicence(observation.licence)) unlicensed++;
        if (observation.value === 'UNKNOWN') unsupportedObservations++;
        if (observation.retrievedOn === 'UNKNOWN') missingDates++;
        const key = `${observation.sourceId}|${observation.licence}|${observation.retrievedOn}|${observation.tier ?? 'UNKNOWN'}`;
        const existing = bySource.get(key) ?? {
          sourceId: observation.sourceId, licence: observation.licence, date: observation.retrievedOn,
          tier: observation.tier, routes: [], directions: [], requirements: [],
        };
        if (!existing.routes.includes(route.routeId)) existing.routes.push(route.routeId);
        if (!existing.directions.includes(observation.direction)) existing.directions.push(observation.direction);
        if (!existing.requirements.includes(requirement.id)) existing.requirements.push(requirement.id);
        bySource.set(key, existing);
      }
    }
  }
  const sources = [...bySource.values()].map((item) => ({ ...item,
    routes: item.routes.sort(compare), directions: item.directions.sort(compare),
    requirements: item.requirements.sort(compare),
  })).sort((a, b) => compare(a.sourceId, b.sourceId) || compare(a.date, b.date) || compare(a.licence, b.licence));
  return { status: missingCitations || unlicensed || missingDates || unsupportedObservations ? 'UNKNOWN' : 'complete',
    sources, missingCitations, unlicensed, unsupportedObservations, missingDates, totalObservations };
}

export function portableNeedsComparison(plan: JourneyPlan, untrustedProfile: unknown): PortableComparison | null {
  const profile = normalizeProfile(untrustedProfile);
  if (!profile) return null;
  const report = compareRoutes(plan, profile);
  if (!report.ok) return null;
  const inventory = sourceInventory(report);
  return {
    version: 1, reportDate: profile.asOf, locale: plan.locale,
    status: inventory.status, profile,
    routes: report.routes.map((route) => ({
      routeId: route.routeId, status: route.status,
      requirements: route.requirements.map((row) => ({
        id: row.id, result: row.result,
        sourceIds: [...new Set(row.observations.map((item) => item.sourceId))].sort(compare),
      })),
    })),
    sourceInventory: inventory,
  };
}

export function exportNeedsJson(plan: JourneyPlan, profile: unknown): string | null {
  const report = portableNeedsComparison(plan, profile);
  if (report === null) return null;
  const json = `${JSON.stringify(report, null, 2)}\n`;
  return json.length <= 2_000_000 ? json : null;
}

export function differencesForRequirement(report: ChangeReview, id: RequirementId): RouteDifference[] {
  return report.changes.filter((item) => item.changedRequirements.includes(id));
}

export function sourceDateChanges(before: JourneyPlan, after: JourneyPlan): string[] {
  const found = new Map<string, string>();
  const changed = new Set<string>();
  for (const route of [...before.journeys, ...before.blocked]) {
    for (const leg of [...route.legs, ...route.returnJourney.legs]) {
      found.set(`${route.id}|${leg.id}|${leg.provenance.sourceId}`, dateFromProvenance(leg.provenance));
    }
  }
  for (const route of [...after.journeys, ...after.blocked]) {
    for (const leg of [...route.legs, ...route.returnJourney.legs]) {
      const key = `${route.id}|${leg.id}|${leg.provenance.sourceId}`;
      if (found.has(key) && found.get(key) !== dateFromProvenance(leg.provenance)) changed.add(key);
    }
  }
  return [...changed].sort(compare);
}
