/** Explain route decisions with locally supplied source, access and confidence facts. */
import { parseOntarioSnapshot, diagnostic, orderIssues, dayNumber, french } from './p15v-ontario-model.mjs';
import { planWaypointJourney } from './p15y-waypoint-journey.mjs';

const compare = (a, b) => a.localeCompare(b, 'en');
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const SEVERITY = Object.freeze({ NO: 3, UNKNOWN: 2, YES: 1 });
const DIAGNOSTICS = Object.freeze({
  ROOT: ['Route evidence request is incomplete.', 'La demande d’observations du parcours est incomplète.'],
  REF: ['A route reference is missing.', 'Une référence du parcours est absente.'],
  SCOPE: ['Source export boundaries are inconsistent.', 'Les limites d’exportation des sources sont incohérentes.'],
  TIER: ['Evidence confidence is insufficient.', 'Le niveau des observations est insuffisant.'],
  AGE: ['The evidence is outside the selected time window.', 'L’observation est hors de la période choisie.'],
  ACCESS: ['The route contains a reported barrier.', 'Le parcours contient un obstacle signalé.'],
  UNKNOWN: ['Accessibility information is UNKNOWN.', 'Les renseignements d’accès sont UNKNOWN.'],
  CONFLICT: ['Dated observations disagree; keep access UNKNOWN.', 'Les observations datées divergent\u202f; l’accès reste UNKNOWN.'],
  LIMIT: ['The requested review exceeds bounded limits.', 'Le contrôle demandé dépasse les limites permises.'],
  TEXT: ['Bilingual source labels are incomplete.', 'Les libellés bilingues des sources sont incomplets.'],
});

export function evidenceNotice(code, path) {
  const pair = DIAGNOSTICS[code] ?? DIAGNOSTICS.ROOT;
  return Object.freeze({ code, path, en: pair[0], fr: pair[1] });
}

/** Validate a bounded review policy and refuse implicit time defaults. */
export function parseEvidencePolicy(input) {
  const problems = [];
  const add = (key, path) => problems.push(evidenceNotice(key, path));
  const required = ['minimumTier', 'maximumAgeDays', 'asOf', 'includeUnknown', 'includeBarriers',
    'maximumNotes', 'minimumIndependentSources'];
  if (!isRecord(input) || !required.every((key) => Object.hasOwn(input, key)) ||
      Object.keys(input).some((key) => !required.includes(key))) {
    add('ROOT', '$.policy'); return { ok: false, issues: problems, value: null };
  }
  if (!integer(input.minimumTier, 0, 3)) add('TIER', '$.policy.minimumTier');
  if (!integer(input.maximumAgeDays, 0, 3650)) add('AGE', '$.policy.maximumAgeDays');
  if (dayNumber(input.asOf) === null) add('AGE', '$.policy.asOf');
  if (typeof input.includeUnknown !== 'boolean' ||
      typeof input.includeBarriers !== 'boolean') add('ROOT', '$.policy.flags');
  if (!integer(input.maximumNotes, 1, 10000)) add('LIMIT', '$.policy.maximumNotes');
  if (!integer(input.minimumIndependentSources, 0, 10)) add('LIMIT', '$.policy.minimumIndependentSources');
  if (problems.length) return { ok: false, issues: problems, value: null };
  return { ok: true, issues: [], value: Object.freeze({ ...input }) };
}

/** Observe the same physical assertion through multiple independently dated sources. */
export function classifyObservations(evidence, sources, access, policy, path) {
  const issues = [];
  const useful = [];
  const sourceIds = new Set();
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const asOf = dayNumber(policy.asOf);
  for (const [index, item] of evidence.entries()) {
    const source = sourceMap.get(item.sourceId);
    const observed = dayNumber(item.observedOn);
    const location = `${path}.evidence[${index}]`;
    if (!source) { issues.push(evidenceNotice('REF', location)); continue; }
    if (observed === null || observed > asOf || asOf - observed > policy.maximumAgeDays ||
        observed < dayNumber(source.observedOn)) {
      issues.push(evidenceNotice('AGE', location));
      continue;
    }
    if (item.tier < policy.minimumTier) {
      issues.push(evidenceNotice('TIER', location));
      continue;
    }
    useful.push(item);
    sourceIds.add(source.id);
  }
  const affirmative = useful.some((item) => item.access === 'YES');
  const negative = useful.some((item) => item.access === 'NO');
  const disagree = affirmative && negative;
  if (disagree) issues.push(evidenceNotice('CONFLICT', path));
  let state = 'UNKNOWN';
  if (!disagree && useful.length && sourceIds.size >= policy.minimumIndependentSources &&
      (affirmative || negative)) state = negative ? 'NO' : 'YES';
  if (state !== access && access !== 'UNKNOWN') {
    issues.push(evidenceNotice('UNKNOWN', path));
    state = 'UNKNOWN';
  }
  if (sourceIds.size < policy.minimumIndependentSources) {
    issues.push(evidenceNotice('TIER', path));
    state = 'UNKNOWN';
  }
  if (state === 'UNKNOWN') issues.push(evidenceNotice('UNKNOWN', path));
  if (state === 'NO') issues.push(evidenceNotice('ACCESS', path));
  return Object.freeze({
    state, independentSources: sourceIds.size,
    usableEvidence: Object.freeze(useful.map((item) => Object.freeze({ ...item }))),
    issues: Object.freeze(issues),
  });
}

function routeSections(route, snapshot, policy) {
  const sourceMap = new Map(snapshot.sources.map((item) => [item.id, item]));
  const edgeMap = new Map(snapshot.edges.map((item) => [item.id, item]));
  const nodeMap = new Map(snapshot.nodes.map((item) => [item.id, item]));
  const sections = [];
  for (const leg of route.legs) {
    for (const segment of leg.segments) {
      const edge = edgeMap.get(segment.id);
      const node = nodeMap.get(segment.to);
      const observations = [...(edge?.evidence ?? []), ...(node?.evidence ?? [])];
      const sourceIds = [...new Set([...(edge?.sourceIds ?? []), ...(node?.sourceIds ?? [])])];
      const sources = sourceIds.map((id) => sourceMap.get(id)).filter(Boolean);
      const report = classifyObservations(observations, sources, segment.access, policy,
        `edges.${segment.id}`);
      const edgeState = edge?.access ?? 'UNKNOWN';
      const nodeState = node?.access ?? 'UNKNOWN';
      let state = edgeState === 'NO' || nodeState === 'NO' ? 'NO' :
        edgeState === 'UNKNOWN' || nodeState === 'UNKNOWN' ? 'UNKNOWN' : report.state;
      if (report.state === 'UNKNOWN' && state === 'YES') state = 'UNKNOWN';
      const issueList = [...report.issues];
      if (edgeState === 'UNKNOWN' || nodeState === 'UNKNOWN') {
        issueList.push(evidenceNotice('UNKNOWN', `edges.${segment.id}.access`));
      }
      if (edgeState === 'NO' || nodeState === 'NO') {
        issueList.push(evidenceNotice('ACCESS', `edges.${segment.id}.access`));
      }
      if (edge?.silo !== node?.silo || sources.some((item) => item.silo !== edge?.silo)) {
        issueList.push(evidenceNotice('SCOPE', `edges.${segment.id}`));
        state = 'UNKNOWN';
      }
      sections.push(Object.freeze({
        edgeId: segment.id,
        from: segment.from, to: segment.to, metres: segment.metres,
        feature: edge?.feature ?? 'UNKNOWN',
        name: Object.freeze({ ...segment.name }),
        access: state, tier: Math.min(edge?.tier ?? 0, node?.tier ?? 0),
        sourceIds: Object.freeze(sourceIds.sort(compare)),
        observations: Object.freeze(observations.map((item) => Object.freeze({ ...item }))),
        issues: Object.freeze(issueList),
      }));
    }
  }
  return sections;
}

function routeDecision(route, sections) {
  const unknown = sections.filter((item) => item.access === 'UNKNOWN').length;
  const barriers = sections.filter((item) => item.access === 'NO').length;
  const supported = sections.filter((item) => item.access === 'YES').length;
  const severity = barriers ? SEVERITY.NO : unknown ? SEVERITY.UNKNOWN : SEVERITY.YES;
  return Object.freeze({
    rank: route.rank, status: barriers ? 'NO' : unknown ? 'UNKNOWN' : 'YES',
    severity, metres: route.distance,
    totalSegments: sections.length, supported, unknown, barriers,
    sourceIds: Object.freeze([...new Set(sections.flatMap((s) => s.sourceIds))].sort(compare)),
    sections: Object.freeze(sections),
  });
}

/** Produce evidence-centric route findings; no route is silently certified safe. */
export function explainWaypointJourney(input, journeyRequest, policyInput) {
  const policy = parseEvidencePolicy(policyInput);
  if (!policy.ok) return Object.freeze({ status: 'blocked', decisions: [], issues: policy.issues });
  const parsed = parseOntarioSnapshot(input);
  if (!parsed.ok) return Object.freeze({ status: 'blocked', decisions: [], issues: parsed.issues });
  const planned = planWaypointJourney(parsed.snapshot, journeyRequest);
  if (planned.status === 'invalid' || planned.status === 'blocked') {
    return Object.freeze({ status: planned.status, decisions: [], issues: planned.issues });
  }
  if (!planned.journeys.length) return Object.freeze({ status: 'absent', decisions: [], issues: [] });
  const decisions = [];
  const issues = [];
  for (const journey of planned.journeys) {
    const sections = routeSections(journey, parsed.snapshot, policy.value);
    const decision = routeDecision(journey, sections);
    if (decision.unknown && !policy.value.includeUnknown) continue;
    if (decision.barriers && !policy.value.includeBarriers) continue;
    decisions.push(decision);
    for (const section of sections) issues.push(...section.issues);
    if (issues.length > policy.value.maximumNotes) {
      return Object.freeze({ status: 'blocked', decisions: [],
        issues: [evidenceNotice('LIMIT', '$.policy.maximumNotes')] });
    }
  }
  const status = decisions.length === 0 ? 'absent' : decisions.some((d) => d.status === 'NO') ?
    'blocked' : decisions.some((d) => d.status === 'UNKNOWN') ? 'conditional' : 'found';
  return Object.freeze({
    status, decisions: Object.freeze(decisions),
    issues: Object.freeze(issues.sort((a, b) => compare(a.path, b.path) || compare(a.code, b.code))),
  });
}

/** Report route uncertainty and citations with strict French punctuation. */
export function evidenceExplanationText(report, locale = 'en') {
  if (locale !== 'en' && locale !== 'fr') throw new TypeError('Unsupported locale');
  const copy = locale === 'en' ? {
    found: 'Evidence supports the listed segments.', conditional: 'Some segments remain UNKNOWN.',
    absent: 'No supported route was found.', blocked: 'Route evidence review is blocked.',
    invalid: 'The request is incomplete.', route: 'Route', unknown: 'UNKNOWN', reported: 'Reported barrier',
    metres: 'Distance', source: 'Sources', count: 'Segments',
  } : {
    found: 'Les observations soutiennent les segments indiqués.', conditional: 'Certains segments restent UNKNOWN.',
    absent: 'Aucun parcours soutenu n’a été trouvé.', blocked: 'Le contrôle des observations est bloqué.',
    invalid: 'La demande est incomplète.', route: 'Parcours', unknown: 'UNKNOWN', reported: 'Obstacle signalé',
    metres: 'Distance', source: 'Sources', count: 'Segments',
  };
  const lines = [copy[report.status] ?? copy.invalid];
  for (const decision of report.decisions ?? []) {
    lines.push(`${copy.route} ${decision.rank}\u00a0: ${copy.metres} ${decision.metres} m`);
    lines.push(`${copy.count}\u00a0: ${decision.totalSegments}`);
    for (const section of decision.sections) {
      const label = section.access === 'NO' ? copy.reported :
        section.access === 'UNKNOWN' ? copy.unknown : section.name[locale];
      lines.push(`${section.edgeId}\u00a0: ${label}`);
      lines.push(`${copy.source}\u00a0: ${section.sourceIds.join(', ')}`);
    }
  }
  for (const issue of report.issues ?? []) lines.push(`${issue.code}\u00a0: ${issue[locale]}`);
  const text = lines.join('\n') + '\n';
  if (!french(text) && locale === 'fr') throw new Error('French punctuation is invalid');
  return text;
}
