/** Publication reconciliation: provenance, chronology and explicit uncertainty. */
import { dateWithin, dayNumber, id, isLocalInput, object, sourceSilo, stableSort,
  unique, validDecision, validObservation, validSource, validTier } from './contract.mjs';

const WORDS = {
  ROOT: ['The local package has an unexpected structure.', 'Le paquet local présente une structure inattendue.'],
  LIMIT: ['The declared inventory limit was exceeded.', 'La limite déclarée de l’inventaire est dépassée.'],
  SOURCE: ['Source details, date, or open licence are invalid.', 'Les détails, la date ou la licence ouverte de la source sont non valides.'],
  RETRIEVAL_DATE: ['Supply a calendar retrieval date between the source observation date and the review date.', 'Indiquez une date de collecte comprise entre la date d’observation de la source et la date d’examen.'],
  SOURCE_TIER: ['Supply the recorded evidence tier as an integer from 0 to 4.', 'Indiquez le niveau de preuve consigné sous forme d’un entier de 0 à 4.'],
  RECORD_SOURCE: ['This record requires a source.', 'Cet enregistrement exige une source.'],
  OBSERVATION: ['An observation has invalid fields or bilingual notes.', 'Une observation comporte des champs ou des notes bilingues non valides.'],
  DECISION: ['A publication decision is incomplete or invalid.', 'Une décision de publication est incomplète ou non valide.'],
  DUPLICATE: ['An identifier occurs more than once.', 'Un identifiant figure plus d’une fois.'],
  HELD: ['A held source cannot be published.', 'Une source retenue ne peut pas être publiée.'],
  STALE: ['Source or observation is old or in the future.', 'La source ou l’observation est trop ancienne ou future.'],
  SOURCE_LINK: ['An observation references an absent source.', 'Une observation renvoie à une source absente.'],
  OBS_LINK: ['A decision references an absent or unrelated observation.', 'Une décision renvoie à une observation absente ou sans rapport.'],
  ORPHAN: ['An observed feature has no publication decision.', 'Une caractéristique observée n’a aucune décision de publication.'],
  HISTORY: ['Observation history is missing, cyclic, or out of order.', 'L’historique des observations est absent, cyclique ou désordonné.'],
  WITHDRAW: ['Withdrawals must explicitly retain UNKNOWN.', 'Les retraits doivent conserver explicitement UNKNOWN.'],
  CORRECTION: ['Corrections must supersede an earlier observation.', 'Les corrections doivent remplacer une observation antérieure.'],
  CONFLICT: ['Conflicting current evidence requires UNKNOWN.', 'Des données actuelles contradictoires exigent UNKNOWN.'],
  ASSERT: ['A known state lacks current supporting observations.', 'Un état connu ne dispose pas d’observations actuelles justificatives.'],
  SILO: ['ODbL sources must remain in a separate export.', 'Les sources ODbL doivent rester dans une exportation distincte.'],
  DEC_SOURCES: ['Decision sources differ from their supporting observations.', 'Les sources de décision diffèrent des observations justificatives.'],
  UNREFERENCED: ['A source is not used by a published observation.', 'Une source n’est utilisée par aucune observation publiée.'],
  UNDECIDED: ['A decision without observations must remain UNKNOWN.', 'Une décision sans observation doit rester UNKNOWN.'],
};

export function finding(code, path, severity = 'ERROR') {
  const words = WORDS[code];
  if (!words) throw new Error(`Unknown finding ${code}`);
  return { code, severity, path, en: words[0], fr: words[1] };
}
export function finish(findings, totals) {
  const ordered = stableSort(findings, item => `${item.path}\u0000${item.code}\u0000${item.severity}`);
  return { ok: !ordered.some(item => item.severity === 'ERROR'), findings: ordered, totals };
}
function pair(value) { return `${value.placeId}/${value.feature}`; }
function historyError(item, observations) {
  const encountered = new Set([item.id]);
  let current = item;
  while (current.supersedes) {
    const previous = observations.get(current.supersedes);
    if (!previous || encountered.has(previous.id)) return true;
    encountered.add(previous.id);
    if (pair(previous) !== pair(item)) return true;
    if (dayNumber(previous.observedOn) > dayNumber(current.observedOn)) return true;
    if (current.kind === 'OBSERVE') return true;
    current = previous;
  }
  return false;
}
function currentObservations(items) {
  const superseded = new Set(items.map(item => item.supersedes).filter(Boolean));
  return items.filter(item => !superseded.has(item.id) && item.kind !== 'WITHDRAW');
}
function statusOf(items) {
  if (items.length === 0 || items.some(item => item.state === 'UNKNOWN')) return 'UNKNOWN';
  return new Set(items.map(item => item.state)).size === 1 ? items[0].state : 'UNKNOWN';
}
function hasConflict(items) {
  return items.some(item => item.state === 'YES') && items.some(item => item.state === 'NO');
}

/** Safe to publish only when ok is true. The audit never fills unknown fields. */
export function audit(input) {
  const findings = [];
  const totals = { sources: 0, observations: 0, decisions: 0, unknown: 0,
    conflicts: 0, withdrawn: 0, expired: 0, distinctFeatures: 0 };
  if (!isLocalInput(input)) return finish([finding('ROOT', '$')], totals);
  const { sources, observations, decisions, policy } = input;
  totals.sources = sources.length;
  totals.observations = observations.length;
  totals.decisions = decisions.length;
  if (sources.length > policy.maxSources || observations.length > policy.maxObservations ||
      decisions.length > policy.maxObservations) {
    findings.push(finding('LIMIT', '$'));
    return finish(findings, totals);
  }
  const bySource = new Map();
  for (const [index, source] of sources.entries()) {
    const path = `$.sources[${index}]`;
    if (object(source)) {
      if (dayNumber(source.retrievedOn) === null) findings.push(finding('RETRIEVAL_DATE', `${path}.retrievedOn`));
      if (!validTier(source.tier)) findings.push(finding('SOURCE_TIER', `${path}.tier`));
    }
    if (!validSource(source)) { findings.push(finding('SOURCE', path)); continue; }
    const retrieved = dayNumber(source.retrievedOn);
    if (retrieved < dayNumber(source.observedOn) || retrieved > dayNumber(policy.asOf)) {
      findings.push(finding('RETRIEVAL_DATE', `${path}.retrievedOn`));
    }
    if (bySource.has(source.id)) findings.push(finding('DUPLICATE', `${path}.id`));
    else bySource.set(source.id, source);
    if (!dateWithin(source.observedOn, policy.asOf, policy.maxSourceAgeDays)) {
      totals.expired++;
      findings.push(finding('STALE', `${path}.observedOn`));
    }
  }
  const byObservation = new Map();
  const byFeature = new Map();
  const firstFeatureIndex = new Map();
  const usedSource = new Set();
  for (const [index, observation] of observations.entries()) {
    const path = `$.observations[${index}]`;
    if (!validObservation(observation)) { findings.push(finding('OBSERVATION', path)); continue; }
    if (byObservation.has(observation.id)) findings.push(finding('DUPLICATE', `${path}.id`));
    else byObservation.set(observation.id, observation);
    const feature = pair(observation);
    if (!firstFeatureIndex.has(feature)) firstFeatureIndex.set(feature, index);
    const list = byFeature.get(feature) ?? [];
    list.push(observation);
    byFeature.set(feature, list);
    if (!dateWithin(observation.observedOn, policy.asOf, policy.maxAgeDays)) {
      totals.expired++;
      findings.push(finding('STALE', `${path}.observedOn`));
    }
    for (const sourceId of observation.sourceIds) {
      const source = bySource.get(sourceId);
      if (!source) findings.push(finding('SOURCE_LINK', `${path}.sourceIds`));
      else {
        usedSource.add(sourceId);
        if (dayNumber(source.observedOn) > dayNumber(observation.observedOn)) {
          findings.push(finding('HISTORY', `${path}.observedOn`));
        }
      }
    }
    if (observation.kind === 'WITHDRAW') {
      totals.withdrawn++;
      if (observation.state !== 'UNKNOWN' || !observation.supersedes) findings.push(finding('WITHDRAW', path));
    }
    if (observation.kind === 'CORRECT' && !observation.supersedes) findings.push(finding('CORRECTION', path));
    if (observation.sourceIds.length === 0) findings.push(finding('RECORD_SOURCE', `${path}.sourceIds`));
    if (observation.state !== 'UNKNOWN' && observation.sourceIds.length === 0) findings.push(finding('ASSERT', path));
  }
  for (const [index, observation] of observations.entries()) {
    if (validObservation(observation) && historyError(observation, byObservation)) {
      findings.push(finding('HISTORY', `$.observations[${index}].supersedes`));
    }
  }
  totals.distinctFeatures = byFeature.size;
  const decisionPairs = new Set();
  for (const [index, decision] of decisions.entries()) {
    const path = `$.decisions[${index}]`;
    if (!validDecision(decision)) { findings.push(finding('DECISION', path)); continue; }
    const feature = pair(decision);
    if (decisionPairs.has(feature)) findings.push(finding('DUPLICATE', path));
    decisionPairs.add(feature);
    if (decision.state === 'UNKNOWN') totals.unknown++;
    const related = byFeature.get(feature) ?? [];
    const relatedIds = new Set(related.map(item => item.id));
    if (!decision.observationIds.every(obsId => relatedIds.has(obsId)) ||
        !unique(decision.observationIds)) findings.push(finding('OBS_LINK', `${path}.observationIds`));
    if (!related.every(item => decision.observationIds.includes(item.id))) {
      findings.push(finding('OBS_LINK', `${path}.observationIds`));
    }
    const active = currentObservations(related);
    if (hasConflict(active)) totals.conflicts++;
    const expected = statusOf(active);
    if (decision.state !== expected) {
      findings.push(finding(hasConflict(active) ? 'CONFLICT' : 'ASSERT', `${path}.state`));
    }
    const sourceIds = new Set(active.flatMap(item => item.sourceIds));
    if (decision.state !== 'UNKNOWN' && sourceIds.size === 0) findings.push(finding('ASSERT', `${path}.sourceIds`));
    if (!decision.sourceIds.every(sourceId => bySource.has(sourceId)) ||
        ![...sourceIds].every(sourceId => decision.sourceIds.includes(sourceId))) {
      findings.push(finding('DEC_SOURCES', `${path}.sourceIds`));
    }
    if (decision.sourceIds.length === 0) findings.push(finding('RECORD_SOURCE', `${path}.sourceIds`));
    const lineage = decision.sourceIds.map(sourceId => bySource.get(sourceId)).filter(Boolean);
    if (sourceSilo(lineage) !== decision.silo) {
      findings.push(finding('SILO', `${path}.silo`));
    }
    if (related.length === 0 && decision.state !== 'UNKNOWN') findings.push(finding('UNDECIDED', path));
  }
  for (const [feature, index] of firstFeatureIndex) {
    if (!decisionPairs.has(feature)) findings.push(finding('ORPHAN', `$.observations[${index}]`));
  }
  for (const [index, source] of sources.entries()) {
    if (source && bySource.get(source.id) === source && !usedSource.has(source.id)) {
      findings.push(finding('UNREFERENCED', `$.sources[${index}]`, 'NOTICE'));
    }
  }
  return finish(findings, totals);
}

export function projection(input) {
  const report = audit(input);
  if (!report.ok) return { ok: false, records: [], report };
  const sourceById = new Map(input.sources.map(source => [source.id, source]));
  const records = stableSort(input.decisions.map(decision => ({
    ...decision,
    sources: decision.sourceIds.map(id => sourceById.get(id)),
  })), item => `${item.placeId}/${item.feature}`);
  return { ok: true, records, report };
}
