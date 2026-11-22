/** Deterministic per-segment evidence coverage without promotional access claims. */
import { diagnostic, orderIssues, parseOntarioSnapshot } from './p15v-ontario-model.mjs';
import {
  assessDate, boundedSourceIndex, defaultReviewPolicy, isId, isRecord,
  normaliseReviewPolicy, sortId, stableFindings, uniqueSorted,
} from './p15ac-policy.mjs';

const STATUS = Object.freeze(['YES', 'NO', 'UNKNOWN']);
const ISSUE_COPY = Object.freeze({
  MISSING: ['A cited source is not in the catalogue.', 'Une source citée est absente du catalogue.'],
  OLD: ['The observation date is not supported by the source window.', 'La date de l’observation n’est pas soutenue par la période de la source.'],
  LOW: ['The supplied evidence tier is below the review threshold.', 'Le niveau des observations est inférieur au seuil du contrôle.'],
  CONFLICT: ['The observations disagree; access remains UNKNOWN.', 'Les observations divergent\u202f; l’accès reste UNKNOWN.'],
  EMPTY: ['No matching observation supports the access status.', 'Aucune observation correspondante ne soutient l’état d’accès.'],
  SILO: ['The source belongs to another licence export.', 'La source appartient à une autre exportation de licence.'],
  INVALID: ['The observation is incomplete.', 'L’observation est incomplète.'],
  DUPLICATE: ['A repeated observation was ignored.', 'Une observation répétée a été ignorée.'],
  REFERENCE: ['The route segment has a missing endpoint.', 'Un segment du parcours a un point d’extrémité absent.'],
  BARRIER: ['An access barrier was reported.', 'Un obstacle d’accès a été signalé.'],
  DISCONNECTED: ['The route segments are not connected.', 'Les segments du parcours ne sont pas reliés.'],
  TIER: ['The record tier is below the review threshold.', 'Le niveau de la fiche est inférieur au seuil du contrôle.'],
  UNCERTAIN: ['The supplied record has UNKNOWN access.', 'La fiche fournie indique un accès UNKNOWN.'],
});

export function coverageIssue(code, path) {
  const words = ISSUE_COPY[code] ?? ISSUE_COPY.INVALID;
  return Object.freeze({ code, path, en: words[0], fr: words[1] });
}

function asObservation(item) {
  return isRecord(item) && isId(item.sourceId) &&
    typeof item.feature === 'string' && STATUS.includes(item.access) &&
    Number.isInteger(item.tier) && item.tier >= 0 && item.tier <= 3 &&
    typeof item.observedOn === 'string';
}

/** The observation and its source have independent dates, permissions and tiers. */
export function assessObservation(raw, record, sources, policy, at) {
  const problems = [];
  if (!asObservation(raw)) {
    problems.push(coverageIssue('INVALID', at));
    return Object.freeze({ ok: false, status: 'UNKNOWN', problems, observation: null });
  }
  const source = sources.get(raw.sourceId);
  if (!source) problems.push(coverageIssue('MISSING', `${at}.sourceId`));
  else if (source.silo !== policy.silo || source.silo !== record.silo) {
    problems.push(coverageIssue('SILO', `${at}.sourceId`));
  }
  if (raw.feature !== record.feature || !record.sourceIds.includes(raw.sourceId)) {
    problems.push(coverageIssue('INVALID', `${at}.feature`));
  }
  const dateStatus = assessDate(raw.observedOn, source, policy);
  if (dateStatus === 'UNKNOWN') problems.push(coverageIssue('OLD', `${at}.observedOn`));
  if (raw.tier < policy.minimumTier) problems.push(coverageIssue('LOW', `${at}.tier`));
  if (raw.tier === 0 && raw.access !== 'UNKNOWN') problems.push(coverageIssue('LOW', `${at}.tier`));
  const usable = problems.length === 0 && raw.access !== 'UNKNOWN';
  return Object.freeze({
    ok: usable,
    status: usable ? raw.access : 'UNKNOWN',
    problems: Object.freeze(problems),
    observation: Object.freeze({
      sourceId: raw.sourceId, feature: raw.feature, access: raw.access,
      observedOn: raw.observedOn, tier: raw.tier,
      licence: source?.licence ?? 'UNKNOWN',
      sourceDate: source?.observedOn ?? 'UNKNOWN',
      usable,
    }),
  });
}

function assessRecordShape(record) {
  return isRecord(record) && isId(record.id) && STATUS.includes(record.access) &&
    typeof record.feature === 'string' && Array.isArray(record.sourceIds) &&
    record.sourceIds.every(isId) && Array.isArray(record.evidence) &&
    Number.isInteger(record.tier) && record.tier >= 0 && record.tier <= 3 &&
    (record.silo === 'open' || record.silo === 'odbl');
}

export function assessRecord(record, sources, policy, path = `records.${record?.id ?? 'UNKNOWN'}`) {
  if (!assessRecordShape(record)) return Object.freeze({
    id: record?.id ?? 'UNKNOWN', access: 'UNKNOWN', tier: null,
    sourceIds: Object.freeze([]), observations: Object.freeze([]),
    problems: Object.freeze([coverageIssue('INVALID', path)]),
    supported: false, coverage: 0, citedSources: 0,
  });
  const problems = [];
  const observations = [];
  const seen = new Set();
  for (const [index, raw] of record.evidence.entries()) {
    const at = `${path}.evidence[${index}]`;
    const key = JSON.stringify([raw?.sourceId, raw?.observedOn, raw?.feature, raw?.access, raw?.tier]);
    if (seen.has(key)) {
      problems.push(coverageIssue('DUPLICATE', at));
      continue;
    }
    seen.add(key);
    const assessed = assessObservation(raw, record, sources, policy, at);
    problems.push(...assessed.problems);
    if (assessed.observation) observations.push(assessed.observation);
  }
  const useful = observations.filter((o) => o.usable);
  const yes = useful.filter((o) => o.access === 'YES');
  const no = useful.filter((o) => o.access === 'NO');
  if (yes.length && no.length) problems.push(coverageIssue('CONFLICT', `${path}.access`));
  if (no.length) problems.push(coverageIssue('BARRIER', `${path}.access`));
  if (record.access === 'UNKNOWN') problems.push(coverageIssue('UNCERTAIN', `${path}.access`));
  if (record.tier < policy.minimumTier && record.access !== 'UNKNOWN') {
    problems.push(coverageIssue('TIER', `${path}.tier`));
  }
  const matching = useful.filter((o) => o.access === record.access && o.tier >= record.tier);
  if (record.access !== 'UNKNOWN' && matching.length === 0) {
    problems.push(coverageIssue('EMPTY', `${path}.access`));
  }
  const independent = uniqueSorted(matching.map((o) => o.sourceId));
  if (policy.requireIndependentSources && record.tier >= 3 && independent.length < 2) {
    problems.push(coverageIssue('LOW', `${path}.evidence`));
  }
  const hasBlockingProblems = problems.some((i) =>
    ['INVALID', 'MISSING', 'OLD', 'LOW', 'CONFLICT', 'EMPTY', 'SILO', 'BARRIER', 'TIER'].includes(i.code));
  const supported = !hasBlockingProblems && record.access === 'YES' &&
    matching.length > 0 && record.silo === policy.silo;
  const access = no.length || record.access === 'NO' ? 'NO' : supported ? 'YES' : 'UNKNOWN';
  const coverage = observations.length === 0 ? 0 : Math.round(100 * useful.length / observations.length);
  const sortedProblems = stableFindings(problems, policy.maxFindings);
  return Object.freeze({
    id: record.id, access, tier: record.tier,
    sourceIds: Object.freeze(uniqueSorted(record.sourceIds)),
    observations: Object.freeze([...observations].sort((a, b) =>
      sortId(a.sourceId, b.sourceId) || sortId(a.observedOn, b.observedOn))),
    problems: sortedProblems ?? Object.freeze([coverageIssue('INVALID', path)]),
    supported, coverage, citedSources: independent.length,
  });
}

function combineAccess(parts) {
  if (parts.some((p) => p.access === 'NO')) return 'NO';
  if (parts.length > 0 && parts.every((p) => p.access === 'YES')) return 'YES';
  return 'UNKNOWN';
}

/** Includes source metadata for each segment so a UI can cite it individually. */
export function assessSegment(edge, nodes, sources, policy) {
  const from = nodes.get(edge.from);
  const to = nodes.get(edge.to);
  const problems = [];
  if (!from || !to) problems.push(coverageIssue('REFERENCE', `edges.${edge.id}`));
  const edgeResult = assessRecord(edge, sources, policy, `edges.${edge.id}`);
  const fromResult = from ? assessRecord(from, sources, policy, `nodes.${from.id}`) : null;
  const toResult = to ? assessRecord(to, sources, policy, `nodes.${to.id}`) : null;
  const all = [edgeResult, fromResult, toResult].filter(Boolean);
  const status = from && to ? combineAccess(all) : 'UNKNOWN';
  for (const item of all) problems.push(...item.problems);
  const unique = stableFindings(problems, policy.maxFindings);
  const citedIds = uniqueSorted(all.flatMap((item) => item.sourceIds));
  return Object.freeze({
    id: edge.id, from: edge.from, to: edge.to,
    metres: edge.metres, direction: edge.direction,
    name: Object.freeze({ ...edge.name }),
    access: status, tier: Math.min(...all.map((r) => r.tier ?? 0)),
    edge: edgeResult, fromNode: fromResult, toNode: toResult,
    sourceIds: Object.freeze(citedIds),
    sources: Object.freeze(citedIds.map((id) => {
      const value = sources.get(id);
      return Object.freeze({ id, licence: value?.licence ?? 'UNKNOWN',
        observedOn: value?.observedOn ?? 'UNKNOWN',
        reference: value?.reference ?? 'UNKNOWN' });
    })),
    problems: unique ?? Object.freeze([coverageIssue('INVALID', `edges.${edge.id}`)]),
    supported: status === 'YES' && all.every((r) => r.supported),
  });
}

export function assessRoutePath(snapshot, route, sources, policy) {
  const edges = new Map(snapshot.edges.map((value) => [value.id, value]));
  const nodes = new Map(snapshot.nodes.map((value) => [value.id, value]));
  const problems = [];
  const segments = [];
  let current = route.nodeIds?.[0];
  for (const [index, id] of (route.edgeIds ?? []).entries()) {
    const edge = edges.get(id);
    if (!edge) {
      problems.push(coverageIssue('REFERENCE', `routes.${route.rank}.edges[${index}]`));
      continue;
    }
    const next = route.nodeIds?.[index + 1];
    if ((edge.from !== current || edge.to !== next) &&
        !(edge.direction === 'both' && edge.to === current && edge.from === next)) {
      problems.push(coverageIssue('DISCONNECTED', `routes.${route.rank}.edges[${index}]`));
      current = next;
      continue;
    }
    const segment = assessSegment(edge, nodes, sources, policy);
    segments.push(segment);
    problems.push(...segment.problems);
    current = next;
  }
  const unresolved = segments.filter((s) => s.access === 'UNKNOWN');
  const blocked = segments.filter((s) => s.access === 'NO');
  const status = blocked.length ? 'NO' :
    unresolved.length || segments.length !== (route.edgeIds?.length ?? 0) ||
      problems.some((p) => p.code === 'DISCONNECTED') ? 'UNKNOWN' : 'YES';
  const findings = stableFindings(problems, policy.maxFindings);
  const sourceIds = uniqueSorted(segments.flatMap((segment) => segment.sourceIds));
  return Object.freeze({
    rank: route.rank, status, metres: route.metres,
    edgeIds: Object.freeze([...route.edgeIds]),
    nodeIds: Object.freeze([...route.nodeIds]),
    segments: Object.freeze(segments),
    sourceIds: Object.freeze(sourceIds),
    unresolvedCount: unresolved.length,
    blockedCount: blocked.length,
    totalSegments: segments.length,
    supportedSegments: segments.filter((s) => s.supported).length,
    findings: findings ?? Object.freeze([coverageIssue('INVALID', '$.route.limit')]),
  });
}

export function collectEvidenceGaps(routes, policy) {
  const tasks = [];
  const seen = new Set();
  for (const route of routes) {
    for (const segment of route.segments) {
      if (segment.access === 'YES' && segment.problems.length === 0) continue;
      const key = segment.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const codes = uniqueSorted(segment.problems.map((p) => p.code));
      tasks.push(Object.freeze({
        id: key, access: segment.access, routeRank: route.rank,
        sourceIds: segment.sourceIds,
        codes: Object.freeze(codes),
        segmentName: segment.name,
        sourceDates: Object.freeze(segment.sources.map((s) =>
          Object.freeze({ sourceId: s.id, observedOn: s.observedOn }))),
      }));
    }
  }
  tasks.sort((a, b) => sortId(a.id, b.id));
  if (tasks.length > policy.maxFindings) return null;
  return Object.freeze(tasks);
}

/** Strict root parse remains authoritative for record shapes and licence boundaries. */
export function createCoverageContext(input, policyInput) {
  const parsed = parseOntarioSnapshot(input);
  if (!parsed.ok) return Object.freeze({ ok: false, snapshot: null, policy: null,
    sources: null, issues: parsed.issues });
  const policyResult = normaliseReviewPolicy(policyInput, parsed.snapshot.asOf);
  if (!policyResult.ok) return Object.freeze({ ok: false, snapshot: null, policy: null,
    sources: null, issues: policyResult.issues });
  const sources = boundedSourceIndex(parsed.snapshot, policyResult.value);
  if (!sources) return Object.freeze({ ok: false, snapshot: null, policy: null,
    sources: null, issues: orderIssues([diagnostic('SOURCE', '$.sources')]) });
  return Object.freeze({ ok: true, snapshot: parsed.snapshot, policy: policyResult.value,
    sources, issues: Object.freeze([]) });
}

export { defaultReviewPolicy };
