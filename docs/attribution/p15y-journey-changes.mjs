/** P15Y: explain changes in a multi-stop Ontario journey across two offline snapshots. */
import { createHash } from 'node:crypto';
import { parseOntarioSnapshot, diagnostic, dayNumber, orderIssues } from './p15v-ontario-model.mjs';
import { planWaypointJourney } from './p15y-waypoint-journey.mjs';
import { explainWaypointJourney } from './p15y-route-evidence.mjs';

const cmp = (a, b) => a.localeCompare(b, 'en');
const changeText = Object.freeze({
  PATH_LOST: ['Previously available route is no longer present.', 'Le parcours disponible auparavant n’est plus présent.'],
  PATH_GAINED: ['A new route is present in the supplied snapshot.', 'Un nouveau parcours figure dans les données fournies.'],
  DISTANCE: ['Route distance changed.', 'La distance du parcours a changé.'],
  UNKNOWN: ['Accessibility evidence became UNKNOWN.', 'Les renseignements d’accès sont devenus UNKNOWN.'],
  ACCESS: ['A route accessibility statement changed.', 'Un état d’accès du parcours a changé.'],
  SOURCE: ['Supporting source identifiers changed.', 'Les identifiants des sources ont changé.'],
  EDGE: ['The route uses a different segment.', 'Le parcours utilise un segment différent.'],
  AGE: ['Snapshot dates are not chronological.', 'Les dates des données ne sont pas chronologiques.'],
  SCOPE: ['Licence export scope changed.', 'La portée de l’exportation des licences a changé.'],
  BOUNDS: ['The change review is too large.', 'Le contrôle des modifications est trop volumineux.'],
});

function finding(code, path, before, after) {
  const words = changeText[code] ?? changeText.BOUNDS;
  return Object.freeze({ code, path, before, after, en: words[0], fr: words[1] });
}

const stable = (value) => JSON.stringify(value, (key, entry) => {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
  return Object.fromEntries(Object.entries(entry).sort(([a], [b]) => cmp(a, b)));
});

function signature(journey) {
  return journey.edgeIds.join('|');
}

/** Stable changes are keyed by ordered edge IDs, not display strings. */
export function compareJourneyLists(before, after) {
  const earlier = new Map(before.map((route) => [signature(route), route]));
  const later = new Map(after.map((route) => [signature(route), route]));
  const findings = [];
  for (const [key, item] of earlier) {
    const updated = later.get(key);
    if (!updated) {
      findings.push(finding('PATH_LOST', `journeys.${key}`, item.distance, null));
      continue;
    }
    if (item.distance !== updated.distance) {
      findings.push(finding('DISTANCE', `journeys.${key}.metres`, item.distance, updated.distance));
    }
    if (item.status !== updated.status) {
      findings.push(finding(item.status === 'YES' && updated.status === 'UNKNOWN' ? 'UNKNOWN' :
        'ACCESS', `journeys.${key}.access`, item.status, updated.status));
    }
    if (stable(item.sourceIds) !== stable(updated.sourceIds)) {
      findings.push(finding('SOURCE', `journeys.${key}.sources`, item.sourceIds, updated.sourceIds));
    }
    if (item.tier > updated.tier) {
      findings.push(finding('UNKNOWN', `journeys.${key}.tier`, item.tier, updated.tier));
    }
  }
  for (const [key, item] of later) {
    if (!earlier.has(key)) findings.push(finding('PATH_GAINED', `journeys.${key}`, null, item.distance));
  }
  findings.sort((a, b) => cmp(a.path, b.path) || cmp(a.code, b.code));
  return Object.freeze(findings);
}

function indexFacts(snapshot) {
  return {
    sources: new Map(snapshot.sources.map((item) => [item.id, item])),
    places: new Map(snapshot.places.map((item) => [item.id, item])),
    nodes: new Map(snapshot.nodes.map((item) => [item.id, item])),
    edges: new Map(snapshot.edges.map((item) => [item.id, item])),
  };
}

/** Review the actual basis of an accessibility assertion, not just route shape. */
export function compareNetworkEvidence(before, after) {
  const old = indexFacts(before);
  const now = indexFacts(after);
  const changes = [];
  for (const name of ['sources', 'places', 'nodes', 'edges']) {
    for (const [id, prior] of old[name]) {
      const next = now[name].get(id);
      if (!next) {
        changes.push(finding('PATH_LOST', `${name}.${id}`, prior.id, null));
        continue;
      }
      if (prior.silo !== next.silo) changes.push(finding('SCOPE', `${name}.${id}.silo`, prior.silo, next.silo));
      if (prior.access !== undefined && prior.access !== next.access) {
        const code = next.access === 'UNKNOWN' ? 'UNKNOWN' : 'ACCESS';
        changes.push(finding(code, `${name}.${id}.access`, prior.access, next.access));
      }
      if (prior.tier !== undefined && next.tier < prior.tier) {
        changes.push(finding('UNKNOWN', `${name}.${id}.tier`, prior.tier, next.tier));
      }
      if (prior.sourceIds && stable(prior.sourceIds) !== stable(next.sourceIds)) {
        changes.push(finding('SOURCE', `${name}.${id}.sourceIds`, prior.sourceIds, next.sourceIds));
      }
      if (prior.observedOn && next.observedOn < prior.observedOn) {
        changes.push(finding('AGE', `${name}.${id}.observedOn`, prior.observedOn, next.observedOn));
      }
      if (name === 'edges' && (prior.from !== next.from || prior.to !== next.to ||
          prior.direction !== next.direction)) {
        changes.push(finding('EDGE', `edges.${id}.connection`,
          [prior.from, prior.to, prior.direction], [next.from, next.to, next.direction]));
      }
      if (name === 'edges' && prior.metres !== next.metres) {
        changes.push(finding('DISTANCE', `edges.${id}.metres`, prior.metres, next.metres));
      }
    }
    for (const [id, next] of now[name]) {
      if (!old[name].has(id)) changes.push(finding('PATH_GAINED', `${name}.${id}`, null, next.id));
    }
  }
  changes.sort((a, b) => cmp(a.path, b.path) || cmp(a.code, b.code));
  return Object.freeze(changes);
}

/** Full fail-closed comparison on independently parseable local snapshots. */
export function auditWaypointChanges(beforeInput, afterInput, request, policy = null) {
  const before = parseOntarioSnapshot(beforeInput);
  const after = parseOntarioSnapshot(afterInput);
  if (!before.ok || !after.ok) return Object.freeze({
    status: 'blocked', before: null, after: null, findings: [],
    issues: orderIssues([...before.issues, ...after.issues]),
  });
  const oldDate = dayNumber(before.snapshot.asOf);
  const newDate = dayNumber(after.snapshot.asOf);
  if (newDate < oldDate) return Object.freeze({
    status: 'blocked', before: null, after: null,
    findings: Object.freeze([finding('AGE', '$.asOf', before.snapshot.asOf, after.snapshot.asOf)]),
    issues: Object.freeze([]),
  });
  const prior = planWaypointJourney(before.snapshot, request);
  const current = planWaypointJourney(after.snapshot, request);
  if (['invalid', 'blocked'].includes(prior.status) || ['invalid', 'blocked'].includes(current.status)) {
    return Object.freeze({ status: 'blocked', before: null, after: null, findings: [],
      issues: orderIssues([...prior.issues, ...current.issues]) });
  }
  const changes = [...compareJourneyLists(prior.journeys, current.journeys),
    ...compareNetworkEvidence(before.snapshot, after.snapshot)];
  changes.sort((a, b) => cmp(a.path, b.path) || cmp(a.code, b.code));
  if (changes.length > 100000) return Object.freeze({
    status: 'blocked', before: null, after: null,
    findings: Object.freeze([finding('BOUNDS', '$.changes', changes.length, 100000)]),
    issues: Object.freeze([]),
  });
  const evidence = policy ? {
    before: explainWaypointJourney(before.snapshot, request, policy),
    after: explainWaypointJourney(after.snapshot, request, policy),
  } : null;
  if (evidence && (evidence.before.status === 'blocked' || evidence.after.status === 'blocked')) {
    return Object.freeze({ status: 'blocked', before: null, after: null, findings: [],
      issues: Object.freeze([...evidence.before.issues, ...evidence.after.issues]) });
  }
  return Object.freeze({
    status: changes.length ? 'changed' : 'unchanged',
    before: prior, after: current,
    findings: Object.freeze(changes), issues: Object.freeze([]),
    evidence: evidence ? Object.freeze(evidence) : null,
  });
}

/** Deterministic report digest identifies data bytes; it is not an approval claim. */
export function serializeWaypointChangeReport(report) {
  if (!report || ['blocked', 'invalid'].includes(report.status)) return Object.freeze({
    ok: false, bytes: null, digest: null,
    issues: Object.freeze([diagnostic('ROOT', '$.report')]),
  });
  const payload = {
    schemaVersion: 1, status: report.status,
    findings: report.findings.map(({ code, path, before, after, en, fr }) =>
      ({ code, path, before, after, en, fr })),
    before: report.before ? { status: report.before.status,
      routes: report.before.journeys.map((item) => ({ signature: item.signature, metres: item.distance })) } : null,
    after: report.after ? { status: report.after.status,
      routes: report.after.journeys.map((item) => ({ signature: item.signature, metres: item.distance })) } : null,
  };
  const json = JSON.stringify(payload) + '\n';
  const bytes = new TextEncoder().encode(json);
  if (bytes.byteLength > 4 * 1024 * 1024) return Object.freeze({ ok: false,
    bytes: null, digest: null, issues: [diagnostic('LIMIT', '$.report')] });
  const digest = createHash('sha256').update(bytes).digest('hex');
  return Object.freeze({ ok: true, bytes, digest, issues: Object.freeze([]) });
}

/** Human-facing EN/FR summary preserves UNKNOWN and proper punctuation. */
export function waypointChangeText(report, locale = 'en') {
  if (locale !== 'en' && locale !== 'fr') throw new TypeError('Unsupported locale');
  const title = locale === 'fr' ? {
    unchanged: 'Aucun changement dans les données fournies.', changed: 'Changements dans les données fournies.',
    blocked: 'Le contrôle des changements est bloqué.', reason: 'Motif',
  } : {
    unchanged: 'No changes in supplied data.', changed: 'Changes in supplied data.',
    blocked: 'The change review is blocked.', reason: 'Reason',
  };
  const lines = [title[report.status] ?? title.blocked];
  for (const item of report.findings ?? []) {
    lines.push(`${item.code} ${item.path}\u00a0: ${item[locale]}`);
  }
  for (const issue of report.issues ?? []) {
    lines.push(`${title.reason}\u00a0: ${issue[locale]}`);
  }
  return lines.join('\n') + '\n';
}
