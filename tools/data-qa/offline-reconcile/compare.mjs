/** Deterministic release-to-release reconciliation. Does not infer access. */
import { audit, finding, finish } from './audit.mjs';
import { dayNumber, stableSort } from './contract.mjs';
const WORDS = {
  INPUT: ['Both release packages must pass the local audit.', 'Les deux paquets doivent réussir le contrôle local.'],
  DATE: ['The new release date must not precede the previous release.', 'La nouvelle date ne doit pas précéder celle de la publication précédente.'],
  REMOVED: ['Removing a decision requires an explicit removal entry.', 'Le retrait d’une décision exige une entrée explicite.'],
  UNUSED: ['The removal policy names a decision that was not removed.', 'La règle de retrait nomme une décision qui n’a pas été retirée.'],
  ACCESS: ['The recorded access status changed without a new observation.', 'L’état d’accès a changé sans nouvelle observation.'],
  REVISION: ['A new observation does not support the changed state.', 'Une nouvelle observation ne justifie pas l’état modifié.'],
  SILO: ['A decision moved across licence silos.', 'Une décision a changé d’exportation de licence.'],
  SOURCE: ['Source metadata changed without a new source identifier.', 'Les métadonnées de source ont changé sans nouvel identifiant.'],
  CLOCK: ['A source observation date moved backwards.', 'Une date d’observation de source a reculé.'],
  HISTORY: ['A previously published observation disappeared.', 'Une observation déjà publiée a disparu.'],
  POLICY: ['The release-removal policy is invalid.', 'La règle de retrait est non valide.'],
  UNKNOWN: ['UNKNOWN was replaced by a known state without new supporting information.', 'UNKNOWN a été remplacé par un état connu sans nouvelles données justificatives.'],
  CLAIM: ['A previous known state lost its recorded evidence.', 'Un état connu antérieur a perdu ses observations enregistrées.'],
};
function issue(code, path) {
  const [en, fr] = WORDS[code];
  return { code, severity: 'ERROR', path, en, fr };
}
export function decisionKey(d) { return `${d.placeId}/${d.feature}`; }
export function releasePolicy(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(key => ['removedDecisions', 'maxRemovals'].includes(key)) &&
    Array.isArray(value.removedDecisions) && value.removedDecisions.length <= 1000 &&
    value.removedDecisions.every(id => typeof id === 'string' && /^[a-z][\w-]*\/[a-z][\w-]*$/.test(id)) &&
    new Set(value.removedDecisions).size === value.removedDecisions.length &&
    Number.isSafeInteger(value.maxRemovals) && value.maxRemovals >= 0 && value.maxRemovals <= 1000;
}
function indexed(collection, key) {
  return new Map(collection.map(item => [key(item), item]));
}
function observationSignature(obs) {
  return JSON.stringify([obs.id, obs.placeId, obs.feature, obs.state, obs.kind,
    obs.observedOn, [...obs.sourceIds].sort(), obs.supersedes ?? null]);
}
function supportsChange(previous, current, oldObservations, newObservations) {
  const oldIds = new Set(oldObservations.map(o => o.id));
  const relatedNew = newObservations.filter(o => o.placeId === current.placeId && o.feature === current.feature &&
    !oldIds.has(o.id));
  const active = relatedNew.filter(o => o.kind !== 'WITHDRAW');
  if (current.state === 'UNKNOWN') return relatedNew.length > 0 || previous.state !== 'UNKNOWN';
  return active.some(o => o.state === current.state && o.sourceIds.length > 0);
}
export function compare(before, after, policy = { removedDecisions: [], maxRemovals: 0 }) {
  const findings = [];
  const totals = { beforeDecisions: 0, afterDecisions: 0, added: 0,
    removed: 0, changed: 0, unchanged: 0, addedObservations: 0, removedObservations: 0 };
  if (!releasePolicy(policy)) return finish([issue('POLICY', '$.policy')], totals);
  const oldReport = audit(before);
  const newReport = audit(after);
  if (!oldReport.ok || !newReport.ok) return finish([issue('INPUT', '$')], totals);
  const oldDate = dayNumber(before.policy.asOf);
  const newDate = dayNumber(after.policy.asOf);
  if (newDate < oldDate) findings.push(issue('DATE', '$.policy.asOf'));
  const oldDecisions = indexed(before.decisions, decisionKey);
  const newDecisions = indexed(after.decisions, decisionKey);
  totals.beforeDecisions = oldDecisions.size;
  totals.afterDecisions = newDecisions.size;
  const oldObs = indexed(before.observations, o => o.id);
  const newObs = indexed(after.observations, o => o.id);
  for (const [key, previous] of oldDecisions) {
    const current = newDecisions.get(key);
    if (!current) {
      totals.removed++;
      if (!policy.removedDecisions.includes(key)) findings.push(issue('REMOVED', `$.decisions(${key})`));
      continue;
    }
    let changed = false;
    if (current.silo !== previous.silo) { findings.push(issue('SILO', `$.decisions(${key}).silo`)); changed = true; }
    if (current.state !== previous.state) {
      changed = true;
      if (!supportsChange(previous, current, before.observations, after.observations)) {
        findings.push(issue(previous.state === 'UNKNOWN' && current.state !== 'UNKNOWN' ?
          'UNKNOWN' : 'ACCESS', `$.decisions(${key}).state`));
      }
    }
    if (previous.state !== 'UNKNOWN' && current.state === previous.state &&
      !current.observationIds.some(id => previous.observationIds.includes(id))) {
      findings.push(issue('CLAIM', `$.decisions(${key}).observationIds`));
    }
    if (JSON.stringify(previous.sourceIds) !== JSON.stringify(current.sourceIds)) changed = true;
    if (JSON.stringify(previous.observationIds) !== JSON.stringify(current.observationIds)) changed = true;
    if (changed) totals.changed++; else totals.unchanged++;
  }
  for (const key of newDecisions.keys()) if (!oldDecisions.has(key)) totals.added++;
  for (const approved of policy.removedDecisions) {
    if (!oldDecisions.has(approved) || newDecisions.has(approved)) findings.push(issue('UNUSED', `$.policy.removedDecisions(${approved})`));
  }
  if (totals.removed > policy.maxRemovals) findings.push(issue('POLICY', '$.policy.maxRemovals'));
  for (const [id, previous] of oldObs) {
    const current = newObs.get(id);
    if (!current) { totals.removedObservations++; findings.push(issue('HISTORY', `$.observations(${id})`)); }
    else if (observationSignature(current) !== observationSignature(previous)) {
      findings.push(issue('HISTORY', `$.observations(${id})`));
    }
  }
  for (const id of newObs.keys()) if (!oldObs.has(id)) totals.addedObservations++;
  const oldSources = indexed(before.sources, s => s.id);
  const newSources = indexed(after.sources, s => s.id);
  for (const [id, previous] of oldSources) {
    const current = newSources.get(id);
    if (!current) continue;
    if (current.licence !== previous.licence || current.name !== previous.name ||
        current.reference !== previous.reference) findings.push(issue('SOURCE', `$.sources(${id})`));
    if (dayNumber(current.observedOn) < dayNumber(previous.observedOn)) {
      findings.push(issue('CLOCK', `$.sources(${id}).observedOn`));
    }
  }
  return finish(findings, totals);
}
export function summarizeDelta(before, after, policy) {
  const result = compare(before, after, policy);
  return { ...result, categories: stableSort([...new Set(result.findings.map(f => f.code))], s => s) };
}
