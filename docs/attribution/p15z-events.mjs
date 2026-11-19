/** Bounded, attributed temporary barrier and reopening evidence. */
import {
  ACCESS, EVENT_KINDS, bilingual, boundedDate, checkFactSources, digest, exact,
  factEvidence, id, immutable, instant, integer, isRecord, issue, licenceSilo,
  localPath, ordered, resultBlocked, resultOk, safeObservation, sortIssues,
  sourceIndex, uniqueStrings,
} from './p15z-common.mjs';

const EVENT_FIELDS = ['id', 'segmentId', 'kind', 'access', 'tier', 'name', 'startAt',
  'endAt', 'sourceIds', 'evidence', 'silo', 'reference'];
const MAX_EVENTS = 15000;
const MAX_SOURCES = 4000;
const MAX_DURATION = 180 * 86_400_000;
const MAX_HORIZON = 30 * 86_400_000;
const priorities = Object.freeze({ closure: 1, obstruction: 2, maintenance: 3,
  weather: 4, inspection: 5, reopening: 6 });
const reason = Object.freeze({
  en: Object.freeze({ closure: 'Reported closure', obstruction: 'Reported obstruction',
    maintenance: 'Maintenance notice', weather: 'Weather notice',
    inspection: 'Inspection notice', reopening: 'Reopening notice' }),
  fr: Object.freeze({ closure: 'Fermeture signalée', obstruction: 'Obstacle signalé',
    maintenance: 'Avis de travaux', weather: 'Avis météorologique',
    inspection: 'Avis d’inspection', reopening: 'Avis de réouverture' }),
});
const validTier = tier => integer(tier, 0, 3);

function eventShape(event) {
  return exact(event, EVENT_FIELDS) && id(event.id) && id(event.segmentId) &&
    EVENT_KINDS.includes(event.kind) && ACCESS.includes(event.access) && validTier(event.tier) &&
    bilingual(event.name) && uniqueStrings(event.sourceIds, 100) &&
    Array.isArray(event.evidence) && event.evidence.length <= 100 &&
    ['open', 'odbl'].includes(event.silo) && localPath(event.reference);
}
function windowValid(event, at, add) {
  const start = instant(event.startAt);
  const end = instant(event.endAt);
  if (start === null || end === null || start >= end || end - start > MAX_DURATION) {
    add('TIME', `${at}.window`);
    return false;
  }
  return true;
}
function semanticStatus(event, at, add) {
  if (['closure', 'obstruction'].includes(event.kind) && event.access !== 'NO') {
    add('STATE', `${at}.access`);
  }
  if (event.kind === 'reopening' && event.access !== 'YES') add('STATE', `${at}.access`);
  if (['maintenance', 'weather', 'inspection'].includes(event.kind) && event.access !== 'UNKNOWN') {
    add('STATE', `${at}.access`);
  }
  if (event.access !== 'UNKNOWN' && event.tier < 2) add('TIER', `${at}.tier`);
}
function recordsFromInput(input, add) {
  if (!exact(input, ['version', 'asOf', 'maxAgeDays', 'sources', 'events']) ||
    input.version !== 1 || !boundedDate(input.asOf, input.asOf, 0) ||
    !integer(input.maxAgeDays, 0, 3650) || !Array.isArray(input.sources) ||
    !Array.isArray(input.events) || input.sources.length > MAX_SOURCES ||
    input.events.length > MAX_EVENTS) {
    add('ROOT', '$');
    return null;
  }
  const sources = sourceIndex(input.sources, input.asOf, input.maxAgeDays, add);
  const seen = new Set();
  const events = [];
  input.events.forEach((event, index) => {
    const at = `events[${index}]`;
    if (!eventShape(event)) { add('ROOT', at); return; }
    if (seen.has(event.id)) add('DUPLICATE', `${at}.id`);
    seen.add(event.id);
    windowValid(event, at, add);
    semanticStatus(event, at, add);
    checkFactSources(event, sources, add, at);
    factEvidence(event, sources, input.asOf, input.maxAgeDays, add, at);
    events.push(event);
  });
  return { sources, events };
}

/** Reject incomplete data instead of silently skipping a malformed event. */
export function validateEventFeed(input) {
  const issues = [];
  const add = (code, path, detail = '') => issues.push(issue(code, path, detail));
  const parsed = recordsFromInput(input, add);
  if (!parsed || issues.length) return resultBlocked(issues);
  return resultOk({
    version: 1,
    asOf: input.asOf,
    maxAgeDays: input.maxAgeDays,
    sources: [...input.sources].sort((a, b) => a.id.localeCompare(b.id, 'en')),
    events: [...parsed.events].sort((a, b) => a.id.localeCompare(b.id, 'en')),
  });
}

export function eventAt(event, when) {
  const time = instant(when);
  if (time === null || !eventShape(event)) return 'UNKNOWN';
  const start = instant(event.startAt);
  const end = instant(event.endAt);
  if (start === null || end === null) return 'UNKNOWN';
  return time >= start && time < end ? 'ACTIVE' : 'INACTIVE';
}

function affected(events, when) {
  return events.filter(event => eventAt(event, when) === 'ACTIVE');
}
function filterForSilo(events, silo) {
  return events.filter(event => event.silo === silo);
}
function precedence(a, b) {
  return priorities[a.kind] - priorities[b.kind] ||
    b.tier - a.tier || a.id.localeCompare(b.id, 'en');
}
function decisionForSegment(events) {
  const orderedEvents = [...events].sort(precedence);
  const blockers = orderedEvents.filter(event => event.access === 'NO');
  const openings = orderedEvents.filter(event => event.access === 'YES');
  const unknown = orderedEvents.filter(event => event.access === 'UNKNOWN');
  if (blockers.length && openings.length) return { status: 'UNKNOWN', conflict: true };
  if (blockers.length) return { status: 'NO', conflict: false };
  if (openings.length && unknown.length) return { status: 'UNKNOWN', conflict: true };
  if (openings.length) return { status: 'YES', conflict: false };
  return { status: 'UNKNOWN', conflict: false };
}

/** Unknown event evidence does not assert that a path is accessible. */
export function eventDecisions(feed, when, silo) {
  const checked = validateEventFeed(feed);
  if (!checked.ok) return checked;
  if (instant(when) === null || !['open', 'odbl'].includes(silo)) {
    return resultBlocked([issue('TIME', '$.when')]);
  }
  const events = affected(filterForSilo(checked.value.events, silo), when);
  const groups = new Map();
  for (const event of events) {
    if (!groups.has(event.segmentId)) groups.set(event.segmentId, []);
    groups.get(event.segmentId).push(event);
  }
  const decisions = [...groups.entries()].map(([segmentId, group]) => {
    const status = decisionForSegment(group);
    return {
      segmentId,
      access: status.status,
      conflict: status.conflict,
      eventIds: ordered(group.map(event => event.id)),
      sourceIds: ordered([...new Set(group.flatMap(event => event.sourceIds))]),
      reasons: [...group].sort(precedence).map(event => ({
        id: event.id, kind: event.kind, access: event.access, tier: event.tier,
        en: reason.en[event.kind], fr: reason.fr[event.kind],
      })),
    };
  }).sort((a, b) => a.segmentId.localeCompare(b.segmentId, 'en'));
  return resultOk({ when, silo, decisions });
}

export function eventTimeline(feed, segmentId, silo, startAt, endAt) {
  const checked = validateEventFeed(feed);
  if (!checked.ok) return checked;
  const start = instant(startAt);
  const end = instant(endAt);
  if (!id(segmentId) || !['open', 'odbl'].includes(silo) || start === null || end === null ||
    start >= end || end - start > MAX_HORIZON) {
    return resultBlocked([issue('TIME', '$.range')]);
  }
  const relevant = checked.value.events.filter(event => event.segmentId === segmentId &&
    event.silo === silo && instant(event.startAt) < end && instant(event.endAt) > start);
  const boundaries = ordered([...new Set([start, end, ...relevant.flatMap(event =>
    [Math.max(start, instant(event.startAt)), Math.min(end, instant(event.endAt))])])]);
  boundaries.sort((a, b) => a - b);
  const windows = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const from = boundaries[index];
    const to = boundaries[index + 1];
    if (from === to) continue;
    const active = relevant.filter(event => instant(event.startAt) <= from && instant(event.endAt) > from);
    const state = decisionForSegment(active);
    windows.push({
      from: new Date(from).toISOString().replace('.000Z', 'Z'),
      to: new Date(to).toISOString().replace('.000Z', 'Z'),
      access: active.length ? state.status : 'UNKNOWN',
      conflict: state.conflict,
      eventIds: ordered(active.map(event => event.id)),
    });
  }
  return resultOk({ segmentId, silo, windows });
}

export function compareEventFeeds(before, after) {
  const older = validateEventFeed(before);
  const newer = validateEventFeed(after);
  if (!older.ok || !newer.ok) return resultBlocked([
    ...(!older.ok ? older.issues : []), ...(!newer.ok ? newer.issues : []),
  ]);
  const issues = [];
  if (newer.value.asOf < older.value.asOf) issues.push(issue('DATE', '$.asOf'));
  const oldSources = new Map(older.value.sources.map(source => [source.id, source]));
  const newSources = new Map(newer.value.sources.map(source => [source.id, source]));
  for (const [key, value] of oldSources) {
    const next = newSources.get(key);
    if (!next) { issues.push(issue('REF', `sources.${key}`)); continue; }
    if (next.licence !== value.licence || next.silo !== value.silo ||
      next.reference !== value.reference || next.name.en !== value.name.en ||
      next.name.fr !== value.name.fr) issues.push(issue('SOURCE', `sources.${key}`));
    if (next.observedOn < value.observedOn) issues.push(issue('AGE', `sources.${key}`));
  }
  const oldEvents = new Map(older.value.events.map(event => [event.id, event]));
  const newEvents = new Map(newer.value.events.map(event => [event.id, event]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [key, value] of oldEvents) {
    const next = newEvents.get(key);
    if (!next) { removed.push(key); continue; }
    if (digest(value) !== digest(next)) changed.push(key);
    if (next.segmentId !== value.segmentId || next.silo !== value.silo ||
      next.kind !== value.kind || next.reference !== value.reference) {
      issues.push(issue('STATE', `events.${key}`));
    }
    if (next.tier < value.tier && next.access !== 'UNKNOWN') issues.push(issue('TIER', `events.${key}`));
  }
  for (const key of newEvents.keys()) if (!oldEvents.has(key)) added.push(key);
  if (issues.length) return resultBlocked(issues);
  return resultOk({ added: ordered(added), removed: ordered(removed), changed: ordered(changed),
    oldCount: oldEvents.size, newCount: newEvents.size });
}

export function eventReceipt(feed, when, silo) {
  const decisions = eventDecisions(feed, when, silo);
  if (!decisions.ok) return decisions;
  const receipt = { version: 1, when, silo, decisions: decisions.value.decisions };
  return resultOk({ receipt, sha256: digest(receipt) });
}
