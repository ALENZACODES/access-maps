/** Stable field-level release comparison, with conservative regression severity. */
import { auditCorrections } from './correction-audit.mjs';
import { UNKNOWN } from './correction-core.mjs';
export const CHANGE_LEVELS = Object.freeze(['block','review','info']);
const SOURCE_FIELDS = ['provider','name','sourceUrl','licenceUrl','licence','permission','datasetDate','acquisitionDate','termsDate','notice','tier','included'];
const EVIDENCE_FIELDS = ['title','url','licenceUrl','collectedOn','tier','language','excerpt','sourceId'];
const CASE_FIELDS = ['sourceId','surfaceId','issue','state','openedOn','updatedOn','summary','currentText','proposedText','permission','evidenceIds','decision','decisionOn','decisionNote','assignee','locale'];
const SURFACE_FIELDS = ['route','locale','sourceIds','caseIds','offline','keyboard','screenReader','minimumTargetPx','publishedOn'];
export function printable(value) { return Array.isArray(value) ? value.slice().sort().join(', ') : String(value ?? UNKNOWN); }
export function safeKey(value) { return String(value).replace(/\s+/gu,' ').trim(); }
export function change(kind, level, entity, field, before, after, surfaces = []) {
  return { kind, level, entity, field, before:printable(before), after:printable(after), surfaces:[...new Set(surfaces)].sort() };
}
export function affectedSurfaces(register, sourceId) {
  const direct = register.surfaces.filter(s=>s.sourceIds.includes(sourceId)).map(s=>s.id);
  const indirect = register.cases.filter(c=>c.sourceId===sourceId).map(c=>c.surfaceId);
  return [...new Set([...direct,...indirect])].sort();
}
export function classifySource(field,before,after) {
  if (field === 'included') return before === 'YES' && after !== 'YES' ? 'block' : 'review';
  if (field === 'permission') return before === 'YES' && after !== 'YES' ? 'block' : 'review';
  if (field === 'sourceUrl' || field === 'licenceUrl' || field === 'licence' || field === 'notice' || field === 'provider') return 'block';
  if (['termsDate','acquisitionDate','datasetDate'].includes(field)) return before !== UNKNOWN && after === UNKNOWN ? 'block' : 'review';
  if (field === 'tier') return before !== UNKNOWN && after === UNKNOWN ? 'block' : 'review';
  return 'info';
}
export function classifyEvidence(field,before,after) {
  if (['url','licenceUrl','sourceId'].includes(field)) return 'block';
  if (['tier','collectedOn','language'].includes(field)) return before !== UNKNOWN && after === UNKNOWN ? 'block' : 'review';
  return field === 'excerpt' ? 'review' : 'info';
}
export function classifyCase(field,before,after) {
  if (field === 'state') return ['resolved','rejected'].includes(before) && !['resolved','rejected'].includes(after) ? 'block' : 'review';
  if (field === 'decision') return before === 'accept' && after !== 'accept' ? 'block' : 'review';
  if (field === 'permission') return before === 'YES' && after !== 'YES' ? 'block' : 'review';
  if (field === 'evidenceIds') return after.length < before.length ? 'block' : 'review';
  if (['sourceId','surfaceId','proposedText','decisionNote'].includes(field)) return 'block';
  if (['openedOn','decisionOn','updatedOn'].includes(field)) return before !== UNKNOWN && after === UNKNOWN ? 'block' : 'review';
  return 'review';
}
export function classifySurface(field,before,after) {
  if (['sourceIds','caseIds'].includes(field)) return after.length < before.length ? 'block' : 'review';
  if (['keyboard','screenReader','offline'].includes(field)) return before === 'YES' && after !== 'YES' ? 'block' : 'review';
  if (field === 'minimumTargetPx') return typeof before === 'number' && (typeof after !== 'number' || after < before) ? 'block' : 'info';
  if (field === 'locale' || field === 'route') return 'block';
  if (field === 'publishedOn') return before !== UNKNOWN && after === UNKNOWN ? 'block' : 'review';
  return 'info';
}
export function compareCollection(before, after, collection, fields, classifier, out, surfaceResolver) {
  const old = new Map(before[collection].map(item=>[item.id,item]));
  const next = new Map(after[collection].map(item=>[item.id,item]));
  const all = [...new Set([...old.keys(),...next.keys()])].sort();
  for (const id of all) {
    const previous = old.get(id), current = next.get(id);
    const attached = surfaceResolver(id,previous,current);
    if (!previous) { out.push(change(`${collection}-added`,'review',id,'id',UNKNOWN,id,attached));continue; }
    if (!current) { out.push(change(`${collection}-removed`,'block',id,'id',id,UNKNOWN,attached));continue; }
    for (const field of fields) {
      const oldValue=previous[field], newValue=current[field];
      const same = Array.isArray(oldValue) && Array.isArray(newValue)
        ? oldValue.length===newValue.length && oldValue.every(v=>newValue.includes(v))
        : oldValue === newValue;
      if (!same) out.push(change(`${collection}-changed`,classifier(field,oldValue,newValue),id,field,oldValue,newValue,attached));
    }
  }
}
export function compareCorrections(before, after, options={}) {
  const beforeAudit=auditCorrections(before,options), afterAudit=auditCorrections(after,options);
  const changes=[];
  compareCollection(before,after,'sources',SOURCE_FIELDS,classifySource,changes,
    id=>[...new Set([...affectedSurfaces(before,id),...affectedSurfaces(after,id)])]);
  compareCollection(before,after,'evidence',EVIDENCE_FIELDS,classifyEvidence,changes,
    id=>[...new Set([...before.cases.filter(c=>c.evidenceIds.includes(id)).map(c=>c.surfaceId),
      ...after.cases.filter(c=>c.evidenceIds.includes(id)).map(c=>c.surfaceId)])]);
  compareCollection(before,after,'cases',CASE_FIELDS,classifyCase,changes,
    (_id,previous,current)=>[...new Set([previous?.surfaceId,current?.surfaceId].filter(Boolean))]);
  compareCollection(before,after,'surfaces',SURFACE_FIELDS,classifySurface,changes,id=>[id]);
  if (before.releaseId !== after.releaseId) changes.push(change('release-id','info','release','releaseId',before.releaseId,after.releaseId));
  if (before.localePairRequired !== after.localePairRequired)
    changes.push(change('pair-requirement',before.localePairRequired&&!after.localePairRequired?'block':'review','release','localePairRequired',before.localePairRequired,after.localePairRequired));
  const oldFailures = new Set(beforeAudit.findings.filter(f=>f.level==='block').map(f=>`${f.code}|${f.path}`));
  const newFailures = afterAudit.findings.filter(f=>f.level==='block'&&!oldFailures.has(`${f.code}|${f.path}`));
  for (const item of newFailures) changes.push(change('new-blocker','block',item.path,item.code,'absent','present',item.surfaceId?[item.surfaceId]:[]));
  changes.sort((a,b)=>a.entity.localeCompare(b.entity)||a.field.localeCompare(b.field)||a.kind.localeCompare(b.kind));
  return { previousRelease:before.releaseId, release:after.releaseId, blocked:afterAudit.blocked||changes.some(c=>c.level==='block'),
    changes, previousAudit:beforeAudit, currentAudit:afterAudit,
    blockingChanges:changes.filter(c=>c.level==='block').length,
    reviewChanges:changes.filter(c=>c.level==='review').length,
    informationalChanges:changes.filter(c=>c.level==='info').length,
  };
}
