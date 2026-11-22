/** Route candidate assessment and review comparisons. Pure, bounded, offline only. */
import { diagnostic, orderIssues } from './p15v-ontario-model.mjs';
import { planOntarioRoutes } from './p15v-ontario-routing.mjs';
import { assessRoutePath, collectEvidenceGaps, createCoverageContext, coverageIssue } from './p15ac-coverage.mjs';
import { isId, isRecord, sortId, stableFindings, uniqueSorted } from './p15ac-policy.mjs';

function failed(issues) {
  return Object.freeze({ ok: false, status: 'blocked', routes: Object.freeze([]),
    tasks: Object.freeze([]), issues: orderIssues(issues) });
}

function buildRequest(input, policy) {
  if (!isRecord(input) || !isId(input.start) || !isId(input.end) ||
      Object.keys(input).some((key) => !['start', 'end'].includes(key))) return null;
  return {
    start: input.start,
    end: input.end,
    silo: policy.silo,
    allowUnknown: policy.allowUnknown,
    maximumMetres: policy.maximumDistanceMetres,
    maximumHops: policy.maximumHops,
    alternatives: policy.alternatives,
    avoidFeatures: policy.avoidFeatures,
  };
}

/** Routes are searched by the merged Ontario planner, not a secondary graph. */
export function auditRouteChoices(snapshot, endpoints, policyInput) {
  const context = createCoverageContext(snapshot, policyInput);
  if (!context.ok) return failed(context.issues);
  const request = buildRequest(endpoints, context.policy);
  if (!request) return failed([diagnostic('ROOT', '$.request')]);
  const result = planOntarioRoutes(context.snapshot, request);
  if (result.status === 'blocked' || result.status === 'invalid') return failed(result.issues);
  const reviewed = result.routes.map((route) =>
    assessRoutePath(context.snapshot, route, context.sources, context.policy));
  const tasks = collectEvidenceGaps(reviewed, context.policy);
  if (tasks === null) return failed([diagnostic('LIMIT', '$.tasks')]);
  const findings = stableFindings(reviewed.flatMap((r) => r.findings), context.policy.maxFindings);
  if (findings === null) return failed([diagnostic('LIMIT', '$.findings')]);
  const routeStatus = reviewed.length === 0 ? 'absent' : reviewed.some((r) => r.status === 'YES') ?
    'found' : reviewed.some((r) => r.status === 'UNKNOWN') ? 'conditional' : 'absent';
  return Object.freeze({
    ok: true, status: routeStatus,
    routeSourceStatus: result.status,
    routes: Object.freeze(reviewed),
    tasks,
    issues: findings,
    asOf: context.snapshot.asOf,
    policy: context.policy,
    sourceCount: context.sources.size,
  });
}

export function scoreRoute(route, policy) {
  const ratio = route.totalSegments === 0 ? 0 : route.supportedSegments / route.totalSegments;
  const base = route.status === 'YES' ? 0 : route.status === 'UNKNOWN' ? 100 : 1000;
  const unresolved = route.unresolvedCount * 30;
  const blocked = route.blockedCount * 500;
  const lengthPenalty = Math.min(100, route.metres / 1000);
  const gapPenalty = (1 - ratio) * 50;
  const score = Number((base + unresolved + blocked + lengthPenalty + gapPenalty).toFixed(3));
  const supported = route.status === 'YES' && (policy.allowUnknown || !route.unresolvedCount);
  return Object.freeze({ score, supported, coveragePercent: Math.round(ratio * 100) });
}

export function rankReviewedRoutes(review) {
  if (!review?.ok) return Object.freeze([]);
  const ranked = review.routes.map((route) => Object.freeze({
    ...route,
    metrics: scoreRoute(route, review.policy),
  }));
  ranked.sort((a, b) => a.metrics.score - b.metrics.score ||
    a.metres - b.metres || sortId(a.edgeIds.join('|'), b.edgeIds.join('|')));
  return Object.freeze(ranked.map((route, i) => Object.freeze({ ...route, reviewRank: i + 1 })));
}

/** Routes are only comparable if their review policy and observation window agree. */
export function compareRouteReviews(before, after) {
  if (!before?.ok || !after?.ok || before.asOf !== after.asOf ||
      before.policy?.silo !== after.policy?.silo) {
    return Object.freeze({ ok: false, changes: Object.freeze([]),
      issues: orderIssues([diagnostic('ROOT', '$.comparison')]) });
  }
  const a = new Map(before.routes.map((route) => [route.edgeIds.join('|'), route]));
  const b = new Map(after.routes.map((route) => [route.edgeIds.join('|'), route]));
  const signatures = uniqueSorted([...a.keys(), ...b.keys()]);
  const changes = [];
  for (const signature of signatures) {
    const previous = a.get(signature);
    const current = b.get(signature);
    const kind = !previous ? 'added' : !current ? 'removed' :
      previous.status !== current.status ? 'status-changed' :
      previous.unresolvedCount !== current.unresolvedCount ? 'uncertainty-changed' :
      previous.supportedSegments !== current.supportedSegments ? 'coverage-changed' :
      previous.metres !== current.metres ? 'length-changed' : 'unchanged';
    if (kind !== 'unchanged') changes.push(Object.freeze({
      signature,
      kind,
      beforeStatus: previous?.status ?? 'UNKNOWN',
      afterStatus: current?.status ?? 'UNKNOWN',
      beforeMetres: previous?.metres ?? null,
      afterMetres: current?.metres ?? null,
      beforeUnresolved: previous?.unresolvedCount ?? null,
      afterUnresolved: current?.unresolvedCount ?? null,
    }));
  }
  return Object.freeze({ ok: true, changes: Object.freeze(changes),
    issues: Object.freeze([]) });
}

/** A review task is never an instruction to edit source data automatically. */
export function groupReviewTasks(review) {
  if (!review?.ok) return Object.freeze({ total: 0, groups: Object.freeze([]) });
  const byCode = new Map();
  for (const task of review.tasks) {
    for (const code of task.codes) {
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code).push(task);
    }
  }
  const groups = [...byCode.entries()].map(([code, tasks]) => Object.freeze({
    code,
    count: tasks.length,
    segmentIds: Object.freeze(uniqueSorted(tasks.map((task) => task.id))),
    en: coverageIssue(code, '$').en,
    fr: coverageIssue(code, '$').fr,
  }));
  groups.sort((a, b) => b.count - a.count || sortId(a.code, b.code));
  return Object.freeze({ total: review.tasks.length, groups: Object.freeze(groups) });
}

export function summarizeRouteStatus(review) {
  if (!review?.ok) return Object.freeze({
    status: 'blocked', routes: 0, yes: 0, no: 0, unknown: 0,
    segments: 0, supported: 0, tasks: 0,
  });
  const allSegments = review.routes.flatMap((route) => route.segments);
  return Object.freeze({
    status: review.status,
    routes: review.routes.length,
    yes: review.routes.filter((r) => r.status === 'YES').length,
    no: review.routes.filter((r) => r.status === 'NO').length,
    unknown: review.routes.filter((r) => r.status === 'UNKNOWN').length,
    segments: allSegments.length,
    supported: allSegments.filter((s) => s.supported).length,
    tasks: review.tasks.length,
  });
}

/** Used to evaluate side-by-side route choices without exposing an unsupported claim. */
export function decisionMatrix(review) {
  if (!review?.ok) return Object.freeze([]);
  const ranked = rankReviewedRoutes(review);
  return Object.freeze(ranked.map((route) => Object.freeze({
    rank: route.reviewRank,
    originalRank: route.rank,
    status: route.status,
    metres: route.metres,
    supported: route.metrics.supported,
    coveragePercent: route.metrics.coveragePercent,
    unknownSegments: route.unresolvedCount,
    reportedBarriers: route.blockedCount,
    evidenceSources: route.sourceIds.length,
    tasks: review.tasks.filter((task) => route.edgeIds.includes(task.id)).length,
  })));
}

export function makeReviewChecklist(review) {
  if (!review?.ok) return Object.freeze([]);
  return Object.freeze(review.tasks.map((task, index) => Object.freeze({
    order: index + 1,
    segmentId: task.id,
    status: task.access,
    codes: task.codes,
    sourceIds: task.sourceIds,
    sourceDates: task.sourceDates,
    action: 'manual-review',
    completion: 'UNKNOWN',
  })));
}
