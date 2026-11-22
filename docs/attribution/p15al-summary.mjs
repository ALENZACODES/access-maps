// @ts-check
import { compare, expectValue } from './p15al-input.mjs';
import { replayReview } from './p15al-review.mjs';

/** @import { Reason, ReviewReport, SourceReview } from './p15al-types.d.mts' */

/** @type {Record<Reason, [string,string]>} */
const REASON_TEXT = {
  'source-withdrawn': ['Withdrawal notice', 'Avis de retrait'],
  'conflicting-captures': ['Conflicting receipts', 'Justificatifs contradictoires'],
  'licence-changed': ['Licence changed', 'Licence modifiée'],
  'tier-changed': ['Source tier changed', 'Niveau de la source modifié'],
  'content-changed': ['Source bytes changed', 'Contenu de la source modifié'],
  'source-unavailable': ['Source unavailable', 'Source indisponible'],
  'review-overdue': ['Review overdue', 'Contrôle en retard'],
  'review-due': ['Review due', 'Contrôle à prévoir'],
};

const COPY = {
  en: {
    title: 'Offline source review', asOf: 'As of', sources: 'Sources',
    flagged: 'Sources needing review', records: 'Linked records', unknown: 'Records with unknown access',
    credit: 'Source credit', captured: 'Last checked', missing: 'Unknown',
    noFlags: 'No sources need review on this date.', licence: 'Licence', retrieved: 'Retrieved',
    tier: 'Source tier', direct: 'Direct records', inherited: 'Dependent records', reasons: 'Review reasons',
    borrowed: 'Superseded receipts', due: 'Days until due', sep: ': ',
  },
  fr: {
    title: 'Contrôle des sources hors ligne', asOf: 'Date du contrôle', sources: 'Sources',
    flagged: 'Sources à contrôler', records: 'Fiches liées', unknown: 'Fiches dont l’accessibilité est inconnue',
    credit: 'Mention de source', captured: 'Dernier contrôle', missing: 'Inconnu',
    noFlags: 'Aucune source à contrôler à cette date.', licence: 'Licence', retrieved: 'Date de récupération',
    tier: 'Niveau de la source', direct: 'Fiches directes', inherited: 'Fiches dépendantes', reasons: 'Motifs du contrôle',
    borrowed: 'Justificatifs de versions antérieures', due: 'Jours avant l’échéance', sep: '\u00a0: ',
  },
};

/** A plain-text reading order suitable for a terminal, a screen reader or printing a local report.
 * Only flagged sources get detail rows. The JSON report retains the whole catalogue.
 * @param {unknown} report @param {'en'|'fr'} language */
export function summarizeReview(report, language) {
  expectValue(language === 'en' || language === 'fr', 'shape', 'language');
  const checked = replayReview(report);
  const words = COPY[language];
  const flagged = checked.sourceReviews.filter(row => row.reasons.length);
  const lines = [
    words.title,
    words.asOf + words.sep + checked.input.asOf,
    words.sources + words.sep + checked.sourceReviews.length,
    words.flagged + words.sep + flagged.length,
    words.records + words.sep + checked.records.length,
    words.unknown + words.sep + checked.records.filter(row => row.access === 'UNKNOWN').length,
  ];
  if (checked.input.sources.some(row => row.source === 'osm-ontario')) {
    lines.push(words.credit + words.sep + '© OpenStreetMap contributors');
  }
  if (!flagged.length) lines.push('', words.noFlags);
  for (const row of flagged) {
    lines.push(
      '', row.provenance.source,
      words.reasons + words.sep + row.reasons.map(code => REASON_TEXT[code][language === 'en' ? 0 : 1]).join(', '),
      words.licence + words.sep + (language === 'fr' ? row.provenance.licence.replace(/ *:/gu, '\u00a0:') : row.provenance.licence),
      words.retrieved + words.sep + row.provenance.retrievedOn,
      words.tier + words.sep + (row.provenance.verificationTier === 'UNKNOWN' ? words.missing : row.provenance.verificationTier),
      words.captured + words.sep + (row.latestCheckOn ?? words.missing),
      words.due + words.sep + row.calendar.dueInDays,
      words.direct + words.sep + row.directRecordIds.length,
      words.inherited + words.sep + row.dependentRecordIds.length,
      words.borrowed + words.sep + row.supersededCaptures,
    );
  }
  return lines.join('\n') + '\n';
}

/** @param {SourceReview} row */
function linkedIds(row) {
  return [...row.directRecordIds, ...row.dependentRecordIds].sort();
}

/** @param {string[]} left @param {string[]} right */
function difference(left, right) {
  const excluded = new Set(right);
  return left.filter(id => !excluded.has(id));
}

/** Compare results across offline review dates. A source missing from the second catalogue
 * moves outside the review scope; its earlier checks are not recorded as resolved.
 * @param {unknown} previous @param {unknown} current */
export function compareReviews(previous, current) {
  const before = replayReview(previous);
  const after = replayReview(current);
  expectValue(after.input.asOf >= before.input.asOf, 'order', 'comparison.asOf');
  const oldRows = new Map(before.sourceReviews.map(row => [row.provenance.source, row]));
  const newRows = new Map(after.sourceReviews.map(row => [row.provenance.source, row]));
  const ids = [...new Set([...oldRows.keys(), ...newRows.keys()])].sort(compare);
  const sources = ids.map(id => {
    const oldRow = oldRows.get(id);
    const newRow = newRows.get(id);
    const beforeReasons = oldRow?.reasons ?? [];
    const afterReasons = newRow?.reasons ?? [];
    const earlierLinks = oldRow ? linkedIds(oldRow) : [];
    const laterLinks = newRow ? linkedIds(newRow) : [];
    const sameBaseline = oldRow !== undefined && newRow !== undefined &&
      oldRow.baselineHash === newRow.baselineHash;
    const status = !oldRow ? 'added' : !newRow ? 'outside-scope' :
      sameBaseline ? 'compared' : 'baseline-replaced';
    return {
      sourceId: id,
      baselineStatus: status,
      previousProvenance: oldRow?.provenance ?? null,
      currentProvenance: newRow?.provenance ?? null,
      opened: sameBaseline ? afterReasons.filter(reason => !beforeReasons.includes(reason)) : afterReasons,
      continuing: sameBaseline ? afterReasons.filter(reason => beforeReasons.includes(reason)) : [],
      cleared: sameBaseline ? beforeReasons.filter(reason => !afterReasons.includes(reason)) : [],
      archived: sameBaseline ? [] : beforeReasons,
      addedRecordIds: difference(laterLinks, earlierLinks),
      removedRecordIds: difference(earlierLinks, laterLinks),
    };
  });
  return {
    from: before.input.asOf, to: after.input.asOf,
    previousDigest: before.digest, currentDigest: after.digest, sources,
  };
}
