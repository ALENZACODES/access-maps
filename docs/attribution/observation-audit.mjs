import { parseJournal, UNKNOWN, OSM_CREDIT, METHOD, observationKey } from './observation-core.mjs';

/** Human observation completeness is not a claim about physical accessibility. */
export const REQUIRED_METHODS = Object.freeze(['visual', 'keyboard', 'screen-reader', 'touch']);
export const SEVERITIES = Object.freeze(['block', 'attention', 'information']);
export const FINDING_TEXT = Object.freeze({
  NO_SOURCE: ['No sources are recorded for this included view.', 'Aucune source n’est inscrite pour cette vue incluse.'],
  NO_OBSERVATION: ['A required interaction method has no observation.', 'Aucune observation pour une méthode d’interaction requise.'],
  OBSERVATION_UNKNOWN: ['The observation date has not been recorded.', 'La date de l’observation n’est pas renseignée.'],
  CREDIT_NOT_SEEN: ['The source credit was not observed.', 'La mention de source n’a pas été constatée.'],
  CREDIT_UNKNOWN: ['The source credit has no observation result.', 'Aucun résultat consigné pour la mention de source.'],
  LICENCE_NOT_SEEN: ['Licence information was not observed.', 'Les renseignements sur la licence n’ont pas été constatés.'],
  LICENCE_UNKNOWN: ['Licence information has no observation result.', 'Aucun résultat consigné pour la licence.'],
  PLACEMENT_UNKNOWN: ['Credit placement has not been recorded.', 'L’emplacement de la mention n’est pas renseigné.'],
  PLACEMENT_HIDDEN: ['Credit is not beside the map.', 'La mention n’est pas à côté de la carte.'],
  TEXT_UNKNOWN: ['The displayed notice text is not recorded.', 'Le texte affiché de la mention n’est pas renseigné.'],
  TEXT_MISMATCH: ['Displayed notice text does not contain the recorded source credit.', 'Le texte affiché ne contient pas la mention de source consignée.'],
  OSM_EXACT: ['The exact OpenStreetMap credit is absent.', 'La mention OpenStreetMap exacte est absente.'],
  NOT_LEGIBLE: ['The notice was recorded as not legible.', 'La mention a été consignée comme illisible.'],
  LEGIBILITY_UNKNOWN: ['Legibility has not been assessed.', 'La lisibilité n’a pas été évaluée.'],
  NO_FOCUS: ['The focus indicator was recorded as not visible.', 'L’indicateur de focus a été consigné comme non visible.'],
  FOCUS_UNKNOWN: ['The focus indicator has no observation result.', 'Aucun résultat consigné pour l’indicateur de focus.'],
  TARGET_TOO_SMALL: ['The recorded target is smaller than 44 pixels.', 'La cible consignée est inférieure à 44 pixels.'],
  TARGET_UNKNOWN: ['The target size has not been recorded.', 'La taille de la cible n’est pas renseignée.'],
  RETRIEVAL_UNKNOWN: ['The source retrieval date is UNKNOWN.', 'La date de récupération de la source est UNKNOWN.'],
  TIER_UNKNOWN: ['The source evidence tier is UNKNOWN.', 'Le niveau de preuve de la source est UNKNOWN.'],
  LICENCE_UNKNOWN: ['The source licence is UNKNOWN.', 'La licence de la source est UNKNOWN.'],
  SOURCE_URL_UNKNOWN: ['The source address is UNKNOWN.', 'L’adresse de la source est UNKNOWN.'],
  LICENCE_URL_UNKNOWN: ['The licence address is UNKNOWN.', 'L’adresse de la licence est UNKNOWN.'],
  PERMISSION_UNKNOWN: ['Distribution permission is UNKNOWN.', 'L’autorisation de diffusion est UNKNOWN.'],
  PERMISSION_NO: ['Distribution permission was recorded as no.', 'L’autorisation de diffusion a été consignée comme refusée.'],
  ROUTE_UNKNOWN: ['The view route is UNKNOWN.', 'Le chemin de la vue est UNKNOWN.'],
  VIEW_STATUS_UNKNOWN: ['The inclusion state is UNKNOWN.', 'L’état d’inclusion est UNKNOWN.'],
  OBSERVATION_CONFLICT: ['Observations disagree about the same requirement.', 'Les observations divergent sur une même exigence.'],
  EVIDENCE_UNKNOWN: ['No observation evidence has been recorded.', 'Aucune preuve d’observation n’est renseignée.'],
  NONE_INCLUDED: ['No included views were supplied.', 'Aucune vue incluse n’a été fournie.'],
});
function finding(code, severity, viewId = UNKNOWN, sourceId = UNKNOWN, method = UNKNOWN, observationId = UNKNOWN) {
  return {code, severity, viewId, sourceId, method, observationId};
}
export function observationFindings(observation, source, view) {
  const issues = [];
  const add = (code, severity = 'block') => issues.push(finding(code, severity, view.id, source.id, observation.method, observation.id));
  if (observation.date === UNKNOWN) add('OBSERVATION_UNKNOWN');
  if (observation.creditSeen === 'no') add('CREDIT_NOT_SEEN');
  if (observation.creditSeen === UNKNOWN) add('CREDIT_UNKNOWN');
  if (observation.licenceSeen === 'no') add('LICENCE_NOT_SEEN');
  if (observation.licenceSeen === UNKNOWN) add('LICENCE_UNKNOWN');
  if (observation.placement === UNKNOWN) add('PLACEMENT_UNKNOWN');
  if (view.kind === 'map' && source.id === 'osm' && observation.placement !== 'beside-map') add('PLACEMENT_HIDDEN');
  if (observation.noticeText === UNKNOWN) add('TEXT_UNKNOWN');
  else if (source.credit !== UNKNOWN && !observation.noticeText.includes(source.credit)) add('TEXT_MISMATCH');
  if (source.id === 'osm' && (observation.noticeText === UNKNOWN || !observation.noticeText.includes(OSM_CREDIT))) add('OSM_EXACT');
  if (observation.legible === 'no') add('NOT_LEGIBLE');
  if (observation.legible === UNKNOWN) add('LEGIBILITY_UNKNOWN');
  if (observation.method === 'keyboard') {
    if (observation.focusVisible === 'no') add('NO_FOCUS');
    if (observation.focusVisible === UNKNOWN) add('FOCUS_UNKNOWN');
  }
  if (observation.method === 'touch') {
    if (observation.targetPx === UNKNOWN) add('TARGET_UNKNOWN');
    else if (observation.targetPx < 44) add('TARGET_TOO_SMALL');
  }
  if (observation.evidence === UNKNOWN) add('EVIDENCE_UNKNOWN', 'attention');
  return issues;
}
export function auditJournal(input) {
  const journal = parseJournal(input);
  const findings = [];
  const sources = new Map(journal.sources.map(source => [source.id, source]));
  const observations = new Map();
  for (const row of journal.observations) {
    const key = observationKey(row.viewId, row.sourceId, row.method);
    if (!observations.has(key)) observations.set(key, []);
    observations.get(key).push(row);
  }
  const included = journal.views.filter(view => view.included === 'yes');
  if (!included.length) findings.push(finding('NONE_INCLUDED', 'information'));
  for (const view of journal.views) {
    if (view.included === UNKNOWN) findings.push(finding('VIEW_STATUS_UNKNOWN', 'block', view.id));
    if (view.included !== 'yes') continue;
    if (view.route === UNKNOWN) findings.push(finding('ROUTE_UNKNOWN', 'block', view.id));
    if (!view.sourceIds.length) findings.push(finding('NO_SOURCE', 'block', view.id));
    for (const sourceId of view.sourceIds) {
      const source = sources.get(sourceId);
      if (source.retrievedOn === UNKNOWN) findings.push(finding('RETRIEVAL_UNKNOWN', 'block', view.id, sourceId));
      if (source.tier === UNKNOWN) findings.push(finding('TIER_UNKNOWN', 'block', view.id, sourceId));
      if (source.licence === UNKNOWN) findings.push(finding('LICENCE_UNKNOWN', 'block', view.id, sourceId));
      if (source.sourceUrl === UNKNOWN) findings.push(finding('SOURCE_URL_UNKNOWN', 'block', view.id, sourceId));
      if (source.licenceUrl === UNKNOWN) findings.push(finding('LICENCE_URL_UNKNOWN', 'block', view.id, sourceId));
      if (source.permission === UNKNOWN) findings.push(finding('PERMISSION_UNKNOWN', 'block', view.id, sourceId));
      if (source.permission === 'no') findings.push(finding('PERMISSION_NO', 'block', view.id, sourceId));
      if (source.id === 'osm' && !source.credit.includes(OSM_CREDIT)) findings.push(finding('OSM_EXACT', 'block', view.id, sourceId));
      for (const method of REQUIRED_METHODS) {
        const matching = observations.get(observationKey(view.id, sourceId, method)) ?? [];
        if (!matching.length) {
          findings.push(finding('NO_OBSERVATION', 'block', view.id, sourceId, method));
          continue;
        }
        const signatures = new Set(matching.map(x => [x.creditSeen, x.licenceSeen, x.placement, x.legible].join('|')));
        if (signatures.size > 1) findings.push(finding('OBSERVATION_CONFLICT', 'block', view.id, sourceId, method));
        for (const observation of matching) findings.push(...observationFindings(observation, source, view));
      }
    }
  }
  findings.sort((a,b) => a.viewId.localeCompare(b.viewId) || a.sourceId.localeCompare(b.sourceId)
    || a.method.localeCompare(b.method) || a.code.localeCompare(b.code) || a.observationId.localeCompare(b.observationId));
  const blocking = findings.filter(x => x.severity === 'block').length;
  return {schema: 'map-attribution-observation-audit/1', title: journal.title,
    totals: {views: journal.views.length, included: included.length, sources: journal.sources.length,
      observations: journal.observations.length, blocking, attention: findings.filter(x => x.severity === 'attention').length},
    readyForManualReview: blocking === 0 && included.length > 0,
    findings};
}
export function auditByView(input) {
  const result = auditJournal(input);
  const output = new Map();
  for (const issue of result.findings) {
    if (!output.has(issue.viewId)) output.set(issue.viewId, []);
    output.get(issue.viewId).push(issue);
  }
  return output;
}
export function observationsNeeded(input) {
  const journal = parseJournal(input);
  const keys = new Set(journal.observations.map(x => observationKey(x.viewId, x.sourceId, x.method)));
  const missing = [];
  for (const view of journal.views.filter(x => x.included === 'yes')) {
    for (const sourceId of view.sourceIds) {
      for (const method of REQUIRED_METHODS) {
        if (!keys.has(observationKey(view.id, sourceId, method))) {
          missing.push({viewId:view.id, sourceId, method});
        }
      }
    }
  }
  return missing;
}
export function auditComparison(before, after) {
  const old = auditJournal(before);
  const next = auditJournal(after);
  const key = issue => [issue.code, issue.viewId, issue.sourceId, issue.method, issue.observationId].join('|');
  const oldSet = new Set(old.findings.map(key));
  const nextSet = new Set(next.findings.map(key));
  const introduced = next.findings.filter(x => !oldSet.has(key(x)));
  const resolved = old.findings.filter(x => !nextSet.has(key(x)));
  return {schema:'map-attribution-observation-comparison/1', introduced, resolved,
    before:old.totals, after:next.totals,
    worsened: introduced.some(x => x.severity === 'block'),
    removedIncludedViews: parseJournal(before).views.filter(x => x.included === 'yes' &&
      !parseJournal(after).views.some(y => y.id === x.id && y.included === 'yes')).map(x=>x.id)};
}
export function renderAuditText(input, locale = 'en') {
  const result = auditJournal(input);
  const language = locale === 'fr' ? 1 : 0;
  const heading = locale === 'fr' ? 'Journal des observations des mentions' : 'Attribution observation journal';
  const count = locale === 'fr' ? 'Écarts bloquants' : 'Blocking gaps';
  const lines = [heading, result.title, `${count}${locale === 'fr' ? '\u00a0:' : ':'} ${result.totals.blocking}`, ''];
  for (const issue of result.findings) {
    lines.push(`${issue.severity.toUpperCase()} ${issue.viewId} / ${issue.sourceId} / ${issue.method}`,
      FINDING_TEXT[issue.code]?.[language] ?? issue.code);
  }
  if (!result.findings.length) lines.push(locale === 'fr' ? 'Aucun écart dans les données fournies.' : 'No gaps in supplied records.');
  lines.push('', locale === 'fr' ? 'Les observations ne constituent pas une évaluation de l’accessibilité d’un lieu.' :
    'Observations are not an assessment of access conditions at a place.');
  return `${lines.join('\n')}\n`;
}
