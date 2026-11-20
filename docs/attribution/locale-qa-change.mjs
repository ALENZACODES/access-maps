/** Field-level release change analysis without inferring unknown values. */
import { auditLocaleQa } from './locale-qa-audit.mjs';

const SOURCE_FIELDS = ['provider', 'terms', 'name', 'sourceUrl', 'licenceUrl', 'licenceName', 'permission', 'licenceEvidence', 'acquiredDate', 'datasetDate', 'termsDate', 'evidenceTier', 'status'];
const PAGE_FIELDS = ['pairId', 'locale', 'route', 'display', 'sourceIds', 'offline', 'targetPx', 'publishedDate', 'publicStatus'];
const NOTICE_FIELDS = ['sourceId', 'kind', 'text', 'licenceUrl', 'visible', 'nearContent', 'targetPx', 'keyboard', 'screenReader', 'contrast', 'review', 'reviewDate', 'evidenceUrl', 'evidenceNote'];
const CRITICAL_SOURCE = new Set(['provider','terms','sourceUrl','licenceUrl','licenceName','permission','licenceEvidence','acquiredDate','termsDate','evidenceTier','status']);
const CRITICAL_PAGE = new Set(['locale','route','display','sourceIds','offline','publicStatus']);
const CRITICAL_NOTICE = new Set(['sourceId','kind','text','licenceUrl','visible','nearContent','keyboard','screenReader','contrast','review','reviewDate','evidenceUrl']);
function normalized(value) {
  if (Array.isArray(value)) return [...value].sort().join(', ');
  if (value === undefined || value === null) return 'UNKNOWN';
  return String(value);
}
function change(list, kind, entity, field, before, after, blocking, why) {
  list.push({ kind, entity, field, before: normalized(before), after: normalized(after), blocking, why });
}
function severityFor(field, before, after, critical) {
  if (field === 'targetPx') return after === 'UNKNOWN' || (before !== 'UNKNOWN' && after < before) || (typeof after === 'number' && after < 44);
  if (field === 'permission' || field === 'licenceEvidence' || field === 'offline' || field === 'visible' || field === 'keyboard' || field === 'screenReader' || field === 'contrast') return before === 'YES' && after !== 'YES';
  if (field === 'review') return before === 'accepted' && after !== 'accepted';
  if (field === 'datasetDate') return before !== 'UNKNOWN' && after === 'UNKNOWN';
  if (field === 'publishedDate' || field === 'reviewDate' || field === 'termsDate' || field === 'acquiredDate') return before !== 'UNKNOWN' && (after === 'UNKNOWN' || after < before);
  if (field === 'sourceIds') return String(after).split(', ').length < String(before).split(', ').length || normalized(after) !== normalized(before);
  if (field === 'status' || field === 'publicStatus') return before === 'included' && after !== 'included';
  if (critical.has(field)) return normalized(before) !== normalized(after);
  return false;
}
function diffFields(output, kind, id, previous, current, fields, critical) {
  for (const field of fields) {
    const before = previous[field];
    const after = current[field];
    if (normalized(before) === normalized(after)) continue;
    const blocking = severityFor(field, before, after, critical);
    change(output, kind, id, field, before, after, blocking, blocking ? 'Release evidence or obligation changed' : 'Changed for review');
  }
}
function compareNotices(output, pageId, oldPage, newPage) {
  const before = new Map(oldPage.notices.map(n => [n.id, n]));
  const after = new Map(newPage.notices.map(n => [n.id, n]));
  for (const [id, previous] of before) {
    const current = after.get(id);
    if (!current) change(output, 'notice-removed', `${pageId}.${id}`, 'notice', id, 'UNKNOWN', true, 'Published notice removed');
    else diffFields(output, 'notice', `${pageId}.${id}`, previous, current, NOTICE_FIELDS, CRITICAL_NOTICE);
  }
  for (const [id, next] of after) if (!before.has(id)) change(output, 'notice-added', `${pageId}.${id}`, 'notice', 'UNKNOWN', next.id, false, 'New notice requires review');
}
export function compareLocaleQa(before, after) {
  const previousAudit = auditLocaleQa(before);
  const currentAudit = auditLocaleQa(after);
  const changes = [];
  const oldSources = new Map(before.sources.map(s => [s.id, s]));
  const newSources = new Map(after.sources.map(s => [s.id, s]));
  for (const [id, source] of oldSources) {
    const next = newSources.get(id);
    if (!next) change(changes, 'source-removed', id, 'source', source.id, 'UNKNOWN', source.status === 'included', 'Source removed');
    else diffFields(changes, 'source', id, source, next, SOURCE_FIELDS, CRITICAL_SOURCE);
  }
  for (const [id, source] of newSources) if (!oldSources.has(id)) change(changes, 'source-added', id, 'source', 'UNKNOWN', source.id, false, 'New source');
  const oldPages = new Map(before.pages.map(p => [p.id, p]));
  const newPages = new Map(after.pages.map(p => [p.id, p]));
  for (const [id, page] of oldPages) {
    const next = newPages.get(id);
    if (!next) change(changes, 'page-removed', id, 'page', page.id, 'UNKNOWN', page.publicStatus === 'included', 'Publication page removed');
    else {
      diffFields(changes, 'page', id, page, next, PAGE_FIELDS, CRITICAL_PAGE);
      compareNotices(changes, id, page, next);
    }
  }
  for (const [id, page] of newPages) if (!oldPages.has(id)) change(changes, 'page-added', id, 'page', 'UNKNOWN', page.id, false, 'New publication page');
  if (before.requireBilingual && !after.requireBilingual) change(changes, 'policy', 'release', 'requireBilingual', true, false, true, 'Bilingual coverage requirement reduced');
  if (!before.requireBilingual && after.requireBilingual) change(changes, 'policy', 'release', 'requireBilingual', false, true, false, 'Bilingual coverage requirement added');
  const oldBlockers = new Set(previousAudit.findings.filter(f => f.severity === 'block').map(f => `${f.code}|${f.pageId}|${f.sourceId}`));
  const newBlockers = currentAudit.findings.filter(f => f.severity === 'block' && !oldBlockers.has(`${f.code}|${f.pageId}|${f.sourceId}`)).map(f => f.code);
  changes.sort((a, b) => a.entity.localeCompare(b.entity) || a.field.localeCompare(b.field) || a.kind.localeCompare(b.kind));
  return {
    beforeReleaseId: before.releaseId,
    afterReleaseId: after.releaseId,
    changes,
    blocked: currentAudit.blocked || changes.some(c => c.blocking),
    blockingChanges: changes.filter(c => c.blocking).length,
    newlyBlockingCodes: [...new Set(newBlockers)].sort(),
    beforeAudit: previousAudit,
    afterAudit: currentAudit,
  };
}
export function changesByEntity(comparison, id) { return comparison.changes.filter(c => c.entity === id || c.entity.startsWith(`${id}.`)); }
export function blockingChanges(comparison) { return comparison.changes.filter(c => c.blocking); }
